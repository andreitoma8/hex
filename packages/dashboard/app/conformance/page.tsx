import { readJsonFile } from '@/lib/data';
import { NotYetGenerated } from '@/components/NotYetGenerated';
import { ConformanceTable } from './ConformanceTable';

export interface ConformanceCheck {
  id: string;
  requirement: string;
  status: string;
  details: string;
  spec_section?: string;
  confidence?: string;
  [key: string]: unknown;
}

interface ConformanceData {
  checks: ConformanceCheck[];
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

  const checks = [...(data.checks ?? [])].sort((a, b) => {
    const orderA = STATUS_ORDER[a.status] ?? 99;
    const orderB = STATUS_ORDER[b.status] ?? 99;
    return orderA - orderB;
  });

  // Count by status
  const counts: Record<string, number> = {};
  for (const c of checks) {
    counts[c.status] = (counts[c.status] ?? 0) + 1;
  }

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

  return (
    <div>
      <h2 className="mb-6 text-2xl font-bold text-gray-100">
        Spec Conformance
      </h2>

      {/* Summary bar */}
      <div className="mb-6 flex flex-wrap gap-4">
        {Object.entries(STATUS_ORDER)
          .sort(([, a], [, b]) => a - b)
          .map(([status]) => (
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
                {counts[status] ?? 0}
              </span>
            </div>
          ))}
      </div>

      {/* Total */}
      <p className="mb-4 text-sm text-gray-400">
        {checks.length} conformance check{checks.length !== 1 ? 's' : ''}
      </p>

      {/* Table with expandable rows (client component) */}
      <ConformanceTable checks={checks} />
    </div>
  );
}
