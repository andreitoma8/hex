'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
} from '@dnd-kit/core';
import { SeverityBadge } from '@/components/SeverityBadge';
import { MarkdownRenderer } from '@/components/MarkdownRenderer';
import { findingToHackmd, findingToGithubBody, type FormatContext } from '@/lib/finding-markdown';

export type BoardColumn = 'potential' | 'verified' | 'synced' | 'invalid' | 'duplicate';
export type SyncState = 'none' | 'unsynced' | 'synced_open' | 'synced_closed' | 'conflict';
export type IssueStatus =
  | 'pending_validation'
  | 'unverified'
  | 'verified'
  | 'synced'
  | 'rejected'
  | 'duplicate';
export type IssueSource = 'manual' | 'auditagent' | 'conformance' | 'github';
export type PocStatus = 'passing' | 'failing' | 'not_started';

export interface BoardIssue {
  id: string;
  title: string;
  severity: 'Critical' | 'High' | 'Medium' | 'Low' | 'Info';
  source: IssueSource;
  status: IssueStatus;
  column: BoardColumn;
  description: string;
  recommendation: string;
  resolution?: string;
  update_from_client?: string;
  code_locations: Array<{ file: string; snippet?: string }>;
  github_synced: boolean;
  github_issue_url?: string;
  github_issue_number?: number;
  github_state?: string;
  /** Derived in page.tsx: how this verified finding stands vs GitHub. */
  sync_state?: SyncState;
  duplicate_of: string | null;
  match_signals?: {
    contract: boolean;
    function: boolean;
    root_cause: string;
    attack_vector: string;
  };
  reasoning?: string;
  has_finding_record: boolean;
  category?: string;
  poc_status?: PocStatus;
  poc_file?: string | null;
  notes: string;
}

const COLUMN_DEFS: Array<{ id: BoardColumn; label: string; description: string }> = [
  { id: 'potential', label: 'Potential', description: 'Awaiting validation' },
  { id: 'verified', label: 'Verified', description: 'Confirmed, ready to push' },
  { id: 'synced', label: 'Synced to GitHub', description: 'On GitHub — edit there, not here' },
  { id: 'invalid', label: 'Rejected', description: 'Not in the report — incorrect, or valid-but-by-design' },
  { id: 'duplicate', label: 'Duplicate', description: 'Covered by another entry' },
];

const SEVERITY_ORDER: Record<BoardIssue['severity'], number> = {
  Critical: 0,
  High: 1,
  Medium: 2,
  Low: 3,
  Info: 4,
};

const SEVERITIES: BoardIssue['severity'][] = ['Critical', 'High', 'Medium', 'Low', 'Info'];
const RESOLUTIONS = ['Fixed', 'Mitigated', 'Acknowledged', 'Not Fixed', 'Unresolved'];

