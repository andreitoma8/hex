/**
 * Canonical issue-mutation logic, shared by the `hex issue` CLI command and the
 * dashboard's PATCH/move API routes. Pure: depends only on node:fs / node:path
 * and is parameterized by `outputDir` (the project's `.hex/` directory) so it
 * can run from the CLI (resolves outputDir via config) or from the dashboard
 * server runtime (resolves outputDir via process.cwd()).
 *
 * The single source of truth for: materializing a findings.json entry from a
 * source-specific record (conformance / auditagent / ai-audit / github /
 * prior-audit), routing edits
 * between findings.json and tracking.json, and column→status mapping.
 *
 * Deliberately NOT imported across the src/ <-> dashboard/ tree boundary as a
 * dependency chain: it pulls in nothing beyond node builtins, so the dashboard
 * can import it via `experimental.externalDir` without dragging CLI deps
 * (chalk/ora/zod) into the Next.js bundle.
 */
import fs from 'node:fs';
import path from 'node:path';

// `rejected` is the canonical name for the column; `invalid` is kept as a
// back-compat alias (both map to status `rejected`). The column holds both
// false positives and true-but-by-design findings.
export type BoardColumn = 'potential' | 'verified' | 'invalid' | 'rejected' | 'duplicate';
export type Severity = 'Critical' | 'High' | 'Medium' | 'Low' | 'Info';
export type Resolution = 'Fixed' | 'Mitigated' | 'Acknowledged' | 'Not Fixed' | 'Unresolved';

export const SEVERITY_VALUES: readonly Severity[] = ['Critical', 'High', 'Medium', 'Low', 'Info'];
export const RESOLUTION_VALUES: readonly Resolution[] = [
  'Fixed',
  'Mitigated',
  'Acknowledged',
  'Not Fixed',
  'Unresolved',
];

export const COLUMN_TO_STATUS: Record<BoardColumn, string> = {
  potential: 'pending_validation',
  verified: 'verified',
  invalid: 'rejected',
  rejected: 'rejected',
  duplicate: 'duplicate',
};

/** Fields a user may edit through the board modal or `hex issue patch`. */
export const EDITABLE_FIELDS = [
  'title',
  'severity',
  'description',
  'recommendation',
  'resolution',
  'update_from_client',
  'notes',
] as const;
export type EditableField = (typeof EDITABLE_FIELDS)[number];

interface FindingLocation {
  file: string;
  snippet?: string;
}

export interface Finding {
  id: string;
  title: string;
  severity: Severity;
  category: string;
  description: string;
  root_cause: { locations: FindingLocation[] };
  poc: { status: string; file: string | null; validation_memo: string | null };
  recommendation: string;
  references: { external_links: string[] };
  created_at: string;
  update_from_client?: string;
  resolution?: Resolution;
  github?: Record<string, unknown>;
  source_ref?: string | null;
  [k: string]: unknown;
}

export interface TrackingEntry {
  id: string;
  title: string;
  severity: Severity;
  source: string;
  status: string;
  poc_status: string;
  poc_file: string | null;
  duplicates: string[];
  duplicate_of?: string | null;
  source_ref?: string | null;
  notes: string;
  [k: string]: unknown;
}

export interface GithubLink {
  issue_number: number;
  issue_url: string;
  state: 'open' | 'closed';
  last_synced_at: string;
  sync_status: string;
  comments: unknown[];
}

interface FindingsFile {
  findings: Finding[];
}
interface TrackingFile {
  findings: TrackingEntry[];
}

// ─── Low-level IO (atomic, JSON) ────────────────────────────────────

function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as T;
  } catch {
    return null;
  }
}

function writeJson(file: string, data: unknown): void {
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', 'utf-8');
  fs.renameSync(tmp, file);
}

function loadFindings(outputDir: string): FindingsFile {
  return readJson<FindingsFile>(path.join(outputDir, 'findings.json')) ?? { findings: [] };
}
function loadTracking(outputDir: string): TrackingFile {
  return readJson<TrackingFile>(path.join(outputDir, 'tracking.json')) ?? { findings: [] };
}

