/**
 * `hex invariant sync-fuzz`: fold the latest /fuzz campaign back into
 * `.hex/model/invariants.json`, and open a board card for every reproduced
 * violation. /fuzz is pashov's fizz vendored in `src/skills/fuzz/`; the formats
 * parsed here are the ones its skill, agents and scripts write:
 *
 *   .hex/fuzz/PROPERTIES.md                           `- [x] **GL-01** (INV-003) — …`
 *   .hex/fuzz/fizz_data/last-run.json                 fizz_sync.js snapshot (its `suiteDir`)
 *   <suite>/Properties.sol, <suite>/handlers/*.sol    `/// @notice GL-01: …` above each property
 *   <suite>/FoundryTester.sol                         `test_repro_<property>` (Step 11)
 *   .hex/fuzz/fizz_data/corpus_medusa/medusa-run.log  run_medusa.js
 *   .hex/fuzz/fizz_data/logs_medusa/*                 medusa's own log (`medusa fuzz`)
 *   .hex/fuzz/fizz_data/corpus_echidna/echidna-run.log run_echidna.js
 *
 * Node builtins plus ./model.js and ./issues.js only.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Invariant } from '../types/index.js';
import { linkInvariantIssue, readInvariants, setInvariantTest } from './model.js';
import { createIssue } from './issues.js';

export type FuzzTestStatus = 'not_written' | 'passing' | 'failing' | 'broken';
type Checkbox = ' ' | 'x' | '~' | '-';

// ─── PROPERTIES.md ──────────────────────────────────────────────────

export interface FuzzProperty {
  /** Spec id: `GL-NN` / `SP-NN`. */
  id: string;
  /** `[ ]` pending, `[x]` implemented, `[~]` quarantined by /fuzz-sync, `[-]` skipped/manual. */
  checkbox: Checkbox;
  /** The `(INV-NNN)` tag after the Spec ID, if any. */
  invariantId: string | null;
  guarantee: 'SHOULD-HOLD' | 'EXPLORATORY' | null;
  /** 1-based line in PROPERTIES.md. */
  line: number;
}

const PROPERTY_LINE = /^\s*[-*]\s+\[([ xX~-])\]\s+(?:\*\*)?((?:GL|SP)-\d+)(?![\w-])(?:\*\*)?(.*)$/;

/**
 * Parse fizz's PROPERTIES.md. Upstream's line is `- [ ] **GL-01** — …`; Hex adds
 * the invariant right after the Spec ID: `- [ ] **GL-01** (INV-003) — …`. The
 * bold is optional so hand-written lines still parse. First entry per id wins.
 */
export function parsePropertiesMd(md: string): FuzzProperty[] {
  const out: FuzzProperty[] = [];
  const seen = new Set<string>();
  md.split(/\r?\n/).forEach((text, i) => {
    const m = PROPERTY_LINE.exec(text);
    if (!m || seen.has(m[2])) return;
    seen.add(m[2]);
    const rest = m[3];
    const g = /Guarantee:\s*(SHOULD-HOLD|EXPLORATORY)/.exec(rest);
    out.push({
      id: m[2],
      checkbox: (m[1] === 'X' ? 'x' : m[1]) as Checkbox,
      invariantId: /\((INV-\d+)\)/.exec(rest)?.[1] ?? null,
      guarantee: (g?.[1] as FuzzProperty['guarantee']) ?? null,
      line: i + 1,
    });
  });
  return out;
}

// ─── Solidity scanning ──────────────────────────────────────────────

/** Blank out comments (same length, newlines kept) so code scans skip them. Strings stay. */
function maskComments(src: string): string {
  const out = src.split('');
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    if (c === '/' && n === '/') {
      while (i < src.length && src[i] !== '\n') out[i++] = ' ';
    } else if (c === '/' && n === '*') {
      const end = src.indexOf('*/', i + 2);
      const stop = end === -1 ? src.length : end + 2;
      for (; i < stop; i++) if (src[i] !== '\n') out[i] = ' ';
    } else if (c === '"' || c === "'") {
      i++;
      while (i < src.length && src[i] !== c && src[i] !== '\n') i += src[i] === '\\' ? 2 : 1;
      i++;
    } else {
      i++;
    }
  }
  return out.join('');
}

