'use client';

import { FilterableTable, type FilterableColumn } from '@/components/FilterableTable';
import { CodeReference } from '@/components/CodeReference';

// ─── Types ──────────────────────────────────────────────────────────

interface Evidence {
  file: string;
  line_start: number;
  line_end: number;
  snippet?: string;
}

interface FunctionRow {
  contract: string;
  name: string;
  visibility: string;
  state_mutability: string;
  state: 'writable' | 'read-only';
  payable: 'payable' | 'non-payable';
  modifiers: string[];
  state_vars_read: string[];
  state_vars_written: string[];
  external_calls: string[];
  evidence: Evidence;
}

// ─── Helpers ────────────────────────────────────────────────────────

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

function TagList({ items, color = 'gray' }: { items: string[]; color?: string }) {
  if (items.length === 0) return <span className="text-gray-600">--</span>;
  const bgColor = color === 'yellow' ? 'bg-yellow-900/30 text-yellow-300' :
                  color === 'red' ? 'bg-red-900/30 text-red-300' :
                  'bg-gray-700 text-gray-300';
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((item) => (
        <span
          key={item}
          className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-mono ${bgColor}`}
        >
          {item}
        </span>
      ))}
    </div>
  );
}

// ─── Columns ────────────────────────────────────────────────────────

const columns: FilterableColumn<FunctionRow>[] = [
  {
    id: 'contract',
    header: 'Contract',
    accessorKey: 'contract',
    enableColumnFilter: true,
    cell: (row) => <span className="font-medium text-gray-200">{row.contract}</span>,
  },
  {
    id: 'name',
    header: 'Function',
    accessorKey: 'name',
    cell: (row) => <span className="font-mono text-sm text-gray-300">{row.name}</span>,
  },
  {
    id: 'visibility',
    header: 'Visibility',
    accessorKey: 'visibility',
    enableColumnFilter: true,
    cell: (row) => <VisibilityBadge visibility={row.visibility} />,
  },
  {
    id: 'state',
    header: 'State',
    accessorKey: 'state',
    enableColumnFilter: true,
    cell: (row) => {
      const style = row.state === 'writable'
        ? 'bg-orange-600/20 text-orange-400 border-orange-500/30'
        : 'bg-blue-600/20 text-blue-400 border-blue-500/30';
      return (
        <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${style}`}>
          {row.state}
        </span>
      );
    },
  },
  {
    id: 'payable',
    header: 'Payable',
    accessorKey: 'payable',
    enableColumnFilter: true,
    cell: (row) => {
      const style = row.payable === 'payable'
        ? 'bg-green-600/20 text-green-400 border-green-500/30'
        : 'bg-gray-600/20 text-gray-400 border-gray-500/30';
      return (
        <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${style}`}>
          {row.payable}
        </span>
      );
    },
  },
  {
    id: 'modifiers',
    header: 'Modifiers',
    accessorKey: 'modifiers',
    cell: (row) => <TagList items={row.modifiers} />,
  },
  {
    id: 'external_calls',
    header: 'External Calls',
    accessorKey: 'external_calls',
    cell: (row) => <TagList items={row.external_calls} color="red" />,
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

export function FunctionsClient({ rows }: { rows: FunctionRow[] }) {
  return (
    <FilterableTable
      columns={columns}
      data={rows}
      defaultOpen={true}
    />
  );
}
