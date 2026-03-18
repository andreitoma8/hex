'use client';

import { useState, useCallback, useMemo } from 'react';
import { FilterableTable, type FilterableColumn } from '@/components/FilterableTable';
import { SeverityBadge } from '@/components/SeverityBadge';

type Severity = 'Critical' | 'High' | 'Medium' | 'Low' | 'Info';

const SEVERITY_ORDER: Record<string, number> = { Critical: 0, High: 1, Medium: 2, Low: 3, Info: 4 };

export interface AiFlatFinding {
  id: string;
  tool: string;
  title: string;
  severity: string;
  description: string;
  affected_code: { file: string; snippet?: string }[];
  confidence?: string;
  category?: string;
  raw_category?: string;
  ai_consensus?: number;
  tracking_status: string;
  is_novel: boolean;
  is_duplicate: boolean;
}

export interface SourceRow {
  source: string;
  total: number;
  unique: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
}

export interface ToolMeta {
  name: string;
  ran_at: string;
  duration_seconds?: number;
  total_findings: number;
  run_status: string;
  started_at?: string;
}

const STATUS_STYLES: Record<string, string> = {
  verified: 'bg-[var(--success)]/15 text-[var(--success)]',
  pending_validation: 'bg-[var(--medium)]/15 text-[var(--medium)]',
  rejected: 'bg-[var(--critical)]/15 text-[var(--critical)]',
  duplicate: 'bg-[var(--neutral)]/15 text-[var(--neutral)]',
  unverified: 'bg-[var(--accent)]/15 text-[var(--accent)]',
};

function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.unverified;
  return (
    <span className={`inline-flex items-center rounded-sm px-2 py-0.5 text-caption font-medium ${style}`}>
      {status}
    </span>
  );
}

function NovelBadge() {
  return (
    <span className="inline-flex items-center rounded-sm bg-[var(--medium)]/15 px-2 py-0.5 text-caption font-medium text-[var(--medium)]">
      NOVEL
    </span>
  );
}

const SEV_COLOR: Record<string, string> = {
  critical: 'text-[var(--critical)]',
  high: 'text-[var(--high)]',
  medium: 'text-[var(--medium)]',
  low: 'text-[var(--low)]',
  info: 'text-[var(--info)]',
};

