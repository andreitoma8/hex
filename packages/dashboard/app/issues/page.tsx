import { readJsonFile, readNestedJsonFile, listSubdirs } from '@/lib/data';
import { NotYetGenerated } from '@/components/NotYetGenerated';
import { IssuesBoardClient, type BoardIssue } from './IssuesBoardClient';

interface FindingsFile {
  findings: Array<{
    id: string;
    title: string;
    severity: 'Critical' | 'High' | 'Medium' | 'Low' | 'Info';
    description?: string;
    recommendation?: string;
    resolution?: string;
    update_from_client?: string;
    root_cause?: { locations?: Array<{ file: string; snippet?: string }> };
    poc?: { status?: string; file?: string | null; validation_memo?: string | null };
    github?: { issue_number?: number; issue_url?: string; state?: string };
    category?: string;
  }>;
}

interface TrackingFile {
  findings: Array<{
    id: string;
    title: string;
    severity: 'Critical' | 'High' | 'Medium' | 'Low' | 'Info';
    source?: string;
    status?: string;
    poc_status?: string;
    poc_file?: string | null;
    duplicates?: string[];
    duplicate_of?: string | null;
    notes?: string;
  }>;
}

interface ComparisonFile {
  duplicates?: Array<{
    ai_finding: string;
    matches: string;
    confidence?: string;
    match_signals?: Record<string, boolean | string>;
    reasoning?: string;
  }>;
}

interface AiResultFile {
  tool: string;
  findings: Array<{
    id: string;
    title: string;
    severity: 'Critical' | 'High' | 'Medium' | 'Low' | 'Info';
    description?: string;
    affected_code?: Array<{ file: string; snippet?: string }>;
    category?: string;
  }>;
}

interface SpecConformanceFile {
  items?: Array<{
    id: string;
    spec_text: string;
    spec_location?: Record<string, unknown>;
    status: 'CONFORMS' | 'DEVIATES' | 'PARTIAL' | 'UNVERIFIABLE' | 'UNDOCUMENTED';
    finding: string;
    code_location?: { file: string; line_start?: number; line_end?: number };
    severity_hint?: 'Critical' | 'High' | 'Medium' | 'Low' | 'Info';
  }>;
}

function statusToColumn(status: string | undefined): BoardIssue['column'] {
  switch (status) {
    case 'verified':
      return 'verified';
    case 'rejected':
      return 'invalid';
    case 'duplicate':
      return 'duplicate';
    case 'pending_validation':
    case 'unverified':
    default:
      return 'potential';
  }
}