// ─── Validation ─────────────────────────────────────────────────────

export function isValidSeverity(v: unknown): v is Severity {
  return typeof v === 'string' && (SEVERITY_VALUES as readonly string[]).includes(v);
}
export function isValidResolution(v: unknown): v is Resolution {
  return typeof v === 'string' && (RESOLUTION_VALUES as readonly string[]).includes(v);
}

// ─── ID allocation ──────────────────────────────────────────────────

/**
 * Allocate the next uniform issue id (`H-001`, `H-002`, ...). Scans both
 * findings.json and tracking.json for the highest `H-<n>` so every creator
 * (init-audit conformance materialization, write-finding, ingest-aa-report,
 * sync-issues pull) agrees on a single sequential namespace.
 */
export function allocateId(outputDir: string): string {
  let max = 0;
  const scan = (id: string) => {
    const m = /^H-(\d+)$/.exec(id);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  };
  for (const f of loadFindings(outputDir).findings) scan(f.id);
  for (const t of loadTracking(outputDir).findings) scan(t.id);
  return `H-${String(max + 1).padStart(3, '0')}`;
}

// ─── Source-specific materialization ────────────────────────────────

function newEmptyFinding(id: string, severity: Severity): Finding {
  return {
    id,
    title: id,
    severity,
    category: '',
    description: '',
    root_cause: { locations: [] },
    poc: { status: 'not_started', file: null, validation_memo: null },
    recommendation: '',
    references: { external_links: [] },
    created_at: new Date().toISOString(),
  };
}

/** Build a findings.json record from a conformance item, keyed by source_ref. */
function findingFromConformance(
  outputDir: string,
  id: string,
  ref: string,
  tracking?: TrackingEntry,
): Finding | null {
  const spec = readJson<{ items?: Array<Record<string, unknown>> }>(
    path.join(outputDir, 'spec-conformance.json'),
  );
  const item = spec?.items?.find((i) => i.id === ref);
  if (!item) return null;
  const f = newEmptyFinding(
    id,
    (tracking?.severity ?? (item.severity_hint as Severity) ?? 'Info') as Severity,
  );
  f.title = tracking?.title ?? String(item.spec_text ?? id);
  f.category = 'Spec Conformance';
  f.description = String(item.finding ?? item.spec_text ?? '');
  const loc = item.code_location as
    | { file?: string; line_start?: number; line_end?: number }
    | undefined;
  if (loc?.file) {
    const snippet = snippetAt(outputDir, loc.file, loc.line_start, loc.line_end);
    f.root_cause.locations = [{ file: loc.file, ...(snippet ? { snippet } : {}) }];
  }
  f.source_ref = ref;
  return f;
}

/**
 * The code at a line range, as a location snippet. Findings stay line-free
 * (lines go stale as code changes); the snippet is what dedup and fix review
 * match back to the enclosing function.
 */
function snippetAt(
  outputDir: string,
  file: string,
  start?: number,
  end?: number,
): string | undefined {
  if (!start) return undefined;
  const cfg = readJson<{ project?: { project_dir?: string } }>(path.join(outputDir, 'config.json'));
  const root = cfg?.project?.project_dir ?? path.dirname(outputDir);
  try {
    const lines = fs.readFileSync(path.join(root, file), 'utf-8').split(/\r?\n/);
    const last = Math.min(end ?? start, start + 40, lines.length);
    const out = lines
      .slice(start - 1, last)
      .join('\n')
      .trimEnd();
    return out || undefined;
  } catch {
    return undefined;
  }
}

export type IssueSource =
  | 'manual'
  | 'conformance'
  | 'auditagent'
  | 'ai-audit'
  | 'github'
  | 'prior-audit'
  | 'invariant';

export const ISSUE_SOURCES: readonly IssueSource[] = [
  'manual',
  'conformance',
  'auditagent',
  'ai-audit',
  'github',
  'prior-audit',
  'invariant',
];