export function IssuesBoardClient({
  issues: initialIssues,
  formatCtx = {},
}: {
  issues: BoardIssue[];
  formatCtx?: FormatContext;
}) {
  const [issues, setIssues] = useState<BoardIssue[]>(initialIssues);
  const [openId, setOpenId] = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState<IssueSource | 'all'>('all');

  // Reflect server-side changes (file watcher SSE will refresh the page entirely;
  // a remount with a fresh `initialIssues` is enough).
  useEffect(() => {
    setIssues(initialIssues);
  }, [initialIssues]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const filtered = useMemo(() => {
    if (sourceFilter === 'all') return issues;
    return issues.filter((i) => i.source === sourceFilter);
  }, [issues, sourceFilter]);

  const grouped = useMemo(() => {
    const map: Record<BoardColumn, BoardIssue[]> = {
      potential: [],
      verified: [],
      synced: [],
      invalid: [],
      duplicate: [],
    };
    for (const issue of filtered) {
      map[issue.column].push(issue);
    }
    for (const col of Object.values(map)) {
      col.sort(
        (a, b) =>
          (SEVERITY_ORDER[a.severity] ?? 5) - (SEVERITY_ORDER[b.severity] ?? 5) ||
          a.id.localeCompare(b.id),
      );
    }
    return map;
  }, [filtered]);

  const counts = useMemo(() => {
    const total: Record<BoardColumn, number> = {
      potential: 0,
      verified: 0,
      synced: 0,
      invalid: 0,
      duplicate: 0,
    };
    for (const issue of issues) total[issue.column]++;
    return total;
  }, [issues]);

  const moveIssue = useCallback(
    async (id: string, nextColumn: BoardColumn) => {
      // Optimistic update.
      setIssues((prev) =>
        prev.map((i) =>
          i.id === id
            ? {
                ...i,
                column: nextColumn,
                status: columnToStatus(nextColumn),
                duplicate_of: nextColumn === 'duplicate' ? i.duplicate_of : null,
              }
            : i,
        ),
      );

      try {
        const res = await fetch(`/api/issues/${encodeURIComponent(id)}/move`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ column: nextColumn }),
        });
        if (!res.ok) {
          const error = await res.json().catch(() => ({}));
          throw new Error(error.error ?? 'move failed');
        }
      } catch (err) {
        // Roll back: reload from server on next render. For now, log.
        console.error(err);
        setIssues((prev) =>
          prev.map((i) => (i.id === id ? (initialIssues.find((orig) => orig.id === id) ?? i) : i)),
        );
      }
    },
    [initialIssues],
  );

  const updateIssue = useCallback(async (id: string, updates: Partial<BoardIssue>) => {
    setIssues((prev) => prev.map((i) => (i.id === id ? { ...i, ...updates } : i)));

    try {
      const res = await fetch(`/api/issues/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.error ?? 'update failed');
      }
    } catch (err) {
      console.error(err);
    }
  }, []);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;
    const dest = over.id as BoardColumn;
    const id = active.id as string;
    const current = issues.find((i) => i.id === id);
    if (!current || current.column === dest) return;
    // Synced is reached only via /sync-issues, and synced cards are locked.
    if (dest === 'synced' || current.column === 'synced') return;
    void moveIssue(id, dest);
  };

  const openIssue = issues.find((i) => i.id === openId) ?? null;

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-title font-semibold text-text-primary">Issues</h1>
          <p className="mt-1 text-body text-text-secondary">
            {issues.length} total — {counts.potential} potential, {counts.verified} verified,{' '}
            {counts.synced} synced, {counts.invalid} invalid, {counts.duplicate} duplicate. Drag a
            card between columns; click to edit. Synced cards are read-only (edit on GitHub).
          </p>
        </div>
        <SourceFilter value={sourceFilter} onChange={setSourceFilter} />
      </header>

      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
          {COLUMN_DEFS.map((col) => (
            <Column key={col.id} column={col} issues={grouped[col.id]} onOpen={setOpenId} />
          ))}
        </div>
      </DndContext>

      {openIssue && (
        <IssueModal
          issue={openIssue}
          formatCtx={formatCtx}
          onClose={() => setOpenId(null)}
          onSave={(updates) => updateIssue(openIssue.id, updates)}
        />
      )}
    </div>
  );
}

function columnToStatus(column: BoardColumn): IssueStatus {
  switch (column) {
    case 'potential':
      return 'pending_validation';
    case 'verified':
      return 'verified';
    case 'synced':
      return 'synced';
    case 'invalid':
      return 'rejected';
    case 'duplicate':
      return 'duplicate';
  }
}

function SourceFilter({
  value,
  onChange,
}: {
  value: IssueSource | 'all';
  onChange: (v: IssueSource | 'all') => void;
}) {
  const options: Array<{ id: IssueSource | 'all'; label: string }> = [
    { id: 'all', label: 'All sources' },
    { id: 'manual', label: 'Manual' },
    { id: 'auditagent', label: 'AuditAgent' },
    { id: 'conformance', label: 'Conformance' },
    { id: 'github', label: 'GitHub' },
  ];
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((opt) => {
        const active = value === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            className={`rounded-md px-2.5 py-1 text-caption font-medium ${
              active
                ? 'bg-accent text-surface-0'
                : 'bg-surface-2 text-text-secondary hover:text-text-primary'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function Column({
  column,
  issues,
  onOpen,
}: {
  column: { id: BoardColumn; label: string; description: string };
  issues: BoardIssue[];
  onOpen: (id: string) => void;
}) {
  // The Synced column is reached only via /sync-issues — never a drop target.
  const { isOver, setNodeRef } = useDroppable({ id: column.id, disabled: column.id === 'synced' });
  return (
    <section
      ref={setNodeRef}
      aria-label={column.label}
      className={`flex flex-col gap-2 rounded-lg border bg-surface-1 p-3 transition-colors ${
        isOver ? 'border-accent bg-surface-2' : 'border-border-subtle'
      }`}
    >
      <header className="flex items-baseline justify-between">
        <h2 className="text-heading font-medium text-text-primary">{column.label}</h2>
        <span className="text-caption text-text-tertiary">{issues.length}</span>
      </header>
      <p className="text-caption text-text-tertiary">{column.description}</p>
      <div className="mt-1 flex flex-col gap-2">
        {issues.map((issue) => (
          <Card key={issue.id} issue={issue} onOpen={onOpen} />
        ))}
        {issues.length === 0 && (
          <div className="rounded-md border border-dashed border-border-subtle py-6 text-center text-caption text-text-tertiary">
            Empty
          </div>
        )}
      </div>
    </section>
  );
}

function Card({ issue, onOpen }: { issue: BoardIssue; onOpen: (id: string) => void }) {
  // Synced cards are locked: not draggable (edits happen on GitHub).
  const locked = issue.column === 'synced';
  const { attributes, listeners, setNodeRef, isDragging, transform } = useDraggable({
    id: issue.id,
    disabled: locked,
  });
  const style: React.CSSProperties = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        zIndex: 30,
      }
    : {};

  return (
    <article
      ref={setNodeRef}
      style={style}
      {...(locked ? {} : attributes)}
      {...(locked ? {} : listeners)}
      onClick={(e) => {
        // Drag listeners may swallow the click during a drag; treat anything
        // with a transform as a drag, not a click.
        if (transform) return;
        e.stopPropagation();
        onOpen(issue.id);
      }}
      className={`group rounded-md border bg-surface-0 p-3 text-left ${
        locked ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing'
      } ${
        isDragging ? 'border-accent shadow-lg' : 'border-border-subtle hover:border-border-default'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="font-mono text-caption text-text-tertiary">{issue.id}</span>
        <SeverityBadge severity={issue.severity} />
      </div>
      <h3
        title={issue.title}
        className="mt-1 text-body font-medium text-text-primary line-clamp-3"
      >
        {issue.title}
      </h3>
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-caption">
        <SourceChip source={issue.source} />
        <SyncChip issue={issue} />
        {issue.column === 'invalid' && (
          <span
            className={`rounded-md px-1.5 py-0.5 ${
              issue.resolution === 'Acknowledged'
                ? 'bg-[var(--medium)]/15 text-[var(--medium)]'
                : 'bg-surface-2 text-text-secondary'
            }`}
            title={
              issue.resolution === 'Acknowledged'
                ? 'Valid but by-design / not a security issue'
                : 'Factually incorrect (false positive)'
            }
          >
            {issue.resolution === 'Acknowledged' ? 'By-design' : 'Invalid'}
          </span>
        )}
        {issue.duplicate_of && (
          <span className="rounded-md bg-surface-2 px-1.5 py-0.5 text-text-secondary">
            dup of {issue.duplicate_of}
          </span>
        )}
        {issue.poc_status === 'passing' && (
          <span className="rounded-md bg-[var(--low)]/15 px-1.5 py-0.5 text-[var(--low)]">
            PoC ✓
          </span>
        )}
        {issue.poc_status === 'failing' && (
          <span className="rounded-md bg-[var(--critical)]/15 px-1.5 py-0.5 text-[var(--critical)]">
            PoC ✕
          </span>
        )}
        {issue.resolution && issue.column !== 'invalid' && (
          <span className="rounded-md bg-surface-2 px-1.5 py-0.5 text-text-secondary">
            {issue.resolution}
          </span>
        )}
      </div>
      {issue.match_signals && (
        <div className="mt-2 text-caption text-text-tertiary">
          <span className="font-mono">
            {[
              issue.match_signals.contract ? 'contract' : null,
              issue.match_signals.function ? 'function' : null,
              issue.match_signals.root_cause !== 'different'
                ? `rc:${issue.match_signals.root_cause}`
                : null,
              issue.match_signals.attack_vector !== 'different'
                ? `av:${issue.match_signals.attack_vector}`
                : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </div>
      )}
    </article>
  );
}

function SourceChip({ source }: { source: IssueSource }) {
  const labels: Record<IssueSource, string> = {
    manual: 'Manual',
    auditagent: 'AuditAgent',
    conformance: 'Conformance',
    github: 'GitHub',
  };
  return (
    <span className="rounded-md bg-surface-2 px-1.5 py-0.5 text-text-tertiary">
      {labels[source] ?? source}
    </span>
  );
}

/**
 * GitHub-sync state chip. Only verified findings are push candidates, so other
 * statuses render nothing (sync_state === 'none').
 */
function SyncChip({ issue }: { issue: BoardIssue }) {
  const state = issue.sync_state ?? 'none';
  if (state === 'none') return null;

  if (state === 'unsynced') {
    return (
      <span
        title="Run /sync-issues to push verified findings to GitHub."
        className="rounded-md border border-dashed border-border-default px-1.5 py-0.5 text-text-tertiary"
      >
        GH unsynced
      </span>
    );
  }
  if (state === 'conflict') {
    return (
      <span
        title="Local and remote diverged. Re-run /sync-issues to reconcile."
        className="rounded-md bg-[var(--critical)]/15 px-1.5 py-0.5 text-[var(--critical)]"
      >
        GH conflict
      </span>
    );
  }
  const closed = state === 'synced_closed';
  const label = `GH #${issue.github_issue_number ?? '?'} ${closed ? 'closed' : 'open'}`;
  const cls = closed ? 'bg-surface-2 text-text-tertiary' : 'bg-[var(--low)]/15 text-[var(--low)]';
  return issue.github_issue_url ? (
    <a
      href={issue.github_issue_url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className={`rounded-md px-1.5 py-0.5 hover:underline ${cls}`}
    >
      {label}
    </a>
  ) : (
    <span className={`rounded-md px-1.5 py-0.5 ${cls}`}>{label}</span>
  );
}

function IssueModal({
  issue,
  formatCtx,
  onClose,
  onSave,
}: {
  issue: BoardIssue;
  formatCtx: FormatContext;
  onClose: () => void;
  onSave: (updates: Partial<BoardIssue>) => Promise<void> | void;
}) {
  const [title, setTitle] = useState(issue.title);
  const [severity, setSeverity] = useState(issue.severity);
  const [description, setDescription] = useState(issue.description);
  const [recommendation, setRecommendation] = useState(issue.recommendation);
  const [resolution, setResolution] = useState(issue.resolution ?? '');
  const [updateFromClient, setUpdateFromClient] = useState(issue.update_from_client ?? '');
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  // Open in read-only view mode; the Edit button switches to the form below.
  const [isEditing, setIsEditing] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);

  // Synced issues are read-only in Hex; edits happen on GitHub.
  const locked = issue.status === 'synced';

  useEffect(() => {
    overlayRef.current?.focus();
  }, []);

  // Copy the current (possibly edited) field values, not just the saved ones.
  const copyAsHackmd = async () => {
    const md = findingToHackmd(
      {
        ...issue,
        title,
        severity,
        description,
        recommendation,
        resolution: resolution || undefined,
        update_from_client: updateFromClient || undefined,
      },
      formatCtx,
    );
    try {
      await navigator.clipboard.writeText(md);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked (insecure context) — no-op */
    }
  };

  const submit = async () => {
    setSaving(true);
    const updates: Partial<BoardIssue> = {
      title,
      severity,
      description,
      recommendation,
      resolution: resolution || undefined,
      update_from_client: updateFromClient || undefined,
    };
    await onSave(updates);
    setSaving(false);
    setIsEditing(false); // back to the rendered view, now showing the saved values
  };

  return (
    <div
      ref={overlayRef}
      tabIndex={-1}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 outline-none"
      style={{ background: 'var(--overlay-bg)' }}
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Issue ${issue.id}`}
        className="relative flex h-[85vh] w-full max-w-4xl flex-col overflow-hidden border border-border-emphasis bg-surface-1 shadow-2xl"
        style={{ borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-accent)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border-default bg-surface-2 px-4 py-3">
          <div className="flex items-center gap-2 text-caption">
            <span className="font-mono text-body text-text-tertiary">{issue.id}</span>
            <SourceChip source={issue.source} />
            <SyncChip issue={issue} />
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded p-1 text-text-tertiary hover:bg-surface-3 hover:text-text-primary"
          >
            <svg
              className="h-5 w-5"
              aria-hidden="true"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {locked && (
            <div className="mb-4 rounded-md border border-border-default bg-surface-2 px-3 py-2 text-caption text-text-secondary">
              This issue is synced to GitHub and is read-only here. Edit it on GitHub, then run{' '}
              <span className="font-mono">/sync-issues</span> to pull the changes back.
            </div>
          )}
          {isEditing ? (
          <>
          <Field label="Title">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={locked}
              className="w-full rounded-md border border-border-default bg-surface-0 px-3 py-2 text-body text-text-primary focus:border-accent focus:outline-none disabled:opacity-60"
            />
          </Field>

          <div className="mt-3 grid grid-cols-2 gap-3">
            <Field label="Severity">
              <select
                value={severity}
                onChange={(e) => setSeverity(e.target.value as BoardIssue['severity'])}
                disabled={locked}
                className="w-full rounded-md border border-border-default bg-surface-0 px-3 py-2 text-body text-text-primary focus:border-accent focus:outline-none disabled:opacity-60"
              >
                {SEVERITIES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Resolution (verified only)">
              <select
                value={resolution}
                onChange={(e) => setResolution(e.target.value)}
                disabled={locked}
                className="w-full rounded-md border border-border-default bg-surface-0 px-3 py-2 text-body text-text-primary focus:border-accent focus:outline-none disabled:opacity-60"
              >
                <option value="">— none —</option>
                {RESOLUTIONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Description" className="mt-3">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={8}
              disabled={locked}
              className="w-full rounded-md border border-border-default bg-surface-0 px-3 py-2 font-mono text-caption text-text-primary focus:border-accent focus:outline-none disabled:opacity-60"
            />
          </Field>

          <Field label="Recommendation" className="mt-3">
            <textarea
              value={recommendation}
              onChange={(e) => setRecommendation(e.target.value)}
              rows={4}
              disabled={locked}
              className="w-full rounded-md border border-border-default bg-surface-0 px-3 py-2 font-mono text-caption text-text-primary focus:border-accent focus:outline-none disabled:opacity-60"
            />
          </Field>

          <Field label="Update from the client" className="mt-3">
            <textarea
              value={updateFromClient}
              onChange={(e) => setUpdateFromClient(e.target.value)}
              rows={4}
              disabled={locked}
              placeholder="How the client responded — used by /generate-overleaf."
              className="w-full rounded-md border border-border-default bg-surface-0 px-3 py-2 font-mono text-caption text-text-primary focus:border-accent focus:outline-none disabled:opacity-60"
            />
          </Field>
          </>
          ) : (
          <>
            <MarkdownRenderer
              content={`**Title**: ${issue.title}\n\n**Severity**: ${issue.severity}\n\n${findingToGithubBody(
                issue,
                formatCtx,
              )}`}
            />
          </>
          )}

          {issue.code_locations.length > 0 && (
            <div className="mt-4">
              <div className="mb-1 text-caption font-medium text-text-tertiary">Code locations</div>
              <ul className="space-y-1 font-mono text-caption text-text-secondary">
                {issue.code_locations.map((loc, i) => (
                  <li key={`${loc.file}-${i}`}>{loc.file}</li>
                ))}
              </ul>
            </div>
          )}

          {issue.match_signals && (
            <div className="mt-4">
              <div className="mb-1 text-caption font-medium text-text-tertiary">
                Duplicate signals
              </div>
              <p className="text-caption text-text-secondary">
                {issue.reasoning ?? 'Matched against another entry.'}
              </p>
              <div className="mt-1 flex flex-wrap gap-1.5 font-mono text-caption text-text-tertiary">
                <span>contract: {issue.match_signals.contract ? '✓' : '—'}</span>
                <span>function: {issue.match_signals.function ? '✓' : '—'}</span>
                <span>root_cause: {issue.match_signals.root_cause}</span>
                <span>attack_vector: {issue.match_signals.attack_vector}</span>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-border-default bg-surface-2 px-4 py-3">
          <button
            type="button"
            onClick={copyAsHackmd}
            className="rounded-md border border-border-default px-3 py-1.5 text-body text-text-secondary hover:bg-surface-3 hover:text-text-primary"
          >
            {copied ? 'Copied!' : 'Copy as HackMD'}
          </button>
          <div className="flex items-center gap-2">
            {isEditing ? (
              <>
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="rounded-md px-3 py-1.5 text-body text-text-secondary hover:text-text-primary"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={submit}
                  disabled={saving}
                  className="rounded-md bg-accent px-3 py-1.5 text-body font-medium text-surface-0 hover:bg-accent-secondary disabled:opacity-50"
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-md px-3 py-1.5 text-body text-text-secondary hover:text-text-primary"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  disabled={locked}
                  title={
                    locked
                      ? 'Synced to GitHub — edit it there, then run /sync-issues to pull the changes back.'
                      : undefined
                  }
                  className="rounded-md bg-accent px-3 py-1.5 text-body font-medium text-surface-0 hover:bg-accent-secondary disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Edit
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`block ${className ?? ''}`}>
      <span className="mb-1 block text-caption font-medium text-text-tertiary">{label}</span>
      {children}
    </label>
  );
}
