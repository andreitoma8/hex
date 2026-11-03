/**
 * Audit-review state in `<output_dir>/progress.json`, shared by the dashboard
 * `/progress` page + `/api/progress` route, the dashboard's notes mutators, and
 * the `hex note` CLI. Like src/core/notes.ts / issues.ts this depends ONLY on
 * node:fs / node:path so the dashboard can import it via `externalDir`.
 * (Named `review` to avoid colliding with src/core/progress.ts, which is the
 * unrelated CLI ProgressTracker.)
 *
 * Two parallel maps keyed by `"<file>::<ContractName>"` (the same key the
 * Contract Checklist uses):
 *   - reviewed_contracts: manual checkbox state (auditor toggles on /progress)
 *   - diane_reviewed:     derived from Diane notes (marked_done + no open leads
 *                         + no unanswered questions). Kept separate so it never
 *                         clobbers a manual check; the checklist shows a row as
 *                         reviewed when either is true.
 */
import fs from 'node:fs';
import path from 'node:path';
import { readContractNote, reviewState } from './notes.js';
import { functionsForFinding, projectDirOf } from './dedup.js';
import type { Facts, FunctionReview, ProtocolModel } from '../types/index.js';

export type ReviewState = FunctionReview['state'];
export const REVIEW_STATES: readonly ReviewState[] = ['unread', 'read', 'questioned', 'cleared'];

export interface ProgressData {
  updated_at: string;
  reviewed_contracts: Record<string, boolean>;
  diane_reviewed?: Record<string, boolean>;
  /** v2: per-function review state, keyed by facts function id (`Contract.sig`). */
  functions?: Record<string, FunctionReview>;
}

function progressPath(outputDir: string): string {
  return path.join(outputDir, 'progress.json');
}

export function readProgress(outputDir: string): ProgressData {
  try {
    const raw = JSON.parse(
      fs.readFileSync(progressPath(outputDir), 'utf-8'),
    ) as Partial<ProgressData>;
    return {
      updated_at: raw.updated_at ?? new Date().toISOString(),
      reviewed_contracts: raw.reviewed_contracts ?? {},
      diane_reviewed: raw.diane_reviewed ?? {},
      functions: raw.functions ?? {},
    };
  } catch {
    return {
      updated_at: new Date().toISOString(),
      reviewed_contracts: {},
      diane_reviewed: {},
      functions: {},
    };
  }
}

export function writeProgress(outputDir: string, data: ProgressData): void {
  const next = { ...data, updated_at: new Date().toISOString() };
  const file = progressPath(outputDir);
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(next, null, 2) + '\n', 'utf-8');
  fs.renameSync(tmp, file);
}

/**
 * Resolve a Diane note's contract name to the `"<file>::<ContractName>"` key
 * the Contract Checklist uses, by matching against stats.json's per_contract.
 * Falls back to the note's own contract string if no stats match is found.
 */
function resolveContractKey(outputDir: string, contract: string, file?: string): string {
  const bare = contract.replace(/\.sol$/i, '');
  try {
    const stats = JSON.parse(fs.readFileSync(path.join(outputDir, 'stats.json'), 'utf-8')) as {
      per_contract?: Array<{ file: string; contract: string }>;
    };
    const per = stats.per_contract ?? [];
    // Prefer an exact contract-name match; only then fall back to filename
    // (a file like Vault.sol can hold several contracts, e.g. an interface).
    const byName = per.find((c) => c.contract === contract || c.contract === bare);
    const byFile = per.find((c) => path.basename(c.file).replace(/\.sol$/i, '') === bare);
    const match = byName ?? byFile;
    if (match) return `${match.file}::${match.contract}`;
  } catch {
    /* no stats.json — fall through */
  }
  return file ? `${file}::${bare}` : `${contract}::${bare}`;
}

/**
 * Recompute a contract's derived "reviewed" flag from its Diane note and store
 * it in progress.json. Call after any note mutation (lead close, answer,
 * mark-done, or a whole-doc `hex note set`).
 */
export function recomputeReview(outputDir: string, contract: string): boolean {
  const note = readContractNote(outputDir, contract);
  const reviewed = reviewState(note).reviewed;
  const key = resolveContractKey(outputDir, contract, note.file);
  const data = readProgress(outputDir);
  data.diane_reviewed = { ...(data.diane_reviewed ?? {}), [key]: reviewed };
  writeProgress(outputDir, data);
  return reviewed;
}

