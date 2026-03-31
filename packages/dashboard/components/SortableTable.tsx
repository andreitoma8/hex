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
                  className="px-sp-4 py-sp-2 font-medium"
                  style={{ width: header.getSize() !== 150 ? header.getSize() : undefined }}
                >
                  {header.isPlaceholder ? null : (
                    <button
                      type="button"
                      className={`inline-flex items-center gap-1 ${
                        header.column.getCanSort()
                          ? 'cursor-pointer select-none hover:text-text-secondary'
                          : ''
                      }`}
                      onClick={header.column.getToggleSortingHandler()}
                      disabled={!header.column.getCanSort()}
                    >
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {{
                        asc: <SortAscIcon />,
                        desc: <SortDescIcon />,
                      }[header.column.getIsSorted() as string] ?? (
                        header.column.getCanSort() ? <SortNeutralIcon /> : null
                      )}
                    </button>
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
                className="hex-glow h-9 bg-surface-1 hover:bg-surface-3"
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-sp-4 py-sp-2 text-text-secondary">
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
    <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 4l4 6H4l4-6z" />
    </svg>
  );
}

function SortDescIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 12L4 6h8l-4 6z" />
    </svg>
  );
}

function SortNeutralIcon() {
  return (
    <svg className="h-3.5 w-3.5 text-text-tertiary" viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 3l3 4H5l3-4zm0 10L5 9h6l-3 4z" />
    </svg>
  );
}
