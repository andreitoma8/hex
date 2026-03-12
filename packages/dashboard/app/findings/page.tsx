import { readJsonFile, readMarkdownFile } from '@/lib/data';
import { NotYetGenerated } from '@/components/NotYetGenerated';
import { MarkdownRenderer } from '@/components/MarkdownRenderer';
import { SeverityBadge } from '@/components/SeverityBadge';

interface Finding {
  id: string;
  title: string;
  severity: string;
  [key: string]: unknown;
}

interface FindingsData {
  findings: Finding[];
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

export default function FindingsPage() {
  const findingsData = readJsonFile<FindingsData>('findings.json');
  const markdown = readMarkdownFile('findings.md');

  if (!findingsData) {
    return (
      <div>
        <h2 className="mb-6 text-2xl font-bold text-gray-100">Findings</h2>
        <NotYetGenerated command="Use the write-finding skill to create findings" />
      </div>
    );
  }

  const findings = findingsData.findings ?? [];

  // Count by severity
  const counts: Record<string, number> = {};
  for (const f of findings) {
    const sev = f.severity ?? 'Info';
    counts[sev] = (counts[sev] ?? 0) + 1;
  }

  return (
    <div>
      <h2 className="mb-6 text-2xl font-bold text-gray-100">Findings</h2>

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

      {/* Total */}
      <p className="mb-6 text-sm text-gray-400">
        {findings.length} total finding{findings.length !== 1 ? 's' : ''}
      </p>

      {/* Findings markdown content */}
      {markdown && (
        <div className="rounded-lg border border-gray-700 bg-gray-800 p-6">
          <MarkdownRenderer content={markdown} />
        </div>
      )}

      {/* If no markdown, show a table of findings */}
      {!markdown && findings.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-gray-700">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-700 bg-gray-800 text-xs uppercase text-gray-400">
              <tr>
                <th className="px-4 py-3">ID</th>
                <th className="px-4 py-3">Severity</th>
                <th className="px-4 py-3">Title</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {findings.map((f) => (
                <tr key={f.id} className="bg-gray-800/50 hover:bg-gray-700/50">
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-gray-300">
                    {f.id}
                  </td>
                  <td className="px-4 py-3">
                    <SeverityBadge severity={f.severity as Severity} />
                  </td>
                  <td className="px-4 py-3 text-gray-300">{f.title}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
