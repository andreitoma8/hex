'use client';

import { useState } from 'react';

export interface OverleafSections {
  executive_summary: string | null;
  audited_files: string | null;
  summary_of_findings: string | null;
  findings: string | null;
}

type SectionKey = keyof OverleafSections;

const TABS: Array<{ key: SectionKey; label: string; file: string }> = [
  { key: 'executive_summary', label: 'Executive Summary', file: 'executive_summary.txt' },
  { key: 'audited_files', label: 'Audited Files', file: 'audited_files.txt' },
  { key: 'summary_of_findings', label: 'Summary of Issues', file: 'summary_of_findings.txt' },
  { key: 'findings', label: 'Issues', file: 'findings.txt' },
];

export function OverleafClient({ sections }: { sections: OverleafSections }) {
  const [active, setActive] = useState<SectionKey>('executive_summary');
  const [copied, setCopied] = useState(false);

  const content = sections[active];

  const copy = async () => {
    if (!content) return;
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked (insecure context) — no-op */
    }
  };

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-title font-semibold text-text-primary">Overleaf</h1>
        <p className="mt-1 text-body text-text-secondary">
          LaTeX report sections from <span className="font-mono text-caption">.hex/overleaf/</span>.
          Copy each into the matching slot of the Nethermind Overleaf template.
        </p>
      </header>

      {/* Segmented control */}
      <div className="mb-4 flex flex-wrap gap-1.5">
        {TABS.map((tab) => {
          const isActive = tab.key === active;
          const present = Boolean(sections[tab.key]);
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActive(tab.key)}
              className={`rounded-md px-3 py-1.5 text-caption font-medium ${
                isActive
                  ? 'bg-accent text-surface-0'
                  : 'bg-surface-2 text-text-secondary hover:text-text-primary'
              } ${present ? '' : 'opacity-50'}`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="rounded-lg border border-border-subtle bg-surface-1">
        <div className="flex items-center justify-between border-b border-border-subtle px-4 py-2.5">
          <span className="font-mono text-caption text-text-tertiary">
            {TABS.find((t) => t.key === active)?.file}
          </span>
          <button
            type="button"
            onClick={copy}
            disabled={!content}
            className="rounded-md border border-border-default px-2.5 py-1 text-caption text-text-secondary hover:bg-surface-2 hover:text-text-primary disabled:opacity-50"
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
        {content ? (
          <pre className="max-h-[70vh] overflow-auto p-4 font-mono text-caption leading-relaxed text-text-secondary whitespace-pre-wrap break-words">
            {content}
          </pre>
        ) : (
          <p className="p-4 text-body text-text-tertiary">
            This section has not been generated yet. Run{' '}
            <span className="font-mono text-caption">/generate-overleaf</span>.
          </p>
        )}
      </div>
    </div>
  );
}