/** Sources whose cards start `unverified` (machine-generated, not yet triaged). */
const UNVERIFIED_SOURCES = new Set<IssueSource>(['auditagent', 'ai-audit', 'invariant']);

type RecordSource = 'auditagent' | 'ai-audit' | 'github';

function recordFileFor(outputDir: string, kind: RecordSource): string {
  switch (kind) {
    case 'auditagent':
      return path.join(outputDir, 'ai-results', 'auditagent', 'findings.json');
    case 'ai-audit':
      return path.join(outputDir, 'ai-results', 'ai-audit', 'findings.json');
    case 'github':
      return path.join(outputDir, 'external', 'github', 'findings.json');
  }
}

/** Build a findings.json record from an ai-results or external/github record, keyed by source_ref. */
function findingFromAiOrGithub(
  outputDir: string,
  id: string,
  kind: RecordSource,
  ref: string,
  tracking?: TrackingEntry,
): Finding | null {
  const nested = recordFileFor(outputDir, kind);
  const file = readJson<{ findings?: Array<Record<string, unknown>> }>(nested);
  const rec = file?.findings?.find(
    (r) => r.id === ref || String(r.issue_number ?? '') === ref || r.id === `github-${ref}`,
  );
  if (!rec) return null;
  const f = newEmptyFinding(id, (rec.severity as Severity) ?? tracking?.severity ?? 'Info');
  f.title = String(rec.title ?? tracking?.title ?? id);
  f.category = String(rec.category ?? '');
  f.description = String(rec.description ?? '');
  if (typeof rec.recommendation === 'string') f.recommendation = rec.recommendation;
  const affected = (rec.affected_code as Array<{ file: string; snippet?: string }>) ?? [];
  f.root_cause.locations = affected.map((a) => ({ file: a.file, snippet: a.snippet }));
  f.source_ref = ref;
  return f;
}

/**
 * Build a findings.json record from a prior-audit finding (differential mode):
 * a regression of an earlier finding, keyed by the prior report's id.
 */
function findingFromPriorAudit(
  outputDir: string,
  id: string,
  ref: string,
  tracking?: TrackingEntry,
): Finding | null {
  const file = readJson<{ findings?: Array<Record<string, unknown>> }>(
    path.join(outputDir, 'previous-audit', 'findings.json'),
  );
  const rec = file?.findings?.find((r) => r.id === ref);
  if (!rec) return null;
  const f = newEmptyFinding(id, (rec.severity as Severity) ?? tracking?.severity ?? 'Info');
  f.title = String(tracking?.title ?? rec.title ?? id);
  f.category = 'Regression';
  f.description = String(rec.description ?? '');
  if (typeof rec.recommendation === 'string') f.recommendation = rec.recommendation;
  const locs = (rec.locations as Array<{ file: string; snippet?: string }>) ?? [];
  f.root_cause.locations = locs.map((l) => ({ file: l.file, snippet: l.snippet }));
  f.source_ref = ref;
  return f;
}

/**
 * Build a findings.json record from a violated invariant (fuzzing found a
 * counterexample). The repro test becomes the card's PoC.
 */
function findingFromInvariant(
  outputDir: string,
  id: string,
  ref: string,
  tracking?: TrackingEntry,
): Finding | null {
  const file = readJson<{ invariants?: Array<Record<string, unknown>> }>(
    path.join(outputDir, 'model', 'invariants.json'),
  );
  const inv = file?.invariants?.find((i) => i.id === ref);
  if (!inv) return null;
  const f = newEmptyFinding(id, tracking?.severity ?? 'Medium');
  f.title = String(tracking?.title ?? `Invariant broken: ${String(inv.statement)}`);
  f.category = 'Invariant violation';
  f.description = String(inv.statement ?? '');
  const evidence = (inv.evidence as Array<{ file: string }> | undefined) ?? [];
  f.root_cause.locations = [...new Set(evidence.map((e) => e.file))].map((file) => ({ file }));
  const test = inv.test as { repro_file?: string; file?: string } | undefined;
  if (test?.repro_file || test?.file) {
    f.poc = {
      status: 'passing',
      file: test.repro_file ?? test.file ?? null,
      validation_memo: null,
    };
  }
  f.source_ref = ref;
  return f;
}

