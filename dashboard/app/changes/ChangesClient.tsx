'use client';

import Link from 'next/link';
import { FilterableTable, type FilterableColumn } from '@/components/FilterableTable';
import { ConfidenceBadge } from '@/components/ConfidenceBadge';
import { CodeReference } from '@/components/CodeReference';
import { MarkdownRenderer, InlineMarkdown } from '@/components/MarkdownRenderer';
import { SeverityBadge } from '@/components/SeverityBadge';

// ─── Types (shape of .hex/diff.json, see src/core/schema.ts DiffSchema) ──

interface DiffChange {
  contract: string;
  entity: string;
  kind: string;
  file: string;
  change: 'added' | 'removed' | 'modified' | 'comments_only';
  line_start?: number;
  line_end?: number;
}

interface ImpactReason {
  kind: 'changed' | 'calls' | 'modifier' | 'reads_state' | 'override' | 'inherits';
  via: string;
}

interface Impacted {
  contract: string;
  function: string;
  file: string;
  visibility: string;
  is_entry_point: boolean;
  depth: number;
  reasons: ImpactReason[];
  confidence: string;
  derived_from: string;
  line_start?: number;
}

export interface DiffData {
  generated_at: string;
  base_commit: string;
  head_commit: string;
  warnings?: string[];
  files: Array<{
    path: string;
    status: string;
    old_path?: string;
    additions: number;
    deletions: number;
  }>;
  changes: DiffChange[];
  storage_layout_changes: Array<{ contract: string; file: string; kind: string; detail: string }>;
  impacted: Impacted[];
  summary: {
    files_changed: number;
    additions: number;
    deletions: number;
    functions_added: number;
    functions_modified: number;
    functions_removed: number;
    impacted_functions: number;
    impacted_entry_points: number;
    storage_layout_changes: number;
  };
}

type Severity = 'Critical' | 'High' | 'Medium' | 'Low' | 'Info';

export interface PriorReview {
  reviewed_at: string;
  items: Array<{
    id: string;
    title: string;
    severity: Severity;
    status: string;
    reasoning: string;
    issue_id?: string;
  }>;
}

// ─── Small pieces ───────────────────────────────────────────────────

const CHANGE_STYLES: Record<string, string> = {
  added: 'bg-accent-subtle text-accent',
  modified: 'bg-[var(--high)]/18 text-[var(--high)]',
  removed: 'bg-[var(--critical)]/18 text-[var(--critical)]',
  comments_only: 'bg-surface-3 text-text-tertiary',
};

const CHANGE_LABELS: Record<string, string> = {
  added: 'Added',
  modified: 'Modified',
  removed: 'Removed',
  comments_only: 'Comments only',
};

