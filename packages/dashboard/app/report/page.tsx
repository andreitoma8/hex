import { readJsonFile } from '@/lib/data';
import { NotYetGenerated } from '@/components/NotYetGenerated';
import { ReportClient } from './ReportClient';

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

const SEVERITY_COLORS: Record<string, string> = {
  Critical: 'bg-[var(--critical)]',
  High: 'bg-[var(--high)]',
  Medium: 'bg-[var(--medium)]',
  Low: 'bg-[var(--low)]',
  Info: 'bg-[var(--info)]',
};

export default function ReportPage() {
  const findingsData = readJsonFile<FindingsData>('findings.json');

  if (!findingsData) {
    return (
      <div>
        <h2 className="mb-sp-5 text-title font-semibold text-text-primary">Report</h2>
        <NotYetGenerated command="Use the write-finding skill to create findings" />
      </div>
    );
  }

  const allFindings = findingsData.findings ?? [];

  const trackingData = readJsonFile<TrackingData>('tracking.json');
  let findings = allFindings;
  if (trackingData?.findings) {
    const verifiedIds = new Set(
      trackingData.findings
        .filter((t) => t.status === 'verified')
        .map((t) => t.id),
    );
    findings = allFindings.filter((f) => verifiedIds.has(f.id));
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

  // Stacked bar total
  const total = findings.length;

  return (
    <div>
      <h2 className="mb-sp-5 text-title font-semibold text-text-primary">Report</h2>

      {/* Horizontal severity bar */}
      {total > 0 && (
        <div className="mb-sp-5">
          <div className="flex h-3 overflow-hidden rounded-sm">
            {SEVERITY_ORDER.map((sev) => {
              const count = counts[sev] ?? 0;
              if (count === 0) return null;
              const pct = (count / total) * 100;
              return (
                <div
                  key={sev}
                  className={`${SEVERITY_COLORS[sev]}`}
                  style={{ width: `${pct}%` }}
                  title={`${sev}: ${count}`}
                />
              );
            })}
          </div>
          <div className="mt-2 flex flex-wrap gap-4">
            {SEVERITY_ORDER.map((sev) => (
              <div key={sev} className="flex items-center gap-1.5">
                <span className={`inline-block h-2 w-2 rounded-full ${SEVERITY_COLORS[sev]}`} />
                <span className="text-caption text-text-secondary">{sev}</span>
                <span className="text-caption font-semibold text-text-primary">{counts[sev] ?? 0}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="mb-sp-4 text-body text-text-secondary">
        {findings.length} finding{findings.length !== 1 ? 's' : ''}
        {trackingData ? ' (verified)' : ''}
      </p>

      <ReportClient findings={findings} />
    </div>
  );
}
