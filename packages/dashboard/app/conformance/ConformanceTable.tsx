'use client';

import { Fragment, useState } from 'react';

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
  DEVIATES: 'bg-[var(--critical)]/15 text-[var(--critical)]',
  PARTIAL: 'bg-[var(--medium)]/15 text-[var(--medium)]',
  UNVERIFIABLE: 'bg-accent/15 text-accent',
  UNDOCUMENTED: 'bg-[var(--neutral)]/15 text-[var(--neutral)]',
  CONFORMS: 'bg-[var(--success)]/15 text-[var(--success)]',
};

const STATUS_ROW_BORDER: Record<string, string> = {
  DEVIATES: 'border-l-[var(--critical)]',
  PARTIAL: 'border-l-[var(--medium)]',
  UNVERIFIABLE: 'border-l-accent',
  UNDOCUMENTED: 'border-l-[var(--neutral)]',
  CONFORMS: 'border-l-[var(--success)]',
};

const SEVERITY_STYLES: Record<string, string> = {
  Critical: 'bg-[var(--critical)]/15 text-[var(--critical)]',
  High: 'bg-[var(--high)]/15 text-[var(--high)]',
  Medium: 'bg-[var(--medium)]/15 text-[var(--medium)]',
  Low: 'bg-[var(--low)]/15 text-[var(--low)]',
  Info: 'bg-[var(--info)]/15 text-[var(--info)]',
};

const SOURCE_LABELS: Record<string, string> = {
  external_docs: 'Docs',
  natspec: 'NatSpec',
  interface: 'Interface',
  erc_eip: 'ERC/EIP',
};

export function ConformanceTable({ checks }: ConformanceTableProps) {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  function toggleRow(id: string) {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const filteredChecks = statusFilter
    ? checks.filter((c) => c.status === statusFilter)
    : checks;

  // Filter pills
  const statuses = ['DEVIATES', 'PARTIAL', 'UNVERIFIABLE', 'UNDOCUMENTED', 'CONFORMS'];

  return (
    <div>
      {/* Status filter pills */}
      <div className="mb-sp-3 flex flex-wrap gap-1">
        <button
          type="button"
          onClick={() => setStatusFilter(null)}
          className={`rounded-sm px-2.5 py-1 text-caption font-medium ${
            !statusFilter ? 'bg-accent text-white' : 'bg-surface-3 text-text-secondary hover:text-text-primary'
          }`}
        >
          All
        </button>
        {statuses.map((status) => {
          const count = checks.filter((c) => c.status === status).length;
          if (count === 0) return null;
          return (
            <button
              key={status}
              type="button"
              onClick={() => setStatusFilter(statusFilter === status ? null : status)}
              className={`rounded-sm px-2.5 py-1 text-caption font-medium ${
                statusFilter === status ? 'bg-accent text-white' : 'bg-surface-3 text-text-secondary hover:text-text-primary'
              }`}
            >
              {status} <span className="opacity-60">{count}</span>
            </button>
          );
        })}
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-md border border-border-default">
        <table className="w-full text-left text-body">
          <thead className="border-b border-border-default bg-surface-2 text-caption font-medium uppercase tracking-wider text-text-tertiary">
            <tr>
              <th className="w-8 px-2 py-sp-2" />
              <th className="w-24 px-sp-4 py-sp-2">ID</th>
              <th className="px-sp-4 py-sp-2">Requirement</th>
              <th className="w-32 px-sp-4 py-sp-2">Status</th>
              <th className="w-24 px-sp-4 py-sp-2">Source</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {filteredChecks.map((check) => {
              const isExpanded = expandedRows.has(check.id);
              const badgeStyle = STATUS_BADGE_STYLES[check.status] ?? STATUS_BADGE_STYLES.UNDOCUMENTED;
              const borderColor = STATUS_ROW_BORDER[check.status] ?? STATUS_ROW_BORDER.UNDOCUMENTED;

              return (
                <Fragment key={check.id}>
                  <tr
                    onClick={() => toggleRow(check.id)}
                    className={`border-l-4 ${borderColor} cursor-pointer bg-surface-1 hover:bg-surface-3`}
                  >
                    <td className="w-8 px-2 py-sp-2 text-text-tertiary">
                      <svg
                        className={`h-4 w-4 ${isExpanded ? 'rotate-90' : ''}`}
                        fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="m9 5 7 7-7 7" />
                      </svg>
                    </td>
                    <td className="whitespace-nowrap px-sp-4 py-sp-2 font-mono text-caption text-text-secondary">
                      {check.id}
                    </td>
                    <td className="px-sp-4 py-sp-2 text-text-primary">
                      {check.requirement}
                    </td>
                    <td className="px-sp-4 py-sp-2">
                      <span className={`inline-flex items-center rounded-sm px-2 py-0.5 text-caption font-medium ${badgeStyle}`}>
                        {check.status}
                      </span>
                    </td>
                    <td className="px-sp-4 py-sp-2 text-caption text-text-tertiary">
                      {check.source
                        ? (SOURCE_LABELS[check.source] ?? check.source)
                        : (check.spec_section ?? '-')}
                    </td>
                  </tr>

                  {isExpanded && (
                    <tr className={`border-l-4 ${borderColor}`}>
                      <td colSpan={5} className="bg-surface-0 px-sp-6 py-sp-4">
                        <div className="text-body text-text-secondary">
                          <h4 className="mb-sp-2 text-caption font-medium uppercase text-text-tertiary">
                            Details
                          </h4>
                          <p className="whitespace-pre-wrap">{check.details}</p>
                        </div>

                        <div className="mt-sp-3 flex flex-wrap gap-sp-3">
                          {check.confidence && (
                            <div>
                              <span className="text-caption text-text-tertiary">Confidence: </span>
                              <span className="text-caption text-text-secondary">{check.confidence}</span>
                            </div>
                          )}
                          {check.severity_hint && (
                            <div>
                              <span className="text-caption text-text-tertiary">Severity: </span>
                              <span className={`inline-flex items-center rounded-sm px-2 py-0.5 text-caption font-medium ${SEVERITY_STYLES[check.severity_hint] ?? SEVERITY_STYLES.Info}`}>
                                {check.severity_hint}
                              </span>
                            </div>
                          )}
                          {check.code_location && (
                            <div>
                              <span className="text-caption text-text-tertiary">Location: </span>
                              <code className="rounded-sm bg-surface-3 px-1.5 py-0.5 text-caption text-text-secondary">
                                {check.code_location.file}:{check.code_location.line_start}
                                {check.code_location.line_end !== check.code_location.line_start &&
                                  `-${check.code_location.line_end}`}
                              </code>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