// ─── Per-function review map (v2) ───────────────────────────────────

function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as T;
  } catch {
    return null;
  }
}

/** Set the review state of one or more functions (facts ids). */
export function markFunctions(
  outputDir: string,
  ids: string[],
  state: ReviewState,
  by: FunctionReview['by'] = 'auditor',
  note?: string,
): ProgressData {
  const data = readProgress(outputDir);
  const functions = { ...(data.functions ?? {}) };
  const at = new Date().toISOString();
  for (const id of ids) {
    if (state === 'unread') delete functions[id];
    else functions[id] = { state, by, updated_at: at, ...(note ? { note } : {}) };
  }
  writeProgress(outputDir, { ...data, functions });
  return { ...data, functions };
}

export interface FunctionReviewRow {
  id: string;
  contract: string;
  name: string;
  file: string;
  line_start: number;
  line_end: number;
  nsloc: number;
  is_entry_point: boolean;
  state: ReviewState;
  by?: string;
  updated_at?: string;
  note?: string;
  risk: number;
  risk_reasons: string[];
  /** An /ai-audit scan raised something on this function. */
  ai_seen: boolean;
  /** Board cards whose code points into this function. */
  cards: string[];
  /** Differential audit: 0 = changed, n = n hops from a change; absent = not impacted. */
  diff_depth?: number;
}

export interface ReviewSummary {
  facts_source: Facts['source'] | null;
  total_nsloc: number;
  cleared_nsloc: number;
  /** cleared nSLOC / total nSLOC, 0-100. */
  pct: number;
  counts: Record<ReviewState, number>;
  rows: FunctionReviewRow[];
  blind_spots: FunctionReviewRow[];
}

/** Every in-scope, implemented function worth reviewing (entry points + what they reach). */
function reviewableFunctions(facts: Facts) {
  const interfaces = new Set(
    facts.contracts.filter((c) => c.kind === 'interface').map((c) => c.name),
  );
  // Implemented in-scope code: functions, modifiers, constructors and pure math alike.
  return facts.functions.filter((f) => f.in_scope && !interfaces.has(f.contract) && f.nsloc > 0);
}

