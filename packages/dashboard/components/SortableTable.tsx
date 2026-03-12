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
    <div className="overflow-x-auto rounded-lg border border-gray-700">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-gray-700 bg-gray-800 text-xs uppercase text-gray-400">
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <th
                  key={header.id}
                  className="px-4 py-3 font-medium"
                  style={{ width: header.getSize() !== 150 ? header.getSize() : undefined }}
                >
                  {header.isPlaceholder ? null : (
                    <button
                      type="button"
                      className={`inline-flex items-center gap-1 ${
                        header.column.getCanSort()
                          ? 'cursor-pointer select-none hover:text-gray-200'
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
        <tbody className="divide-y divide-gray-700/50">
          {table.getRowModel().rows.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="px-4 py-8 text-center text-gray-500"
              >
                No data
              </td>
            </tr>
          ) : (
            table.getRowModel().rows.map((row) => (
              <tr
                key={row.id}
                className="bg-gray-900 transition-colors hover:bg-gray-800/70"
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-4 py-3 text-gray-300">
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
    <svg className="h-3.5 w-3.5 text-gray-600" viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 3l3 4H5l3-4zm0 10L5 9h6l-3 4z" />
    </svg>
  );
}
