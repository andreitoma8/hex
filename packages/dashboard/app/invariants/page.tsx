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

  const sections = md.split(/^## /m).slice(1);

  for (const section of sections) {
    const headerEnd = section.indexOf('\n');
    const header = section.slice(0, headerEnd).trim();
    const body = section.slice(headerEnd + 1);

    if (/from documentation/i.test(header)) {
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
      const items = body.split(/(?=\d+\.\s*\[DISC-)/);
      for (const item of items) {
        const idMatch = item.match(/\[(DISC-\d+)\]\s*(.+)/);
        if (!idMatch) continue;
        const severityMatch = item.match(/\*\*Severity:\*\*\s*(.+)/i);
        const docsMatch = item.match(/\*\*Docs say:\*\*\s*(.+)/i);
        const docRefMatch = item.match(/\*\*Doc ref:\*\*\s*(.+)/i);
        const codeMatch = item.match(/\*\*Code does:\*\*\s*(.+)/i);
        const riskMatch = item.match(/\*\*Risk:\*\*\s*(.+)/i);
        result.discrepancies.push({
          id: idMatch[1],
          description: idMatch[2].trim(),
          severity: severityMatch?.[1]?.trim() ?? '-',
          docs_say: docsMatch?.[1]?.trim() ?? '-',
          doc_ref: docRefMatch?.[1]?.trim(),
          code_does: codeMatch?.[1]?.trim() ?? '-',
          risk: riskMatch?.[1]?.trim() ?? '-',
        });
      }
    } else if (/implicit|assumption/i.test(header)) {
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
        <h2 className="mb-sp-5 text-title font-semibold text-text-primary">Invariants</h2>
        <NotYetGenerated command="Use the identify-invariants skill" />
      </div>
    );
  }

  const parsed = parseInvariantsMarkdown(markdown);

  return (
    <div>
      <h2 className="mb-sp-5 text-title font-semibold text-text-primary">Invariants</h2>

      {/* Summary strip */}
      <div className="mb-sp-5 flex flex-wrap gap-sp-3">
        <div className="flex items-center gap-2 rounded-md border border-border-default bg-surface-2 px-sp-4 py-sp-2">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-accent" />
          <span className="text-caption text-text-secondary">From Docs</span>
          <span className="text-heading font-semibold text-text-primary">{parsed.fromDocs.length}</span>
        </div>
        <div className="flex items-center gap-2 rounded-md border border-border-default bg-surface-2 px-sp-4 py-sp-2">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-[var(--info)]" />
          <span className="text-caption text-text-secondary">From Code</span>
          <span className="text-heading font-semibold text-text-primary">{parsed.fromCode.length}</span>
        </div>
        <div className="flex items-center gap-2 rounded-md border border-[var(--critical)]/30 bg-[var(--critical)]/5 px-sp-4 py-sp-2">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-[var(--critical)]" />
          <span className="text-caption text-[var(--critical)]">Discrepancies</span>
          <span className="text-heading font-semibold text-[var(--critical)]">{parsed.discrepancies.length}</span>
        </div>
        <div className="flex items-center gap-2 rounded-md border border-[var(--medium)]/30 bg-[var(--medium)]/5 px-sp-4 py-sp-2">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-[var(--medium)]" />
          <span className="text-caption text-[var(--medium)]">Assumptions</span>
          <span className="text-heading font-semibold text-[var(--medium)]">{parsed.assumptions.length}</span>
        </div>
      </div>

      {/* Tabbed content */}
      <InvariantsTable data={parsed} />

      {/* Confidence methodology note */}
      <div className="mt-sp-5 rounded-md border border-border-default bg-surface-2 p-sp-4">
        <h4 className="mb-sp-2 text-caption font-medium uppercase text-text-tertiary">Understanding Confidence Levels</h4>
        <div className="space-y-2 text-body text-text-secondary">
          <p>
            <span className="font-medium text-[var(--success)]">High</span> — Enforced with explicit checks (require/revert, modifiers, assertions).
          </p>
          <p>
            <span className="font-medium text-[var(--medium)]">Medium</span> — Partially enforced: holds on most paths, some edge cases unchecked.
          </p>
          <p>
            <span className="font-medium text-[var(--critical)]">Low</span> — Assumed but not explicitly checked. Depends on external conditions.
          </p>
        </div>
      </div>
    </div>
  );
}