/** Dispatch to the source-specific materializer. */
function materialize(
  outputDir: string,
  id: string,
  source: string | undefined,
  ref: string,
  tracking?: TrackingEntry,
): Finding | null {
  if (!ref) return null;
  switch (source) {
    case 'conformance':
      return findingFromConformance(outputDir, id, ref, tracking);
    case 'auditagent':
    case 'ai-audit':
    case 'github':
      return findingFromAiOrGithub(outputDir, id, source, ref, tracking);
    case 'prior-audit':
      return findingFromPriorAudit(outputDir, id, ref, tracking);
    case 'invariant':
      return findingFromInvariant(outputDir, id, ref, tracking);
    default:
      return null;
  }
}

/**
 * Ensure a findings.json entry exists for `id`, materializing one from the
 * source-specific record if needed. Idempotent: returns the existing entry
 * untouched when present. Dispatches on the tracking entry's `source` +
 * `source_ref` (not the id, which is now a uniform `H-NNN`).
 */
export function ensureFindingExists(outputDir: string, id: string): Finding {
  const findings = loadFindings(outputDir);
  const existing = findings.findings.find((f) => f.id === id);
  if (existing) return existing;

  const tracking = loadTracking(outputDir).findings.find((t) => t.id === id);
  const ref = tracking?.source_ref ?? '';

  let materialized = materialize(outputDir, id, tracking?.source, ref, tracking);

  // Fallback: synthesize a minimal record from the tracking entry (manual
  // findings, or any source record we couldn't read).
  if (!materialized) {
    materialized = newEmptyFinding(id, tracking?.severity ?? 'Info');
    if (tracking?.title) materialized.title = tracking.title;
    if (tracking?.source_ref) materialized.source_ref = tracking.source_ref;
  }

  findings.findings.push(materialized);
  writeJson(path.join(outputDir, 'findings.json'), findings);
  return materialized;
}

// ─── Mutations ──────────────────────────────────────────────────────

/**
 * Move an issue between board columns. Materializes a findings.json entry first
 * (so non-manual cards become reportable when promoted to Verified), then flips
 * the tracking status.
 *
 * Note: this does NOT edit the user's source files. Source annotation
 * (`// @audit-issue-verified ...`) remains the responsibility of the
 * /validate-finding skill, which the auditor invokes deliberately — a drag-drop
 * on the board should never silently rewrite .sol files.
 */
const SYNCED_LOCK_MSG =
  'Issue is synced to GitHub and is read-only in Hex. Edit it on GitHub, then run /sync-issues to pull the changes.';

export function moveIssue(
  outputDir: string,
  id: string,
  column: BoardColumn,
  duplicateOf?: string,
): TrackingEntry {
  const nextStatus = COLUMN_TO_STATUS[column];
  // `synced` is reachable only via markSynced (the /sync-issues path), never drag/move.
  if (!nextStatus) {
    throw new Error(
      `Invalid column: ${column}. The "synced" column is reached only via /sync-issues.`,
    );
  }

  const current = loadTracking(outputDir).findings.find((t) => t.id === id);
  if (current?.status === 'synced') throw new Error(SYNCED_LOCK_MSG);

  // Promoting to Verified should make the issue reportable.
  if (column === 'verified') ensureFindingExists(outputDir, id);

  const tracking = loadTracking(outputDir);
  let entry = tracking.findings.find((t) => t.id === id);
  if (!entry) {
    // The board only surfaces tracking entries, but be defensive: synthesize one
    // from the (now-ensured) finding so a move never 404s on a real card.
    const finding = ensureFindingExists(outputDir, id);
    entry = {
      id,
      title: finding.title,
      severity: finding.severity,
      source: 'manual',
      status: nextStatus,
      poc_status: finding.poc?.status ?? 'not_started',
      poc_file: finding.poc?.file ?? null,
      duplicates: [],
      duplicate_of: column === 'duplicate' ? (duplicateOf ?? null) : null,
      notes: '',
    };
    tracking.findings.push(entry);
  } else {
    entry.status = nextStatus;
  }

  if (column === 'duplicate') {
    // Record the canonical issue this duplicates, if given.
    if (duplicateOf) entry.duplicate_of = duplicateOf;
  } else if (entry.duplicate_of) {
    // Clear a stale duplicate pointer when the card leaves the Duplicate column.
    entry.duplicate_of = null;
  }

  writeJson(path.join(outputDir, 'tracking.json'), tracking);
  return entry;
}

