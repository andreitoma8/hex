'use client';

import { FilterableTable, type FilterableColumn } from '@/components/FilterableTable';
import { SeverityBadge } from '@/components/SeverityBadge';
import type { MergedFinding } from './page';

type Severity = 'Critical' | 'High' | 'Medium' | 'Low' | 'Info';

const SEVERITY_ORDER: Record<string, number> = { Critical: 0, High: 1, Medium: 2, Low: 3, Info: 4 };

const STATUS_STYLES: Record<string, string> = {
  verified: 'bg-[var(--success)]/15 text-[var(--success)]',
  pending_validation: 'bg-[var(--medium)]/15 text-[var(--medium)]',
  rejected: 'bg-[var(--critical)]/15 text-[var(--critical)]',
  duplicate: 'bg-[var(--neutral)]/15 text-[var(--neutral)]',
};

const POC_STYLES: Record<string, string> = {
  passing: 'text-[var(--success)]',
  failing: 'text-[var(--critical)]',
  not_started: 'text-text-tertiary',
};

function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.duplicate;
  return (
    <span className={`inline-flex items-center rounded-sm px-2 py-0.5 text-caption font-medium ${style}`}>
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
      <span className="whitespace-nowrap font-mono text-caption text-text-secondary">{row.id}</span>
    ),
  },
  {
    id: 'title',
    header: 'Title',
    accessorKey: 'title',
    cell: (row) => <span className="font-medium text-text-primary">{row.title}</span>,
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
      <span className="font-mono text-caption text-text-secondary">{row.source}</span>
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
      <span className={POC_STYLES[row.poc_status] ?? 'text-text-tertiary'}>
        {row.poc_status}
      </span>
    ),
  },
];

function FindingDetail({ item }: { item: MergedFinding }) {
  const finding = item.finding;
  if (!finding) {
    return (
      <div className="text-body text-text-secondary">
        <p>No detailed finding data available.</p>
        {item.duplicates.length > 0 && (
          <p className="mt-2">Duplicates: {item.duplicates.join(', ')}</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-sp-4 text-body">
      {finding.description && (
        <div>
          <h4 className="mb-1 text-caption font-medium uppercase text-text-tertiary">Description</h4>
          <p className="text-text-secondary">{finding.description}</p>
        </div>
      )}

      {finding.root_cause?.locations && finding.root_cause.locations.length > 0 && (
        <div>
          <h4 className="mb-1 text-caption font-medium uppercase text-text-tertiary">Code Locations</h4>
          {finding.root_cause.locations.map((loc, i) => (
            <div key={i} className="mb-2">
              <span className="font-mono text-caption text-text-tertiary">{loc.file}</span>
              {loc.snippet && (
                <pre className="mt-1 overflow-x-auto rounded-md bg-surface-0 p-sp-3 text-caption text-text-secondary">
                  {loc.snippet}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}

      {finding.recommendation && (
        <div>
          <h4 className="mb-1 text-caption font-medium uppercase text-text-tertiary">Recommendation</h4>
          <p className="text-text-secondary">{finding.recommendation}</p>
        </div>
      )}

      {finding.poc && finding.poc.file && (
        <div>
          <h4 className="mb-1 text-caption font-medium uppercase text-text-tertiary">Proof of Concept</h4>
          <p className="text-caption text-text-secondary">
            <code className="rounded-sm bg-surface-3 px-1.5 py-0.5">{finding.poc.file}</code>
            <span className="ml-2">({finding.poc.status})</span>
          </p>
        </div>
      )}

      {item.duplicates.length > 0 && (
        <div>
          <h4 className="mb-1 text-caption font-medium uppercase text-text-tertiary">Duplicates</h4>
          <p className="text-caption text-text-secondary">{item.duplicates.join(', ')}</p>
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
