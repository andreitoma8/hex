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
  inherited_from?: string;
  inheritance_depth?: number;
}

// ─── Helpers ────────────────────────────────────────────────────────

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

function TagList({ items, color = 'default' }: { items: string[]; color?: string }) {
  if (items.length === 0) return <span className="text-text-tertiary">--</span>;
  const bgColor = color === 'yellow' ? 'bg-[var(--medium)]/10 text-[var(--medium)]' :
                  color === 'red' ? 'bg-[var(--critical)]/10 text-[var(--critical)]' :
                  'bg-surface-3 text-text-secondary';
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((item) => (
        <span
          key={item}
          className={`inline-flex items-center rounded-sm px-1.5 py-0.5 font-mono text-caption ${bgColor}`}
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
    cell: (row) => (
      <div>
        <span className="font-medium text-text-primary">{row.contract}</span>
        {row.inherited_from && (
          <span className="ml-1.5 text-caption text-text-tertiary">← {row.inherited_from}</span>
        )}
      </div>
    ),
  },
  {
    id: 'name',
    header: 'Function',
    accessorKey: 'name',
    cell: (row) => <span className="font-mono text-body text-text-secondary">{row.name}</span>,
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
        ? 'bg-[var(--high)]/15 text-[var(--high)]'
        : 'bg-[var(--low)]/15 text-[var(--low)]';
      return (
        <span className={`inline-flex items-center rounded-sm px-2 py-0.5 text-caption font-medium ${style}`}>
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
        ? 'bg-[var(--success)]/15 text-[var(--success)]'
        : 'bg-[var(--neutral)]/15 text-[var(--neutral)]';
      return (
        <span className={`inline-flex items-center rounded-sm px-2 py-0.5 text-caption font-medium ${style}`}>
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
