'use client';

import { useState, useMemo } from 'react';
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
        ...(col.sortingFn ? { sortingFn: col.sortingFn } : {}),
        cell: col.cell
          ? ({ row }) => col.cell!(row.original)
          : ({ getValue }) => <span className="text-gray-300">{String(getValue() ?? '')}</span>,
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
    <div className="mb-6 rounded-lg border border-gray-700 overflow-hidden">
      {/* Collapsible header */}
      {title && (
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex w-full items-center justify-between bg-gray-800 px-4 py-3 text-left hover:bg-gray-700/50 transition-colors"
        >
          <span className="text-sm font-semibold text-gray-200">
            {title} ({data.length})
          </span>
          <svg
            className={`h-4 w-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
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
          {/* Filter dropdowns */}
          {filterableCols.length > 0 && (
            <div className="flex flex-wrap gap-3 border-b border-gray-700 bg-gray-800/50 px-4 py-2">
              {filterableCols.map((col) => {
                const currentFilter = columnFilters.find((f) => f.id === col.id);
                return (
                  <select
                    key={col.id}
                    value={(currentFilter?.value as string) ?? ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      setColumnFilters((prev) => {
                        const without = prev.filter((f) => f.id !== col.id);
                        if (!val) return without;
                        return [...without, { id: col.id, value: val }];
                      });
                    }}
                    className="rounded border border-gray-600 bg-gray-700 px-2 py-1 text-xs text-gray-300 focus:border-blue-500 focus:outline-none"
                  >
                    <option value="">All {col.header}</option>
                    {(filterOptions[col.id] ?? []).map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                );
              })}
            </div>
          )}

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-gray-700 bg-gray-800 text-xs uppercase text-gray-400">
                <tr>
                  {table.getHeaderGroups().map((hg) =>
                    hg.headers.map((header) => (
                      <th
                        key={header.id}
                        className="px-4 py-3 cursor-pointer select-none hover:text-gray-200 transition-colors"
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
              <tbody className="divide-y divide-gray-700/50">
                {table.getRowModel().rows.map((row) => {
                  const rowData = row.original;
                  const rowKey = (rowData as Record<string, unknown>).id
                    ? String((rowData as Record<string, unknown>).id)
                    : row.id;
                  const isExpanded = expandedId === rowKey;
                  const isClickable = !!onRowClick || !!expandedRow;

                  return (
                    <>{/* Fragment for row + expansion */}
                      <tr
                        key={row.id}
                        className={`transition-colors ${
                          rowClassName ? rowClassName(rowData) : 'bg-gray-800/50 hover:bg-gray-700/50'
                        } ${isClickable ? 'cursor-pointer' : ''}`}
                        onClick={() => {
                          if (expandedRow) {
                            setExpandedId(isExpanded ? null : rowKey);
                          }
                          onRowClick?.(rowData);
                        }}
                      >
                        {row.getVisibleCells().map((cell) => (
                          <td key={cell.id} className="px-4 py-3">
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </td>
                        ))}
                      </tr>
                      {expandedRow && isExpanded && (
                        <tr key={`${row.id}-expanded`}>
                          <td colSpan={columns.length} className="bg-gray-900/70 px-6 py-4">
                            {expandedRow(rowData)}
                          </td>
                        </tr>
                      )}
                    </>
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
