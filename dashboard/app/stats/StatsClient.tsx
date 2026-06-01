'use client';

import { useState, useMemo } from 'react';
import { FilterableTable, type FilterableColumn } from '@/components/FilterableTable';

// ─── Types ──────────────────────────────────────────────────────────

interface PerContractStats {
  file: string;
  contract: string;
  type: string;
  nsloc: number;
  functions: number;
  external_functions: number;
  public_functions: number;
  internal_functions: number;
  private_functions: number;
  modifiers: number;
  events: number;
  errors: number;
  assembly_lines: number;
  inherits: string[];
}

interface DependencyEntry {
  package: string;
  version: string | null;
  imports: number;
}

interface CoveragePerContract {
  contract: string;
  file: string;
  line_pct: number;
  branch_pct: number;
}

interface TestCoverage {
  status: string;
  failure_reason: string | null;
  overall_line_pct: number | null;
  overall_branch_pct: number | null;
  per_contract: CoveragePerContract[];
}

interface Totals {
  files: number;
  contracts: number;
  interfaces: number;
  libraries: number;
  abstract_contracts: number;
  total_lines: number;
  nsloc: number;
  comment_lines: number;
  blank_lines: number;
  assembly_lines: number;
}

export interface StatsClientProps {
  totals: Totals;
  per_contract: PerContractStats[];
  erc_eip_usage: string[];
  dependencies: DependencyEntry[];
  test_coverage: TestCoverage | null;
}

// ─── Helpers ────────────────────────────────────────────────────────

function pctBarColor(pct: number): string {
  if (pct >= 80) return 'bg-[var(--success)]';
  if (pct >= 50) return 'bg-[var(--medium)]';
  return 'bg-[var(--critical)]';
}

const TYPE_STYLES: Record<string, string> = {
  contract: 'bg-[var(--low)]/15 text-[var(--low)]',
  interface: 'bg-[var(--info)]/15 text-[var(--info)]',
  library: 'bg-[var(--info)]/15 text-[var(--info)]',
  abstract: 'bg-[var(--high)]/15 text-[var(--high)]',
};

const TABS = ['Summary', 'Per-Contract', 'Coverage', 'Dependencies'] as const;
type Tab = (typeof TABS)[number];

// ─── Component ──────────────────────────────────────────────────────

