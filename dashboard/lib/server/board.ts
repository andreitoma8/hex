/**
 * Board cards: tracking.json is canonical for status + source; findings.json,
 * ai-results/, external/ and spec-conformance.json fill in the body.
 */
import { listSubdirs, readJsonFile, readNestedJsonFile } from '@/lib/data';
import { functionsForFinding } from '../../../src/core/dedup';
import type { BoardColumn, BoardIssue, CardRef, CardValidation, SyncState } from '@/lib/types';
import { projectRoot, readFacts } from './workspace';

type Sev = BoardIssue['severity'];

interface FindingsFile {
  findings: Array<{
    id: string;
    title: string;
    severity: Sev;
    description?: string;
    recommendation?: string;
    resolution?: string;
    update_from_client?: string;
    root_cause?: { locations?: Array<{ file: string; snippet?: string }> };
    poc?: { status?: string; file?: string | null; validation_memo?: string | null };
    github?: { issue_number?: number; issue_url?: string; state?: string; sync_status?: string };
    category?: string;
    validation?: CardValidation;
    source_ref?: string | null;
  }>;
}

interface TrackingFile {
  findings: Array<{
    id: string;
    title: string;
    severity: Sev;
    source?: string;
    status?: string;
    poc_status?: string;
    poc_file?: string | null;
    duplicates?: string[];
    duplicate_of?: string | null;
    notes?: string;
    source_ref?: string | null;
    validation?: CardValidation;
  }>;
}

interface ComparisonFile {
  duplicates?: Array<{
    ai_finding: string;
    matches: string;
    match_signals?: Record<string, boolean | string>;
    reasoning?: string;
  }>;
}

interface AiResultFile {
  tool?: string;
  findings: Array<{
    id: string;
    title: string;
    severity: Sev;
    description?: string;
    affected_code?: Array<{ file: string; snippet?: string }>;
    category?: string;
  }>;
}

interface SpecFile {
  items?: Array<{
    id: string;
    spec_text: string;
    finding: string;
    code_location?: { file: string };
  }>;
}

function syncState(
  status: string | undefined,
  github: { issue_number?: number; state?: string; sync_status?: string } | undefined,
): SyncState {
  if (status !== 'verified' && status !== 'synced') return 'none';
  if (!github?.issue_number) return 'unsynced';
  if (github.sync_status && github.sync_status !== 'in_sync') return 'conflict';
  return github.state === 'closed' ? 'synced_closed' : 'synced_open';
}

export function statusToColumn(status: string | undefined): BoardColumn {
  switch (status) {
    case 'verified':
      return 'verified';
    case 'synced':
      return 'synced';
    case 'rejected':
      return 'invalid';
    case 'duplicate':
      return 'duplicate';
    default:
      return 'potential';
  }
}

