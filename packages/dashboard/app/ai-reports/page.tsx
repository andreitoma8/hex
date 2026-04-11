import { listSubdirs, readNestedJsonFile, readJsonFile } from '@/lib/data';
import { NotYetGenerated } from '@/components/NotYetGenerated';
import { AiReportsClient, type AiFlatFinding, type SourceRow, type ToolMeta } from './AiReportsClient';

interface AiResultFinding {
  id: string;
  tool: string;
  title: string;
  severity: string;
  description: string;
  affected_code: { file: string; snippet?: string }[];
  confidence?: string;
  category?: string;
  raw_category?: string;
  ai_consensus?: number;
}

interface AiResultFile {
  tool: string;
  ran_at: string;
  duration_seconds?: number;
  total_findings: number;
  findings: AiResultFinding[];
}

interface AiMetadata {
  ran_at?: string;
  ingested_at?: string;
  duration_seconds?: number;
  total_findings?: number;
}

interface AiToolStatus {
  status: string;
  ran_at?: string;
  started_at?: string;
  pid?: number;
  findings_count?: number;
  error?: string;
}

interface AiStatusFile {
  tools: Record<string, AiToolStatus>;
}

interface TrackingEntry {
  id: string;
  status: string;
  [key: string]: unknown;
}

interface TrackingData {
  findings?: TrackingEntry[];
  issues?: TrackingEntry[];
}

interface ComparisonDuplicate {
  ai_finding: string;
  matches: string;
  confidence: string;
  reasoning: string;
}

interface ComparisonNovel {
  id: string;
  source: string;
  original_id: string;
  title: string;
  validity: string;
  reasoning: string;
  priority: number;
}

interface ComparisonRejected {
  id: string;
  reason: string;
}

interface ComparisonData {
  compared_at: string;
  sources: string[];
  duplicates: ComparisonDuplicate[];
  novel: ComparisonNovel[];
  rejected: ComparisonRejected[];
}

interface FindingsData {
  findings: { id: string; severity?: string; [key: string]: unknown }[];
}

export default function AiReportsPage() {
  const toolDirs = listSubdirs('ai-results');
  const aiStatus = readNestedJsonFile<AiStatusFile>('ai-status.json');
  const trackingRaw = readJsonFile<TrackingData>('tracking.json');
  const comparison = readJsonFile<ComparisonData>('comparison.json');
  const findingsData = readJsonFile<FindingsData>('findings.json');

  const trackingEntries = trackingRaw?.findings ?? trackingRaw?.issues ?? [];
  const trackingMap = new Map(trackingEntries.map((e) => [e.id, e.status]));

  // Build set of novel finding IDs
  const novelIds = new Set<string>();
  for (const n of comparison?.novel ?? []) {
    novelIds.add(n.original_id);
  }

  // Build set of duplicate AI finding IDs
  const duplicateAiIds = new Set<string>();
  for (const d of comparison?.duplicates ?? []) {
    duplicateAiIds.add(d.ai_finding);
  }

  // Build set of rejected AI finding IDs
  const rejectedIds = new Set<string>();
  for (const r of comparison?.rejected ?? []) {
    rejectedIds.add(r.id);
  }

  // Build set of novel finding IDs per source
  const novelBySource = new Map<string, Set<string>>();
  for (const n of comparison?.novel ?? []) {
    if (!novelBySource.has(n.source)) novelBySource.set(n.source, new Set());
    novelBySource.get(n.source)!.add(n.original_id);
  }

  // Build set of manual finding IDs matched by AI (for manual unique count)
  const matchedManualIds = new Set<string>();
  for (const d of comparison?.duplicates ?? []) {
    matchedManualIds.add(d.matches);
  }

  // Flatten all tool findings into a single list
  const allFindings: AiFlatFinding[] = [];
  const toolMetas: ToolMeta[] = [];
  const aiSourceRows: SourceRow[] = [];
  let hasAnyData = false;

  for (const dir of toolDirs) {
    const results = readNestedJsonFile<AiResultFile>(`ai-results/${dir}/findings.json`);
    const metadata = readNestedJsonFile<AiMetadata>(`ai-results/${dir}/metadata.json`);
    const status = aiStatus?.tools?.[dir];

    if (results && results.findings.length > 0) {
      hasAnyData = true;
      toolMetas.push({
        name: dir,
        ran_at: results.ran_at ?? metadata?.ran_at ?? '',
        duration_seconds: results.duration_seconds ?? metadata?.duration_seconds,
        total_findings: results.total_findings,
        run_status: status?.status ?? 'completed',
      });

      // Build AI source row
      const toolNovelIds = novelBySource.get(dir) ?? new Set();
      const sevCounts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };

      for (const f of results.findings) {
        const sev = (f.severity ?? 'Info').toLowerCase();
        if (sev in sevCounts) sevCounts[sev as keyof typeof sevCounts]++;

        const trackingStatus = trackingMap.get(f.id) ?? 'unverified';
        allFindings.push({
          id: f.id,
          tool: f.tool ?? dir,
          title: f.title,
          severity: f.severity,
          description: f.description,
          affected_code: f.affected_code,
          confidence: f.confidence,
          category: f.category,
          raw_category: f.raw_category,
          ai_consensus: f.ai_consensus,
          tracking_status: trackingStatus,
          is_novel: novelIds.has(f.id),
          is_duplicate: duplicateAiIds.has(f.id) || trackingStatus === 'duplicate',
        });
      }

      aiSourceRows.push({
        source: dir,
        total: results.findings.length,
        unique: results.findings.filter((f) => toolNovelIds.has(f.id)).length,
        ...sevCounts,
      });
    } else if (status?.status === 'running') {
      hasAnyData = true;
      toolMetas.push({
        name: dir,
        ran_at: '',
        duration_seconds: undefined,
        total_findings: 0,
        run_status: 'running',
        started_at: status.started_at,
      });
    } else if (status?.status === 'pending_scan') {
      hasAnyData = true;
      toolMetas.push({
        name: dir,
        ran_at: '',
        duration_seconds: undefined,
        total_findings: 0,
        run_status: 'pending_scan',
        started_at: status.started_at,
      });
    }
  }

  if (!hasAnyData) {
    return (
      <div>
        <h2 className="mb-sp-5 text-title font-semibold text-text-primary">AI Audit Reports</h2>
        <NotYetGenerated command="Run /run-ai-analysis to generate AI audit reports" />
      </div>
    );
  }

  // Build manual source row
  const manualFindings = findingsData?.findings ?? [];
  const manualSev = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const f of manualFindings) {
    const sev = String(f.severity ?? 'Info').toLowerCase();
    if (sev in manualSev) manualSev[sev as keyof typeof manualSev]++;
  }

  const sourceRows: SourceRow[] = [
    {
      source: 'manual',
      total: manualFindings.length,
      unique: manualFindings.filter((f) => !matchedManualIds.has(f.id)).length,
      ...manualSev,
    },
    ...aiSourceRows,
  ];

  return (
    <div>
      <h2 className="mb-sp-5 text-title font-semibold text-text-primary">AI Audit Reports</h2>
      <AiReportsClient findings={allFindings} sourceRows={sourceRows} toolMetas={toolMetas} />
    </div>
  );
}
