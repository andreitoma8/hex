'use client';

import { useState } from 'react';
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';

interface SortableTableProps<T> {
  columns: ColumnDef<T, any>[];
  data: T[];
}

export function SortableTable<T>({ columns, data }: SortableTableProps<T>) {
  const [sorting, setSorting] = useState<SortingState>([]);

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="overflow-x-auto border border-border-default" style={{ borderRadius: 'var(--radius-sm)' }}>
      <table className="w-full text-left text-body">
        <thead className="border-b border-border-default bg-surface-2 text-caption font-medium uppercase tracking-wider text-text-tertiary">
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <th
                  key={header.id}
                  scope="col"
                  aria-sort={
                    header.column.getIsSorted() === 'asc' ? 'ascending'
                    : header.column.getIsSorted() === 'desc' ? 'descending'
                    : undefined
                  }
                  className="px-sp-4 py-sp-2 font-medium"
                  style={{ width: header.getSize() !== 150 ? header.getSize() : undefined }}
                >
                  {header.isPlaceholder ? null : header.column.getCanSort() ? (
                    <button
                      type="button"
                      className="inline-flex cursor-pointer select-none items-center gap-1 hover:text-text-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent rounded-sm"
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {{
                        asc: <SortAscIcon />,
                        desc: <SortDescIcon />,
                      }[header.column.getIsSorted() as string] ?? <SortNeutralIcon />}
                    </button>
                  ) : (
                    <span className="inline-flex items-center gap-1">
                      {flexRender(header.column.columnDef.header, header.getContext())}
                    </span>
                  )}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody className="divide-y divide-border-subtle">
          {table.getRowModel().rows.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="px-sp-4 py-sp-6 text-center text-text-tertiary"
              >
                No data
              </td>
            </tr>
          ) : (
            table.getRowModel().rows.map((row) => (
              <tr
                key={row.id}
                className="min-h-9 bg-surface-1 hover:bg-surface-3"
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-sp-4 py-sp-2 text-text-secondary align-top">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function SortAscIcon() {
  return (
    <svg className="h-3.5 w-3.5" aria-hidden="true" viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 4l4 6H4l4-6z" />
    </svg>
  );
}

function SortDescIcon() {
  return (
    <svg className="h-3.5 w-3.5" aria-hidden="true" viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 12L4 6h8l-4 6z" />
    </svg>
  );
}

function SortNeutralIcon() {
  return (
    <svg className="h-3.5 w-3.5 text-text-tertiary" aria-hidden="true" viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 3l3 4H5l3-4zm0 10L5 9h6l-3 4z" />
    </svg>
  );
}
