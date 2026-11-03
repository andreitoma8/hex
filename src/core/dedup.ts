/**
 * One dedup engine for every finding source (manual, AuditAgent, /ai-audit,
 * conformance, GitHub, prior-audit, invariant). The deterministic part —
 * mapping cards to exact functions and ranking candidates — lives here; the
 * semantic judgement (root cause, attack vector) is the agent's, against the
 * rules below, which exist only in this file.
 *
 * Node builtins only (the dashboard and the MCP server import it).
 */
import fs from 'node:fs';
import path from 'node:path';
import { moveIssue } from './issues.js';
import type { Facts, FactsFunction } from '../types/index.js';

export const DEDUP_RULES = `Compare the two findings on four signals:
- contract (boolean): does the affected contract match?
- function (boolean): does the affected function match?
- root_cause: same / overlapping / different — the technical mechanism.
- attack_vector: same / overlapping / different — what the attacker actually does.

They are duplicates when at least one holds:
1. root_cause = same AND function = true
2. root_cause = same AND contract = true AND attack_vector = same
3. root_cause = overlapping AND function = true AND attack_vector = same

The canonical card is the earliest-created card that is not itself a duplicate.
A synced (GitHub) card always wins over a local one.`;

interface FindingLike {
  id: string;
  title?: string;
  description?: string;
  created_at?: string;
  root_cause?: { locations?: Array<{ file: string; snippet?: string }> };
}
interface TrackingLike {
  id: string;
  status: string;
  source: string;
  title: string;
  duplicate_of?: string | null;
}

function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as T;
  } catch {
    return null;
  }
}

export function projectDirOf(outputDir: string): string {
  const cfg = readJson<{ project?: { project_dir?: string } }>(path.join(outputDir, 'config.json'));
  return cfg?.project?.project_dir ?? path.dirname(outputDir);
}

function loadFactsFile(outputDir: string): Facts | null {
  return readJson<Facts>(path.join(outputDir, 'facts.json'));
}

function enclosing(facts: Facts, file: string, line: number): FactsFunction[] {
  return facts.functions.filter(
    (f) => f.file === file && f.line_start <= line && line <= f.line_end && f.kind !== 'modifier',
  );
}

/**
 * Exact function ids a finding is about: snippet lines located in the cited
 * files, plus backticked `name(...)` identifiers resolved within the cited
 * contracts (or anywhere when no file is cited).
 */
export function functionsForFinding(
  facts: Facts,
  finding: FindingLike,
  projectDir: string,
): string[] {
  const out = new Set<string>();
  const files = (finding.root_cause?.locations ?? []).map((l) => l.file);
  const probeLines = (code: string) =>
    code
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 8 && !l.startsWith('//') && l !== '// ....');
  const locate = (file: string, probes: string[]) => {
    let content: string;
    try {
      content = fs.readFileSync(path.join(projectDir, file), 'utf-8');
    } catch {
      return;
    }
    const lines = content.split(/\r?\n/);
    for (const probe of probes.slice(0, 6)) {
      const idx = lines.findIndex((l) => l.trim() === probe || l.includes(probe));
      if (idx >= 0) for (const f of enclosing(facts, file, idx + 1)) out.add(f.id);
    }
  };
  for (const loc of finding.root_cause?.locations ?? []) {
    if (loc.snippet) locate(loc.file, probeLines(loc.snippet));
  }
  // Hex-standard descriptions carry the offending code in a fenced block.
  const blocks = [...(finding.description ?? '').matchAll(/```[a-z]*\n([\s\S]*?)```/g)].map(
    (m) => m[1],
  );
  if (blocks.length) {
    const searchFiles = files.length
      ? [...new Set(files)]
      : [...new Set(facts.functions.filter((f) => f.in_scope).map((f) => f.file))];
    const probes = blocks.flatMap(probeLines);
    for (const file of searchFiles) locate(file, probes);
  }
  const text = `${finding.title ?? ''}\n${finding.description ?? ''}`;
  const names = new Set([...text.matchAll(/`([A-Za-z_][A-Za-z0-9_]*)\(/g)].map((m) => m[1]));
  for (const name of names) {
    for (const f of facts.functions) {
      if (f.name !== name || f.kind === 'modifier') continue;
      if (files.length && !files.includes(f.file)) continue;
      out.add(f.id);
    }
  }
  return [...out].sort();
}

function tokens(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[`*_()[\],.:;]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 2 && !STOP.has(t)),
  );
}
const STOP = new Set([
  'the',
  'and',
  'for',
  'can',
  'not',
  'with',
  'from',
  'that',
  'this',
  'are',
  'when',
  'into',
  'may',
  'allows',
  'missing',
  'lack',
  'lacks',
]);

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