/** Index of the bracket closing the one at `open` (strings skipped), or -1. */
function matchBracket(text: string, open: number): number {
  const o = text[open];
  const close = o === '(' ? ')' : '}';
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    const c = text[i];
    if (c === '"' || c === "'") {
      i++;
      while (i < text.length && text[i] !== c && text[i] !== '\n') i += text[i] === '\\' ? 2 : 1;
    } else if (c === o) {
      depth++;
    } else if (c === close && --depth === 0) {
      return i;
    }
  }
  return -1;
}

interface SolFunction {
  name: string;
  /** Index of the `function` keyword. */
  start: number;
  /** Body including braces (raw source, comments kept), '' when there is none. */
  body: string;
  /** Same span with comments blanked. */
  maskedBody: string;
}

function findFunctions(src: string, masked = maskComments(src)): SolFunction[] {
  const out: SolFunction[] = [];
  const re = /\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(masked)) !== null) {
    const paramsEnd = matchBracket(masked, m.index + m[0].length - 1);
    if (paramsEnd === -1) continue;
    let i = paramsEnd + 1;
    while (i < masked.length && masked[i] !== '{' && masked[i] !== ';') i++;
    let body = '';
    let maskedBody = '';
    if (masked[i] === '{') {
      const end = matchBracket(masked, i);
      if (end !== -1) {
        body = src.slice(i, end + 1);
        maskedBody = masked.slice(i, end + 1);
      }
    }
    out.push({ name: m[1], start: m.index, body, maskedBody });
  }
  return out;
}

interface TaggedFunction {
  functionName: string;
  /** Project-relative, forward slashes. */
  file: string;
  quarantined: boolean;
}

/**
 * Map Spec ID → the function under its `/// @notice GL-NN:` doctag (fizz's
 * implementers and /fuzz-convert always write one). Comments between the tag
 * and `function` are allowed (/fuzz-sync parks a quarantined body there).
 */
function scanTagged(files: Array<{ rel: string; src: string }>): Map<string, TaggedFunction> {
  const out = new Map<string, TaggedFunction>();
  for (const { rel, src } of files) {
    const masked = maskComments(src);
    const fns = findFunctions(src, masked);
    const tag = /\/\/\/\s*@notice\s+((?:GL|SP)-\d+)\s*:/g;
    let m: RegExpExecArray | null;
    while ((m = tag.exec(src)) !== null) {
      const fn = fns.find((f) => f.start > m!.index);
      if (!fn || masked.slice(m.index, fn.start).trim() !== '') continue;
      if (out.has(m[1])) continue;
      out.set(m[1], {
        functionName: fn.name,
        file: rel,
        quarantined: fn.body.includes('FUZZ-SYNC: quarantined'),
      });
    }
  }
  return out;
}

/** Handler functions that reach `fn`, following calls between handler functions. */
function callingHandlers(fn: string, handlers: SolFunction[]): string[] {
  const reached = new Set<string>([fn]);
  for (let changed = true; changed; ) {
    changed = false;
    for (const h of handlers) {
      if (reached.has(h.name)) continue;
      for (const name of reached) {
        if (new RegExp(`\\b${name.replace(/\$/g, '\\$')}\\s*\\(`).test(h.maskedBody)) {
          reached.add(h.name);
          changed = true;
          break;
        }
      }
    }
  }
  reached.delete(fn);
  return [...reached];
}

interface Repro {
  test: string;
  /** Property function name it targets (`test_repro_<name>` or `test_repro_<name>_N`). */
  target: string;
}

/** `test_repro_*` tests that really replay a violation (not the TODO placeholder). */
function scanRepros(src: string): Repro[] {
  return findFunctions(src)
    .filter((f) => f.name.startsWith('test_repro_'))
    .filter(
      (f) =>
        f.maskedBody.replace(/[{}\s]/g, '') !== '' && !f.body.includes('TODO: manual repro needed'),
    )
    .map((f) => ({ test: f.name, target: f.name.slice('test_repro_'.length).replace(/^_+/, '') }));
}

function reprosFor(fn: string, repros: Repro[]): Repro[] {
  const want = fn.replace(/^_+/, '');
  return repros.filter(
    (r) =>
      r.target === want ||
      (r.target.startsWith(want + '_') && /^\d+$/.test(r.target.slice(want.length + 1))),
  );
}