function Chip({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-caption font-medium ${className}`}
    >
      {children}
    </span>
  );
}

function ChangeBadge({ change }: { change: string }) {
  return (
    <Chip className={CHANGE_STYLES[change] ?? CHANGE_STYLES.comments_only}>
      {CHANGE_LABELS[change] ?? change}
    </Chip>
  );
}

const REASON_LABELS: Record<ImpactReason['kind'], string> = {
  changed: 'Changed',
  calls: 'Calls',
  modifier: 'Uses modifier',
  reads_state: 'Reads state',
  override: 'Dispatches to',
  inherits: 'Inherits',
};

const PRIOR_STATUS: Record<string, { label: string; className: string }> = {
  regressed: { label: 'Regressed', className: 'bg-[var(--critical)]/18 text-[var(--critical)]' },
  acknowledged_still_present: {
    label: 'Still present',
    className: 'bg-[var(--medium)]/18 text-[var(--medium)]',
  },
  fix_touched_ok: { label: 'Fix touched, holds', className: 'bg-accent-subtle text-accent' },
  fixed_unchanged: { label: 'Fixed, untouched', className: 'bg-surface-3 text-text-secondary' },
  code_removed: { label: 'Code removed', className: 'bg-surface-3 text-text-tertiary' },
};

function Stat({ label, value, tone }: { label: string; value: number | string; tone?: 'warn' }) {
  return (
    <div
      className={`rounded-lg border p-4 ${
        tone === 'warn'
          ? 'border-[var(--high)]/30 bg-[var(--high)]/5'
          : 'border-border-subtle bg-surface-1'
      }`}
    >
      <div
        className={`text-display scale-in ${tone === 'warn' ? 'text-[var(--high)]' : 'text-text-primary'}`}
      >
        {value}
      </div>
      <div className="mt-1 text-caption text-text-secondary">{label}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-sp-6">
      <h3 className="mb-sp-3 text-heading font-medium text-text-primary">{title}</h3>
      {children}
    </section>
  );
}

// ─── Columns ────────────────────────────────────────────────────────

const changeColumns: FilterableColumn<DiffChange>[] = [
  {
    id: 'contract',
    header: 'Contract',
    accessorKey: 'contract',
    enableColumnFilter: true,
    cell: (row) => <span className="font-medium text-text-primary">{row.contract}</span>,
  },
  {
    id: 'entity',
    header: 'Entity',
    accessorKey: 'entity',
    cell: (row) => <code className="font-mono text-body text-text-secondary">{row.entity}</code>,
  },
  {
    id: 'kind',
    header: 'Kind',
    accessorKey: 'kind',
    enableColumnFilter: true,
    cell: (row) => (
      <span className="text-body text-text-secondary">{row.kind.replace('_', ' ')}</span>
    ),
  },
  {
    id: 'change',
    header: 'Change',
    accessorKey: 'change',
    enableColumnFilter: true,
    filterOrder: ['added', 'modified', 'removed', 'comments_only'],
    cell: (row) => <ChangeBadge change={row.change} />,
  },
  {
    id: 'location',
    header: 'Location',
    accessorKey: 'file',
    cell: (row) =>
      row.change === 'removed' || !row.line_start ? (
        <code className="font-mono text-caption text-text-tertiary">{row.file}</code>
      ) : (
        <CodeReference file={row.file} lineStart={row.line_start} lineEnd={row.line_end} />
      ),
  },
];

interface ImpactRow extends Impacted {
  entry: string;
  reason: string;
}

const impactColumns: FilterableColumn<ImpactRow>[] = [
  {
    id: 'contract',
    header: 'Contract',
    accessorKey: 'contract',
    enableColumnFilter: true,
    cell: (row) => <span className="font-medium text-text-primary">{row.contract}</span>,
  },
  {
    id: 'function',
    header: 'Function',
    accessorKey: 'function',
    cell: (row) => <code className="font-mono text-body text-text-secondary">{row.function}</code>,
  },
  {
    id: 'entry',
    header: 'Entry point',
    accessorKey: 'entry',
    enableColumnFilter: true,
    cell: (row) =>
      row.is_entry_point ? (
        <Chip className="bg-accent-subtle text-accent">Entry point</Chip>
      ) : (
        <span className="text-caption text-text-tertiary">{row.visibility}</span>
      ),
  },
  {
    id: 'depth',
    header: 'Depth',
    accessorKey: 'depth',
    cell: (row) => (
      <span className="text-body text-text-secondary">
        {row.depth === 0 ? 'changed' : row.depth}
      </span>
    ),
  },
  {
    id: 'reason',
    header: 'Why',
    accessorKey: 'reason',
    enableColumnFilter: true,
    cell: (row) => (
      <div className="space-y-0.5">
        {row.reasons.slice(0, 2).map((r, i) => (
          <div key={i} className="text-caption text-text-secondary">
            {REASON_LABELS[r.kind] ?? r.kind}{' '}
            {r.kind !== 'changed' && <code className="font-mono text-text-primary">{r.via}</code>}
            {r.kind === 'changed' && <span className="text-text-tertiary">({r.via})</span>}
          </div>
        ))}
        {row.reasons.length > 2 && (
          <div className="text-caption text-text-tertiary">+{row.reasons.length - 2} more</div>
        )}
      </div>
    ),
  },
  {
    id: 'confidence',
    header: 'Confidence',
    accessorKey: 'confidence',
    enableColumnFilter: true,
    filterOrder: ['high', 'medium', 'low'],
    cell: (row) => <ConfidenceBadge level={row.confidence} derivedFrom={row.derived_from} />,
  },
  {
    id: 'location',
    header: 'Location',
    accessorKey: 'file',
    cell: (row) =>
      row.line_start ? (
        <CodeReference file={row.file} lineStart={row.line_start} />
      ) : (
        <code className="font-mono text-caption text-text-tertiary">{row.file}</code>
      ),
  },
];

// ─── Component ──────────────────────────────────────────────────────

export function ChangesClient({
  diff,
  overview,
  review,
}: {
  diff: DiffData;
  overview: string | null;
  review: PriorReview | null;
}) {
  const s = diff.summary;
  const base = diff.base_commit.slice(0, 8);
  const head = diff.head_commit.slice(0, 8);

  const impactRows: ImpactRow[] = diff.impacted.map((i) => ({
    ...i,
    entry: i.is_entry_point ? 'Entry point' : 'Internal',
    reason: REASON_LABELS[i.reasons[0]?.kind] ?? '',
  }));
  const regressed = review?.items.filter((i) => i.status === 'regressed').length ?? 0;

  return (
    <div>
      <h2 className="mb-sp-2 text-title font-semibold text-text-primary">Changes</h2>
      <div className="mb-sp-5 flex flex-wrap items-center gap-2 text-caption text-text-tertiary">
        <span>Differential audit</span>
        <code className="rounded-md bg-surface-2 px-2 py-0.5 font-mono text-text-secondary">
          {base}
        </code>
        <span aria-hidden="true">→</span>
        <code className="rounded-md bg-surface-2 px-2 py-0.5 font-mono text-text-secondary">
          {head}
        </code>
        <span>
          · +{s.additions} / −{s.deletions} lines
        </span>
      </div>

      {(diff.warnings ?? []).map((w, i) => (
        <div
          key={i}
          className="mb-sp-3 rounded-lg border border-[var(--high)]/30 bg-[var(--high)]/5 px-4 py-3 text-body text-text-secondary"
        >
          {w}
        </div>
      ))}

      <div className="mb-sp-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6 stagger">
        <Stat label="Files changed" value={s.files_changed} />
        <Stat label="Functions added" value={s.functions_added} />
        <Stat label="Functions modified" value={s.functions_modified} />
        <Stat label="Functions removed" value={s.functions_removed} />
        <Stat label="Impacted entry points" value={s.impacted_entry_points} />
        <Stat
          label="Storage layout changes"
          value={s.storage_layout_changes}
          tone={s.storage_layout_changes > 0 ? 'warn' : undefined}
        />
        {review && (
          <Stat
            label="Prior findings regressed"
            value={regressed}
            tone={regressed > 0 ? 'warn' : undefined}
          />
        )}
      </div>

      {overview && (
        <Section title="What changed">
          <div className="rounded-lg border border-border-subtle bg-surface-1 p-6">
            <MarkdownRenderer content={overview} />
          </div>
        </Section>
      )}

      {diff.storage_layout_changes.length > 0 && (
        <Section title="Storage layout">
          <ul className="divide-y divide-border-subtle rounded-lg border border-border-subtle bg-surface-1">
            {diff.storage_layout_changes.map((l, i) => (
              <li key={i} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-3">
                <span className="font-medium text-text-primary">{l.contract}</span>
                <Chip className="bg-[var(--high)]/18 text-[var(--high)]">
                  {l.kind.replace(/_/g, ' ')}
                </Chip>
                <span className="text-body text-text-secondary">
                  <InlineMarkdown>{l.detail}</InlineMarkdown>
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Changed code">
        <p className="mb-sp-3 text-body text-text-secondary">
          {diff.files.length} file{diff.files.length !== 1 ? 's' : ''}:{' '}
          {diff.files.map((f, i) => (
            <span key={f.path}>
              {i > 0 && ', '}
              <code className="font-mono text-caption text-text-primary">{f.path}</code>{' '}
              <span className="text-caption text-text-tertiary">
                ({f.status}
                {f.old_path ? ` from ${f.old_path}` : ''}, +{f.additions}/−{f.deletions})
              </span>
            </span>
          ))}
        </p>
        <FilterableTable columns={changeColumns} data={diff.changes} />
      </Section>

      <Section title="Impacted flows">
        <p className="mb-sp-3 text-body text-text-secondary">
          Every function the change reaches: changed code (depth 0), then callers, modifier users,
          readers of state the change writes, and inherited entry points. {s.impacted_functions}{' '}
          impacted beyond the changed code.
        </p>
        <FilterableTable columns={impactColumns} data={impactRows} />
      </Section>

      {review && review.items.length > 0 && (
        <Section title="Prior findings">
          <div className="overflow-x-auto rounded-lg border border-border-subtle bg-surface-1">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-border-subtle text-caption text-text-tertiary">
                  <th className="px-4 py-2 font-normal">ID</th>
                  <th className="px-4 py-2 font-normal">Title</th>
                  <th className="px-4 py-2 font-normal">Severity</th>
                  <th className="px-4 py-2 font-normal">Status</th>
                  <th className="px-4 py-2 font-normal">Card</th>
                </tr>
              </thead>
              <tbody>
                {review.items.map((item) => {
                  const st = PRIOR_STATUS[item.status] ?? {
                    label: item.status,
                    className: 'bg-surface-3 text-text-secondary',
                  };
                  return (
                    <tr
                      key={item.id}
                      className="border-b border-border-subtle last:border-0 hover:bg-surface-3"
                      title={item.reasoning}
                    >
                      <td className="px-4 py-2 text-body text-text-secondary">{item.id}</td>
                      <td className="px-4 py-2 text-body text-text-primary">{item.title}</td>
                      <td className="px-4 py-2">
                        <SeverityBadge severity={item.severity} />
                      </td>
                      <td className="px-4 py-2">
                        <Chip className={st.className}>{st.label}</Chip>
                      </td>
                      <td className="px-4 py-2 text-body">
                        {item.issue_id ? (
                          <Link href="/issues" className="text-accent hover:underline">
                            {item.issue_id}
                          </Link>
                        ) : (
                          <span className="text-text-tertiary">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Section>
      )}
    </div>
  );
}
