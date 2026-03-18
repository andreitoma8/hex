'use client';

import { useState } from 'react';
import { SeverityBadge } from '@/components/SeverityBadge';

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
    external_links: string[];
  };
}

function findingToMarkdown(f: Finding): string {
  const lines: string[] = [];

  lines.push(`### [${f.severity}] ${f.title}`);
  lines.push('');

  // Deduplicated files in linked format
  const uniqueFiles = [...new Set((f.root_cause?.locations ?? []).map((loc) => loc.file))];
  if (uniqueFiles.length > 0) {
    const fileLinks = uniqueFiles.map((file) => `[\`${file}\`]()`).join(', ');
    lines.push(`**File(s)**: ${fileLinks}`);
    lines.push('');
  }

  if (f.description) {
    lines.push(`**Description**: ${f.description}`);
    lines.push('');
  }

  for (const loc of f.root_cause?.locations ?? []) {
    if (loc.snippet) {
      lines.push('```solidity');
      lines.push(loc.snippet);
      lines.push('```');
      lines.push('');
    }
  }

  if (f.recommendation) {
    lines.push(`**Recommendation(s)**: ${f.recommendation}`);
    lines.push('');
  }

  lines.push('**Status**: Unresolved');
  lines.push('');
  lines.push('**Update from the client**:');
  lines.push('');
  lines.push('---');

  return lines.join('\n');
}

function CopyButton({ finding }: { finding: Finding }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const md = findingToMarkdown(finding);
    await navigator.clipboard.writeText(md);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <button
      onClick={handleCopy}
      title="Copy as HackMD markdown"
      className="ml-auto flex-shrink-0 rounded p-1 text-text-tertiary transition-colors hover:bg-surface-0 hover:text-text-secondary"
    >
      {copied ? (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
          <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
        </svg>
      )}
    </button>
  );
}

const SEVERITY_ORDER: Record<string, number> = { Critical: 0, High: 1, Medium: 2, Low: 3, Info: 4 };

const SEVERITY_ACCENT: Record<string, string> = {
  Critical: 'border-l-[var(--critical)]',
  High: 'border-l-[var(--high)]',
  Medium: 'border-l-[var(--medium)]',
  Low: 'border-l-[var(--low)]',
  Info: 'border-l-[var(--info)]',
};

export function ReportClient({ findings }: { findings: Finding[] }) {
  const sorted = [...findings].sort((a, b) => {
    return (SEVERITY_ORDER[a.severity] ?? 5) - (SEVERITY_ORDER[b.severity] ?? 5);
  });

  return (
    <div className="space-y-sp-3">
      {sorted.map((finding) => (
        <div
          key={finding.id}
          className={`rounded-md border border-border-default border-l-4 ${
            SEVERITY_ACCENT[finding.severity] ?? 'border-l-[var(--neutral)]'
          } bg-surface-2 p-sp-4`}
        >
          {/* Header */}
          <div className="mb-sp-2 flex items-start gap-sp-3">
            <SeverityBadge severity={(finding.severity ?? 'Info') as 'Critical' | 'High' | 'Medium' | 'Low' | 'Info'} />
            <h3 className="text-heading font-medium text-text-primary">{finding.title}</h3>
            <CopyButton finding={finding} />
          </div>

          {/* Description */}
          {finding.description && (
            <p className="mb-sp-3 text-body text-text-secondary">{finding.description}</p>
          )}

          {/* Code locations */}
          {finding.root_cause?.locations && finding.root_cause.locations.length > 0 && (
            <div className="mb-sp-3">
              {finding.root_cause.locations.map((loc, i) => (
                <div key={i} className="mb-sp-2">
                  <span className="font-mono text-caption text-text-tertiary">{loc.file}</span>
                  {loc.snippet && (
                    <pre className="mt-1 overflow-x-auto rounded-md bg-surface-0 p-sp-3 text-caption leading-relaxed text-text-secondary">
                      {loc.snippet}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Recommendation */}
          {finding.recommendation && (
            <div className="rounded-md bg-surface-0 p-sp-3">
              <span className="text-caption font-medium uppercase text-text-tertiary">Recommendation</span>
              <p className="mt-1 text-body text-text-secondary">{finding.recommendation}</p>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
