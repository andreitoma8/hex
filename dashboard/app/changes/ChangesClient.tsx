'use client';

import { LocalTime } from '@/components/ui/LocalTime';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ScrollArea, SplitView, Toolbar } from '@/components/ui/SplitView';
import { Inspector, InspectorField, InspectorSection } from '@/components/ui/Inspector';
import { ListGroupLabel, ListRow } from '@/components/ui/ListRow';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Dot, SeverityDot } from '@/components/ui/SeverityDot';
import { StateGlyph } from '@/components/ui/StateGlyph';
import { EmptyState } from '@/components/ui/EmptyState';
import { CodeReference } from '@/components/CodeReference';
import { InlineMarkdown, MarkdownRenderer } from '@/components/MarkdownRenderer';
import { useHotkeys } from '@/lib/hotkeys';
import { setFocus } from '@/lib/focus';
import { replaceQuery } from '@/lib/url';
import { cn } from '@/lib/cn';
import type { FixReview, ReviewState } from '@/lib/types';

// ─── Shapes (src/core/schema.ts DiffSchema / PriorReviewSchema) ─────

interface DiffChange {
  contract: string;
  entity: string;
  kind: string;
  file: string;
  change: 'added' | 'removed' | 'modified' | 'comments_only';
  line_start?: number;
  line_end?: number;
}

