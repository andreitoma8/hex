'use client';

import { useState, useMemo } from 'react';

// ─── Types ──────────────────────────────────────────────────────────

interface ContractInfo {
  file: string;
  contract: string;
  type: string;
  nsloc: number;
}

export interface ProgressClientProps {
  contracts: ContractInfo[];
  totalsNsloc: number;
  reviewedContracts: Record<string, boolean>;
  auditSteps: { label: string; completed: boolean }[];
  findingsTotal: number;
  findingsBySeverity: Record<string, number>;
  findingsTracked: number;
}

// ─── Helpers ────────────────────────────────────────────────────────

function contractKey(c: ContractInfo): string {
  return `${c.file}::${c.contract}`;
}

function pctBarColor(pct: number): string {
  if (pct >= 67) return 'bg-[var(--success)]';
  if (pct >= 34) return 'bg-[var(--medium)]';
  return 'bg-[var(--critical)]';
}

function pctTextColor(pct: number): string {
  if (pct >= 67) return 'text-[var(--success)]';
  if (pct >= 34) return 'text-[var(--medium)]';
  return 'text-[var(--critical)]';
}

const TYPE_ORDER: Record<string, number> = {
  contract: 0,
  abstract: 1,
  library: 2,
  interface: 3,
};

const TYPE_STYLES: Record<string, string> = {
  contract: 'bg-[var(--low)]/15 text-[var(--low)]',
  interface: 'bg-[var(--info)]/15 text-[var(--info)]',
  library: 'bg-[var(--info)]/15 text-[var(--info)]',
  abstract: 'bg-[var(--high)]/15 text-[var(--high)]',
};

const SEVERITY_ORDER: string[] = ['Critical', 'High', 'Medium', 'Low', 'Info', 'Gas'];

const SEVERITY_COLORS: Record<string, string> = {
  Critical: 'bg-[var(--critical)]/15 text-[var(--critical)]',
  High: 'bg-[var(--high)]/15 text-[var(--high)]',
  Medium: 'bg-[var(--medium)]/15 text-[var(--medium)]',
  Low: 'bg-[var(--low)]/15 text-[var(--low)]',
  Info: 'bg-[var(--info)]/15 text-[var(--info)]',
  Gas: 'bg-surface-3 text-text-secondary',
};

// ─── Component ──────────────────────────────────────────────────────

type CheckFilter = 'all' | 'checked' | 'unchecked';

