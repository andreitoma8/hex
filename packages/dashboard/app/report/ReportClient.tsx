'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';

interface Finding {
  id: string;
  title: string;
  severity: string;
  likelihood?: string;
  impact?: string;
  category?: string;
  description?: string;
  impact_detail?: string;
  root_cause?: {
    summary: string;
    locations: { file: string; line_start: number; line_end: number; snippet?: string }[];
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

  lines.push(`## [${finding.severity}] ${finding.title}`);
  lines.push('');

  if (finding.category) {
    lines.push(`**Category:** ${finding.category}`);
    lines.push('');
  }

  if (finding.likelihood || finding.impact) {
    const parts: string[] = [];
    if (finding.likelihood) parts.push(`Likelihood: **${finding.likelihood}**`);
    if (finding.impact) parts.push(`Impact: **${finding.impact}**`);
    lines.push(parts.join(' | '));
    lines.push('');
  }

  // File locations
  if (finding.root_cause?.locations?.length) {
    for (const loc of finding.root_cause.locations) {
      lines.push(`**Location:** \`${loc.file}:${loc.line_start}${loc.line_end !== loc.line_start ? `-${loc.line_end}` : ''}\``);
    }
    lines.push('');
  }

  // Description
  if (finding.description) {
    lines.push('### Description');
    lines.push('');
    lines.push(finding.description);
    lines.push('');
  }

  // Impact
  if (finding.impact_detail) {
    lines.push('### Impact');
    lines.push('');
    lines.push(finding.impact_detail);
    lines.push('');
  }

  // Root cause
  if (finding.root_cause) {
    lines.push('### Root Cause');
    lines.push('');
    lines.push(finding.root_cause.summary);
    lines.push('');

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
    lines.push('### Recommendation');
    lines.push('');
    lines.push(finding.recommendation);
    lines.push('');
  }

  // PoC status
  if (finding.poc && finding.poc.file) {
    lines.push(`**PoC:** \`${finding.poc.file}\` (${finding.poc.status})`);
    lines.push('');
  }

  // References
  if (finding.references?.external_links?.length) {
    lines.push('### References');
    lines.push('');
    for (const link of finding.references.external_links) {
      lines.push(`- ${link}`);
    }
    lines.push('');
  }

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
