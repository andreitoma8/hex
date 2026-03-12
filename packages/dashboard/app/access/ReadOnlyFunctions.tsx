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
  external: 'bg-red-600/20 text-red-400 border-red-500/30',
  public: 'bg-orange-600/20 text-orange-400 border-orange-500/30',
  internal: 'bg-blue-600/20 text-blue-400 border-blue-500/30',
  private: 'bg-gray-600/20 text-gray-400 border-gray-500/30',
};

function VisibilityBadge({ visibility }: { visibility: string }) {
  const style =
    VISIBILITY_STYLES[visibility] ?? 'bg-gray-600/20 text-gray-400 border-gray-500/30';
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${style}`}
    >
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
    <div className="mb-10">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 rounded-lg border border-gray-700 bg-gray-800/50 px-4 py-3 text-left transition-colors hover:bg-gray-700/50"
      >
        <svg
          className={`h-4 w-4 text-gray-500 transition-transform ${expanded ? 'rotate-90' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m9 5 7 7-7 7" />
        </svg>
        <span className="text-sm font-medium text-gray-300">
          Read-Only Functions ({functions.length})
        </span>
        <span className="text-xs text-gray-500">view / pure</span>
      </button>

      {expanded && (
        <div className="mt-2 overflow-x-auto rounded-lg border border-gray-700">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-700 bg-gray-800 text-xs uppercase text-gray-400">
              <tr>
                <th className="px-4 py-3">Contract</th>
                <th className="px-4 py-3">Function</th>
                <th className="px-4 py-3">Visibility</th>
                <th className="px-4 py-3">Mutability</th>
                <th className="px-4 py-3">Location</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700/50">
              {functions.map((fn) => {
                const key = `${fn.contract}::${fn.function}`;
                const isAnyone = anyoneSet.has(key);
                return (
                  <tr
                    key={key}
                    className={
                      isAnyone
                        ? 'bg-red-950/30 transition-colors hover:bg-red-900/30'
                        : 'bg-gray-900 transition-colors hover:bg-gray-800/70'
                    }
                  >
                    <td className="px-4 py-3 font-medium text-gray-200">{fn.contract}</td>
                    <td className="px-4 py-3 font-mono text-sm text-gray-300">{fn.function}</td>
                    <td className="px-4 py-3">
                      <VisibilityBadge visibility={fn.visibility} />
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400">
                      {fn.state_mutability ?? '--'}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">
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
