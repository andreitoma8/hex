'use client';

import { useState, useCallback, useMemo } from 'react';
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
  unverified: 'bg-[var(--accent)]/15 text-[var(--accent)]',
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

function VerifyRejectButtons({ findingId, currentStatus, onUpdate }: {
  findingId: string;
  currentStatus: string;
  onUpdate: (id: string, newStatus: string) => void;
}) {
  const [loading, setLoading] = useState(false);

  const handleAction = async (action: 'verify' | 'reject') => {
    setLoading(true);
    try {
      const res = await fetch('/api/findings/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ finding_id: findingId, action }),
      });
      if (res.ok) {
        onUpdate(findingId, action === 'verify' ? 'verified' : 'rejected');
      }
    } finally {
      setLoading(false);
    }
  };

  if (currentStatus !== 'unverified' && currentStatus !== 'pending_validation') {
    return null;
  }

  return (
    <div className="flex gap-2">
      <button
        type="button"
        disabled={loading}
        onClick={() => handleAction('verify')}
        className="rounded-md border border-[var(--success)] bg-[var(--success)]/10 px-3 py-1 text-caption font-medium text-[var(--success)] hover:bg-[var(--success)]/20 disabled:opacity-50"
      >
        Verify
      </button>
      <button
        type="button"
        disabled={loading}
        onClick={() => handleAction('reject')}
        className="rounded-md border border-[var(--critical)] bg-[var(--critical)]/10 px-3 py-1 text-caption font-medium text-[var(--critical)] hover:bg-[var(--critical)]/20 disabled:opacity-50"
      >
        Reject
      </button>
    </div>
  );
}

function FindingDetail({ item, onStatusUpdate }: { item: MergedFinding; onStatusUpdate: (id: string, newStatus: string) => void }) {
  const finding = item.finding;
  if (!finding) {
    return (
      <div className="text-body text-text-secondary">
        <p>No detailed finding data available.</p>
        {item.duplicates.length > 0 && (
          <p className="mt-2">Duplicates: {item.duplicates.join(', ')}</p>
        )}
        <VerifyRejectButtons
          findingId={item.id}
          currentStatus={item.status}
          onUpdate={onStatusUpdate}
        />
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

      <VerifyRejectButtons
        findingId={item.id}
        currentStatus={item.status}
        onUpdate={onStatusUpdate}
      />
    </div>
  );
}

export function AllFindingsClient({ findings, hiddenCount }: { findings: MergedFinding[]; hiddenCount: number }) {
  const [showDuplicates, setShowDuplicates] = useState(false);
  const [statuses, setStatuses] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    for (const f of findings) {
      map[f.id] = f.status;
    }
    return map;
  });

  const handleStatusUpdate = useCallback((id: string, newStatus: string) => {
    setStatuses((prev) => ({ ...prev, [id]: newStatus }));
  }, []);

  // Apply live status overrides and filter duplicates
  const liveFindings = useMemo(() => {
    const withStatus = findings.map((f) => ({
      ...f,
      status: statuses[f.id] ?? f.status,
    }));

    if (showDuplicates) return withStatus;

    return withStatus.filter((f) => {
      const status = f.status;
      // Hide rejected and duplicate entries
      if (status === 'duplicate' || status === 'rejected') return false;
      // Hide sub-entries (tracking entries that map to a different canonical finding)
      if (f.finding_id != null && f.id !== f.finding_id) return false;
      return true;
    });
  }, [findings, statuses, showDuplicates]);

  return (
    <div>
      {hiddenCount > 0 && (
        <div className="mb-sp-3 flex items-center">
          <button
            type="button"
            onClick={() => setShowDuplicates(!showDuplicates)}
            className={`rounded-md border px-3 py-1.5 text-caption font-medium transition-colors ${
              showDuplicates
                ? 'border-accent bg-accent-subtle text-accent'
                : 'border-border-default bg-surface-2 text-text-secondary hover:bg-surface-3'
            }`}
          >
            {showDuplicates ? 'Hide' : 'Show'} duplicates ({hiddenCount})
          </button>
        </div>
      )}
      <FilterableTable
        columns={columns}
        data={liveFindings}
        defaultOpen={true}
        expandedRow={(item) => <FindingDetail item={item} onStatusUpdate={handleStatusUpdate} />}
      />
    </div>
  );
}
