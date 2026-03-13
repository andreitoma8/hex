import { readJsonFile } from '@/lib/data';
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
  findings: TrackingEntry[];
}

export interface MergedFinding {
  id: string;
  title: string;
  severity: string;
  category: string;
  source: string;
  status: string;
  poc_status: string;
  duplicates: string[];
  // Full finding detail (if available)
  finding?: Finding;
}

export default function AllFindingsPage() {
  const findingsData = readJsonFile<FindingsData>('findings.json');
  const trackingData = readJsonFile<TrackingData>('tracking.json');

  if (!findingsData && !trackingData) {
    return (
      <div>
        <h2 className="mb-6 text-2xl font-bold text-gray-100">All Findings</h2>
        <NotYetGenerated command="Findings and tracking data will appear as you progress through the audit" />
      </div>
    );
  }

  // Build findings map for detail lookup
  const findingsMap = new Map<string, Finding>();
  for (const f of findingsData?.findings ?? []) {
    findingsMap.set(f.id, f);
  }

  // Build tracking map
  const trackingMap = new Map<string, TrackingEntry>();
  for (const t of trackingData?.findings ?? []) {
    trackingMap.set(t.id, t);
  }

  // Merge: start from tracking if available, add findings not in tracking
  const merged: MergedFinding[] = [];
  const seenIds = new Set<string>();

  // Add all tracking entries
  for (const t of trackingData?.findings ?? []) {
    seenIds.add(t.id);
    merged.push({
      id: t.id,
      title: t.title,
      severity: t.severity,
      category: findingsMap.get(t.id)?.category ?? '-',
      source: t.source,
      status: t.status,
      poc_status: t.poc_status,
      duplicates: t.duplicates ?? [],
      finding: findingsMap.get(t.id),
    });
  }

  // Add findings not in tracking
  for (const f of findingsData?.findings ?? []) {
    if (seenIds.has(f.id)) continue;
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

  // Summary stats
  const byStatus: Record<string, number> = {};
  for (const m of merged) {
    byStatus[m.status] = (byStatus[m.status] ?? 0) + 1;
  }

  return (
    <div>
      <h2 className="mb-6 text-2xl font-bold text-gray-100">All Findings</h2>

      {/* Summary stats */}
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-5">
        <div className="rounded-lg border border-gray-700 bg-gray-800 p-4 text-center">
          <div className="text-2xl font-bold text-gray-100">{merged.length}</div>
          <div className="text-sm text-gray-400">Total</div>
        </div>
        {Object.entries(byStatus).map(([status, count]) => (
          <div
            key={status}
            className="rounded-lg border border-gray-700 bg-gray-800 p-4 text-center"
          >
            <div className="text-2xl font-bold text-gray-100">{count}</div>
            <div className="text-sm text-gray-400">{status}</div>
          </div>
        ))}
      </div>

      <AllFindingsClient findings={merged} />
    </div>
  );
}
