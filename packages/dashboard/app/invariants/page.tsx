import { readMarkdownFile } from '@/lib/data';
import { NotYetGenerated } from '@/components/NotYetGenerated';
import { InvariantsTable, type ParsedInvariants } from './InvariantsTable';

// ─── Markdown parser ────────────────────────────────────────────────

function parseInvariantsMarkdown(md: string): ParsedInvariants {
  const result: ParsedInvariants = {
    fromDocs: [],
    fromCode: [],
    discrepancies: [],
    assumptions: [],
  };

  // Split by ## headers
  const sections = md.split(/^## /m).slice(1); // skip content before first ##

  for (const section of sections) {
    const headerEnd = section.indexOf('\n');
    const header = section.slice(0, headerEnd).trim();
    const body = section.slice(headerEnd + 1);

    if (/from documentation/i.test(header)) {
      // Parse [INV-D01] entries
      const re = /\[([A-Z]+-D\d+)\]\s*(.+?)(?:\s*—\s*\*\*Confidence:\s*(High|Medium|Low)\*\*)?(?:\s*—\s*Enforced in:\s*(.+?))?(?:\s*—\s*Source:\s*(.+?))?$/gmi;
      for (const match of body.matchAll(re)) {
        result.fromDocs.push({
          id: match[1],
          invariant: match[2].trim(),
          confidence: match[3] ?? 'Medium',
          enforced_in: match[4]?.trim() ?? '-',
          source: match[5]?.trim() ?? '-',
        });
      }
    } else if (/from code/i.test(header)) {
      // Parse [INV-C01] entries
      const re = /\[([A-Z]+-C\d+)\]\s*(.+?)(?:\s*—\s*\*\*Confidence:\s*(High|Medium|Low)\*\*)?(?:\s*—\s*Enforced in:\s*(.+?))?$/gmi;
      for (const match of body.matchAll(re)) {
        result.fromCode.push({
          id: match[1],
          invariant: match[2].trim(),
          confidence: match[3] ?? 'Medium',
          enforced_in: match[4]?.trim() ?? '-',
        });
      }
    } else if (/discrepanc/i.test(header)) {
      // Parse [DISC-01] entries — may be multiline with sub-items
      const items = body.split(/(?=\d+\.\s*\[DISC-)/);
      for (const item of items) {
        const idMatch = item.match(/\[(DISC-\d+)\]\s*(.+)/);
        if (!idMatch) continue;
        const docsMatch = item.match(/\*\*Docs say:\*\*\s*(.+)/i);
        const codeMatch = item.match(/\*\*Code does:\*\*\s*(.+)/i);
        const riskMatch = item.match(/\*\*Risk:\*\*\s*(.+)/i);
        result.discrepancies.push({
          id: idMatch[1],
          description: idMatch[2].trim(),
          docs_say: docsMatch?.[1]?.trim() ?? '-',
          code_does: codeMatch?.[1]?.trim() ?? '-',
          risk: riskMatch?.[1]?.trim() ?? '-',
        });
      }
    } else if (/implicit|assumption/i.test(header)) {
      // Parse [ASSUM-01] entries
      const items = body.split(/(?=\d+\.\s*\[ASSUM-)/);
      for (const item of items) {
        const idMatch = item.match(/\[(ASSUM-\d+)\]\s*(.+)/);
        if (!idMatch) continue;
        const whereMatch = item.match(/\*\*Where:\*\*\s*(.+)/i);
        const violatedMatch = item.match(/\*\*If violated:\*\*\s*(.+)/i);
        result.assumptions.push({
          id: idMatch[1],
          assumption: idMatch[2].trim(),
          where: whereMatch?.[1]?.trim() ?? '-',
          if_violated: violatedMatch?.[1]?.trim() ?? '-',
        });
      }
    }
  }

  return result;
}

// ─── Component ──────────────────────────────────────────────────────

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

  const parsed = parseInvariantsMarkdown(markdown);

  return (
    <div>
      <h2 className="mb-6 text-2xl font-bold text-gray-100">Invariants</h2>

      {/* Summary bar */}
      <div className="mb-6 flex flex-wrap gap-3">
        <div className="flex items-center gap-2 rounded-lg border border-gray-700 bg-gray-800 px-4 py-2">
          <span className="inline-block h-3 w-3 rounded-full bg-blue-500" />
          <span className="text-sm text-gray-300">From Docs</span>
          <span className="text-sm font-bold text-gray-100">{parsed.fromDocs.length}</span>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-gray-700 bg-gray-800 px-4 py-2">
          <span className="inline-block h-3 w-3 rounded-full bg-purple-500" />
          <span className="text-sm text-gray-300">From Code</span>
          <span className="text-sm font-bold text-gray-100">{parsed.fromCode.length}</span>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-red-800/50 bg-red-950/20 px-4 py-2">
          <span className="inline-block h-3 w-3 rounded-full bg-red-500" />
          <span className="text-sm text-red-300">Discrepancies</span>
          <span className="text-sm font-bold text-red-100">{parsed.discrepancies.length}</span>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-yellow-800/50 bg-yellow-950/20 px-4 py-2">
          <span className="inline-block h-3 w-3 rounded-full bg-yellow-500" />
          <span className="text-sm text-yellow-300">Assumptions</span>
          <span className="text-sm font-bold text-yellow-100">{parsed.assumptions.length}</span>
        </div>
      </div>

      {/* Section tables */}
      <InvariantsTable data={parsed} />

      {/* Confidence methodology note */}
      <div className="mt-6 rounded-lg border border-gray-700 bg-gray-800/50 p-5">
        <h4 className="mb-2 text-sm font-semibold text-gray-300">Understanding Confidence Levels</h4>
        <div className="space-y-2 text-sm text-gray-400">
          <p>
            <span className="font-medium text-green-400">High</span> — The invariant is clearly
            enforced with explicit checks (require/revert statements, modifiers, or assertions)
            that directly validate the condition.
          </p>
          <p>
            <span className="font-medium text-yellow-400">Medium</span> — The invariant is
            partially enforced: it holds on most code paths, but some edge cases or branches
            may not explicitly check the condition.
          </p>
          <p>
            <span className="font-medium text-red-400">Low</span> — The invariant is assumed
            but not explicitly checked. It depends on external conditions, correct caller
            behavior, or implicit guarantees from other components.
          </p>
        </div>
      </div>
    </div>
  );
}