interface Impacted {
  contract: string;
  function: string;
  file: string;
  visibility: string;
  is_entry_point: boolean;
  depth: number;
  reasons: Array<{ kind: string; via: string }>;
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

export interface PriorReview {
  reviewed_at: string;
  items: Array<{
    id: string;
    title: string;
    severity: string;
    status: string;
    reasoning: string;
    issue_id?: string;
  }>;
}

type Section = 'overview' | 'storage' | 'code' | 'impact' | 'prior' | 'fixes';

type Sel =
  | { kind: 'change'; i: number }
  | { kind: 'impact'; i: number }
  | { kind: 'storage'; i: number }
  | { kind: 'prior'; i: number }
  | { kind: 'fix'; i: number }
  | { kind: 'unmapped'; i: number };

const CHANGE_WORD: Record<string, string> = {
  added: 'Added',
  modified: 'Modified',
  removed: 'Removed',
  comments_only: 'Comments only',
};
const CHANGE_COLOR: Record<string, string> = {
  added: 'var(--success)',
  modified: 'var(--high)',
  removed: 'var(--critical)',
  comments_only: 'var(--neutral)',
};

const REASON: Record<string, string> = {
  changed: 'Changed',
  calls: 'Calls',
  modifier: 'Uses modifier',
  reads_state: 'Reads state',
  override: 'Dispatches to',
  inherits: 'Inherits',
};

const PRIOR: Record<string, { label: string; color: string }> = {
  regressed: { label: 'Regressed', color: 'var(--critical)' },
  acknowledged_still_present: { label: 'Still present', color: 'var(--medium)' },
  fix_touched_ok: { label: 'Fix touched, holds', color: 'var(--success)' },
  fixed_unchanged: { label: 'Fixed, untouched', color: 'var(--neutral)' },
  code_removed: { label: 'Code removed', color: 'var(--neutral)' },
};

const FIX: Record<string, { label: string; color: string }> = {
  fixed: { label: 'Fixed', color: 'var(--success)' },
  partially_fixed: { label: 'Partially fixed', color: 'var(--medium)' },
  not_fixed: { label: 'Not fixed', color: 'var(--critical)' },
  unaddressed: { label: 'Unaddressed', color: 'var(--high)' },
  unknown: { label: 'Unknown', color: 'var(--neutral)' },
};

const POC_WORD: Record<string, string> = {
  passing: 'passes',
  failing: 'fails',
  error: 'errors',
  missing: 'missing',
};

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

export function ChangesClient({
  diff,
  overview,
  prior,
  fixReview,
  reviewStates,
}: {
  diff: DiffData | null;
  overview: string | null;
  prior: PriorReview | null;
  fixReview: FixReview | null;
  reviewStates: Record<string, string>;
}) {
  const params = useSearchParams();

  const sections = useMemo(() => {
    // A full audit has no diff; its fix review is then the only section.
    const out: Array<{ id: Section; label: string; count?: number }> = diff
      ? [{ id: 'overview', label: 'Overview' }]
      : [];
    if (fixReview)
      out.push({
        id: 'fixes',
        label: 'Fix review',
        count: fixReview.cards.length + fixReview.unmapped_changes.length,
      });
    if (diff?.storage_layout_changes.length)
      out.push({
        id: 'storage',
        label: 'Storage layout',
        count: diff.storage_layout_changes.length,
      });
    if (diff) {
      out.push({ id: 'code', label: 'Changed code', count: diff.changes.length });
      out.push({ id: 'impact', label: 'Impact', count: diff.impacted.length });
    }
    if (prior?.items.length)
      out.push({ id: 'prior', label: 'Prior findings', count: prior.items.length });
    return out;
  }, [diff, prior, fixReview]);

  const [section, setSection] = useState<Section>(() => {
    const q = params.get('s') as Section | null;
    return q && sections.some((x) => x.id === q) ? q : (sections[0]?.id ?? 'overview');
  });
  const [sel, setSel] = useState<Sel | null>(null);
  const [impactScope, setImpactScope] = useState<'entry' | 'all'>('entry');

  useEffect(() => {
    replaceQuery({ s: section === sections[0]?.id ? null : section });
    setSel(null);
  }, [section]);

  const impactRows = useMemo(
    () =>
      (diff?.impacted ?? [])
        .map((it, i) => ({ it, i }))
        .filter(({ it }) => impactScope === 'all' || it.is_entry_point || it.depth === 0)
        .sort(
          (a, b) =>
            a.it.depth - b.it.depth || Number(b.it.is_entry_point) - Number(a.it.is_entry_point),
        ),
    [diff, impactScope],
  );

  // Selected item → focus bridge.
  useEffect(() => {
    if (!sel) return;
    if (sel.kind === 'impact' && diff) {
      const it = diff.impacted[sel.i];
      setFocus({
        ref: `${it.contract}.${it.function}`,
        kind: 'function',
        label: `${it.contract}.${it.function}`,
        file: it.file,
        ...(it.line_start ? { line_start: it.line_start } : {}),
      });
    } else if (sel.kind === 'change' && diff) {
      const c = diff.changes[sel.i];
      if (c.kind === 'function' || c.kind === 'modifier') {
        setFocus({
          ref: `${c.contract}.${c.entity}`,
          kind: 'function',
          label: `${c.contract}.${c.entity}`,
          file: c.file,
          ...(c.line_start
            ? { line_start: c.line_start, line_end: c.line_end ?? c.line_start }
            : {}),
        });
      }
    } else if (sel.kind === 'fix' && fixReview) {
      const c = fixReview.cards[sel.i];
      setFocus({ ref: c.id, kind: 'card', label: c.title });
    }
  }, [sel]); // eslint-disable-line react-hooks/exhaustive-deps

  useHotkeys({
    Escape: () => setSel(null),
    j: () => stepSection(1),
    k: () => stepSection(-1),
  });
  const stepSection = (d: number) => {
    const i = sections.findIndex((x) => x.id === section);
    const next = sections[Math.max(0, Math.min(sections.length - 1, i + d))];
    if (next) setSection(next.id);
  };

  const list = (
    <div className="min-h-0 flex-1 overflow-y-auto p-2">
      {sections.map((x) => (
        <ListRow
          key={x.id}
          dense
          selected={x.id === section}
          onClick={() => setSection(x.id)}
          title={x.label}
          trailing={
            x.count !== undefined ? <span className="tabular-nums">{x.count}</span> : undefined
          }
        />
      ))}
    </div>
  );

  return (
    <SplitView
      toolbar={
        <Toolbar
          title="Changes"
          meta={
            diff ? (
              <span>
                <span className="font-mono text-caption">{diff.base_commit.slice(0, 8)}</span> →{' '}
                <span className="font-mono text-caption">{diff.head_commit.slice(0, 8)}</span>
                <span className="ml-2">
                  +{diff.summary.additions} −{diff.summary.deletions}
                </span>
              </span>
            ) : fixReview ? (
              <span>
                Fix review ·{' '}
                <span className="font-mono text-caption">{fixReview.from_commit.slice(0, 8)}</span>{' '}
                → <span className="font-mono text-caption">{fixReview.to_commit.slice(0, 8)}</span>
              </span>
            ) : undefined
          }
        />
      }
      list={list}
      listWidth={220}
      inspector={
        sel ? (
          <ChangeInspector
            sel={sel}
            diff={diff}
            prior={prior}
            fixReview={fixReview}
            reviewStates={reviewStates}
            onClose={() => setSel(null)}
          />
        ) : undefined
      }
    >
      <ScrollArea>
        <div className="mx-auto max-w-[760px] px-8 pb-16 pt-8">
          {section === 'overview' && diff && (
            <div className="rise-in">
              <p className="text-heading font-medium text-text-primary">
                {plural(diff.summary.files_changed, 'file')} changed ·{' '}
                {diff.summary.functions_added} added, {diff.summary.functions_modified} modified,{' '}
                {diff.summary.functions_removed} removed
              </p>
              <p className="mt-1 text-body text-text-secondary">
                The change reaches {plural(diff.summary.impacted_entry_points, 'entry point')}
                {diff.summary.storage_layout_changes
                  ? ` and moves ${plural(diff.summary.storage_layout_changes, 'storage slot')}`
                  : ''}
                .
              </p>
              {(diff.warnings ?? []).map((w, i) => (
                <p key={i} className="mt-3 flex gap-2 text-caption text-text-secondary">
                  <Dot color="var(--medium)" className="mt-1" />
                  {w}
                </p>
              ))}
              {overview && (
                <div className="mt-8 border-t border-border-subtle pt-6">
                  <MarkdownRenderer content={overview.replace(/^# .*\n+/, '')} />
                </div>
              )}
              {fixReview && (
                <button
                  type="button"
                  onClick={() => setSection('fixes')}
                  className="mt-8 flex w-full items-center gap-3 border-y border-border-subtle py-3 text-left hover:border-border-default"
                >
                  <span className="flex-1 text-body text-text-primary">
                    Fix review of {fixReview.to_commit.slice(0, 8)}:{' '}
                    <span className="text-text-secondary">{fixSummary(fixReview)}</span>
                  </span>
                </button>
              )}
            </div>
          )}

          {section === 'storage' && diff && (
            <Rows
              title="Storage layout"
              hint="Slots that moved. Behind a proxy, an upgrade would read these from the wrong place."
            >
              {diff.storage_layout_changes.map((l, i) => (
                <ContentRow
                  key={i}
                  selected={sel?.kind === 'storage' && sel.i === i}
                  onClick={() => setSel({ kind: 'storage', i })}
                  leading={<Dot color="var(--high)" />}
                  title={<InlineMarkdown>{l.detail}</InlineMarkdown>}
                  subtitle={`${l.contract} · ${l.kind.replace(/_/g, ' ')}`}
                />
              ))}
            </Rows>
          )}

          {section === 'code' && diff && (
            <Rows
              title="Changed code"
              hint={diff.files
                .map((f) => `${f.path} (+${f.additions} −${f.deletions})`)
                .join(' · ')}
            >
              {groupBy(
                diff.changes.map((c, i) => ({ c, i })),
                (x) => x.c.contract,
              ).map(([contract, items]) => (
                <div key={contract}>
                  <ListGroupLabel>{contract}</ListGroupLabel>
                  {items.map(({ c, i }) => (
                    <ContentRow
                      key={i}
                      selected={sel?.kind === 'change' && sel.i === i}
                      onClick={() => setSel({ kind: 'change', i })}
                      leading={<Dot color={CHANGE_COLOR[c.change]} title={CHANGE_WORD[c.change]} />}
                      title={
                        <span className="font-mono text-caption text-text-primary">{c.entity}</span>
                      }
                      subtitle={`${c.kind.replace('_', ' ')} · ${CHANGE_WORD[c.change] ?? c.change}`}
                    />
                  ))}
                </div>
              ))}
            </Rows>
          )}

          {section === 'impact' && diff && (
            <Rows
              title="Impact"
              hint="Every function the change reaches: changed code first, then callers, modifier users, readers of changed state and inherited entry points."
              control={
                <SegmentedControl
                  segments={[
                    { value: 'entry', label: 'Entry points' },
                    { value: 'all', label: 'All', count: diff.impacted.length },
                  ]}
                  value={impactScope}
                  onChange={setImpactScope}
                />
              }
            >
              {impactRows.map(({ it, i }) => {
                const id = `${it.contract}.${it.function}`;
                const st = reviewStates[id] as ReviewState | undefined;
                return (
                  <ContentRow
                    key={i}
                    selected={sel?.kind === 'impact' && sel.i === i}
                    onClick={() => setSel({ kind: 'impact', i })}
                    leading={st ? <StateGlyph state={st} /> : <span className="h-3.5 w-3.5" />}
                    title={
                      <span>
                        {it.contract}.
                        <span className="font-medium">{it.function.split('(')[0]}</span>
                      </span>
                    }
                    subtitle={
                      it.depth === 0
                        ? `Changed · ${it.reasons[0]?.via ?? ''}`
                        : `${plural(it.depth, 'hop')} · ${REASON[it.reasons[0]?.kind] ?? ''} ${it.reasons[0]?.via ?? ''}`
                    }
                    trailing={it.is_entry_point ? 'Entry point' : it.visibility}
                  />
                );
              })}
            </Rows>
          )}

          {section === 'prior' && prior && (
            <Rows
              title="Prior findings"
              hint="Findings from the previous audit, checked against this change."
            >
              {prior.items.map((p, i) => (
                <ContentRow
                  key={p.id}
                  selected={sel?.kind === 'prior' && sel.i === i}
                  onClick={() => setSel({ kind: 'prior', i })}
                  leading={<SeverityDot severity={p.severity} label={false} />}
                  title={p.title}
                  subtitle={`${p.id} · ${PRIOR[p.status]?.label ?? p.status}`}
                  trailing={
                    <Dot
                      color={PRIOR[p.status]?.color ?? 'var(--neutral)'}
                      title={PRIOR[p.status]?.label}
                    />
                  }
                />
              ))}
            </Rows>
          )}

          {section === 'fixes' && fixReview && (
            <>
              <Rows
                title="Fix review"
                hint={`${fixReview.from_commit.slice(0, 8)} → ${fixReview.to_commit.slice(0, 8)} · ${fixSummary(fixReview)}. Read-only here; the CLI skill applies the proposals.`}
              >
                {fixReview.cards.map((c, i) => (
                  <ContentRow
                    key={c.id}
                    selected={sel?.kind === 'fix' && sel.i === i}
                    onClick={() => setSel({ kind: 'fix', i })}
                    leading={
                      <Dot
                        color={FIX[c.status]?.color ?? 'var(--neutral)'}
                        title={FIX[c.status]?.label}
                      />
                    }
                    title={c.title}
                    subtitle={`${c.id}${c.github_issue ? ` · #${c.github_issue}` : ''} · ${FIX[c.status]?.label ?? c.status}${c.applied_at ? ' · applied' : ''}`}
                    trailing={<SeverityDot severity={c.severity} />}
                  />
                ))}
              </Rows>
              {fixReview.unmapped_changes.length > 0 && (
                <Rows
                  title="Changes no card explains"
                  hint="Fix-commit code that needs a review of its own."
                >
                  {fixReview.unmapped_changes.map((u, i) => (
                    <ContentRow
                      key={i}
                      selected={sel?.kind === 'unmapped' && sel.i === i}
                      onClick={() => setSel({ kind: 'unmapped', i })}
                      leading={
                        <Dot
                          color={u.reviewed ? 'var(--success)' : 'var(--medium)'}
                          title={u.reviewed ? 'Reviewed' : 'Needs review'}
                        />
                      }
                      title={
                        <span className="font-mono text-caption text-text-primary">{u.entity}</span>
                      }
                      subtitle={`${u.contract} · ${u.kind} ${u.change}${u.reviewed ? ' · reviewed' : ''}`}
                    />
                  ))}
                </Rows>
              )}
            </>
          )}
        </div>
      </ScrollArea>
    </SplitView>
  );
}

function fixSummary(f: FixReview): string {
  const s = f.summary;
  return [
    s.fixed ? `${s.fixed} fixed` : null,
    s.partially_fixed ? `${s.partially_fixed} partially fixed` : null,
    s.not_fixed ? `${s.not_fixed} not fixed` : null,
    s.unaddressed ? `${s.unaddressed} unaddressed` : null,
    s.unknown ? `${s.unknown} unknown` : null,
    s.unmapped ? plural(s.unmapped, 'unmapped change') : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

function groupBy<T>(items: T[], key: (t: T) => string): Array<[string, T[]]> {
  const m = new Map<string, T[]>();
  for (const it of items) m.set(key(it), [...(m.get(key(it)) ?? []), it]);
  return Array.from(m.entries());
}

function Rows({
  title,
  hint,
  control,
  children,
}: {
  title: string;
  hint?: string;
  control?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rise-in mb-10">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-heading font-medium text-text-primary">{title}</h2>
          {hint && <p className="mt-0.5 text-caption text-text-tertiary">{hint}</p>}
        </div>
        {control}
      </div>
      <div className="-mx-2">{children}</div>
    </section>
  );
}

function ContentRow({
  selected,
  onClick,
  leading,
  title,
  subtitle,
  trailing,
}: {
  selected: boolean;
  onClick: () => void;
  leading?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  trailing?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-3 rounded-md px-2 py-2 text-left',
        selected ? 'bg-accent-subtle' : 'hover:bg-surface-1',
      )}
    >
      {leading && <span className="flex w-4 shrink-0 justify-center">{leading}</span>}
      <span className="min-w-0 flex-1">
        <span
          className={cn('block truncate text-body', selected ? 'text-accent' : 'text-text-primary')}
        >
          {title}
        </span>
        {subtitle && (
          <span className="block truncate text-caption text-text-tertiary">{subtitle}</span>
        )}
      </span>
      {trailing && <span className="shrink-0 text-caption text-text-tertiary">{trailing}</span>}
    </button>
  );
}

// ─── Inspector ──────────────────────────────────────────────────────

function ReviewLink({ id, states }: { id: string; states: Record<string, string> }) {
  const st = states[id] as ReviewState | undefined;
  if (!st) return null;
  return (
    <Link
      href={`/review?fn=${encodeURIComponent(id)}`}
      className="inline-flex h-8 items-center gap-2 rounded-md border border-border-default bg-surface-0 px-3 text-body font-medium text-text-primary shadow-sm hover:bg-surface-2"
    >
      <StateGlyph state={st} /> Open in Review
    </Link>
  );
}

function ChangeInspector({
  sel,
  diff,
  prior,
  fixReview,
  reviewStates,
  onClose,
}: {
  sel: Sel;
  diff: DiffData | null;
  prior: PriorReview | null;
  fixReview: FixReview | null;
  reviewStates: Record<string, string>;
  onClose: () => void;
}) {
  if (sel.kind === 'change' && diff) {
    const c = diff.changes[sel.i];
    const id = `${c.contract}.${c.entity}`;
    return (
      <Inspector
        eyebrow={`${c.contract} · ${c.kind.replace('_', ' ')}`}
        title={<span className="font-mono text-body">{c.entity}</span>}
        subtitle={CHANGE_WORD[c.change]}
        onClose={onClose}
        actions={<ReviewLink id={id} states={reviewStates} />}
      >
        <InspectorSection label="Where">
          {c.change !== 'removed' && c.line_start ? (
            <CodeReference file={c.file} lineStart={c.line_start} lineEnd={c.line_end} />
          ) : (
            <span className="font-mono text-caption text-text-secondary">{c.file}</span>
          )}
        </InspectorSection>
      </Inspector>
    );
  }
  if (sel.kind === 'impact' && diff) {
    const it = diff.impacted[sel.i];
    const id = `${it.contract}.${it.function}`;
    return (
      <Inspector
        eyebrow={`${it.contract} · ${it.is_entry_point ? 'Entry point' : it.visibility}`}
        title={it.function.split('(')[0]}
        subtitle={<span className="font-mono">{it.function}</span>}
        onClose={onClose}
        actions={<ReviewLink id={id} states={reviewStates} />}
      >
        <InspectorSection label="Why it is impacted">
          <ul className="space-y-1.5">
            {it.reasons.map((r, i) => (
              <li key={i} className="text-body text-text-secondary">
                {REASON[r.kind] ?? r.kind}{' '}
                <span className="font-mono text-caption text-text-primary">{r.via}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-caption text-text-tertiary">
            {it.depth === 0
              ? 'Changed itself'
              : `${plural(it.depth, 'hop')} from the nearest change`}{' '}
            · {it.confidence} confidence
          </p>
        </InspectorSection>
        <InspectorSection label="Where">
          <CodeReference file={it.file} lineStart={it.line_start} />
        </InspectorSection>
      </Inspector>
    );
  }
  if (sel.kind === 'storage' && diff) {
    const l = diff.storage_layout_changes[sel.i];
    return (
      <Inspector
        eyebrow={l.contract}
        title={l.kind.replace(/_/g, ' ').replace(/^./, (m) => m.toUpperCase())}
        onClose={onClose}
      >
        <InspectorSection label="Detail">
          <p className="text-body text-text-secondary">
            <InlineMarkdown>{l.detail}</InlineMarkdown>
          </p>
          <p className="mt-2 font-mono text-caption text-text-tertiary">{l.file}</p>
        </InspectorSection>
      </Inspector>
    );
  }
  if (sel.kind === 'prior' && prior) {
    const p = prior.items[sel.i];
    return (
      <Inspector
        eyebrow={`${p.id} · prior audit`}
        title={p.title}
        subtitle={<SeverityDot severity={p.severity} />}
        onClose={onClose}
        actions={
          p.issue_id ? (
            <Link
              href={`/issues?card=${encodeURIComponent(p.issue_id)}`}
              className="inline-flex h-8 items-center rounded-md border border-border-default bg-surface-0 px-3 text-body font-medium text-text-primary shadow-sm hover:bg-surface-2"
            >
              Open card {p.issue_id}
            </Link>
          ) : undefined
        }
      >
        <InspectorSection label={PRIOR[p.status]?.label ?? p.status}>
          <p className="text-body text-text-secondary">{p.reasoning}</p>
        </InspectorSection>
      </Inspector>
    );
  }
  if (sel.kind === 'fix' && fixReview) {
    const c = fixReview.cards[sel.i];
    return (
      <Inspector
        eyebrow={`${c.id}${c.github_issue ? ` · #${c.github_issue}` : ''}`}
        title={c.title}
        subtitle={<SeverityDot severity={c.severity} />}
        onClose={onClose}
        actions={
          <Link
            href={`/issues?card=${encodeURIComponent(c.id)}`}
            className="inline-flex h-8 items-center rounded-md border border-border-default bg-surface-0 px-3 text-body font-medium text-text-primary shadow-sm hover:bg-surface-2"
          >
            Open card
          </Link>
        }
      >
        <InspectorSection label="Status">
          <p className="flex items-center gap-2 text-body text-text-primary">
            <Dot color={FIX[c.status]?.color ?? 'var(--neutral)'} />
            {FIX[c.status]?.label ?? c.status}
          </p>
          {c.evidence && <p className="mt-1.5 text-body text-text-secondary">{c.evidence}</p>}
        </InspectorSection>
        {(c.poc.file || c.poc.before || c.poc.after) && (
          <InspectorSection label="Proof of concept">
            {c.poc.file && (
              <p className="truncate font-mono text-caption text-text-secondary">{c.poc.file}</p>
            )}
            {c.poc.before && (
              <InspectorField label="Audited">
                {POC_WORD[c.poc.before] ?? c.poc.before}
              </InspectorField>
            )}
            {c.poc.after && (
              <InspectorField label="Fixed">{POC_WORD[c.poc.after] ?? c.poc.after}</InspectorField>
            )}
          </InspectorSection>
        )}
        {(c.changed_functions.length > 0 || c.commits.length > 0) && (
          <InspectorSection label="Changed by">
            {c.changed_functions.map((f) => (
              <Link
                key={f}
                href={`/review?fn=${encodeURIComponent(f)}`}
                className="-mx-1.5 block truncate rounded-md px-1.5 py-1 text-body text-text-primary hover:bg-surface-2"
              >
                {f.split('(')[0]}
              </Link>
            ))}
            {c.commits.length > 0 && (
              <p className="mt-1 font-mono text-caption text-text-tertiary">
                {c.commits.join(', ')}
              </p>
            )}
          </InspectorSection>
        )}
        {(c.proposed.resolution || c.proposed.update_from_client) && (
          <InspectorSection label={c.applied_at ? 'Applied to GitHub' : 'Proposed'}>
            {c.proposed.resolution && (
              <InspectorField label="Resolution">{c.proposed.resolution}</InspectorField>
            )}
            {c.proposed.update_from_client && (
              <p className="mt-1 text-body text-text-secondary">{c.proposed.update_from_client}</p>
            )}
            {c.applied_at && (
              <p className="mt-1 text-caption text-text-tertiary">
                <LocalTime iso={c.applied_at} />
              </p>
            )}
          </InspectorSection>
        )}
      </Inspector>
    );
  }
  if (sel.kind === 'unmapped' && fixReview) {
    const u = fixReview.unmapped_changes[sel.i];
    return (
      <Inspector
        eyebrow={`${u.contract} · ${u.kind} ${u.change}`}
        title={<span className="font-mono text-body">{u.entity}</span>}
        onClose={onClose}
      >
        <InspectorSection label="Where">
          <p className="font-mono text-caption text-text-secondary">{u.file}</p>
        </InspectorSection>
        {u.impacted_entry_points.length > 0 && (
          <InspectorSection label="Reaches">
            {u.impacted_entry_points.map((e) => (
              <Link
                key={e}
                href={`/review?fn=${encodeURIComponent(e)}`}
                className="-mx-1.5 block truncate rounded-md px-1.5 py-1 text-body text-text-primary hover:bg-surface-2"
              >
                {e.split('(')[0]}
              </Link>
            ))}
          </InspectorSection>
        )}
        <InspectorSection label="Review">
          <p className="text-body text-text-secondary">
            {u.reviewed ? 'Reviewed.' : 'Not reviewed yet.'}
          </p>
          {u.note && <p className="mt-1 text-body text-text-secondary">{u.note}</p>}
        </InspectorSection>
      </Inspector>
    );
  }
  return <EmptyState sentence="Nothing selected." />;
}
