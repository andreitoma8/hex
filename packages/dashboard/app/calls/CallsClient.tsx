'use client';

import { FilterableTable, type FilterableColumn } from '@/components/FilterableTable';
import { ConfidenceBadge } from '@/components/ConfidenceBadge';
import { CodeReference } from '@/components/CodeReference';

// ─── Types ──────────────────────────────────────────────────────────

interface ConfidenceValue {
  value: boolean | string;
  confidence: string;
  derived_from: string;
  reasoning?: string;
  warnings?: string[];
  guard_type?: string;
}

interface Evidence {
  file: string;
  line_start: number;
  line_end: number;
  snippet?: string;
}

interface ExternalCall {
  contract: string;
  function: string;
  evidence: Evidence;
  target: string;
  method: string;
  return_checked: ConfidenceValue;
  inside_reentrancy_guard: ConfidenceValue;
  call_type: string;
  trust_level: ConfidenceValue;
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

function BoolIndicator({ value }: { value: boolean | string }) {
  const isTrue =
    value === true || value === 'true' || value === 'yes';
  return (
    <span className={isTrue ? 'text-green-400' : 'text-red-400'}>
      {isTrue ? 'Yes' : 'No'}
    </span>
  );
}

function trustRowClass(trust: string): string {
  const t = trust.toLowerCase();
  if (t === 'external' || t === 'untrusted') return 'bg-red-950/30 hover:bg-red-900/30 transition-colors';
  if (t === 'semi-trusted' || t === 'semi_trusted') return 'bg-yellow-950/20 hover:bg-yellow-900/20 transition-colors';
  if (t === 'trusted') return 'bg-green-950/20 hover:bg-green-900/20 transition-colors';
  return 'bg-gray-900 hover:bg-gray-800/70 transition-colors';
}

// ─── Columns ────────────────────────────────────────────────────────

const columns: FilterableColumn<ExternalCall>[] = [
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
    accessorKey: 'function',
    cell: (row) => <span className="font-mono text-sm text-gray-300">{row.function}</span>,
  },
  {
    id: 'target',
    header: 'Target',
    accessorKey: 'target',
    cell: (row) => (
      <span className="max-w-[180px] truncate font-mono text-sm text-gray-300">{row.target}</span>
    ),
  },
  {
    id: 'method',
    header: 'Method',
    accessorKey: 'method',
    cell: (row) => <span className="font-mono text-sm text-gray-400">{row.method}</span>,
  },
  {
    id: 'return_checked',
    header: 'Return Checked',
    accessorKey: 'return_checked',
    cell: (row) => (
      <div className="flex items-center justify-center gap-1.5">
        <BoolIndicator value={row.return_checked.value} />
        <ConfidenceBadge
          level={row.return_checked.confidence}
          derivedFrom={row.return_checked.derived_from}
        />
      </div>
    ),
  },
  {
    id: 'reentrancy_guard',
    header: 'Reentrancy Guard',
    accessorKey: 'inside_reentrancy_guard',
    cell: (row) => (
      <div className="flex items-center justify-center gap-1.5">
        <BoolIndicator value={row.inside_reentrancy_guard.value} />
        <ConfidenceBadge
          level={row.inside_reentrancy_guard.confidence}
          derivedFrom={row.inside_reentrancy_guard.derived_from}
        />
      </div>
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
    id: 'trust_level',
    header: 'Trust Level',
    accessorKey: 'trust_level',
    enableColumnFilter: false,
    cell: (row) => (
      <div className="flex items-center gap-1.5">
        <TrustBadge trust={String(row.trust_level.value)} />
        <ConfidenceBadge
          level={row.trust_level.confidence}
          derivedFrom={row.trust_level.derived_from}
        />
      </div>
    ),
  },
  {
    id: 'location',
    header: 'Location',
    accessorKey: 'evidence',
    cell: (row) => (
      <CodeReference
        file={row.evidence.file}
        lineStart={row.evidence.line_start}
        lineEnd={row.evidence.line_end}
        snippet={row.evidence.snippet}
      />
    ),
  },
];

// ─── Component ──────────────────────────────────────────────────────

export function CallsClient({ calls }: { calls: ExternalCall[] }) {
  // Counts by trust level
  const trustCounts: Record<string, number> = {};
  for (const c of calls) {
    const t = String(c.trust_level.value);
    trustCounts[t] = (trustCounts[t] ?? 0) + 1;
  }

  const uncheckedReturns = calls.filter(
    (c) => c.return_checked.value === false || c.return_checked.value === 'false',
  ).length;

  const unguardedCalls = calls.filter(
    (c) =>
      c.inside_reentrancy_guard.value === false ||
      c.inside_reentrancy_guard.value === 'false',
  ).length;

  return (
    <div>
      <h2 className="mb-6 text-2xl font-bold text-gray-100">External Calls</h2>

      <p className="mb-4 text-sm text-gray-400">
        {calls.length} external call{calls.length !== 1 ? 's' : ''} found
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
        data={calls}
        defaultOpen={true}
        rowClassName={(row) => trustRowClass(String(row.trust_level.value))}
      />
    </div>
  );
}
