'use client';

import { useState } from 'react';

interface Evidence {
  file: string;
  line_start: number;
  line_end: number;
  snippet?: string;
}

interface AccessFunction {
  contract: string;
  function: string;
  visibility: string;
  state_mutability: string | null;
  modifiers: string[];
  evidence: Evidence;
}

const VISIBILITY_STYLES: Record<string, string> = {
  external: 'bg-[var(--critical)]/15 text-[var(--critical)]',
  public: 'bg-[var(--high)]/15 text-[var(--high)]',
  internal: 'bg-[var(--low)]/15 text-[var(--low)]',
  private: 'bg-[var(--neutral)]/15 text-[var(--neutral)]',
};

function VisibilityBadge({ visibility }: { visibility: string }) {
  const style = VISIBILITY_STYLES[visibility] ?? 'bg-[var(--neutral)]/15 text-[var(--neutral)]';
  return (
    <span className={`inline-flex items-center rounded-sm px-2 py-0.5 text-caption font-medium ${style}`}>
      {visibility}
    </span>
  );
}

export function ReadOnlyFunctions({
  functions,
  anyoneFnKeys,
}: {
  functions: AccessFunction[];
  anyoneFnKeys: string[];
}) {
  const [expanded, setExpanded] = useState(false);
  const anyoneSet = new Set(anyoneFnKeys);

  return (
    <div className="mb-sp-6">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 rounded-md border border-border-default bg-surface-2 px-sp-4 py-sp-3 text-left hover:bg-surface-3"
      >
        <svg
          className={`h-4 w-4 text-text-tertiary ${expanded ? 'rotate-90' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m9 5 7 7-7 7" />
        </svg>
        <span className="text-body font-medium text-text-primary">
          Read-Only Functions ({functions.length})
        </span>
        <span className="text-caption text-text-tertiary">view / pure</span>
      </button>

      {expanded && (
        <div className="mt-2 overflow-x-auto rounded-md border border-border-default">
          <table className="w-full text-left text-body">
            <thead className="border-b border-border-default bg-surface-2 text-caption font-medium uppercase tracking-wider text-text-tertiary">
              <tr>
                <th className="px-sp-4 py-sp-2">Contract</th>
                <th className="px-sp-4 py-sp-2">Function</th>
                <th className="px-sp-4 py-sp-2">Visibility</th>
                <th className="px-sp-4 py-sp-2">Mutability</th>
                <th className="px-sp-4 py-sp-2">Location</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {functions.map((fn) => {
                const key = `${fn.contract}::${fn.function}`;
                const isAnyone = anyoneSet.has(key);
                return (
                  <tr
                    key={key}
                    className={
                      isAnyone
                        ? 'bg-[var(--critical)]/5 hover:bg-[var(--critical)]/10'
                        : 'bg-surface-1 hover:bg-surface-3'
                    }
                  >
                    <td className="px-sp-4 py-sp-2 font-medium text-text-primary">{fn.contract}</td>
                    <td className="px-sp-4 py-sp-2 font-mono text-body text-text-secondary">{fn.function}</td>
                    <td className="px-sp-4 py-sp-2">
                      <VisibilityBadge visibility={fn.visibility} />
                    </td>
                    <td className="px-sp-4 py-sp-2 text-caption text-text-tertiary">
                      {fn.state_mutability ?? '--'}
                    </td>
                    <td className="px-sp-4 py-sp-2 font-mono text-caption text-text-tertiary">
                      {fn.evidence.file}:{fn.evidence.line_start}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