export interface DedupCandidate {
  id: string;
  title: string;
  status: string;
  source: string;
  same_function: boolean;
  same_contract: boolean;
  shared_functions: string[];
  title_similarity: number;
  strength: 'strong' | 'weak';
}

export interface DedupReport {
  id: string;
  functions: string[];
  candidates: DedupCandidate[];
  rules: string;
}

/** Rank existing cards that may duplicate `id`. Judgement stays with the caller. */
export function dedupCandidates(outputDir: string, id: string, limit = 8): DedupReport {
  const findings =
    readJson<{ findings: FindingLike[] }>(path.join(outputDir, 'findings.json'))?.findings ?? [];
  const tracking =
    readJson<{ findings: TrackingLike[] }>(path.join(outputDir, 'tracking.json'))?.findings ?? [];
  const facts = loadFactsFile(outputDir);
  const projectDir = projectDirOf(outputDir);
  const byId = new Map(findings.map((f) => [f.id, f]));
  const target = byId.get(id) ?? { id, title: tracking.find((t) => t.id === id)?.title ?? '' };
  const targetFns = facts ? functionsForFinding(facts, target, projectDir) : [];
  const contractsOf = (fns: string[]) => new Set(fns.map((f) => f.slice(0, f.indexOf('.'))));
  const targetContracts = contractsOf(targetFns);
  const targetTokens = tokens(target.title ?? '');

  const candidates: DedupCandidate[] = [];
  for (const t of tracking) {
    if (t.id === id || t.status === 'duplicate') continue;
    const f = byId.get(t.id) ?? { id: t.id, title: t.title };
    const fns = facts ? functionsForFinding(facts, f, projectDir) : [];
    const shared = fns.filter((x) => targetFns.includes(x));
    const sameContract = [...contractsOf(fns)].some((c) => targetContracts.has(c));
    const sim = jaccard(targetTokens, tokens(f.title ?? t.title));
    if (!shared.length && !sameContract && sim < 0.25) continue;
    candidates.push({
      id: t.id,
      title: t.title,
      status: t.status,
      source: t.source,
      same_function: shared.length > 0,
      same_contract: sameContract,
      shared_functions: shared,
      title_similarity: Math.round(sim * 100) / 100,
      strength: shared.length > 0 || (sameContract && sim >= 0.3) ? 'strong' : 'weak',
    });
  }
  candidates.sort(
    (a, b) =>
      Number(b.same_function) - Number(a.same_function) ||
      Number(b.same_contract) - Number(a.same_contract) ||
      b.title_similarity - a.title_similarity,
  );
  return { id, functions: targetFns, candidates: candidates.slice(0, limit), rules: DEDUP_RULES };
}

export interface MatchSignals {
  contract: boolean;
  function: boolean;
  root_cause: 'same' | 'overlapping' | 'different';
  attack_vector: 'same' | 'overlapping' | 'different';
}

interface ComparisonFile {
  duplicates: Array<Record<string, unknown>>;
  novel: unknown[];
  rejected: Array<{ id: string; reason: string }>;
}

function readComparison(outputDir: string): ComparisonFile {
  const c = readJson<Partial<ComparisonFile>>(path.join(outputDir, 'comparison.json'));
  return { duplicates: c?.duplicates ?? [], novel: c?.novel ?? [], rejected: c?.rejected ?? [] };
}
function writeComparison(outputDir: string, c: ComparisonFile): void {
  const p = path.join(outputDir, 'comparison.json');
  const tmp = p + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(c, null, 2) + '\n', 'utf-8');
  fs.renameSync(tmp, p);
}

/** Move `id` to Duplicate pointing at `of`, and record why — in one step. */
export function markDuplicate(
  outputDir: string,
  id: string,
  of: string,
  input: { signals: MatchSignals; reasoning: string; confidence: 'high' | 'medium' | 'low' },
): void {
  if (id === of) throw new Error('A card cannot duplicate itself.');
  moveIssue(outputDir, id, 'duplicate', of);
  const c = readComparison(outputDir);
  c.duplicates = c.duplicates.filter((d) => d.ai_finding !== id);
  c.duplicates.push({
    ai_finding: id,
    matches: of,
    confidence: input.confidence,
    match_signals: input.signals,
    reasoning: input.reasoning,
  });
  writeComparison(outputDir, c);
}

/** Reject `id` because a triage rule covers it, and record which rule. */
export function excludeByRule(
  outputDir: string,
  id: string,
  ruleId: string,
  ruleText: string,
): void {
  moveIssue(outputDir, id, 'rejected');
  const c = readComparison(outputDir);
  c.rejected = c.rejected.filter((r) => r.id !== id);
  c.rejected.push({ id, reason: `${ruleId}: ${ruleText}` });
  writeComparison(outputDir, c);
}