// ─── Campaign logs ──────────────────────────────────────────────────

export type TestOutcome = 'passed' | 'failed' | 'error';

export interface ParsedLog {
  /** Bare function name (no contract prefix, no signature) → worst outcome seen. */
  tests: Map<string, TestOutcome>;
  /** Fuzzer calls executed, when the log reports it. */
  calls: number | null;
}

const RANK: Record<TestOutcome, number> = { passed: 0, error: 1, failed: 2 };

function record(tests: Map<string, TestOutcome>, name: string, outcome: TestOutcome): void {
  const prev = tests.get(name);
  if (!prev || RANK[outcome] > RANK[prev]) tests.set(name, outcome);
}

const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');
const num = (s: string) => parseInt(s.replace(/,/g, ''), 10);

/**
 * Medusa: `⇾ [FAILED] Assertion Test: FuzzTester.property_solvency()` (printed
 * when found and again in the final results), `[PASSED] Property Test: …`, and
 * status lines `fuzz: elapsed: 1m0s, calls: 123456 (…), …`.
 */
export function parseMedusaLog(text: string): ParsedLog {
  const tests = new Map<string, TestOutcome>();
  let calls: number | null = null;
  const clean = stripAnsi(text);
  const test =
    /\[(PASSED|FAILED)\]\s+(?:Assertion|Property|Optimization)\s+Test:\s+(?:[\w$]+\.)?([\w$]+)\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = test.exec(clean)) !== null)
    record(tests, m[2], m[1] === 'FAILED' ? 'failed' : 'passed');
  const callsRe = /\bcalls:\s*([\d,]+)/g;
  while ((m = callsRe.exec(clean)) !== null) calls = Math.max(calls ?? 0, num(m[1]));
  return { tests, calls };
}

/**
 * Echidna (`format: "text"`): final lines `property_x(): passing`,
 * `vault_deposit(uint256): failed!💥`, `foo(): could not evaluate ☣`, event
 * lines `[…] Test vault_deposit(uint256) falsified!`, `Total calls: 50123`,
 * status lines `[status] tests: 0/5, fuzzing: 1234/50000, …`.
 */
export function parseEchidnaLog(text: string): ParsedLog {
  const tests = new Map<string, TestOutcome>();
  let calls: number | null = null;
  for (const raw of stripAnsi(text).split(/\r?\n/)) {
    const res =
      /^\s*([A-Za-z_$][\w$]*)(?:\(.*\))?\s*:\s*(passing|passed|failed|could not evaluate|error)/i.exec(
        raw,
      );
    if (res) {
      const s = res[2].toLowerCase();
      record(tests, res[1], s.startsWith('pass') ? 'passed' : s === 'failed' ? 'failed' : 'error');
      continue;
    }
    const ev = /\bTest\s+([A-Za-z_$][\w$]*)(?:\(.*\))?\s+falsified/.exec(raw);
    if (ev) record(tests, ev[1], 'failed');
    const total = /Total calls:\s*([\d,]+)/.exec(raw);
    if (total) calls = Math.max(calls ?? 0, num(total[1]));
    const fuzzing = /fuzzing:\s*([\d,]+)\s*\/\s*[\d,]+/.exec(raw);
    if (fuzzing) calls = Math.max(calls ?? 0, num(fuzzing[1]));
  }
  return { tests, calls };
}

interface CampaignLog extends ParsedLog {
  tool: 'medusa' | 'echidna';
  file: string;
  mtimeMs: number;
}

function newestFile(dir: string): string | null {
  try {
    const files = fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isFile())
      .map((e) => path.join(dir, e.name));
    files.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
    return files[0] ?? null;
  } catch {
    return null;
  }
}

