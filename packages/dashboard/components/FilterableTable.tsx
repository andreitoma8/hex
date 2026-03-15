'use client';

import { useState, useMemo, Fragment } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type ColumnFiltersState,
} from '@tanstack/react-table';

// ─── Public column definition ────────────────────────────────────────

export interface FilterableColumn<T> {
  id: string;
  header: string;
  accessorKey: string;
  enableColumnFilter?: boolean;
  cell?: (row: T) => React.ReactNode;
  className?: string;
  /** Custom sorting function — maps to TanStack's column sortingFn */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sortingFn?: (rowA: any, rowB: any, columnId: string) => number;
  /** Controls filter dropdown order instead of alphabetical sort */
  filterOrder?: string[];
}

// ─── Props ───────────────────────────────────────────────────────────

interface FilterableTableProps<T> {
  columns: FilterableColumn<T>[];
  data: T[];
  title?: string;
  defaultOpen?: boolean;
  /** Optional row className callback for conditional row styling */
  rowClassName?: (row: T) => string;
  /** Optional row click handler for expandable rows */
  onRowClick?: (row: T) => void;
  /** Optional render function for expanded row content */
  expandedRow?: (row: T) => React.ReactNode;
}

// ─── Component ───────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function FilterableTable<T extends object>({
  columns,
  data,
  title,
  defaultOpen = true,
  rowClassName,
  onRowClick,
  expandedRow,
}: FilterableTableProps<T>) {
  const [open, setOpen] = useState(defaultOpen);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const tanstackColumns = useMemo<ColumnDef<T>[]>(
    () =>
      columns.map((col) => ({
        id: col.id,
        accessorKey: col.accessorKey,
        header: col.header,
        enableColumnFilter: col.enableColumnFilter ?? false,
        filterFn: col.enableColumnFilter ? 'equalsString' : undefined,
        ...(col.sortingFn ? { sortingFn: col.sortingFn } : {}),
        cell: col.cell
          ? ({ row }) => col.cell!(row.original)
          : ({ getValue }) => <span className="text-text-primary">{String(getValue() ?? '')}</span>,
      })),
    [columns],
  );

  const table = useReactTable({
    data,
    columns: tanstackColumns,
    state: { sorting, columnFilters },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  // Collect unique values for filterable columns
  const filterOptions = useMemo(() => {
    const opts: Record<string, string[]> = {};
    for (const col of columns) {
      if (!col.enableColumnFilter) continue;
      const values = new Set<string>();
      for (const row of data) {
        const val = (row as Record<string, unknown>)[col.accessorKey];
        if (val != null) values.add(String(val));
      }
      const arr = [...values];
      if (col.filterOrder) {
        const order = col.filterOrder;
        arr.sort((a, b) => {
          const ai = order.indexOf(a);
          const bi = order.indexOf(b);
          return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
        });
      } else {
        arr.sort();
      }
      opts[col.id] = arr;
    }
    return opts;
  }, [columns, data]);

  const filterableCols = columns.filter((c) => c.enableColumnFilter);

  return (
    <div className="overflow-hidden rounded-md border border-border-default">
      {/* Collapsible header */}
      {title && (
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex w-full items-center justify-between bg-surface-2 px-sp-4 py-sp-3 text-left hover:bg-surface-3"
        >
          <span className="text-heading font-medium text-text-primary">
            {title} ({data.length})
          </span>
          <svg
            className={`h-4 w-4 text-text-tertiary ${open ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="m19 9-7 7-7-7" />
          </svg>
        </button>
      )}

      {open && (
        <>
          {/* Filter pills */}
          {filterableCols.length > 0 && (
            <div className="flex flex-wrap gap-2 border-b border-border-subtle bg-surface-1 px-sp-4 py-sp-2">
              {filterableCols.map((col) => {
                const currentFilter = columnFilters.find((f) => f.id === col.id);
                return (
                  <div key={col.id} className="flex flex-wrap gap-1">
                    {/* "All" pill */}
                    <button
                      type="button"
                      onClick={() =>
                        setColumnFilters((prev) => prev.filter((f) => f.id !== col.id))
                      }
                      className={`rounded-sm px-2.5 py-1 text-caption font-medium ${
                        !currentFilter?.value
                          ? 'bg-accent text-white'
                          : 'bg-surface-3 text-text-secondary hover:text-text-primary'
                      }`}
                    >
                      All {col.header}
                    </button>
                    {(filterOptions[col.id] ?? []).map((opt) => {
                      const count = data.filter(
                        (r) => String((r as Record<string, unknown>)[col.accessorKey]) === opt,
                      ).length;
                      return (
                        <button
                          key={opt}
                          type="button"
                          onClick={() =>
                            setColumnFilters((prev) => {
                              const without = prev.filter((f) => f.id !== col.id);
                              if (currentFilter?.value === opt) return without;
                              return [...without, { id: col.id, value: opt }];
                            })
                          }
                          className={`rounded-sm px-2.5 py-1 text-caption font-medium ${
                            currentFilter?.value === opt
                              ? 'bg-accent text-white'
                              : 'bg-surface-3 text-text-secondary hover:text-text-primary'
                          }`}
                        >
                          {opt}
                          <span className="ml-1 opacity-60">{count}</span>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-body">
              <thead className="border-b border-border-default bg-surface-2 text-caption font-medium uppercase tracking-wider text-text-tertiary">
                <tr>
                  {table.getHeaderGroups().map((hg) =>
                    hg.headers.map((header) => (
                      <th
                        key={header.id}
                        className="cursor-pointer select-none px-sp-4 py-sp-2 hover:text-text-secondary"
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        <div className="flex items-center gap-1">
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {header.column.getIsSorted() === 'asc' && (
                            <svg className="h-3 w-3" viewBox="0 0 12 12" fill="currentColor"><path d="M6 2l4 5H2z" /></svg>
                          )}
                          {header.column.getIsSorted() === 'desc' && (
                            <svg className="h-3 w-3" viewBox="0 0 12 12" fill="currentColor"><path d="M6 10l4-5H2z" /></svg>
                          )}
                        </div>
                      </th>
                    )),
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {table.getRowModel().rows.map((row) => {
                  const rowData = row.original;
                  const rowKey = (rowData as Record<string, unknown>).id
                    ? String((rowData as Record<string, unknown>).id)
                    : row.id;
                  const isExpanded = expandedId === rowKey;
                  const isClickable = !!onRowClick || !!expandedRow;

                  return (
                    <Fragment key={row.id}>
                      <tr
                        className={`${
                          rowClassName
                            ? rowClassName(rowData)
                            : 'bg-surface-1 hover:bg-surface-3'
                        } ${isClickable ? 'cursor-pointer' : ''}`}
                        onClick={() => {
                          if (expandedRow) {
                            setExpandedId(isExpanded ? null : rowKey);
                          }
                          onRowClick?.(rowData);
                        }}
                      >
                        {row.getVisibleCells().map((cell) => (
                          <td key={cell.id} className="h-9 px-sp-4 py-sp-2">
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </td>
                        ))}
                      </tr>
                      {expandedRow && isExpanded && (
                        <tr>
                          <td colSpan={columns.length} className="bg-surface-0 px-sp-5 py-sp-4">
                            {expandedRow(rowData)}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
