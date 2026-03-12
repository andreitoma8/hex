import { readJsonFile } from '@/lib/data';
import { NotYetGenerated } from '@/components/NotYetGenerated';

interface Annotation {
  id: string;
  type: string;
  status: string;
  file: string;
  line: number;
  text: string;
}

const TYPE_STYLES: Record<string, string> = {
  issue: 'bg-red-600/20 text-red-400 border-red-500/30',
  'issue-verified': 'bg-green-600/20 text-green-400 border-green-500/30',
  question: 'bg-blue-600/20 text-blue-400 border-blue-500/30',
  note: 'bg-gray-600/20 text-gray-400 border-gray-500/30',
};

function TypeBadge({ type }: { type: string }) {
  const style = TYPE_STYLES[type] ?? TYPE_STYLES.note;
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${style}`}
    >
      {type}
    </span>
  );
}

export default function AnnotationsPage() {
  const annotations = readJsonFile<Annotation[]>('annotations.json');

  if (!annotations) {
    return (
      <div>
        <h2 className="mb-6 text-2xl font-bold text-gray-100">Annotations</h2>
        <NotYetGenerated command="solaudit annotations" />
      </div>
    );
  }

  return (
    <div>
      <h2 className="mb-6 text-2xl font-bold text-gray-100">Annotations</h2>

      <p className="mb-4 text-sm text-gray-400">
        {annotations.length} annotation{annotations.length !== 1 ? 's' : ''} found
      </p>

      <div className="overflow-x-auto rounded-lg border border-gray-700">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-gray-700 bg-gray-800 text-xs uppercase text-gray-400">
            <tr>
              <th className="px-4 py-3">ID</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">File</th>
              <th className="px-4 py-3">Line</th>
              <th className="px-4 py-3">Text</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700">
            {annotations.map((a) => (
              <tr key={a.id} className="bg-gray-800/50 hover:bg-gray-700/50">
                <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-gray-300">
                  {a.id}
                </td>
                <td className="px-4 py-3">
                  <TypeBadge type={a.type} />
                </td>
                <td className="px-4 py-3 text-gray-300">{a.status}</td>
                <td className="max-w-xs truncate px-4 py-3 font-mono text-xs text-gray-400">
                  {a.file}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-gray-400">
                  {a.line}
                </td>
                <td className="max-w-md px-4 py-3 text-gray-300">{a.text}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
