import { readJsonFile, listSubdirs, readNestedJsonFile } from '@/lib/data';
import { NotYetGenerated } from '@/components/NotYetGenerated';
import { AllFindingsClient } from './AllFindingsClient';

interface Finding {
  id: string;
  title: string;
  severity: string;
  category?: string;
  description?: string;
  root_cause?: {
    locations: { file: string; snippet?: string }[];
  };
  poc?: { status: string; file: string | null; validation_memo?: string | null };
  recommendation?: string;
  references?: {
    external_links: string[];
  };
  [key: string]: unknown;
}

interface TrackingEntry {
  id: string;
  finding_id?: string | null;
  title: string;
  severity: string;
  source: string;
  status: string;
  poc_status: string;
  duplicates?: string[];
  [key: string]: unknown;
}

interface FindingsData {
  findings: Finding[];
}

interface TrackingData {
  findings?: TrackingEntry[];
  issues?: TrackingEntry[];
}

interface AiResultFinding {
  id: string;
  tool: string;
  title: string;
  severity: string;
  description: string;
  affected_code: { file: string; snippet?: string }[];
  confidence?: string;
  category?: string;
}

interface AiResultFile {
  tool: string;
  findings: AiResultFinding[];
}

interface ComparisonDuplicate {
  ai_finding: string;
  matches: string;
  confidence?: string;
  reasoning?: string;
}

interface ComparisonRejected {
  id: string;
  reason?: string;
}

interface ComparisonNovel {
  id: string;
  original_id?: string;
  [key: string]: unknown;
}

interface ComparisonData {
  duplicates?: ComparisonDuplicate[];
  novel?: ComparisonNovel[];
  rejected?: ComparisonRejected[];
}

export interface MergedFinding {
  id: string;
  finding_id?: string | null;
  title: string;
  severity: string;
  category: string;
  source: string;
  status: string;
  poc_status: string;
  duplicates: string[];
  finding?: Finding;
}

