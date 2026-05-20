'use client';

import { useState, useMemo } from 'react';
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

function MatchSignalsBlock({ item }: { item: MergedFinding }) {
  if (!item.match_signals) return null;
  const s = item.match_signals;
  const Pair = ({ label, value }: { label: string; value: string }) => {
    const tint =
      value === 'same' || value === 'true'
        ? 'bg-[var(--success)]/15 text-[var(--success)]'
        : value === 'overlapping'
          ? 'bg-[var(--medium)]/15 text-[var(--medium)]'
          : 'bg-[var(--critical)]/15 text-[var(--critical)]';
    return (
      <span className="inline-flex items-center gap-1">
        <span className="text-caption text-text-tertiary">{label}:</span>
        <span className={`rounded-md px-2 py-0.5 text-caption font-medium ${tint}`}>{value}</span>
      </span>
    );
  };
  return (
    <div className="rounded-md border border-border-subtle bg-surface-2 p-sp-3">
      <h4 className="mb-2 text-caption font-medium uppercase text-text-tertiary">
        Duplicate match{' '}
        {item.match_confidence && (
          <span className="ml-1 normal-case text-text-secondary">({item.match_confidence} confidence)</span>
        )}
      </h4>
      <div className="flex flex-wrap gap-x-sp-4 gap-y-1">
        <Pair label="contract" value={String(s.contract)} />
        <Pair label="function" value={String(s.function)} />
        <Pair label="root cause" value={s.root_cause} />
        <Pair label="attack vector" value={s.attack_vector} />
      </div>
      {item.match_reasoning && (
        <p className="mt-2 text-caption text-text-secondary">{item.match_reasoning}</p>
      )}
    </div>
  );
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const seconds = Math.round((now - then) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h ago`;
  return `${Math.round(seconds / 86400)}d ago`;
}

function GithubBlock({ item }: { item: MergedFinding }) {
  const gh = item.github;
  if (!gh) return null;
  const issueLabel = `#${gh.issue_number}`;
  const stateTint =
    gh.state === 'open'
      ? 'bg-[var(--success)]/15 text-[var(--success)]'
      : 'bg-[var(--neutral)]/15 text-[var(--neutral)]';
  const comments = (gh.comments ?? []).slice(-5);
  return (
    <div className="rounded-md border border-border-subtle bg-surface-2 p-sp-3">
      <div className="mb-2 flex items-center gap-sp-2 text-caption">
        <span className="font-medium uppercase text-text-tertiary">GitHub</span>
        <span className={`rounded-md px-2 py-0.5 font-medium ${stateTint}`}>{gh.state}</span>
        {gh.issue_url ? (
          <a
            href={gh.issue_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent rounded-sm"
          >
            {issueLabel}
          </a>
        ) : (
          <span className="font-mono text-text-secondary">{issueLabel}</span>
        )}
        {gh.author && (
          <span className="text-text-tertiary">by @{gh.author}</span>
        )}
        {gh.last_synced_at && (
          <span className="ml-auto text-text-tertiary">synced {relativeTime(gh.last_synced_at)}</span>
        )}
      </div>
      {comments.length > 0 ? (
        <ul className="space-y-2">
          {comments.map((c, i) => (
            <li key={i} className="rounded-md bg-surface-1 px-sp-3 py-sp-2">
              <div className="mb-1 flex items-center gap-sp-2 text-caption">
                <span className="font-medium text-text-primary">@{c.author}</span>
                <span className="text-text-tertiary">{relativeTime(c.created_at)}</span>
              </div>
              <p className="whitespace-pre-wrap text-caption text-text-secondary">{c.body}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-caption text-text-tertiary">No comments on this issue yet.</p>
      )}
    </div>
  );
}

function FindingDetail({ item }: { item: MergedFinding }) {
  const finding = item.finding;
  if (!finding) {
    return (
      <div className="text-body text-text-secondary space-y-sp-3">
        <MatchSignalsBlock item={item} />
        <GithubBlock item={item} />
        {!item.match_signals && !item.github && <p>No detailed finding data available.</p>}
        {item.duplicates.length > 0 && (
          <p className="mt-2">Duplicates: {item.duplicates.join(', ')}</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-sp-4 text-body">
      <MatchSignalsBlock item={item} />
      <GithubBlock item={item} />
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

export function AllFindingsClient({ findings, hiddenCount }: { findings: MergedFinding[]; hiddenCount: number }) {
  const [showDuplicates, setShowDuplicates] = useState(false);
  // Filter duplicates
  const liveFindings = useMemo(() => {
    if (showDuplicates) return findings;

    return findings.filter((f) => {
      const status = f.status;
      // Hide rejected and duplicate entries
      if (status === 'duplicate' || status === 'rejected') return false;
      // Hide sub-entries (tracking entries that map to a different canonical finding)
      if (f.finding_id != null && f.id !== f.finding_id) return false;
      return true;
    });
  }, [findings, showDuplicates]);

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
        expandedRow={(item) => <FindingDetail item={item} />}
      />
    </div>
  );
}