/**
 * Patch editable fields on an issue. Materializes a findings.json entry first so
 * description / recommendation / resolution / update_from_client always land on
 * a real record (not just non-manual cards' tracking rows). Title / severity /
 * notes are mirrored on the tracking entry so the board reads current values
 * without re-reading findings.json.
 */
export function patchIssue(
  outputDir: string,
  id: string,
  updates: Record<string, unknown>,
): Finding {
  const clean: Partial<Record<EditableField, unknown>> = {};
  for (const key of EDITABLE_FIELDS) {
    if (!(key in updates)) continue;
    const value = updates[key];
    if (key === 'severity' && value != null && !isValidSeverity(value)) {
      throw new Error(`Invalid severity: ${String(value)}`);
    }
    if (key === 'resolution' && value != null && value !== '' && !isValidResolution(value)) {
      throw new Error(`Invalid resolution: ${String(value)}`);
    }
    clean[key] = value;
  }
  // `files` is not an editable text field; it sets root_cause.locations directly.
  const files = Array.isArray(updates.files)
    ? (updates.files as unknown[]).filter((v): v is string => typeof v === 'string')
    : null;
  if (Object.keys(clean).length === 0 && !files) {
    throw new Error('No editable fields supplied');
  }

  const current = loadTracking(outputDir).findings.find((t) => t.id === id);
  if (current?.status === 'synced') throw new Error(SYNCED_LOCK_MSG);

  const finding = ensureFindingExists(outputDir, id);
  const findings = loadFindings(outputDir);
  const target = findings.findings.find((f) => f.id === id) ?? finding;

  for (const [key, value] of Object.entries(clean)) {
    if (key === 'notes') continue; // notes lives on tracking, not findings
    if (key === 'resolution' && (value === '' || value == null)) {
      delete target.resolution;
      continue;
    }
    (target as Record<string, unknown>)[key] = value;
  }
  if (files) {
    target.root_cause.locations = files.map((file) => ({ file }));
  }
  writeJson(path.join(outputDir, 'findings.json'), findings);

  // Mirror title / severity / notes onto tracking.
  const tracking = loadTracking(outputDir);
  const entry = tracking.findings.find((t) => t.id === id);
  if (entry) {
    if ('title' in clean) entry.title = clean.title as string;
    if ('severity' in clean) entry.severity = clean.severity as Severity;
    if ('notes' in clean) entry.notes = clean.notes as string;
    writeJson(path.join(outputDir, 'tracking.json'), tracking);
  }

  return target;
}

// ─── Creation ───────────────────────────────────────────────────────

export interface CreateIssueInput {
  source: IssueSource;
  source_ref?: string | null;
  title: string;
  severity?: Severity;
  /** Affected file path(s); populates root_cause.locations (the File(s) line). */
  files?: string[];
}

/**
 * Allocate a uniform `H-NNN` id and write a tracking entry + findings.json
 * skeleton. Returns the new id. Conformance/manual start in the Potential
 * column (`pending_validation`); auditagent / ai-audit start `unverified`. Skills call
 * this (via `hex issue new`) instead of hand-writing JSON.
 */