function aiSeenKeys(outputDir: string): Set<string> {
  // Keys look like `contract|function|bug-class`, normalized lower-case.
  const keys = new Set<string>();
  const runsDir = path.join(outputDir, 'ai-audit', 'runs');
  try {
    for (const stamp of fs.readdirSync(runsDir)) {
      const tsv = path.join(runsDir, stamp, 'winners.tsv');
      if (!fs.existsSync(tsv)) continue;
      for (const line of fs.readFileSync(tsv, 'utf-8').split('\n')) {
        const key = line.split('\t')[1];
        if (!key) continue;
        const [c, f] = key.split('|');
        keys.add(`${c}|${f}`);
      }
    }
  } catch {
    /* no scans yet */
  }
  return keys;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-');

/**
 * Join facts (inventory), progress (states), model (risk), cards, /ai-audit
 * coverage and the diff into one review map. Risk is a 0-100 ordering score,
 * not a severity: it says where an unread hour is best spent.
 */
export function reviewSummary(
  outputDir: string,
  opts: { blindSpots?: number } = {},
): ReviewSummary {
  const facts = readJson<Facts>(path.join(outputDir, 'facts.json'));
  const empty: ReviewSummary = {
    facts_source: null,
    total_nsloc: 0,
    cleared_nsloc: 0,
    pct: 0,
    counts: { unread: 0, read: 0, questioned: 0, cleared: 0 },
    rows: [],
    blind_spots: [],
  };
  if (!facts) return empty;

  const progress = readProgress(outputDir);
  const model = readJson<ProtocolModel>(path.join(outputDir, 'model', 'protocol.json'));
  const diff = readJson<{
    impacted?: Array<{ contract: string; function: string; depth: number }>;
  }>(path.join(outputDir, 'diff.json'));
  const findings =
    readJson<{
      findings: Array<{
        id: string;
        title?: string;
        description?: string;
        root_cause?: { locations?: Array<{ file: string; snippet?: string }> };
      }>;
    }>(path.join(outputDir, 'findings.json'))?.findings ?? [];
  const tracking =
    readJson<{ findings: Array<{ id: string; status: string }> }>(
      path.join(outputDir, 'tracking.json'),
    )?.findings ?? [];
  const liveCards = new Set(
    tracking.filter((t) => t.status !== 'duplicate' && t.status !== 'rejected').map((t) => t.id),
  );
  const projectDir = projectDirOf(outputDir);

  const cardsByFn = new Map<string, string[]>();
  for (const f of findings) {
    if (!liveCards.has(f.id)) continue;
    for (const fn of functionsForFinding(facts, f, projectDir)) {
      cardsByFn.set(fn, [...(cardsByFn.get(fn) ?? []), f.id]);
    }
  }
  const movesAssets = new Set((model?.assets ?? []).flatMap((a) => a.moved_by));
  const privileged = new Set((model?.privileges ?? []).map((p) => p.function));
  const accounting = new Set(
    (model?.accounting ?? []).flatMap((a) =>
      a.terms.flatMap((t) => t.updated_by.map((u) => u.function)),
    ),
  );
  const impacted = new Map(
    (diff?.impacted ?? []).map((i) => [`${i.contract}.${i.function}`, i.depth]),
  );
  const ai = aiSeenKeys(outputDir);

  const rows: FunctionReviewRow[] = [];
  for (const f of reviewableFunctions(facts)) {
    const reasons: string[] = [];
    let risk = 0;
    const add = (pts: number, why: string) => {
      risk += pts;
      reasons.push(why);
    };
    if (f.is_entry_point) add(10, 'entry point');
    const valueCalls = f.external_calls.filter(
      (c) =>
        c.kind === 'low_level' ||
        c.kind === 'transfer' ||
        /transfer|send|mint|burn/i.test(c.member),
    );
    if (movesAssets.has(f.id) || valueCalls.length) add(25, 'moves value');
    if (accounting.has(f.id)) add(20, 'updates accounting');
    if (f.external_calls.length && !valueCalls.length) add(10, 'external calls');
    if (privileged.has(f.id)) add(8, 'privileged');
    if (f.writes.length >= 3) add(7, `writes ${f.writes.length} state vars`);
    risk += Math.min(15, Math.round(f.nsloc / 3));
    const depth = impacted.get(f.id);
    if (depth === 0) add(20, 'changed');
    else if (depth !== undefined) add(10, 'impacted by change');
    const cards = cardsByFn.get(f.id) ?? [];
    if (cards.length) add(5, `${cards.length} card${cards.length > 1 ? 's' : ''}`);

    const rv = progress.functions?.[f.id];
    rows.push({
      id: f.id,
      contract: f.contract,
      name: f.name,
      file: f.file,
      line_start: f.line_start,
      line_end: f.line_end,
      nsloc: f.nsloc,
      is_entry_point: f.is_entry_point,
      state: rv?.state ?? 'unread',
      ...(rv
        ? { by: rv.by, updated_at: rv.updated_at, ...(rv.note ? { note: rv.note } : {}) }
        : {}),
      risk: Math.min(100, risk),
      risk_reasons: reasons,
      ai_seen: ai.has(`${norm(f.contract)}|${norm(f.name)}`),
      cards,
      ...(depth !== undefined ? { diff_depth: depth } : {}),
    });
  }
  rows.sort((a, b) => a.contract.localeCompare(b.contract) || a.line_start - b.line_start);

  const total = rows.reduce((s, r) => s + r.nsloc, 0);
  const cleared = rows.filter((r) => r.state === 'cleared').reduce((s, r) => s + r.nsloc, 0);
  const counts: Record<ReviewState, number> = { unread: 0, read: 0, questioned: 0, cleared: 0 };
  for (const r of rows) counts[r.state]++;

  // Blind spots: nobody has looked hard yet. Unread first, then read-but-not-cleared;
  // no AI coverage ranks above AI-seen; riskiest first.
  const blind = rows
    .filter((r) => r.state === 'unread' || r.state === 'read')
    .sort(
      (a, b) =>
        Number(a.state !== 'unread') - Number(b.state !== 'unread') ||
        Number(a.ai_seen) - Number(b.ai_seen) ||
        b.risk - a.risk,
    )
    .slice(0, opts.blindSpots ?? 10);

  return {
    facts_source: facts.source,
    total_nsloc: total,
    cleared_nsloc: cleared,
    pct: total ? Math.round((cleared * 100) / total) : 0,
    counts,
    rows,
    blind_spots: blind,
  };
}