export default function AllFindingsPage() {
  const findingsData = readJsonFile<FindingsData>('findings.json');
  const trackingData = readJsonFile<TrackingData>('tracking.json');
  const comparison = readJsonFile<ComparisonData>('comparison.json');

  if (!findingsData && !trackingData) {
    return (
      <div>
        <h2 className="mb-sp-5 text-title font-semibold text-text-primary">All Findings</h2>
        <NotYetGenerated command="Findings and tracking data will appear as you progress through the audit" />
      </div>
    );
  }

  // Build canonical findings map
  const findingsMap = new Map<string, Finding>();
  for (const f of findingsData?.findings ?? []) {
    findingsMap.set(f.id, f);
  }

  // Build AI results map from all ai-results/<tool>/findings.json
  const aiResultsMap = new Map<string, Finding>();
  const toolDirs = listSubdirs('ai-results');
  for (const dir of toolDirs) {
    const results = readNestedJsonFile<AiResultFile>(`ai-results/${dir}/findings.json`);
    if (!results) continue;
    for (const af of results.findings) {
      aiResultsMap.set(af.id, {
        id: af.id,
        title: af.title,
        severity: af.severity,
        category: af.category,
        description: af.description,
        root_cause: {
          locations: af.affected_code.map((ac) => ({ file: ac.file, snippet: ac.snippet })),
        },
      });
    }
  }

  // Build comparison.json lookup maps for Loop 3 fallback
  const aiDuplicateOf = new Map<string, string>();
  for (const d of comparison?.duplicates ?? []) {
    aiDuplicateOf.set(d.ai_finding, d.matches);
  }
  const aiRejectedIds = new Set(
    (comparison?.rejected ?? []).map((r) => r.id),
  );

  // Backward compat: old runs produced novel[] with synthetic IDs (AI-N001) and original_id.
  // Map original AI ID → synthetic tracking ID so Loop 3 can skip already-tracked novels.
  const novelOriginalToTrackingId = new Map<string, string>();
  for (const n of comparison?.novel ?? []) {
    if (n.original_id) novelOriginalToTrackingId.set(n.original_id, n.id);
  }

  const trackingEntries = trackingData?.findings ?? trackingData?.issues ?? [];

  // Build canonical finding state map for duplicate inheritance
  const canonicalState = new Map<string, { status: string; poc_status: string }>();
  for (const t of trackingEntries) {
    if (t.id === (t.finding_id ?? t.id)) {
      canonicalState.set(t.id, { status: t.status, poc_status: t.poc_status });
    }
  }
  // Fallback: findings.json entries not in tracking are implicitly verified
  for (const f of findingsData?.findings ?? []) {
    if (!canonicalState.has(f.id)) {
      canonicalState.set(f.id, { status: 'verified', poc_status: f.poc?.status ?? 'not_started' });
    }
  }

  const merged: MergedFinding[] = [];
  const seenIds = new Set<string>();

  for (const t of trackingEntries) {
    if (!t.id) continue; // Skip malformed entries without an id
    seenIds.add(t.id);
    // Look up finding: first try finding_id bridge, then own id, then AI results fallback
    const lookupId = t.finding_id ?? t.id;
    const finding = findingsMap.get(lookupId) ?? aiResultsMap.get(t.id);

    merged.push({
      id: t.id,
      finding_id: t.finding_id,
      title: t.title,
      severity: t.severity,
      category: finding?.category ?? '-',
      source: t.source === 'manual_annotation' ? 'manual' : t.source,
      status: t.status,
      poc_status: t.poc_status,
      duplicates: t.duplicates ?? [],
      finding,
    });
  }

  for (const f of findingsData?.findings ?? []) {
    if (seenIds.has(f.id)) continue;
    seenIds.add(f.id);
    merged.push({
      id: f.id,
      title: f.title,
      severity: f.severity,
      category: f.category ?? '-',
      source: 'manual',
      status: 'verified',
      poc_status: f.poc?.status ?? 'not_started',
      duplicates: [],
      finding: f,
    });
  }

  // Add AI findings not already present via tracking, using comparison.json as fallback
  for (const dir of toolDirs) {
    const results = readNestedJsonFile<AiResultFile>(`ai-results/${dir}/findings.json`);
    if (!results) continue;
    for (const af of results.findings) {
      if (seenIds.has(af.id)) continue;
      // Backward compat: skip if this AI finding was already tracked under a synthetic novel ID
      const bridgedId = novelOriginalToTrackingId.get(af.id);
      if (bridgedId && seenIds.has(bridgedId)) continue;
      seenIds.add(af.id);

      const matchedId = aiDuplicateOf.get(af.id);
      const isRejected = aiRejectedIds.has(af.id);
      const inherited = matchedId ? canonicalState.get(matchedId) : undefined;

      merged.push({
        id: af.id,
        finding_id: matchedId ?? null,
        title: af.title,
        severity: af.severity,
        category: af.category ?? '-',
        source: dir,
        status: isRejected ? 'rejected' : matchedId ? (inherited?.status ?? 'duplicate') : 'unverified',
        poc_status: isRejected ? 'not_started' : matchedId ? (inherited?.poc_status ?? 'not_started') : 'not_started',
        duplicates: [],
        finding: aiResultsMap.get(af.id),
      });
    }
  }

  // Count duplicates/rejected for the toggle badge
  const hiddenCount = merged.filter(
    (m) =>
      (m.finding_id != null && m.id !== m.finding_id) ||
      m.status === 'duplicate' ||
      m.status === 'rejected',
  ).length;

  // Summary stats (on visible findings only by default, but compute on all)
  const byStatus: Record<string, number> = {};
  for (const m of merged) {
    byStatus[m.status] = (byStatus[m.status] ?? 0) + 1;
  }

  return (
    <div>
      <h2 className="mb-sp-5 text-title font-semibold text-text-primary">All Findings</h2>

      {/* Summary stats */}
      <div className="mb-sp-5 grid grid-cols-2 gap-sp-3 md:grid-cols-5">
        <div className="rounded-md border border-border-default bg-surface-2 p-sp-4 text-center">
          <div className="text-display text-text-primary">{merged.length}</div>
          <div className="text-caption text-text-secondary">Total</div>
        </div>
        {Object.entries(byStatus).map(([status, count]) => (
          <div
            key={status}
            className="rounded-md border border-border-default bg-surface-2 p-sp-4 text-center"
          >
            <div className="text-display text-text-primary">{count}</div>
            <div className="text-caption text-text-secondary">{status}</div>
          </div>
        ))}
      </div>

      <AllFindingsClient findings={merged} hiddenCount={hiddenCount} />
    </div>
  );
}
