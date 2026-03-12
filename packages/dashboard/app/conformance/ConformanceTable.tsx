'use client';

import { useState } from 'react';

interface ConformanceCheck {
  id: string;
  requirement: string;
  status: string;
  details: string;
  spec_section: string;
  confidence?: string;
  source?: string;
  severity_hint?: string;
  code_location?: { file: string; line_start: number; line_end: number };
}

interface ConformanceTableProps {
  checks: ConformanceCheck[];
}

const STATUS_BADGE_STYLES: Record<string, string> = {
  DEVIATES: 'bg-red-600/20 text-red-400 border-red-500/30',
  PARTIAL: 'bg-yellow-600/20 text-yellow-400 border-yellow-500/30',
  UNVERIFIABLE: 'bg-blue-600/20 text-blue-400 border-blue-500/30',
  UNDOCUMENTED: 'bg-gray-600/20 text-gray-400 border-gray-500/30',
  CONFORMS: 'bg-green-600/20 text-green-400 border-green-500/30',
};

const STATUS_ROW_BORDER: Record<string, string> = {
  DEVIATES: 'border-l-red-500',
  PARTIAL: 'border-l-yellow-500',
  UNVERIFIABLE: 'border-l-blue-500',
  UNDOCUMENTED: 'border-l-gray-500',
  CONFORMS: 'border-l-green-500',
};

const SEVERITY_STYLES: Record<string, string> = {
  Critical: 'bg-red-600/30 text-red-300 border-red-500/40',
  High: 'bg-orange-600/30 text-orange-300 border-orange-500/40',
  Medium: 'bg-yellow-600/30 text-yellow-300 border-yellow-500/40',
  Low: 'bg-blue-600/30 text-blue-300 border-blue-500/40',
  Info: 'bg-gray-600/30 text-gray-300 border-gray-500/40',
};

const SOURCE_LABELS: Record<string, string> = {
  external_docs: 'Docs',
  natspec: 'NatSpec',
  interface: 'Interface',
  erc_eip: 'ERC/EIP',
};

export function ConformanceTable({ checks }: ConformanceTableProps) {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  function toggleRow(id: string) {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-700">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-gray-700 bg-gray-800 text-xs uppercase text-gray-400">
          <tr>
            <th className="w-8 px-2 py-3" />
            <th className="px-4 py-3">ID</th>
            <th className="px-4 py-3">Requirement</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Source</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-700">
          {checks.map((check) => {
            const isExpanded = expandedRows.has(check.id);
            const badgeStyle =
              STATUS_BADGE_STYLES[check.status] ?? STATUS_BADGE_STYLES.UNDOCUMENTED;
            const borderColor =
              STATUS_ROW_BORDER[check.status] ?? STATUS_ROW_BORDER.UNDOCUMENTED;

            return (
              <tr key={check.id} className="contents">
                <td colSpan={5} className="p-0">
                  {/* Main row */}
                  <button
                    type="button"
                    onClick={() => toggleRow(check.id)}
                    className={`flex w-full items-center border-l-4 ${borderColor} bg-gray-800/50 text-left hover:bg-gray-700/50 transition-colors`}
                  >
                    <span className="flex w-8 shrink-0 items-center justify-center px-2 py-3 text-gray-500">
                      <svg
                        className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="m9 5 7 7-7 7"
                        />
                      </svg>
                    </span>
                    <span className="whitespace-nowrap px-4 py-3 font-mono text-xs text-gray-300">
                      {check.id}
                    </span>
                    <span className="flex-1 px-4 py-3 text-gray-300">
                      {check.requirement}
                    </span>
                    <span className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${badgeStyle}`}
                      >
                        {check.status}
                      </span>
                    </span>
                    <span className="px-4 py-3 text-xs text-gray-400">
                      {check.source
                        ? (SOURCE_LABELS[check.source] ?? check.source)
                        : (check.spec_section ?? '-')}
                    </span>
                  </button>

                  {/* Expanded details */}
                  {isExpanded && (
                    <div className={`border-l-4 ${borderColor} bg-gray-900/50 px-8 py-4`}>
                      <div className="text-sm text-gray-300">
                        <h4 className="mb-2 text-xs font-semibold uppercase text-gray-500">
                          Details
                        </h4>
                        <p className="whitespace-pre-wrap">{check.details}</p>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-3">
                        {check.confidence && (
                          <div>
                            <span className="text-xs text-gray-500">Confidence: </span>
                            <span className="text-xs text-gray-300">
                              {check.confidence}
                            </span>
                          </div>
                        )}

                        {check.severity_hint && (
                          <div>
                            <span className="text-xs text-gray-500">Severity: </span>
                            <span
                              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${
                                SEVERITY_STYLES[check.severity_hint] ?? SEVERITY_STYLES.Info
                              }`}
                            >
                              {check.severity_hint}
                            </span>
                          </div>
                        )}

                        {check.code_location && (
                          <div>
                            <span className="text-xs text-gray-500">Location: </span>
                            <code className="rounded bg-gray-800 px-1.5 py-0.5 text-xs text-gray-300">
                              {check.code_location.file}:{check.code_location.line_start}
                              {check.code_location.line_end !== check.code_location.line_start &&
                                `-${check.code_location.line_end}`}
                            </code>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
