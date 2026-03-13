import { readJsonFile } from '@/lib/data';
import { NotYetGenerated } from '@/components/NotYetGenerated';
import { ReportClient } from './ReportClient';

interface Finding {
  id: string;
  title: string;
  severity: string;
  likelihood?: string;
  impact?: string;
  category?: string;
  description?: string;
  impact_detail?: string;
  root_cause?: {
    summary: string;
    locations: { file: string; line_start: number; line_end: number; snippet?: string }[];
  };
  poc?: { status: string; file: string | null; validation_memo?: string | null };
  recommendation?: string;
  references?: {
    annotation_id: string | null;
    annotation_location: string | null;
    external_links: string[];
  };
  [key: string]: unknown;
}

interface FindingsData {
  findings: Finding[];
}

interface TrackingEntry {
  id: string;
  status: string;
  [key: string]: unknown;
}

interface TrackingData {
  findings: TrackingEntry[];
}

type Severity = 'Critical' | 'High' | 'Medium' | 'Low' | 'Info';

const SEVERITY_ORDER: Severity[] = ['Critical', 'High', 'Medium', 'Low', 'Info'];

const SEVERITY_BAR_COLORS: Record<string, string> = {
  Critical: 'bg-red-500',
  High: 'bg-orange-500',
  Medium: 'bg-yellow-500',
  Low: 'bg-blue-500',
  Info: 'bg-gray-500',
};

export default function ReportPage() {
  const findingsData = readJsonFile<FindingsData>('findings.json');

  if (!findingsData) {
    return (
      <div>
        <h2 className="mb-6 text-2xl font-bold text-gray-100">Report</h2>
        <NotYetGenerated command="Use the write-finding skill to create findings" />
      </div>
    );
  }

  const allFindings = findingsData.findings ?? [];

  // Filter to only verified findings if tracking exists
  const trackingData = readJsonFile<TrackingData>('tracking.json');
  let findings = allFindings;
  if (trackingData) {
    const verifiedIds = new Set(
      trackingData.findings
        .filter((t) => t.status === 'verified')
        .map((t) => t.id),
    );
    findings = allFindings.filter((f) => verifiedIds.has(f.id));
    // If tracking exists but no verified findings yet, show all
    if (findings.length === 0 && allFindings.length > 0) {
      findings = allFindings;
    }
  }

  // Count by severity
  const counts: Record<string, number> = {};
  for (const f of findings) {
    const sev = f.severity ?? 'Info';
    counts[sev] = (counts[sev] ?? 0) + 1;
  }

  return (
    <div>
      <h2 className="mb-6 text-2xl font-bold text-gray-100">Report</h2>

      {/* Severity summary */}
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-5">
        {SEVERITY_ORDER.map((sev) => (
          <div
            key={sev}
            className="rounded-lg border border-gray-700 bg-gray-800 p-4 text-center"
          >
            <div className="mb-1 text-2xl font-bold text-gray-100">
              {counts[sev] ?? 0}
            </div>
            <div className="flex items-center justify-center gap-2">
              <span
                className={`inline-block h-2.5 w-2.5 rounded-full ${SEVERITY_BAR_COLORS[sev]}`}
              />
              <span className="text-sm text-gray-400">{sev}</span>
            </div>
          </div>
        ))}
      </div>

      <p className="mb-6 text-sm text-gray-400">
        {findings.length} finding{findings.length !== 1 ? 's' : ''}
        {trackingData ? ' (verified)' : ''}
      </p>

      <ReportClient findings={findings} />
    </div>
  );
}
