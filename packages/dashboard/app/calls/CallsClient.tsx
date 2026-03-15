'use client';

import { FilterableTable, type FilterableColumn } from '@/components/FilterableTable';

// ─── Types ──────────────────────────────────────────────────────────

interface ConfidenceValue {
  value: boolean | string;
  confidence: string;
  derived_from: string;
  reasoning?: string;
  warnings?: string[];
  guard_type?: string;
}

interface ExternalCall {
  contract: string;
  function: string;
  target: string;
  method: string;
  return_checked: ConfidenceValue;
  inside_reentrancy_guard: ConfidenceValue;
  call_type: string;
  trust_level: ConfidenceValue;
}

interface CallRow {
  contract: string;
  fn: string;
  call: string;
  return_checked: boolean;
  call_type: string;
  trust: string;
}

// ─── Helpers ────────────────────────────────────────────────────────

const TRUST_STYLES: Record<string, string> = {
  external: 'bg-[var(--critical)]/15 text-[var(--critical)]',
  untrusted: 'bg-[var(--critical)]/15 text-[var(--critical)]',
  'semi-trusted': 'bg-[var(--medium)]/15 text-[var(--medium)]',
  semi_trusted: 'bg-[var(--medium)]/15 text-[var(--medium)]',
  trusted: 'bg-[var(--success)]/15 text-[var(--success)]',
};

function TrustBadge({ trust }: { trust: string }) {
  const style = TRUST_STYLES[trust.toLowerCase()] ?? 'bg-[var(--neutral)]/15 text-[var(--neutral)]';
  return (
    <span className={`inline-flex items-center rounded-sm px-2 py-0.5 text-caption font-medium ${style}`}>
      {trust}
    </span>
  );
}

function toBool(value: boolean | string): boolean {
  return value === true || value === 'true' || value === 'yes';
}

function flattenCalls(calls: ExternalCall[]): CallRow[] {
  return calls.map((c) => ({
    contract: c.contract,
    fn: c.function,
    call: `${c.target}.${c.method}()`,
    return_checked: toBool(c.return_checked.value),
    call_type: c.call_type,
    trust: String(c.trust_level.value),
  }));
}

// ─── Columns ────────────────────────────────────────────────────────

const columns: FilterableColumn<CallRow>[] = [
  {
    id: 'contract',
    header: 'Contract',
    accessorKey: 'contract',
    enableColumnFilter: true,
    cell: (row) => <span className="font-medium text-text-primary">{row.contract}</span>,
  },
  {
    id: 'function',
    header: 'Function',
    accessorKey: 'fn',
    cell: (row) => <span className="font-mono text-body text-text-secondary">{row.fn}</span>,
  },
  {
    id: 'call',
    header: 'Call',
    accessorKey: 'call',
    cell: (row) => <span className="font-mono text-body text-text-secondary">{row.call}</span>,
  },
  {
    id: 'return_checked',
    header: 'Return Checked',
    accessorKey: 'return_checked',
    cell: (row) => (
      <span className={row.return_checked ? 'text-[var(--success)]' : 'text-[var(--critical)]'}>
        {row.return_checked ? 'Yes' : 'No'}
      </span>
    ),
  },
  {
    id: 'call_type',
    header: 'Call Type',
    accessorKey: 'call_type',
    enableColumnFilter: true,
    cell: (row) => (
      <span className="inline-flex items-center rounded-sm bg-surface-3 px-2 py-0.5 text-caption text-text-secondary">
        {row.call_type}
      </span>
    ),
  },
  {
    id: 'trust',
    header: 'Trust',
    accessorKey: 'trust',
    enableColumnFilter: true,
    cell: (row) => <TrustBadge trust={row.trust} />,
  },
];

// ─── Component ──────────────────────────────────────────────────────

export function CallsClient({ calls }: { calls: ExternalCall[] }) {
  const rows = flattenCalls(calls);

  const trustCounts: Record<string, number> = {};
  for (const r of rows) {
    trustCounts[r.trust] = (trustCounts[r.trust] ?? 0) + 1;
  }

  const uncheckedReturns = rows.filter((r) => !r.return_checked).length;

  return (
    <div>
      <h2 className="mb-sp-5 text-title font-semibold text-text-primary">External Calls</h2>

      <p className="mb-sp-3 text-body text-text-secondary">
        {rows.length} external call{rows.length !== 1 ? 's' : ''} found
      </p>

      {/* Summary cards */}
      <div className="mb-sp-5 grid grid-cols-2 gap-sp-3 sm:grid-cols-4">
        {Object.entries(trustCounts).map(([level, count]) => (
          <div
            key={level}
            className="rounded-md border border-border-default bg-surface-2 p-sp-4"
          >
            <div className="text-display text-text-primary">{count}</div>
            <div className="mt-1">
              <TrustBadge trust={level} />
            </div>
          </div>
        ))}
        {uncheckedReturns > 0 && (
          <div className="rounded-md border border-[var(--critical)]/30 bg-[var(--critical)]/5 p-sp-4">
            <div className="text-display text-[var(--critical)]">{uncheckedReturns}</div>
            <div className="mt-1 text-caption text-[var(--critical)]/70">Unchecked returns</div>
          </div>
        )}
      </div>

      <FilterableTable
        columns={columns}
        data={rows}
        defaultOpen={true}
      />
    </div>
  );
}
