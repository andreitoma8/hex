import { readJsonFile } from '@/lib/data';
import { NotYetGenerated } from '@/components/NotYetGenerated';
import { SeverityBadge } from '@/components/SeverityBadge';

interface TrackingEntry {
  id: string;
  title: string;
  severity: string;
  source: string;
  status: string;
  poc_status: string;
  duplicates?: string[];
}

interface TrackingData {
  findings: TrackingEntry[];
}

type Severity = 'Critical' | 'High' | 'Medium' | 'Low' | 'Info';

const STATUS_STYLES: Record<string, string> = {
  confirmed: 'bg-green-600/20 text-green-400 border-green-500/30',
  disputed: 'bg-red-600/20 text-red-400 border-red-500/30',
  fixed: 'bg-blue-600/20 text-blue-400 border-blue-500/30',
  acknowledged: 'bg-yellow-600/20 text-yellow-400 border-yellow-500/30',
  open: 'bg-gray-600/20 text-gray-400 border-gray-500/30',
};

function StatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  const style = STATUS_STYLES[normalized] ?? STATUS_STYLES.open;
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${style}`}
    >
      {status}
    </span>
  );
}

const POC_STYLES: Record<string, string> = {
  verified: 'text-green-400',
  written: 'text-blue-400',
  pending: 'text-yellow-400',
  'not-needed': 'text-gray-500',
};

export default function TrackingPage() {
  const trackingData = readJsonFile<TrackingData>('tracking.json');

  if (!trackingData) {
    return (
      <div>
        <h2 className="mb-6 text-2xl font-bold text-gray-100">Tracking</h2>
        <NotYetGenerated command="Tracking data will be created as you progress through the audit" />
      </div>
    );
  }

  const entries = trackingData.findings ?? [];

  // Summary stats
  const totalFindings = entries.length;

  const byStatus: Record<string, number> = {};
  const bySource: Record<string, number> = {};
  for (const e of entries) {
    const status = e.status ?? 'open';
    byStatus[status] = (byStatus[status] ?? 0) + 1;
    const source = e.source ?? 'unknown';
    bySource[source] = (bySource[source] ?? 0) + 1;
  }

  return (
    <div>
      <h2 className="mb-6 text-2xl font-bold text-gray-100">Tracking</h2>

      {/* Summary stats */}
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="rounded-lg border border-gray-700 bg-gray-800 p-4 text-center">
          <div className="text-2xl font-bold text-gray-100">{totalFindings}</div>
          <div className="text-sm text-gray-400">Total Findings</div>
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

      {/* By source */}
      <div className="mb-6">
        <h3 className="mb-3 text-lg font-semibold text-gray-200">By Source</h3>
        <div className="flex flex-wrap gap-3">
          {Object.entries(bySource).map(([source, count]) => (
            <div
              key={source}
              className="rounded-lg border border-gray-700 bg-gray-800 px-4 py-2"
            >
              <span className="font-mono text-sm text-gray-300">{source}</span>
              <span className="ml-2 text-sm font-bold text-gray-100">{count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Master table */}
      <div className="overflow-x-auto rounded-lg border border-gray-700">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-gray-700 bg-gray-800 text-xs uppercase text-gray-400">
            <tr>
              <th className="px-4 py-3">ID</th>
              <th className="px-4 py-3">Title</th>
              <th className="px-4 py-3">Severity</th>
              <th className="px-4 py-3">Source</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">PoC Status</th>
              <th className="px-4 py-3">Duplicates</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700">
            {entries.map((e) => (
              <tr key={e.id} className="bg-gray-800/50 hover:bg-gray-700/50">
                <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-gray-300">
                  {e.id}
                </td>
                <td className="px-4 py-3 text-gray-300">{e.title}</td>
                <td className="px-4 py-3">
                  <SeverityBadge severity={e.severity as Severity} />
                </td>
                <td className="px-4 py-3 font-mono text-xs text-gray-400">
                  {e.source}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={e.status} />
                </td>
                <td className="px-4 py-3">
                  <span className={POC_STYLES[e.poc_status?.toLowerCase()] ?? 'text-gray-500'}>
                    {e.poc_status ?? '-'}
                  </span>
                </td>
                <td className="px-4 py-3 font-mono text-xs text-gray-400">
                  {e.duplicates && e.duplicates.length > 0
                    ? e.duplicates.join(', ')
                    : '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