function ComparisonTable({ rows, toolMetas }: { rows: SourceRow[]; toolMetas: ToolMeta[] }) {
  const sevKeys = ['critical', 'high', 'medium', 'low', 'info'] as const;

  return (
    <div className="mb-sp-5 space-y-sp-4">
      <div className="overflow-x-auto rounded-md border border-border-default">
        <table className="w-full text-body">
          <thead>
            <tr className="border-b border-border-default bg-surface-2">
              <th className="px-sp-4 py-sp-3 text-left text-caption font-medium text-text-secondary">Source</th>
              <th className="px-sp-4 py-sp-3 text-right text-caption font-medium text-text-secondary">Findings</th>
              <th className="px-sp-4 py-sp-3 text-right text-caption font-medium text-text-secondary">Unique</th>
              {sevKeys.map((s) => (
                <th key={s} className={`px-sp-4 py-sp-3 text-right text-caption font-medium ${SEV_COLOR[s]}`}>
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.source} className="border-b border-border-default last:border-b-0 hover:bg-surface-2/50">
                <td className="px-sp-4 py-sp-3 font-medium text-text-primary">{row.source}</td>
                <td className="px-sp-4 py-sp-3 text-right tabular-nums text-text-secondary">{row.total}</td>
                <td className="px-sp-4 py-sp-3 text-right tabular-nums text-text-secondary">
                  {row.unique} / {row.total}
                </td>
                {sevKeys.map((s) => (
                  <td key={s} className={`px-sp-4 py-sp-3 text-right tabular-nums ${row[s] > 0 ? SEV_COLOR[s] : 'text-text-tertiary'}`}>
                    {row[s]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Tool metadata chips */}
      <div className="flex flex-wrap gap-sp-3">
        {toolMetas.map((tm) => (
          <div key={tm.name} className="flex items-center gap-2 rounded-md border border-border-default bg-surface-2 px-sp-4 py-sp-2 text-caption">
            <span className="font-medium text-text-primary">{tm.name}</span>
            {tm.run_status === 'running' ? (
              <span className="inline-flex items-center gap-1.5 text-[var(--medium)]">
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-[var(--medium)]" />
                Running
              </span>
            ) : (
              <>
                {tm.duration_seconds != null && (
                  <span className="text-text-secondary">
                    {tm.duration_seconds < 60
                      ? `${tm.duration_seconds}s`
                      : `${Math.round(tm.duration_seconds / 60)}m`}
                  </span>
                )}
                {tm.ran_at && (
                  <span className="text-text-tertiary">
                    {new Date(tm.ran_at).toLocaleString()}
                  </span>
                )}
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

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

  // No buttons for duplicate findings or already verified/rejected
  if (currentStatus === 'duplicate' || currentStatus === 'verified' || currentStatus === 'rejected') {
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

function FindingDetail({ item, onStatusUpdate }: { item: AiFlatFinding; onStatusUpdate: (id: string, newStatus: string) => void }) {
  return (
    <div className="space-y-sp-3 text-body">
      <div>
        <h4 className="mb-1 text-caption font-medium uppercase text-text-tertiary">Description</h4>
        <p className="whitespace-pre-wrap text-text-secondary">{item.description}</p>
      </div>

      {item.affected_code.length > 0 && (
        <div>
          <h4 className="mb-1 text-caption font-medium uppercase text-text-tertiary">Affected Code</h4>
          {item.affected_code.map((ac, i) => (
            <div key={i} className="mb-2">
              <span className="font-mono text-caption text-text-tertiary">{ac.file}</span>
              {ac.snippet && (
                <pre className="mt-1 overflow-x-auto rounded-md bg-surface-0 p-sp-3 text-caption text-text-secondary">
                  {ac.snippet}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-sp-4">
        {item.category && (
          <div>
            <span className="text-caption text-text-tertiary">Category: </span>
            <span className="text-caption text-text-secondary">{item.category}</span>
          </div>
        )}
        {item.confidence && (
          <div>
            <span className="text-caption text-text-tertiary">Confidence: </span>
            <span className="text-caption text-text-secondary">{item.confidence}</span>
          </div>
        )}
        {item.raw_category && (
          <div>
            <span className="text-caption text-text-tertiary">Raw Category: </span>
            <span className="text-caption text-text-secondary">{item.raw_category}</span>
          </div>
        )}
      </div>

      <VerifyRejectButtons
        findingId={item.id}
        currentStatus={item.tracking_status}
        onUpdate={onStatusUpdate}
      />
    </div>
  );
}

export function AiReportsClient({ findings, sourceRows, toolMetas }: {
  findings: AiFlatFinding[];
  sourceRows: SourceRow[];
  toolMetas: ToolMeta[];
}) {
  const [showDuplicates, setShowDuplicates] = useState(false);
  const [statuses, setStatuses] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    for (const f of findings) {
      map[f.id] = f.tracking_status;
    }
    return map;
  });

  const handleUpdate = useCallback((id: string, newStatus: string) => {
    setStatuses((prev) => ({ ...prev, [id]: newStatus }));
  }, []);

  const duplicateCount = findings.filter((f) => f.is_duplicate || f.tracking_status === 'duplicate' || f.tracking_status === 'rejected').length;

  const columns: FilterableColumn<AiFlatFinding>[] = useMemo(() => [
    {
      id: 'id',
      header: 'ID',
      accessorKey: 'id',
      cell: (row: AiFlatFinding) => (
        <span className="whitespace-nowrap font-mono text-caption text-text-secondary">{row.id}</span>
      ),
    },
    {
      id: 'title',
      header: 'Title',
      accessorKey: 'title',
      cell: (row: AiFlatFinding) => (
        <span className="flex items-center gap-2">
          <span className="font-medium text-text-primary">{row.title}</span>
          {row.is_novel && <NovelBadge />}
        </span>
      ),
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
      cell: (row: AiFlatFinding) => <SeverityBadge severity={(row.severity ?? 'Info') as Severity} />,
    },
    {
      id: 'tool',
      header: 'Tool',
      accessorKey: 'tool',
      enableColumnFilter: true,
      cell: (row: AiFlatFinding) => (
        <span className="font-mono text-caption text-text-secondary">{row.tool}</span>
      ),
    },
    {
      id: 'status',
      header: 'Status',
      accessorKey: 'tracking_status',
      enableColumnFilter: true,
      cell: (row: AiFlatFinding) => <StatusBadge status={statuses[row.id] ?? row.tracking_status} />,
    },
    {
      id: 'confidence',
      header: 'Confidence',
      accessorKey: 'confidence',
      cell: (row: AiFlatFinding) => (
        <span className="text-caption text-text-secondary">{row.confidence ?? '-'}</span>
      ),
    },
  ], [statuses]);

  // Filter and sort findings
  const visibleFindings = useMemo(() => {
    let filtered = findings.map((f) => ({
      ...f,
      tracking_status: statuses[f.id] ?? f.tracking_status,
    }));

    if (!showDuplicates) {
      filtered = filtered.filter((f) => {
        const status = f.tracking_status;
        if (status === 'duplicate' || status === 'rejected') return false;
        if (f.is_duplicate) return false;
        return true;
      });
    }

    // Sort: novel first, then by severity
    filtered.sort((a, b) => {
      if (a.is_novel && !b.is_novel) return -1;
      if (!a.is_novel && b.is_novel) return 1;
      return (SEVERITY_ORDER[a.severity] ?? 5) - (SEVERITY_ORDER[b.severity] ?? 5);
    });

    return filtered;
  }, [findings, statuses, showDuplicates]);

  return (
    <div>
      <ComparisonTable rows={sourceRows} toolMetas={toolMetas} />

      {duplicateCount > 0 && (
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
            {showDuplicates ? 'Hide' : 'Show'} duplicates ({duplicateCount})
          </button>
        </div>
      )}

      <FilterableTable
        columns={columns}
        data={visibleFindings}
        defaultOpen={true}
        expandedRow={(item) => <FindingDetail item={item} onStatusUpdate={handleUpdate} />}
      />
    </div>
  );
}
