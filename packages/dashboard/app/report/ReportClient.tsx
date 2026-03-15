'use client';

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
