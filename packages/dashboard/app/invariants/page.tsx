import { readMarkdownFile } from '@/lib/data';
import { NotYetGenerated } from '@/components/NotYetGenerated';
import { MarkdownRenderer } from '@/components/MarkdownRenderer';

export default function InvariantsPage() {
  const markdown = readMarkdownFile('invariants.md');

  if (!markdown) {
    return (
      <div>
        <h2 className="mb-6 text-2xl font-bold text-gray-100">Invariants</h2>
        <NotYetGenerated command="Use the identify-invariants skill" />
      </div>
    );
  }

  return (
    <div>
      <h2 className="mb-6 text-2xl font-bold text-gray-100">Invariants</h2>
      <div className="rounded-lg border border-gray-700 bg-gray-800 p-6">
        <MarkdownRenderer content={markdown} />
      </div>
    </div>
  );
}