export function ProgressClient({
  contracts,
  totalsNsloc,
  reviewedContracts: initialReviewed,
  auditSteps,
  findingsTotal,
  findingsBySeverity,
  findingsTracked,
}: ProgressClientProps) {
  const [reviewed, setReviewed] = useState<Record<string, boolean>>(initialReviewed);
  const [checkFilter, setCheckFilter] = useState<CheckFilter>('all');

  // ── Calculations ──

  const reviewedNsloc = useMemo(
    () => contracts.filter((c) => reviewed[contractKey(c)]).reduce((s, c) => s + c.nsloc, 0),
    [contracts, reviewed],
  );

  const reviewedCount = useMemo(
    () => contracts.filter((c) => reviewed[contractKey(c)]).length,
    [contracts, reviewed],
  );

  const contractPct = totalsNsloc > 0 ? (reviewedNsloc / totalsNsloc) * 100 : 0;
  const stepsCompleted = auditSteps.filter((s) => s.completed).length;
  const stepsPct = (stepsCompleted / auditSteps.length) * 100;
  const triagePct = findingsTotal > 0 ? (findingsTracked / findingsTotal) * 100 : 100;
  const overallPct = 0.7 * contractPct + 0.2 * stepsPct + 0.1 * triagePct;

  // ── Sorted & filtered contracts ──

  const sortedContracts = useMemo(() => {
    const sorted = [...contracts].sort((a, b) => {
      const typeA = TYPE_ORDER[a.type] ?? 99;
      const typeB = TYPE_ORDER[b.type] ?? 99;
      if (typeA !== typeB) return typeA - typeB;
      return b.nsloc - a.nsloc;
    });
    if (checkFilter === 'all') return sorted;
    return sorted.filter((c) => {
      const isChecked = !!reviewed[contractKey(c)];
      return checkFilter === 'checked' ? isChecked : !isChecked;
    });
  }, [contracts, checkFilter, reviewed]);

  const maxNsloc = useMemo(
    () => Math.max(...contracts.map((c) => c.nsloc), 1),
    [contracts],
  );

  // ── Toggle handler ──

  function toggleContract(c: ContractInfo) {
    const key = contractKey(c);
    const next = !reviewed[key];
    setReviewed((prev) => ({ ...prev, [key]: next }));

    // Fire-and-forget persist
    fetch('/api/progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reviewed_contracts: { [key]: next } }),
    }).catch(() => {/* silent */});
  }

  // ── Render ──

  return (
    <>
      {/* A. Overall Progress Bar */}
      <div className="mb-sp-5 rounded-md border border-border-default bg-surface-2 p-sp-4">
        <div className="mb-2 flex items-baseline justify-between gap-sp-2">
          <span className={`text-display font-semibold ${pctTextColor(overallPct)}`}>
            {overallPct.toFixed(0)}%
          </span>
          <span
            className="text-caption text-text-tertiary inline-flex items-center gap-1.5"
            title="Overall progress is a weighted average: 70% nSLOC reviewed (contract review), 20% audit-step completion, 10% findings triage."
            aria-label="Overall progress formula: 70% contract review by nSLOC, 20% step completion, 10% findings triage"
          >
            Contract Review {contractPct.toFixed(0)}% · Steps {stepsPct.toFixed(0)}% · Triage {triagePct.toFixed(0)}%
            <svg className="h-3.5 w-3.5 text-text-tertiary" aria-hidden="true" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM7.25 7.25a.75.75 0 0 1 1.5 0v3.5a.75.75 0 0 1-1.5 0v-3.5zM8 4.5a.875.875 0 1 1 0 1.75A.875.875 0 0 1 8 4.5z" />
            </svg>
          </span>
        </div>
        <div className="h-3 w-full overflow-hidden rounded-full bg-surface-3">
          <div
            className={`h-full rounded-full transition-all duration-300 ${pctBarColor(overallPct)}`}
            style={{ width: `${Math.min(overallPct, 100)}%` }}
            role="progressbar"
            aria-valuenow={Math.round(overallPct)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Overall audit progress"
          />
        </div>
        <p className="mt-2 text-caption text-text-tertiary">
          Weighted: 70% nSLOC reviewed · 20% audit steps · 10% findings triage. Hover the breakdown for details.
        </p>
      </div>

      {/* B. KPI Cards */}
      <div className="mb-sp-5 grid grid-cols-2 gap-sp-3 lg:grid-cols-4">
        <div className="rounded-md border border-border-default bg-surface-2 p-sp-4">
          <div className={`text-display ${pctTextColor(overallPct)}`}>{overallPct.toFixed(0)}%</div>
          <div className="mt-1 text-caption text-text-secondary">Overall Progress</div>
        </div>
        <div className="rounded-md border border-border-default bg-surface-2 p-sp-4">
          <div className="text-display text-text-primary">
            {reviewedCount} / {contracts.length}
          </div>
          <div className="mt-1 text-caption text-text-secondary">Contracts Reviewed</div>
        </div>
        <div className="rounded-md border border-border-default bg-surface-2 p-sp-4">
          <div className="text-display text-text-primary">
            {reviewedNsloc.toLocaleString()} / {totalsNsloc.toLocaleString()}
          </div>
          <div className="mt-1 text-caption text-text-secondary">nSLOC Reviewed</div>
        </div>
        <div className="rounded-md border border-border-default bg-surface-2 p-sp-4">
          <div className="text-display text-text-primary">{findingsTotal}</div>
          <div className="mt-1 text-caption text-text-secondary">Findings</div>
          {Object.keys(findingsBySeverity).length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {SEVERITY_ORDER.filter((sev) => findingsBySeverity[sev]).map((sev) => (
                <span
                  key={sev}
                  className={`inline-flex items-center rounded-md px-2 py-0.5 text-caption font-medium ${SEVERITY_COLORS[sev] ?? 'bg-surface-3 text-text-secondary'}`}
                >
                  {findingsBySeverity[sev]} {sev}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* C. Audit Steps */}
      <div className="mb-sp-5">
        <h3 className="mb-sp-2 text-heading font-medium text-text-primary">Audit Steps</h3>
        <div className="flex flex-wrap gap-2">
          {auditSteps.map((step) => (
            <span
              key={step.label}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-caption font-medium ${
                step.completed
                  ? 'bg-[var(--success)]/15 text-[var(--success)]'
                  : 'bg-surface-3 text-text-tertiary'
              }`}
            >
              {step.completed ? (
                <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />
                </svg>
              ) : (
                <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm.75-11.25a.75.75 0 0 0-1.5 0v2.5h-2.5a.75.75 0 0 0 0 1.5h2.5v2.5a.75.75 0 0 0 1.5 0v-2.5h2.5a.75.75 0 0 0 0-1.5h-2.5v-2.5Z" clipRule="evenodd" />
                </svg>
              )}
              {step.label}
            </span>
          ))}
        </div>
      </div>

      {/* D. Contract Checklist */}
      <div>
        <div className="mb-sp-2 flex items-center justify-between">
          <h3 className="text-heading font-medium text-text-primary">Contract Checklist</h3>
          <div className="inline-flex rounded-md bg-surface-3 p-0.5">
            {(['all', 'unchecked', 'checked'] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setCheckFilter(f)}
                className={`rounded-sm px-2.5 py-1 text-caption font-medium ${
                  checkFilter === f
                    ? 'bg-surface-2 text-text-primary shadow-sm'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                {f === 'all' ? `All (${contracts.length})` : f === 'checked' ? `Reviewed (${reviewedCount})` : `Remaining (${contracts.length - reviewedCount})`}
              </button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto rounded-md border border-border-default">
          <table className="w-full text-left text-body">
            <thead className="border-b border-border-default bg-surface-2 text-caption font-medium uppercase tracking-wider text-text-tertiary">
              <tr>
                <th className="w-10 px-sp-3 py-sp-2" />
                <th className="px-sp-4 py-sp-2">Contract</th>
                <th className="px-sp-4 py-sp-2">File</th>
                <th className="px-sp-4 py-sp-2">Type</th>
                <th className="px-sp-4 py-sp-2 text-right">nSLOC</th>
                <th className="w-32 px-sp-4 py-sp-2">Weight</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {sortedContracts.map((c) => {
                const key = contractKey(c);
                const isChecked = !!reviewed[key];
                const barWidth = (c.nsloc / maxNsloc) * 100;
                return (
                  <tr
                    key={key}
                    className={`h-9 transition-colors ${
                      isChecked ? 'bg-[var(--success)]/5' : 'bg-surface-1'
                    } hover:bg-surface-3`}
                  >
                    <td className="px-sp-3 py-sp-2">
                      <button
                        type="button"
                        onClick={() => toggleContract(c)}
                        className={`flex h-5 w-5 items-center justify-center rounded border transition-colors ${
                          isChecked
                            ? 'border-[var(--accent)] bg-[var(--accent)] text-surface-0'
                            : 'border-border-emphasis bg-surface-1 hover:border-[var(--accent)]'
                        }`}
                      >
                        {isChecked && (
                          <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.5 6l2.5 2.5 4.5-5" />
                          </svg>
                        )}
                      </button>
                    </td>
                    <td className="px-sp-4 py-sp-2 font-medium text-text-primary">{c.contract}</td>
                    <td className="max-w-[200px] truncate px-sp-4 py-sp-2 font-mono text-caption text-text-tertiary">
                      {c.file}
                    </td>
                    <td className="px-sp-4 py-sp-2">
                      <span
                        className={`inline-flex items-center rounded-sm px-2 py-0.5 text-caption font-medium ${
                          TYPE_STYLES[c.type] ?? 'bg-surface-3 text-text-secondary'
                        }`}
                      >
                        {c.type}
                      </span>
                    </td>
                    <td className="px-sp-4 py-sp-2 text-right font-mono tabular-nums text-text-secondary">
                      {c.nsloc}
                    </td>
                    <td className="px-sp-4 py-sp-2">
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
                        <div
                          className="h-full rounded-full bg-[var(--accent)]"
                          style={{ width: `${barWidth}%` }}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
