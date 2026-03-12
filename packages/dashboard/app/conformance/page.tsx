import { readJsonFile } from '@/lib/data';
import { NotYetGenerated } from '@/components/NotYetGenerated';
import { ConformanceTable } from './ConformanceTable';

// ─── Types matching CLI schema ──────────────────────────────────────

interface ConformanceItem {
  id: string;
  source: string;
  spec_text: string;
  spec_location?: Record<string, unknown>;
  status: string;
  finding: string;
  code_location?: { file: string; line_start: number; line_end: number };
  severity_hint?: string;
  confidence?: string;
}

interface ConformanceSummary {
  total_checks: number;
  conforms: number;
  deviates: number;
  partial: number;
  unverifiable: number;
  undocumented: number;
}

interface ConformanceData {
  checked_at?: string;
  sources_checked?: Record<string, unknown>;
  summary?: ConformanceSummary;
  items?: ConformanceItem[];
  // Legacy support
  checks?: Array<{
    id: string;
    requirement: string;
    status: string;
    details: string;
    spec_section?: string;
    confidence?: string;
  }>;
}

export interface ConformanceCheck {
  id: string;
  requirement: string;
  status: string;
  details: string;
  spec_section: string;
  confidence?: string;
  source?: string;
  severity_hint?: string;
  code_location?: { file: string; line_start: number; line_end: number };
}

const STATUS_ORDER: Record<string, number> = {
  DEVIATES: 0,
  PARTIAL: 1,
  UNVERIFIABLE: 2,
  UNDOCUMENTED: 3,
  CONFORMS: 4,
};

export default function ConformancePage() {
  const data = readJsonFile<ConformanceData>('spec-conformance.json');

  if (!data) {
    return (
      <div>
        <h2 className="mb-6 text-2xl font-bold text-gray-100">
          Spec Conformance
        </h2>
        <NotYetGenerated command="Use the check-spec-conformance skill" />
      </div>
    );
  }

  // Normalize: support both new schema (items) and legacy schema (checks)
  let checks: ConformanceCheck[];
  if (data.items) {
    checks = data.items.map((item) => ({
      id: item.id,
      requirement: item.spec_text,
      status: item.status,
      details: item.finding,
      spec_section: item.source ?? '-',
      confidence: item.confidence,
      source: item.source,
      severity_hint: item.severity_hint,
      code_location: item.code_location,
    }));
  } else if (data.checks) {
    checks = data.checks.map((c) => ({
      id: c.id,
      requirement: c.requirement,
      status: c.status,
      details: c.details,
      spec_section: c.spec_section ?? '-',
      confidence: c.confidence,
    }));
  } else {
    checks = [];
  }

  checks.sort((a, b) => {
    const orderA = STATUS_ORDER[a.status] ?? 99;
    const orderB = STATUS_ORDER[b.status] ?? 99;
    return orderA - orderB;
  });

  // Use summary from data if available, otherwise count manually
  const summary = data.summary ?? {
    total_checks: checks.length,
    conforms: checks.filter((c) => c.status === 'CONFORMS').length,
    deviates: checks.filter((c) => c.status === 'DEVIATES').length,
    partial: checks.filter((c) => c.status === 'PARTIAL').length,
    unverifiable: checks.filter((c) => c.status === 'UNVERIFIABLE').length,
    undocumented: checks.filter((c) => c.status === 'UNDOCUMENTED').length,
  };

  const STATUS_COLORS: Record<string, string> = {
    DEVIATES: 'bg-red-500',
    PARTIAL: 'bg-yellow-500',
    UNVERIFIABLE: 'bg-blue-500',
    UNDOCUMENTED: 'bg-gray-500',
    CONFORMS: 'bg-green-500',
  };

  const STATUS_TEXT_COLORS: Record<string, string> = {
    DEVIATES: 'text-red-400',
    PARTIAL: 'text-yellow-400',
    UNVERIFIABLE: 'text-blue-400',
    UNDOCUMENTED: 'text-gray-400',
    CONFORMS: 'text-green-400',
  };

  const summaryEntries: Array<{ status: string; count: number }> = [
    { status: 'DEVIATES', count: summary.deviates },
    { status: 'PARTIAL', count: summary.partial },
    { status: 'UNVERIFIABLE', count: summary.unverifiable },
    { status: 'UNDOCUMENTED', count: summary.undocumented },
    { status: 'CONFORMS', count: summary.conforms },
  ];

  return (
    <div>
      <h2 className="mb-6 text-2xl font-bold text-gray-100">
        Spec Conformance
      </h2>

      {/* Summary bar */}
      <div className="mb-6 flex flex-wrap gap-4">
        {summaryEntries.map(({ status, count }) => (
          <div
            key={status}
            className="flex items-center gap-2 rounded-lg border border-gray-700 bg-gray-800 px-4 py-2"
          >
            <span
              className={`inline-block h-3 w-3 rounded-full ${STATUS_COLORS[status]}`}
            />
            <span className={`text-sm font-medium ${STATUS_TEXT_COLORS[status]}`}>
              {status}
            </span>
            <span className="text-sm font-bold text-gray-100">
              {count}
            </span>
          </div>
        ))}
      </div>

      {/* Total + sources */}
      <p className="mb-4 text-sm text-gray-400">
        {summary.total_checks} conformance check{summary.total_checks !== 1 ? 's' : ''}
        {data.sources_checked && (
          <span className="ml-2 text-gray-500">
            (sources: {Object.entries(data.sources_checked)
              .filter(([, v]) => v === true || (Array.isArray(v) && v.length > 0))
              .map(([k]) => k.replace(/_/g, ' '))
              .join(', ')})
          </span>
        )}
      </p>

      {/* Table with expandable rows (client component) */}
      <ConformanceTable checks={checks} />
    </div>
  );
}
