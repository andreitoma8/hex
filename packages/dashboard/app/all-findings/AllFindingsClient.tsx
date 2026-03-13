'use client';

import { FilterableTable, type FilterableColumn } from '@/components/FilterableTable';
import { SeverityBadge } from '@/components/SeverityBadge';
import { CodeReference } from '@/components/CodeReference';
import type { MergedFinding } from './page';

type Severity = 'Critical' | 'High' | 'Medium' | 'Low' | 'Info';

const SEVERITY_ORDER: Record<string, number> = { Critical: 0, High: 1, Medium: 2, Low: 3, Info: 4 };

const STATUS_STYLES: Record<string, string> = {
  verified: 'bg-green-600/20 text-green-400 border-green-500/30',
  pending_validation: 'bg-yellow-600/20 text-yellow-400 border-yellow-500/30',
  rejected: 'bg-red-600/20 text-red-400 border-red-500/30',
  duplicate: 'bg-gray-600/20 text-gray-400 border-gray-500/30',
};

const POC_STYLES: Record<string, string> = {
  passing: 'text-green-400',
  failing: 'text-red-400',
  not_started: 'text-gray-500',
};

function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.duplicate;
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${style}`}>
      {status}
    </span>
  );
}

const columns: FilterableColumn<MergedFinding>[] = [
  {
    id: 'id',
    header: 'ID',
    accessorKey: 'id',
    cell: (row) => (
      <span className="whitespace-nowrap font-mono text-xs text-gray-300">{row.id}</span>
    ),
  },
  {
    id: 'title',
    header: 'Title',
    accessorKey: 'title',
    cell: (row) => <span className="font-medium text-gray-200">{row.title}</span>,
  },
  {
    id: 'severity',
    header: 'Severity',
    accessorKey: 'severity',
    enableColumnFilter: true,
    filterOrder: ['Critical', 'High', 'Medium', 'Low', 'Info'],
    sortingFn: (rowA: { getValue: (id: string) => unknown }, rowB: { getValue: (id: string) => unknown }, columnId: string) => {
      const a = SEVERITY_ORDER[String(rowA.getValue(columnId))] ?? 5;
      const b = SEVERITY_ORDER[String(rowB.getValue(columnId))] ?? 5;
      return a - b;
    },
    cell: (row) => <SeverityBadge severity={(row.severity ?? 'Info') as Severity} />,
  },
  {
    id: 'source',
    header: 'Source',
    accessorKey: 'source',
    enableColumnFilter: true,
    cell: (row) => (
      <span className="font-mono text-xs text-gray-400">{row.source}</span>
    ),
  },
  {
    id: 'status',
    header: 'Status',
    accessorKey: 'status',
    enableColumnFilter: true,
    cell: (row) => <StatusBadge status={row.status} />,
  },
  {
    id: 'poc_status',
    header: 'PoC',
    accessorKey: 'poc_status',
    cell: (row) => (
      <span className={POC_STYLES[row.poc_status] ?? 'text-gray-500'}>
        {row.poc_status}
      </span>
    ),
  },
];

function FindingDetail({ item }: { item: MergedFinding }) {
  const finding = item.finding;
  if (!finding) {
    return (
      <div className="text-sm text-gray-400">
        <p>No detailed finding data available.</p>
        {item.duplicates.length > 0 && (
          <p className="mt-2">Duplicates: {item.duplicates.join(', ')}</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4 text-sm">
      {finding.description && (
        <div>
          <h4 className="mb-1 text-xs font-semibold uppercase text-gray-400">Description</h4>
          <p className="text-gray-300">{finding.description}</p>
        </div>
      )}

      {finding.impact_detail && (
        <div>
          <h4 className="mb-1 text-xs font-semibold uppercase text-gray-400">Impact</h4>
          <p className="text-gray-300">{finding.impact_detail}</p>
        </div>
      )}

      {(finding.likelihood || finding.impact) && (
        <div className="flex gap-4">
          {finding.likelihood && (
            <span className="text-xs text-gray-400">
              Likelihood: <span className="text-gray-200">{finding.likelihood}</span>
            </span>
          )}
          {finding.impact && (
            <span className="text-xs text-gray-400">
              Impact: <span className="text-gray-200">{finding.impact}</span>
            </span>
          )}
        </div>
      )}

      {finding.root_cause && (
        <div>
          <h4 className="mb-1 text-xs font-semibold uppercase text-gray-400">Root Cause</h4>
          <p className="mb-2 text-gray-300">{finding.root_cause.summary}</p>
          {finding.root_cause.locations.map((loc, i) => (
            <div key={i} className="mb-2">
              <CodeReference
                file={loc.file}
                lineStart={loc.line_start}
                lineEnd={loc.line_end}
                snippet={loc.snippet}
              />
              {loc.snippet && (
                <pre className="mt-1 overflow-x-auto rounded bg-gray-950 p-3 text-xs text-gray-400">
                  {loc.snippet}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}

      {finding.recommendation && (
        <div>
          <h4 className="mb-1 text-xs font-semibold uppercase text-gray-400">Recommendation</h4>
          <p className="text-gray-300">{finding.recommendation}</p>
        </div>
      )}

      {finding.poc && finding.poc.file && (
        <div>
          <h4 className="mb-1 text-xs font-semibold uppercase text-gray-400">Proof of Concept</h4>
          <p className="text-gray-400 text-xs">
            <code className="rounded bg-gray-800 px-1.5 py-0.5">{finding.poc.file}</code>
            <span className="ml-2">({finding.poc.status})</span>
          </p>
        </div>
      )}

      {item.duplicates.length > 0 && (
        <div>
          <h4 className="mb-1 text-xs font-semibold uppercase text-gray-400">Duplicates</h4>
          <p className="text-xs text-gray-400">{item.duplicates.join(', ')}</p>
        </div>
      )}
    </div>
  );
}

export function AllFindingsClient({ findings }: { findings: MergedFinding[] }) {
  return (
    <FilterableTable
      columns={columns}
      data={findings}
      defaultOpen={true}
      expandedRow={(item) => <FindingDetail item={item} />}
    />
  );
}
