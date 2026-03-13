'use client';

import { useState } from 'react';
import { FilterableTable, type FilterableColumn } from '@/components/FilterableTable';

interface Annotation {
  id: string;
  type: string;
  status: string;
  file: string;
  line: number;
  text: string;
}

const TYPE_STYLES: Record<string, string> = {
  issue: 'bg-red-600/20 text-red-400 border-red-500/30',
  'issue-verified': 'bg-green-600/20 text-green-400 border-green-500/30',
  question: 'bg-blue-600/20 text-blue-400 border-blue-500/30',
  note: 'bg-gray-600/20 text-gray-400 border-gray-500/30',
};

function TypeBadge({ type }: { type: string }) {
  const style = TYPE_STYLES[type] ?? TYPE_STYLES.note;
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${style}`}
    >
      {type}
    </span>
  );
}

function AnnotationGuide() {
  const [open, setOpen] = useState(false);

  return (
    <div className="mb-6 rounded-lg border border-gray-700 bg-gray-800/50">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-gray-700/50"
      >
        <span className="text-sm font-medium text-gray-300">Annotation Types Guide</span>
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
      {open && (
        <div className="border-t border-gray-700 px-4 py-4 space-y-3 text-sm">
          <div className="flex items-start gap-3">
            <TypeBadge type="issue" />
            <div>
              <span className="text-gray-200 font-medium">@audit-issue</span>
              <span className="text-gray-400"> — Potential issue to investigate</span>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <TypeBadge type="issue-verified" />
            <div>
              <span className="text-gray-200 font-medium">@audit-issue-verified</span>
              <span className="text-gray-400"> — Issue confirmed, finding written (include finding ID after tag)</span>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <TypeBadge type="question" />
            <div>
              <span className="text-gray-200 font-medium">@audit-question</span>
              <span className="text-gray-400"> — Question for the client/team</span>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <TypeBadge type="note" />
            <div>
              <span className="text-gray-200 font-medium">@audit-note</span>
              <span className="text-gray-400"> — General observation or context</span>
            </div>
          </div>
          <div className="mt-2 rounded bg-gray-900 px-3 py-2 font-mono text-xs text-gray-400">
            // @audit-issue Possible reentrancy in withdraw
          </div>
        </div>
      )}
    </div>
  );
}

const columns: FilterableColumn<Annotation>[] = [
  {
    id: 'id',
    header: 'ID',
    accessorKey: 'id',
    cell: (row) => (
      <span className="whitespace-nowrap font-mono text-xs text-gray-300">{row.id}</span>
    ),
  },
  {
    id: 'type',
    header: 'Type',
    accessorKey: 'type',
    enableColumnFilter: true,
    cell: (row) => <TypeBadge type={row.type} />,
  },
  {
    id: 'status',
    header: 'Status',
    accessorKey: 'status',
    enableColumnFilter: true,
    cell: (row) => <span className="text-gray-300">{row.status}</span>,
  },
  {
    id: 'file',
    header: 'File',
    accessorKey: 'file',
    enableColumnFilter: true,
    cell: (row) => (
      <span className="max-w-xs truncate font-mono text-xs text-gray-400">{row.file}</span>
    ),
  },
  {
    id: 'line',
    header: 'Line',
    accessorKey: 'line',
    cell: (row) => (
      <span className="font-mono text-xs text-gray-400">{row.line}</span>
    ),
  },
  {
    id: 'text',
    header: 'Text',
    accessorKey: 'text',
    cell: (row) => <span className="max-w-md text-gray-300">{row.text}</span>,
  },
];

export function AnnotationsClient({ annotations }: { annotations: Annotation[] }) {
  return (
    <div>
      <h2 className="mb-6 text-2xl font-bold text-gray-100">Annotations</h2>

      <AnnotationGuide />

      <p className="mb-4 text-sm text-gray-400">
        {annotations.length} annotation{annotations.length !== 1 ? 's' : ''} found
      </p>

      <FilterableTable
        columns={columns}
        data={annotations}
        title="Annotations"
        defaultOpen={true}
      />
    </div>
  );
}