export function buildBoard(): BoardIssue[] {
  const findings = readJsonFile<FindingsFile>('findings.json') ?? { findings: [] };
  const tracking = readJsonFile<TrackingFile>('tracking.json') ?? { findings: [] };
  const comparison = readJsonFile<ComparisonFile>('comparison.json') ?? {};
  const spec = readJsonFile<SpecFile>('spec-conformance.json') ?? {};
  const facts = readFacts();
  const root = projectRoot();

  const findingById = new Map(findings.findings.map((f) => [f.id, f]));
  const specById = new Map((spec.items ?? []).map((s) => [s.id, s]));
  const aiById = new Map<string, AiResultFile['findings'][number]>();
  for (const dir of ['ai-results', 'external']) {
    for (const tool of listSubdirs(dir)) {
      const file = readNestedJsonFile<AiResultFile>(`${dir}/${tool}/findings.json`);
      for (const f of file?.findings ?? []) aiById.set(f.id, f);
    }
  }
  const dupById = new Map((comparison.duplicates ?? []).map((d) => [d.ai_finding, d]));

  const fnsFor = (
    id: string,
    title: string,
    description: string,
    locations: Array<{ file: string; snippet?: string }>,
  ) => {
    if (!facts) return [];
    try {
      return functionsForFinding(
        facts,
        { id, title, description, root_cause: { locations } },
        root,
      );
    } catch {
      return [];
    }
  };

  const out: BoardIssue[] = [];
  const seen = new Set<string>();

  for (const t of tracking.findings) {
    const f = findingById.get(t.id);
    const ai = aiById.get(t.id);
    const sp = specById.get(t.id);
    const description = f?.description ?? ai?.description ?? sp?.finding ?? '';
    const locations =
      f?.root_cause?.locations?.map((l) => ({ file: l.file, snippet: l.snippet })) ??
      ai?.affected_code?.map((l) => ({ file: l.file, snippet: l.snippet })) ??
      (sp?.code_location?.file ? [{ file: sp.code_location.file }] : []);
    const dup = dupById.get(t.id);
    const title = t.title || f?.title || ai?.title || sp?.spec_text || t.id;
    seen.add(t.id);
    out.push({
      id: t.id,
      title,
      severity: t.severity,
      source: (t.source ?? 'manual') as BoardIssue['source'],
      status: t.status ?? 'pending_validation',
      column: statusToColumn(t.status),
      description,
      recommendation: f?.recommendation ?? '',
      resolution: f?.resolution,
      update_from_client: f?.update_from_client,
      code_locations: locations,
      github_issue_url: f?.github?.issue_url,
      github_issue_number: f?.github?.issue_number,
      github_state: f?.github?.state,
      sync_state: syncState(t.status, f?.github),
      duplicate_of: t.duplicate_of ?? dup?.matches ?? null,
      match_signals: dup?.match_signals
        ? {
            contract: Boolean(dup.match_signals.contract),
            function: Boolean(dup.match_signals.function),
            root_cause: String(dup.match_signals.root_cause ?? ''),
            attack_vector: String(dup.match_signals.attack_vector ?? ''),
          }
        : undefined,
      reasoning: dup?.reasoning,
      category: f?.category || ai?.category,
      poc_status: (t.poc_status ?? f?.poc?.status) as BoardIssue['poc_status'],
      poc_file: t.poc_file ?? f?.poc?.file ?? null,
      notes: t.notes ?? '',
      source_ref: t.source_ref ?? f?.source_ref ?? null,
      validation: t.validation ?? f?.validation,
      functions: fnsFor(t.id, title, description, locations),
    });
  }

  // findings.json entries without a tracking row (legacy data) render as verified.
  for (const f of findings.findings) {
    if (seen.has(f.id)) continue;
    const locations = f.root_cause?.locations ?? [];
    out.push({
      id: f.id,
      title: f.title,
      severity: f.severity,
      source: 'manual',
      status: 'verified',
      column: 'verified',
      description: f.description ?? '',
      recommendation: f.recommendation ?? '',
      resolution: f.resolution,
      update_from_client: f.update_from_client,
      code_locations: locations,
      github_issue_url: f.github?.issue_url,
      github_issue_number: f.github?.issue_number,
      github_state: f.github?.state,
      sync_state: syncState('verified', f.github),
      duplicate_of: null,
      category: f.category,
      poc_status: f.poc?.status as BoardIssue['poc_status'],
      poc_file: f.poc?.file ?? null,
      notes: '',
      source_ref: f.source_ref ?? null,
      validation: f.validation,
      functions: fnsFor(f.id, f.title, f.description ?? '', locations),
    });
  }
  return out;
}

/** id → compact card for inspectors on other pages. */
export function cardRefs(board: BoardIssue[] = buildBoard()): Record<string, CardRef> {
  const out: Record<string, CardRef> = {};
  for (const c of board)
    out[c.id] = { id: c.id, title: c.title, severity: c.severity, column: c.column };
  return out;
}