export function createIssue(outputDir: string, input: CreateIssueInput): string {
  const id = allocateId(outputDir);
  const status = UNVERIFIED_SOURCES.has(input.source) ? 'unverified' : 'pending_validation';

  // Materialize the full finding from the source record when source_ref
  // resolves (conformance / auditagent / ai-audit / github / prior-audit), so the board shows the real
  // description immediately. Fall back to a titled skeleton otherwise.
  let f = materialize(outputDir, id, input.source, input.source_ref ?? '');
  if (!f) {
    f = newEmptyFinding(id, input.severity ?? 'Info');
    f.title = input.title;
    if (input.source_ref) f.source_ref = input.source_ref;
  }
  // An explicit --severity / --title from the caller wins over the source record.
  if (input.severity) f.severity = input.severity;
  if (input.title) f.title = input.title;
  // Explicit affected files populate the File(s) line.
  if (input.files && input.files.length > 0) {
    f.root_cause.locations = input.files.map((file) => ({ file }));
  }
  const severity: Severity = f.severity;

  const findings = loadFindings(outputDir);
  findings.findings.push(f);
  writeJson(path.join(outputDir, 'findings.json'), findings);

  const tracking = loadTracking(outputDir);
  tracking.findings.push({
    id,
    title: input.title,
    severity,
    source: input.source,
    status,
    poc_status: 'not_started',
    poc_file: null,
    duplicates: [],
    duplicate_of: null,
    source_ref: input.source_ref ?? null,
    notes: '',
  });
  writeJson(path.join(outputDir, 'tracking.json'), tracking);

  return id;
}

// ─── Sync (the only producer of status: 'synced') ───────────────────

export interface SyncFields {
  title?: string;
  severity?: Severity;
  description?: string;
  recommendation?: string;
  resolution?: Resolution | '';
  update_from_client?: string;
}

/**
 * Mark an issue as synced to GitHub: set status to `synced`, write the github
 * block, and overwrite finding fields from GitHub (GitHub is the source of
 * truth once synced). Used by /sync-issues for both push-confirm (after
 * `gh issue create`) and pull-update (GitHub edits → local). This is the only
 * function that produces `status: 'synced'`.
 */
export function markSynced(
  outputDir: string,
  id: string,
  github: GithubLink,
  fields: SyncFields = {},
): Finding {
  const finding = ensureFindingExists(outputDir, id);
  const findings = loadFindings(outputDir);
  const target = findings.findings.find((f) => f.id === id) ?? finding;

  if (fields.title != null) target.title = fields.title;
  if (fields.severity != null && isValidSeverity(fields.severity))
    target.severity = fields.severity;
  if (fields.description != null) target.description = fields.description;
  if (fields.recommendation != null) target.recommendation = fields.recommendation;
  if (fields.update_from_client != null) target.update_from_client = fields.update_from_client;
  if (fields.resolution != null) {
    if (fields.resolution === '') delete target.resolution;
    else if (isValidResolution(fields.resolution)) target.resolution = fields.resolution;
  }
  target.github = { ...github };
  writeJson(path.join(outputDir, 'findings.json'), findings);

  const tracking = loadTracking(outputDir);
  let entry = tracking.findings.find((t) => t.id === id);
  if (!entry) {
    entry = {
      id,
      title: target.title,
      severity: target.severity,
      source: 'github',
      status: 'synced',
      poc_status: target.poc?.status ?? 'not_started',
      poc_file: target.poc?.file ?? null,
      duplicates: [],
      duplicate_of: null,
      source_ref: String(github.issue_number),
      notes: '',
    };
    tracking.findings.push(entry);
  } else {
    entry.status = 'synced';
    entry.title = target.title;
    entry.severity = target.severity;
    if (entry.source_ref == null) entry.source_ref = String(github.issue_number);
  }
  writeJson(path.join(outputDir, 'tracking.json'), tracking);

  return target;
}

// ─── Validation (PoC results, agent pre-validation) ─────────────────

export type Verdict = 'reproduced' | 'refuted' | 'uncertain' | 'valid_no_poc';