function buildBoardIssues(): BoardIssue[] {
  const findings = readJsonFile<FindingsFile>('findings.json') ?? { findings: [] };
  const tracking = readJsonFile<TrackingFile>('tracking.json') ?? { findings: [] };
  const comparison = readJsonFile<ComparisonFile>('comparison.json') ?? { duplicates: [] };
  const spec = readJsonFile<SpecConformanceFile>('spec-conformance.json') ?? { items: [] };

  const findingById = new Map(findings.findings.map((f) => [f.id, f]));
  const specById = new Map((spec.items ?? []).map((s) => [s.id, s]));

  // AI results: enumerate all subdirs under ai-results/ so future tools (or
  // legacy projects) still surface. Today only auditagent is officially
  // supported.
  const aiTools = listSubdirs('ai-results');
  const aiById = new Map<string, AiResultFile['findings'][number] & { tool: string }>();
  for (const tool of aiTools) {
    const file = readNestedJsonFile<AiResultFile>(`ai-results/${tool}/findings.json`);
    if (!file) continue;
    for (const f of file.findings ?? []) {
      aiById.set(f.id, { ...f, tool: file.tool ?? tool });
    }
  }

  // External github findings live under external/<source>/findings.json.
  const externalSources = listSubdirs('external');
  for (const source of externalSources) {
    const file = readNestedJsonFile<AiResultFile>(`external/${source}/findings.json`);
    if (!file) continue;
    for (const f of file.findings ?? []) {
      aiById.set(f.id, { ...f, tool: file.tool ?? source });
    }
  }

  const matchByLocalId = new Map<string, NonNullable<ComparisonFile['duplicates']>[number]>();
  for (const dup of comparison.duplicates ?? []) {
    // The schema field is named `ai_finding` historically but the dedup direction
    // depends on source — for github-canonical hits, ai_finding is actually the
    // local id that became the duplicate.
    matchByLocalId.set(dup.ai_finding, dup);
  }

  const issues: BoardIssue[] = [];

  // Pass 1: every tracking entry (canonical source for status + source).
  for (const t of tracking.findings) {
    const finding = findingById.get(t.id);
    const aiFinding = aiById.get(t.id);
    const specItem = specById.get(t.id);

    const description = finding?.description ?? aiFinding?.description ?? specItem?.finding ?? '';
    const recommendation = finding?.recommendation ?? '';
    const resolution = finding?.resolution;
    const updateFromClient = finding?.update_from_client;

    const locations: BoardIssue['code_locations'] = [];
    if (finding?.root_cause?.locations) {
      for (const loc of finding.root_cause.locations) {
        locations.push({ file: loc.file, snippet: loc.snippet });
      }
    } else if (aiFinding?.affected_code) {
      for (const loc of aiFinding.affected_code) {
        locations.push({ file: loc.file, snippet: loc.snippet });
      }
    } else if (specItem?.code_location?.file) {
      locations.push({ file: specItem.code_location.file });
    }

    const dup = matchByLocalId.get(t.id);
    const matchSignals = dup?.match_signals
      ? {
          contract: Boolean(dup.match_signals.contract),
          function: Boolean(dup.match_signals.function),
          root_cause: String(dup.match_signals.root_cause ?? ''),
          attack_vector: String(dup.match_signals.attack_vector ?? ''),
        }
      : undefined;

    issues.push({
      id: t.id,
      title: t.title || finding?.title || aiFinding?.title || specItem?.spec_text || t.id,
      severity: t.severity,
      source: (t.source as BoardIssue['source']) ?? 'manual',
      status: (t.status as BoardIssue['status']) ?? 'pending_validation',
      column: statusToColumn(t.status),
      description,
      recommendation,
      resolution,
      update_from_client: updateFromClient,
      code_locations: locations,
      github_synced: Boolean(finding?.github?.issue_number),
      github_issue_url: finding?.github?.issue_url,
      github_state: finding?.github?.state,
      duplicate_of: t.duplicate_of ?? dup?.matches ?? null,
      match_signals: matchSignals,
      reasoning: dup?.reasoning,
      has_finding_record: Boolean(finding),
      category: finding?.category ?? aiFinding?.category,
      poc_status: t.poc_status as BoardIssue['poc_status'],
      poc_file: t.poc_file ?? finding?.poc?.file ?? null,
      notes: t.notes ?? '',
    });
  }

  // Pass 2: findings.json entries that have no tracking row (legacy data).
  // Render them as verified so we don't drop them silently.
  const seen = new Set(issues.map((i) => i.id));
  for (const f of findings.findings) {
    if (seen.has(f.id)) continue;
    issues.push({
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
      code_locations: f.root_cause?.locations ?? [],
      github_synced: Boolean(f.github?.issue_number),
      github_issue_url: f.github?.issue_url,
      github_state: f.github?.state,
      duplicate_of: null,
      match_signals: undefined,
      reasoning: undefined,
      has_finding_record: true,
      category: f.category,
      poc_status: f.poc?.status as BoardIssue['poc_status'],
      poc_file: f.poc?.file ?? null,
      notes: '',
    });
  }

  return issues;
}

export default function IssuesPage() {
  const issues = buildBoardIssues();

  if (issues.length === 0) {
    return (
      <div>
        <header className="mb-6">
          <h1 className="text-title font-semibold text-text-primary">Issues</h1>
          <p className="mt-1 text-body text-text-secondary">
            Potential, Verified, Invalid, and Duplicate issues across all sources.
          </p>
        </header>
        <NotYetGenerated command="/init-audit  (then /write-finding or /ingest-aa-report)" />
      </div>
    );
  }

  return <IssuesBoardClient issues={issues} />;
}