function readLogs(projectDir: string, metaDir: string): CampaignLog[] {
  const candidates: Array<{ tool: 'medusa' | 'echidna'; file: string | null }> = [
    { tool: 'medusa', file: path.join(metaDir, 'corpus_medusa', 'medusa-run.log') },
    { tool: 'medusa', file: newestFile(path.join(metaDir, 'logs_medusa')) },
    { tool: 'echidna', file: path.join(metaDir, 'corpus_echidna', 'echidna-run.log') },
  ];
  const logs: CampaignLog[] = [];
  for (const { tool, file } of candidates) {
    if (!file || !fs.existsSync(file)) continue;
    const parsed = (tool === 'medusa' ? parseMedusaLog : parseEchidnaLog)(
      fs.readFileSync(file, 'utf-8'),
    );
    if (parsed.tests.size === 0) continue;
    logs.push({ tool, file: rel(projectDir, file), mtimeMs: fs.statSync(file).mtimeMs, ...parsed });
  }
  return logs.sort((a, b) => b.mtimeMs - a.mtimeMs);
}

// ─── Sync ───────────────────────────────────────────────────────────

export interface FuzzSyncOptions {
  /** Project root (holds foundry.toml and the suite). Default: the parent of `outputDir`. */
  projectDir?: string;
  /** Suite dir relative to the project. Default: last-run.json's `suiteDir`, else `test/fizz`. */
  suiteDir?: string;
  /** Compute the summary without writing invariants or cards. */
  dryRun?: boolean;
}

export interface FuzzSyncInvariant {
  id: string;
  statement: string;
  properties: string[];
  /** `unchanged` = no new evidence (not run since its code changed, or unattributed). */
  status: FuzzTestStatus | 'unchanged';
  previous: FuzzTestStatus | null;
  /** Why, in a few words: `repro test_repro_x`, `failed in medusa`, `quarantined`, … */
  reason: string;
  runs?: number;
  repro_file?: string;
  issue_id?: string;
  issue_created?: boolean;
}

export interface FuzzSyncSummary {
  properties_file: string;
  suite_dir: string;
  logs: Array<{
    tool: 'medusa' | 'echidna';
    file: string;
    finished_at: string;
    calls: number | null;
    failed: string[];
  }>;
  invariants: FuzzSyncInvariant[];
  created_issues: Array<{ invariant: string; issue: string }>;
  /** Properties with no `(INV-NNN)` tag and no invariant whose `test.property_id` names them. */
  unmapped_properties: string[];
  /** `(INV-NNN)` tags that name no invariant in invariants.json. */
  unknown_invariants: Array<{ property: string; invariant: string }>;
  /** SP properties whose handler failed with no repro naming the property. */
  unattributed: Array<{ property: string; invariant: string | null; handlers: string[] }>;
}

interface PropertyVerdict {
  status: FuzzTestStatus | null;
  reason: string;
  functionName: string | null;
  file: string | null;
  log?: CampaignLog;
  repro?: string;
  /** SP only: handlers that reach it and failed, with no repro naming the property. */
  failedHandlers?: string[];
}

const PRECEDENCE: Record<FuzzTestStatus, number> = {
  not_written: 0,
  passing: 1,
  broken: 2,
  failing: 3,
};

function rel(projectDir: string, file: string): string {
  return path.relative(projectDir, file).split(path.sep).join('/');
}

function readText(file: string): string | null {
  try {
    return fs.readFileSync(file, 'utf-8');
  } catch {
    return null;
  }
}

function mtime(file: string): number {
  try {
    return fs.statSync(file).mtimeMs;
  } catch {
    return 0;
  }
}

/** Open card for an invariant created earlier (e.g. before issue_id was lost), if any. */
function existingInvariantCard(outputDir: string, invId: string): string | null {
  const raw = readText(path.join(outputDir, 'tracking.json'));
  if (!raw) return null;
  try {
    const t = JSON.parse(raw) as {
      findings?: Array<{ id: string; source?: string; source_ref?: string | null }>;
    };
    return t.findings?.find((f) => f.source === 'invariant' && f.source_ref === invId)?.id ?? null;
  } catch {
    return null;
  }
}

