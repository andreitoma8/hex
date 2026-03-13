'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';

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
    annotation_id: string | null;
    annotation_location: string | null;
    external_links: string[];
  };
}

const SEVERITY_ORDER: Record<string, number> = { Critical: 0, High: 1, Medium: 2, Low: 3, Info: 4 };

function findingToMarkdown(finding: Finding): string {
  const lines: string[] = [];

  // Title with severity
  lines.push(`## **[${finding.severity}] ${finding.title}**`);
  lines.push('');

  // File locations
  if (finding.root_cause?.locations?.length) {
    const files = finding.root_cause.locations.map((loc) => `\`${loc.file}\``).join(', ');
    lines.push(`**File(s):** ${files}`);
    lines.push('');
  }

  // Description
  if (finding.description) {
    lines.push(`**Description:** ${finding.description}`);
    lines.push('');
  }

  // Code snippets
  if (finding.root_cause?.locations) {
    for (const loc of finding.root_cause.locations) {
      if (loc.snippet) {
        lines.push('```solidity');
        lines.push(loc.snippet);
        lines.push('```');
        lines.push('');
      }
    }
  }

  // Recommendation
  if (finding.recommendation) {
    lines.push(`**Recommendation(s):** ${finding.recommendation}`);
    lines.push('');
  }

  // Status
  lines.push('**Status:** Unresolved');
  lines.push('');

  lines.push('---');
  lines.push('');

  return lines.join('\n');
}

export function ReportClient({ findings }: { findings: Finding[] }) {
  // Sort by severity
  const sorted = [...findings].sort((a, b) => {
    return (SEVERITY_ORDER[a.severity] ?? 5) - (SEVERITY_ORDER[b.severity] ?? 5);
  });

  const markdown = sorted.map(findingToMarkdown).join('\n');

  return (
    <div className="prose prose-invert prose-sm max-w-none">
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
