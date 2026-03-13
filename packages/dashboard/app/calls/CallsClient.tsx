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

/** Flattened row for table display and filtering */
interface CallRow {
  contract: string;
  fn: string;
  call: string;
  return_checked: boolean;
  reentrancy_guard: boolean;
  call_type: string;
  trust: string;
}

// ─── Helpers ────────────────────────────────────────────────────────

const TRUST_BADGE_STYLES: Record<string, string> = {
  external: 'bg-red-600/20 text-red-400 border-red-500/30',
  untrusted: 'bg-red-600/20 text-red-400 border-red-500/30',
  'semi-trusted': 'bg-yellow-600/20 text-yellow-400 border-yellow-500/30',
  semi_trusted: 'bg-yellow-600/20 text-yellow-400 border-yellow-500/30',
  trusted: 'bg-green-600/20 text-green-400 border-green-500/30',
};

function TrustBadge({ trust }: { trust: string }) {
  const style =
    TRUST_BADGE_STYLES[trust.toLowerCase()] ??
    'bg-gray-600/20 text-gray-400 border-gray-500/30';
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${style}`}
    >
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
    reentrancy_guard: toBool(c.inside_reentrancy_guard.value),
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
    cell: (row) => <span className="font-medium text-gray-200">{row.contract}</span>,
  },
  {
    id: 'function',
    header: 'Function',
    accessorKey: 'fn',
    cell: (row) => <span className="font-mono text-sm text-gray-300">{row.fn}</span>,
  },
  {
    id: 'call',
    header: 'Call',
    accessorKey: 'call',
    cell: (row) => <span className="font-mono text-sm text-gray-300">{row.call}</span>,
  },
  {
    id: 'return_checked',
    header: 'Return Checked',
    accessorKey: 'return_checked',
    cell: (row) => (
      <span className={row.return_checked ? 'text-green-400' : 'text-red-400'}>
        {row.return_checked ? 'Yes' : 'No'}
      </span>
    ),
  },
  {
    id: 'reentrancy_guard',
    header: 'Reentrancy Guard',
    accessorKey: 'reentrancy_guard',
    cell: (row) => (
      <span className={row.reentrancy_guard ? 'text-green-400' : 'text-red-400'}>
        {row.reentrancy_guard ? 'Yes' : 'No'}
      </span>
    ),
  },
  {
    id: 'call_type',
    header: 'Call Type',
    accessorKey: 'call_type',
    enableColumnFilter: true,
    cell: (row) => (
      <span className="inline-flex items-center rounded bg-gray-700 px-2 py-0.5 text-xs text-gray-300">
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

  // Counts by trust level
  const trustCounts: Record<string, number> = {};
  for (const r of rows) {
    trustCounts[r.trust] = (trustCounts[r.trust] ?? 0) + 1;
  }

  const uncheckedReturns = rows.filter((r) => !r.return_checked).length;
  const unguardedCalls = rows.filter((r) => !r.reentrancy_guard).length;

  return (
    <div>
      <h2 className="mb-6 text-2xl font-bold text-gray-100">External Calls</h2>

      <p className="mb-4 text-sm text-gray-400">
        {rows.length} external call{rows.length !== 1 ? 's' : ''} found
      </p>

      {/* Summary cards */}
      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {Object.entries(trustCounts).map(([level, count]) => (
          <div
            key={level}
            className="rounded-lg border border-gray-700 bg-gray-800 p-4"
          >
            <div className="text-2xl font-bold text-gray-100">{count}</div>
            <div className="mt-1 flex items-center gap-2">
              <TrustBadge trust={level} />
            </div>
          </div>
        ))}
        {uncheckedReturns > 0 && (
          <div className="rounded-lg border border-red-800/50 bg-red-950/20 p-4">
            <div className="text-2xl font-bold text-red-400">{uncheckedReturns}</div>
            <div className="mt-1 text-sm text-red-300/70">Unchecked returns</div>
          </div>
        )}
        {unguardedCalls > 0 && (
          <div className="rounded-lg border border-yellow-800/50 bg-yellow-950/20 p-4">
            <div className="text-2xl font-bold text-yellow-400">{unguardedCalls}</div>
            <div className="mt-1 text-sm text-yellow-300/70">No reentrancy guard</div>
          </div>
        )}
      </div>

      {/* Main table */}
      <FilterableTable
        columns={columns}
        data={rows}
        defaultOpen={true}
      />
    </div>
  );
}