export function StatsClient({
  totals,
  per_contract,
  erc_eip_usage,
  dependencies,
  test_coverage,
}: StatsClientProps) {
  const [activeTab, setActiveTab] = useState<Tab>('Summary');

  return (
    <>
      {/* Segmented control */}
      <div className="mb-sp-5 inline-flex overflow-x-auto rounded-md bg-surface-3 p-1">
        {TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`whitespace-nowrap rounded-sm px-sp-3 py-1.5 text-body font-medium ${
              activeTab === tab
                ? 'bg-surface-2 text-text-primary shadow-sm'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'Summary' && (
        <SummaryTab totals={totals} per_contract={per_contract} erc_eip_usage={erc_eip_usage} />
      )}
      {activeTab === 'Per-Contract' && (
        <PerContractTab per_contract={per_contract} />
      )}
      {activeTab === 'Coverage' && (
        <CoverageTab test_coverage={test_coverage} />
      )}
      {activeTab === 'Dependencies' && (
        <DependenciesTab dependencies={dependencies} />
      )}
    </>
  );
}

// ─── Tab: Summary ───────────────────────────────────────────────────

function SummaryTab({
  totals,
  per_contract,
  erc_eip_usage,
}: {
  totals: Totals;
  per_contract: PerContractStats[];
  erc_eip_usage: string[];
}) {
  return (
    <div>
      {/* 6 KPI cards */}
      <div className="mb-sp-6 grid grid-cols-2 gap-sp-3 sm:grid-cols-3 lg:grid-cols-6">
        <SummaryCard label="Contracts" value={totals.contracts} />
        <SummaryCard label="nSLOC" value={totals.nsloc.toLocaleString()} />
        <SummaryCard label="Functions" value={per_contract.reduce((s, c) => s + c.functions, 0)} />
        <SummaryCard label="Modifiers" value={per_contract.reduce((s, c) => s + c.modifiers, 0)} />
        <SummaryCard label="Events" value={per_contract.reduce((s, c) => s + c.events, 0)} />
        <SummaryCard label="Assembly" value={totals.assembly_lines} />
      </div>

      {/* ERC/EIP badges */}
      {erc_eip_usage.length > 0 && (
        <div className="mb-sp-6">
          <h3 className="mb-sp-2 text-heading font-medium text-text-primary">ERC / EIP Usage</h3>
          <div className="flex flex-wrap gap-2">
            {erc_eip_usage.map((erc) => (
              <span
                key={erc}
                className="inline-flex items-center rounded-sm bg-[var(--info)]/15 px-2.5 py-1 text-caption font-medium text-[var(--info)]"
              >
                {erc}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Less important counts */}
      <div className="flex flex-wrap gap-sp-4 text-caption text-text-tertiary">
        <span>Total Lines: {totals.total_lines.toLocaleString()}</span>
        <span>Comments: {totals.comment_lines.toLocaleString()}</span>
        <span>Blank: {totals.blank_lines.toLocaleString()}</span>
        <span>Files: {totals.files}</span>
        <span>Interfaces: {totals.interfaces}</span>
        <span>Libraries: {totals.libraries}</span>
        <span>Abstract: {totals.abstract_contracts}</span>
      </div>
    </div>
  );
}

// ─── Tab: Per-Contract ──────────────────────────────────────────────

function PerContractTab({ per_contract }: { per_contract: PerContractStats[] }) {
  const columns = useMemo<FilterableColumn<PerContractStats>[]>(() => [
    {
      id: 'file',
      header: 'File',
      accessorKey: 'file',
      cell: (row) => (
        <span className="max-w-[200px] truncate font-mono text-caption text-text-tertiary">{row.file}</span>
      ),
    },
    {
      id: 'contract',
      header: 'Contract',
      accessorKey: 'contract',
      enableColumnFilter: true,
      cell: (row) => <span className="font-medium text-text-primary">{row.contract}</span>,
    },
    {
      id: 'type',
      header: 'Type',
      accessorKey: 'type',
      enableColumnFilter: true,
      cell: (row) => (
        <span className={`inline-flex items-center rounded-sm px-2 py-0.5 text-caption font-medium ${TYPE_STYLES[row.type] ?? 'bg-surface-3 text-text-secondary'}`}>
          {row.type}
        </span>
      ),
    },
    {
      id: 'nsloc',
      header: 'nSLOC',
      accessorKey: 'nsloc',
      cell: (row) => <span className="text-right font-mono tabular-nums text-text-secondary">{row.nsloc}</span>,
    },
    {
      id: 'functions',
      header: 'Functions',
      accessorKey: 'functions',
      cell: (row) => <span className="text-right font-mono tabular-nums text-text-secondary">{row.functions}</span>,
    },
    {
      id: 'modifiers',
      header: 'Modifiers',
      accessorKey: 'modifiers',
      cell: (row) => <span className="text-right font-mono tabular-nums text-text-secondary">{row.modifiers}</span>,
    },
    {
      id: 'events',
      header: 'Events',
      accessorKey: 'events',
      cell: (row) => <span className="text-right font-mono tabular-nums text-text-secondary">{row.events}</span>,
    },
    {
      id: 'errors',
      header: 'Errors',
      accessorKey: 'errors',
      cell: (row) => <span className="text-right font-mono tabular-nums text-text-secondary">{row.errors}</span>,
    },
    {
      id: 'assembly_lines',
      header: 'Assembly',
      accessorKey: 'assembly_lines',
      cell: (row) => (
        row.assembly_lines > 0
          ? <span className="text-right font-mono tabular-nums text-[var(--medium)]">{row.assembly_lines}</span>
          : <span className="text-right font-mono tabular-nums text-text-tertiary">0</span>
      ),
    },
    {
      id: 'inherits',
      header: 'Inherits',
      accessorKey: 'inherits',
      cell: (row) => (
        <span className="max-w-[200px] truncate text-caption text-text-tertiary">
          {row.inherits.length > 0 ? row.inherits.join(', ') : '--'}
        </span>
      ),
    },
  ], []);

  const totals = useMemo(() => ({
    nsloc: per_contract.reduce((s, c) => s + c.nsloc, 0),
    functions: per_contract.reduce((s, c) => s + c.functions, 0),
    modifiers: per_contract.reduce((s, c) => s + c.modifiers, 0),
    events: per_contract.reduce((s, c) => s + c.events, 0),
    errors: per_contract.reduce((s, c) => s + c.errors, 0),
    assembly: per_contract.reduce((s, c) => s + c.assembly_lines, 0),
  }), [per_contract]);

  return (
    <div>
      <FilterableTable columns={columns} data={per_contract} defaultOpen={true} />

      {/* Totals summary */}
      <div className="mt-sp-3 flex flex-wrap gap-sp-4 rounded-md border border-border-default bg-surface-2 px-sp-4 py-sp-3 text-body font-medium text-text-primary">
        <span>Total ({per_contract.length} contracts)</span>
        <span className="font-mono tabular-nums">nSLOC: {totals.nsloc}</span>
        <span className="font-mono tabular-nums">Functions: {totals.functions}</span>
        <span className="font-mono tabular-nums">Modifiers: {totals.modifiers}</span>
        <span className="font-mono tabular-nums">Events: {totals.events}</span>
        <span className="font-mono tabular-nums">Errors: {totals.errors}</span>
        <span className="font-mono tabular-nums">Assembly: {totals.assembly}</span>
      </div>
    </div>
  );
}

// ─── Tab: Coverage ──────────────────────────────────────────────────

function CoverageTab({ test_coverage }: { test_coverage: TestCoverage | null }) {
  if (!test_coverage || test_coverage.status !== 'available') {
    return (
      <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-border-emphasis bg-surface-1 py-sp-8">
        <p className="mb-2 text-heading font-medium text-text-primary">No Coverage Data</p>
        <p className="text-body text-text-tertiary">
          Run tests with coverage enabled to see results here.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-sp-3 grid grid-cols-2 gap-sp-3 sm:grid-cols-4">
        {test_coverage.overall_line_pct != null && (
          <div className="rounded-md border border-border-default bg-surface-2 p-sp-4">
            <div className="mb-1 text-caption text-text-secondary">Line Coverage</div>
            <div className="text-display text-text-primary">
              {test_coverage.overall_line_pct.toFixed(1)}%
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
              <div
                className={`h-full rounded-full ${pctBarColor(test_coverage.overall_line_pct)}`}
                style={{ width: `${Math.min(test_coverage.overall_line_pct, 100)}%` }}
              />
            </div>
          </div>
        )}
        {test_coverage.overall_branch_pct != null && (
          <div className="rounded-md border border-border-default bg-surface-2 p-sp-4">
            <div className="mb-1 text-caption text-text-secondary">Branch Coverage</div>
            <div className="text-display text-text-primary">
              {test_coverage.overall_branch_pct.toFixed(1)}%
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
              <div
                className={`h-full rounded-full ${pctBarColor(test_coverage.overall_branch_pct)}`}
                style={{ width: `${Math.min(test_coverage.overall_branch_pct, 100)}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {test_coverage.per_contract.length > 0 && (
        <div className="overflow-x-auto rounded-md border border-border-default">
          <table className="w-full text-left text-body">
            <thead className="border-b border-border-default bg-surface-2 text-caption font-medium uppercase tracking-wider text-text-tertiary">
              <tr>
                <th className="px-sp-4 py-sp-2">Contract</th>
                <th className="px-sp-4 py-sp-2">File</th>
                <th className="px-sp-4 py-sp-2">Line %</th>
                <th className="w-48 px-sp-4 py-sp-2">Line Coverage</th>
                <th className="px-sp-4 py-sp-2">Branch %</th>
                <th className="w-48 px-sp-4 py-sp-2">Branch Coverage</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {test_coverage.per_contract.map((cov) => (
                <tr
                  key={`${cov.file}:${cov.contract}`}
                  className="h-9 bg-surface-1 hover:bg-surface-3"
                >
                  <td className="px-sp-4 py-sp-2 font-medium text-text-primary">{cov.contract}</td>
                  <td className="max-w-[200px] truncate px-sp-4 py-sp-2 font-mono text-caption text-text-tertiary">
                    {cov.file}
                  </td>
                  <td className="px-sp-4 py-sp-2 font-mono tabular-nums text-text-secondary">
                    {cov.line_pct.toFixed(1)}%
                  </td>
                  <td className="px-sp-4 py-sp-2">
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
                      <div
                        className={`h-full rounded-full ${pctBarColor(cov.line_pct)}`}
                        style={{ width: `${Math.min(cov.line_pct, 100)}%` }}
                      />
                    </div>
                  </td>
                  <td className="px-sp-4 py-sp-2 font-mono tabular-nums text-text-secondary">
                    {cov.branch_pct.toFixed(1)}%
                  </td>
                  <td className="px-sp-4 py-sp-2">
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
                      <div
                        className={`h-full rounded-full ${pctBarColor(cov.branch_pct)}`}
                        style={{ width: `${Math.min(cov.branch_pct, 100)}%` }}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Tab: Dependencies ──────────────────────────────────────────────

function DependenciesTab({ dependencies }: { dependencies: DependencyEntry[] }) {
  if (dependencies.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-border-emphasis bg-surface-1 py-sp-8">
        <p className="mb-2 text-heading font-medium text-text-primary">No Dependencies</p>
        <p className="text-body text-text-tertiary">
          No external dependencies were detected.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border border-border-default">
      <table className="w-full text-left text-body">
        <thead className="border-b border-border-default bg-surface-2 text-caption font-medium uppercase tracking-wider text-text-tertiary">
          <tr>
            <th className="px-sp-4 py-sp-2">Package</th>
            <th className="px-sp-4 py-sp-2">Version</th>
            <th className="px-sp-4 py-sp-2 text-right">Imports</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border-subtle">
          {dependencies.map((dep) => (
            <tr
              key={dep.package}
              className="h-9 bg-surface-1 hover:bg-surface-3"
            >
              <td className="px-sp-4 py-sp-2 font-medium text-text-primary">{dep.package}</td>
              <td className="px-sp-4 py-sp-2 font-mono text-body text-text-tertiary">
                {dep.version ?? '--'}
              </td>
              <td className="px-sp-4 py-sp-2 text-right font-mono tabular-nums text-text-secondary">
                {dep.imports}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Shared sub-components ──────────────────────────────────────────

function SummaryCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-border-default bg-surface-2 p-sp-4">
      <div className="text-display text-text-primary">{value}</div>
      <div className="mt-1 text-caption text-text-secondary">{label}</div>
    </div>
  );
}