export function syncFuzzResults(outputDir: string, opts: FuzzSyncOptions = {}): FuzzSyncSummary {
  const projectDir = path.resolve(opts.projectDir ?? path.dirname(outputDir));
  const fuzzDir = path.join(outputDir, 'fuzz');
  const metaDir = path.join(fuzzDir, 'fizz_data');
  const propertiesPath = path.join(fuzzDir, 'PROPERTIES.md');

  const md = readText(propertiesPath);
  if (md === null) {
    throw new Error(
      `No ${rel(projectDir, propertiesPath)} yet. Run /fuzz first (Step 9 writes it).`,
    );
  }
  const properties = parsePropertiesMd(md);

  let lastRunSuite: string | undefined;
  try {
    lastRunSuite = (
      JSON.parse(readText(path.join(metaDir, 'last-run.json')) ?? '{}') as { suiteDir?: string }
    ).suiteDir;
  } catch {
    lastRunSuite = undefined;
  }
  const suiteRel = opts.suiteDir ?? lastRunSuite ?? 'test/fizz';
  const suiteDir = path.resolve(projectDir, suiteRel);
  const handlersDir = path.join(suiteDir, 'handlers');

  const solFiles: Array<{ abs: string; rel: string; src: string }> = [];
  const add = (abs: string) => {
    const src = readText(abs);
    if (src !== null) solFiles.push({ abs, rel: rel(projectDir, abs), src });
  };
  add(path.join(suiteDir, 'Properties.sol'));
  let handlerNames: string[] = [];
  try {
    handlerNames = fs
      .readdirSync(handlersDir)
      .filter((f) => f.endsWith('.sol'))
      .sort();
  } catch {
    handlerNames = [];
  }
  for (const f of handlerNames) add(path.join(handlersDir, f));
  const tagged = scanTagged(solFiles);
  const handlerFiles = solFiles.filter((f) => f.abs.startsWith(handlersDir + path.sep));
  const handlerFns = handlerFiles.flatMap((f) =>
    findFunctions(f.src).map((fn) => ({ fn, abs: f.abs })),
  );

  const testerPath = path.join(suiteDir, 'FoundryTester.sol');
  const repros = scanRepros(readText(testerPath) ?? '');
  const logs = readLogs(projectDir, metaDir);

  const judge = (p: FuzzProperty): PropertyVerdict => {
    const t = tagged.get(p.id);
    const base = { functionName: t?.functionName ?? null, file: t?.file ?? null };
    if (p.checkbox === ' ' || p.checkbox === '-') {
      return {
        ...base,
        status: 'not_written',
        reason: p.checkbox === ' ' ? 'not implemented yet' : 'skipped ([-])',
      };
    }
    if (p.checkbox === '~')
      return { ...base, status: 'broken', reason: 'quarantined by /fuzz-sync ([~])' };
    if (!t)
      return { ...base, status: 'broken', reason: `[x] but no /// @notice ${p.id}: function` };
    if (t.quarantined) return { ...base, status: 'broken', reason: 'function body quarantined' };

    // Tests whose outcome speaks for this property: its own function, and for
    // an internal SP property the handlers that reach it.
    const callers = p.id.startsWith('SP-')
      ? callingHandlers(
          t.functionName,
          handlerFns.map((h) => h.fn),
        )
      : [];
    const relevant = [t.functionName, ...callers];
    // Code newer than a log means the log did not run this version of the property.
    const codeFiles = [
      path.resolve(projectDir, t.file),
      ...handlerFns.filter((h) => callers.includes(h.fn.name)).map((h) => h.abs),
    ];
    const codeTime = Math.max(...codeFiles.map(mtime));
    const log = logs.find((l) => l.mtimeMs >= codeTime && relevant.some((n) => l.tests.has(n)));

    // A repro replays the violation deterministically: failing until it is removed.
    const repro = reprosFor(t.functionName, repros)[0];
    if (repro) {
      return {
        ...base,
        status: 'failing',
        reason: `repro ${repro.test}`,
        repro: rel(projectDir, testerPath),
        log,
      };
    }
    if (!log) return { ...base, status: null, reason: 'no campaign log newer than its code' };

    const own = log.tests.get(t.functionName);
    if (own === 'failed')
      return { ...base, status: 'failing', reason: `failed in ${log.tool}`, log };
    if (own === 'error')
      return { ...base, status: 'broken', reason: `${log.tool} could not evaluate it`, log };
    const failedHandlers = callers.filter((h) => log.tests.get(h) === 'failed');
    if (failedHandlers.length) {
      const reason = `handler failed (${failedHandlers.join(', ')}); no repro names it`;
      return { ...base, status: null, reason, log, failedHandlers };
    }
    return { ...base, status: 'passing', reason: `passed in ${log.tool}`, log };
  };

  const invFile = readInvariants(outputDir);
  const byId = new Map(invFile.invariants.map((i) => [i.id, i]));
  const byPropertyId = new Map<string, Invariant>();
  for (const i of invFile.invariants) {
    if (i.test?.tool === 'fizz' && i.test.property_id) byPropertyId.set(i.test.property_id, i);
  }

  const groups = new Map<string, Array<{ p: FuzzProperty; v: PropertyVerdict }>>();
  const unmapped: string[] = [];
  const unknown: FuzzSyncSummary['unknown_invariants'] = [];
  const unattributed: FuzzSyncSummary['unattributed'] = [];
  for (const p of properties) {
    const v = judge(p);
    const inv = p.invariantId ? byId.get(p.invariantId) : byPropertyId.get(p.id);
    if (v.failedHandlers) {
      unattributed.push({
        property: p.id,
        invariant: inv?.id ?? p.invariantId,
        handlers: v.failedHandlers,
      });
    }
    if (!inv) {
      if (p.invariantId) unknown.push({ property: p.id, invariant: p.invariantId });
      else unmapped.push(p.id);
      continue;
    }
    const g = groups.get(inv.id) ?? [];
    g.push({ p, v });
    groups.set(inv.id, g);
  }

  const summary: FuzzSyncSummary = {
    properties_file: rel(projectDir, propertiesPath),
    suite_dir: rel(projectDir, suiteDir),
    logs: logs.map((l) => ({
      tool: l.tool,
      file: l.file,
      finished_at: new Date(l.mtimeMs).toISOString(),
      calls: l.calls,
      failed: [...l.tests].filter(([, o]) => o === 'failed').map(([n]) => n),
    })),
    invariants: [],
    created_issues: [],
    unmapped_properties: unmapped,
    unknown_invariants: unknown,
    unattributed,
  };

  for (const [invId, entries] of groups) {
    const inv = byId.get(invId)!;
    const known = entries.filter((e) => e.v.status !== null);
    // Worst definite verdict decides; a property with no new evidence keeps the old status.
    const decider = known.sort((a, b) => PRECEDENCE[b.v.status!] - PRECEDENCE[a.v.status!])[0];
    const primary = decider ?? entries.find((e) => e.p.id === inv.test?.property_id) ?? entries[0];
    const status = decider?.v.status ?? null;
    const repro = entries.find((e) => e.v.repro)?.v.repro;

    const row: FuzzSyncInvariant = {
      id: invId,
      statement: inv.statement,
      properties: entries.map((e) => e.p.id),
      status: status ?? 'unchanged',
      previous: inv.test?.status ?? null,
      reason: primary.v.reason,
    };
    if (decider?.v.log?.calls != null) row.runs = decider.v.log.calls;
    if (status === 'failing' && repro) row.repro_file = repro;

    const test: Parameters<typeof setInvariantTest>[2] = {
      tool: 'fizz',
      property_id: primary.p.id,
    };
    const file = primary.v.file ?? inv.test?.file;
    if (file) test.file = file;
    if (status) {
      test.status = status;
      test.repro_file = row.repro_file; // undefined clears a stale repro
      if (row.runs != null) test.runs = row.runs;
      if (decider?.v.log) test.last_run_at = new Date(decider.v.log.mtimeMs).toISOString();
    }
    if (!opts.dryRun) setInvariantTest(outputDir, invId, test);

    if (status === 'failing' && repro && inv.status !== 'rejected') {
      if (inv.issue_id) {
        row.issue_id = inv.issue_id;
      } else {
        const existing = existingInvariantCard(outputDir, invId);
        if (existing) {
          row.issue_id = existing;
        } else if (!opts.dryRun) {
          row.issue_id = createIssue(outputDir, {
            source: 'invariant',
            source_ref: invId,
            title: `Invariant broken: ${inv.statement}`,
            severity: 'High',
          });
          row.issue_created = true;
          summary.created_issues.push({ invariant: invId, issue: row.issue_id });
        }
        if (row.issue_id && !opts.dryRun) linkInvariantIssue(outputDir, invId, row.issue_id);
      }
    }
    summary.invariants.push(row);
  }

  summary.invariants.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
  return summary;
}