export interface ValidationInput {
  verdict: Verdict;
  validated_by: 'auditor' | 'agent';
  memo?: string;
  poc_file?: string;
  poc_status?: 'passing' | 'failing' | 'not_started';
  /** Independent refuter agents that agreed (auto-reject needs 2). */
  refuters?: number;
  /** The reality gate passed: true and security-relevant, not by design. */
  reality_gate?: boolean;
}

/**
 * Where an agent may move a card on its own. Conservative by construction:
 * reproduced only with a passing PoC and a passed reality gate; refuted only
 * when two independent refuters agree. Everything else stays with the auditor.
 */
export function autoMoveTarget(v: ValidationInput): 'verified' | 'rejected' | null {
  if (v.validated_by !== 'agent') return null;
  if (v.verdict === 'reproduced' && v.poc_status === 'passing' && v.reality_gate === true)
    return 'verified';
  if (v.verdict === 'refuted' && (v.refuters ?? 0) >= 2) return 'rejected';
  return null;
}

/**
 * Record a validation on a card: verdict, memo, PoC file and status. With
 * `autoMove`, an agent verdict that meets autoMoveTarget() moves the card and
 * is marked so the auditor can see and revert it.
 */
export function recordValidation(
  outputDir: string,
  id: string,
  v: ValidationInput,
  opts: { autoMove?: boolean } = {},
): { finding: Finding; movedTo: 'verified' | 'rejected' | null } {
  const current = loadTracking(outputDir).findings.find((t) => t.id === id);
  if (!current) throw new Error(`No issue ${id}`);
  // PoC and validation results are local evidence that never reaches the GitHub
  // body (sync rewrites only content fields), so a synced card accepts them;
  // only its column is locked. Fix review depends on PoCs for synced cards.
  const synced = current.status === 'synced';

  ensureFindingExists(outputDir, id);
  const target = opts.autoMove && !synced ? autoMoveTarget(v) : null;
  const at = new Date().toISOString();
  const validation = {
    verdict: v.verdict,
    validated_by: v.validated_by,
    ...(v.memo ? { memo: v.memo } : {}),
    ...(v.poc_file ? { poc_file: v.poc_file } : {}),
    ...(v.poc_status ? { poc_status: v.poc_status } : {}),
    ...(v.refuters !== undefined ? { refuters: v.refuters } : {}),
    ...(target ? { auto_moved_to: target } : {}),
    at,
  };

  const findings = loadFindings(outputDir);
  const f = findings.findings.find((x) => x.id === id)!;
  f.validation = validation;
  f.poc = {
    status: v.poc_status ?? f.poc?.status ?? 'not_started',
    file: v.poc_file ?? f.poc?.file ?? null,
    validation_memo: v.memo ?? f.poc?.validation_memo ?? null,
  };
  writeJson(path.join(outputDir, 'findings.json'), findings);

  const tracking = loadTracking(outputDir);
  const t = tracking.findings.find((x) => x.id === id)!;
  t.poc_status = f.poc.status;
  t.poc_file = f.poc.file;
  t.validation = validation;
  writeJson(path.join(outputDir, 'tracking.json'), tracking);

  if (target) moveIssue(outputDir, id, target);
  return { finding: f, movedTo: target };
}

/** Undo an agent's auto-move: back to Potential, auto flag cleared. */
export function revertAutoMove(outputDir: string, id: string): TrackingEntry {
  const entry = moveIssue(outputDir, id, 'potential');
  const tracking = loadTracking(outputDir);
  const t = tracking.findings.find((x) => x.id === id);
  const v = t?.validation as Record<string, unknown> | undefined;
  if (t && v) {
    delete v.auto_moved_to;
    v.reverted_at = new Date().toISOString();
    writeJson(path.join(outputDir, 'tracking.json'), tracking);
    const findings = loadFindings(outputDir);
    const f = findings.findings.find((x) => x.id === id);
    if (f) {
      f.validation = { ...v };
      writeJson(path.join(outputDir, 'findings.json'), findings);
    }
  }
  return entry;
}
