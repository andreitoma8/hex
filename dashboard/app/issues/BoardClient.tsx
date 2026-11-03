'use client';

import { LocalTime } from '@/components/ui/LocalTime';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { SplitView, Toolbar } from '@/components/ui/SplitView';
import { Inspector, InspectorField, InspectorSection } from '@/components/ui/Inspector';
import { SearchField } from '@/components/ui/SearchField';
import { SegmentedControl, type Segment } from '@/components/ui/SegmentedControl';
import { SeverityDot } from '@/components/ui/SeverityDot';
import { Chip } from '@/components/ui/Chip';
import { Button } from '@/components/ui/Button';
import { Kbd } from '@/components/ui/Kbd';
import { useToast } from '@/components/ui/Toast';
import { IconChevron, IconExternal } from '@/components/ui/Icons';
import { MarkdownRenderer } from '@/components/MarkdownRenderer';
import { useHotkeys } from '@/lib/hotkeys';
import { setFocus } from '@/lib/focus';
import { replaceQuery } from '@/lib/url';
import { sendJson } from '@/lib/api';
import { cn } from '@/lib/cn';
import { findingToHackmd, type FormatContext } from '@/lib/finding-markdown';
import { SEVERITY_ORDER, SOURCE_LABEL, type BoardColumn, type BoardIssue } from '@/lib/types';

interface Rule {
  id: string;
  kind: string;
  text: string;
  scope: string[];
}

const COLUMNS: Array<{ id: BoardColumn; label: string; hint: string }> = [
  { id: 'potential', label: 'Potential', hint: 'Awaiting validation' },
  { id: 'verified', label: 'Verified', hint: 'Confirmed, ready to sync' },
  { id: 'synced', label: 'Synced', hint: 'On GitHub; edit there' },
  { id: 'invalid', label: 'Rejected', hint: 'Not in the report' },
  { id: 'duplicate', label: 'Duplicate', hint: 'Covered by another card' },
];

const COLUMN_LABEL: Record<BoardColumn, string> = Object.fromEntries(
  COLUMNS.map((c) => [c.id, c.label]),
) as Record<BoardColumn, string>;

const STATUS_FOR: Record<BoardColumn, string> = {
  potential: 'pending_validation',
  verified: 'verified',
  synced: 'synced',
  invalid: 'rejected',
  duplicate: 'duplicate',
};

const RULE_KIND: Record<string, string> = {
  out_of_scope: 'Out of scope',
  trusted_role: 'Trusted role',
  by_design: 'By design',
  known_issue: 'Known issue',
};

const VERDICT: Record<string, string> = {
  reproduced: 'Reproduced',
  refuted: 'Refuted',
  uncertain: 'Uncertain',
  valid_no_poc: 'Valid, no PoC',
};

const SEVERITIES = ['Critical', 'High', 'Medium', 'Low', 'Info'] as const;
const RESOLUTIONS = ['Fixed', 'Mitigated', 'Acknowledged', 'Not Fixed', 'Unresolved'];

/** At most one status chip per card: auto-moved › PoC › duplicate. */
function statusChip(c: BoardIssue): React.ReactNode {
  if (c.validation?.auto_moved_to) return <Chip>Auto-moved</Chip>;
  if (c.poc_status === 'passing') return <Chip tone="ok">PoC ✓</Chip>;
  if (c.poc_status === 'failing') return <Chip tone="danger">PoC ✕</Chip>;
  if (c.duplicate_of) return <Chip>Dup of {c.duplicate_of}</Chip>;
  return null;
}

export function BoardClient({
  issues,
  rules,
  formatCtx,
}: {
  issues: BoardIssue[];
  rules: Rule[];
  formatCtx: FormatContext;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();

  // Optimistic column moves, dropped when fresh props arrive.
  const [moves, setMoves] = useState<Record<string, BoardColumn>>({});
  useEffect(() => setMoves({}), [issues]);
  const live = useMemo(
    () =>
      issues.map((i) =>
        moves[i.id] ? { ...i, column: moves[i.id], status: STATUS_FOR[moves[i.id]] } : i,
      ),
    [issues, moves],
  );

  const [query, setQuery] = useState('');
  const [source, setSource] = useState<string>('all');
  const [collapsed, setCollapsed] = useState<Record<BoardColumn, boolean>>({
    potential: false,
    verified: false,
    synced: false,
    invalid: true,
    duplicate: true,
  });
  const [selectedId, setSelectedId] = useState<string | null>(() => params.get('card'));
  const [editing, setEditing] = useState(false);
  const [showRules, setShowRules] = useState(false);

  useEffect(() => {
    const id = params.get('card');
    if (id) setSelectedId(id);
  }, [params]);

  const selected = live.find((i) => i.id === selectedId) ?? null;

  useEffect(() => {
    replaceQuery({ card: selected?.id ?? null });
    if (selected) setFocus({ ref: selected.id, kind: 'card', label: selected.title });
    setEditing(false);
  }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Open the column that holds a deep-linked card.
  useEffect(() => {
    if (selected && collapsed[selected.column])
      setCollapsed((c) => ({ ...c, [selected.column]: false }));
  }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const sources = useMemo(() => {
    const present = Array.from(new Set(issues.map((i) => i.source)));
    return present.sort((a, b) => (SOURCE_LABEL[a] ?? a).localeCompare(SOURCE_LABEL[b] ?? b));
  }, [issues]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return live.filter(
      (i) =>
        (source === 'all' || i.source === source) &&
        (!q || `${i.id} ${i.title} ${i.description}`.toLowerCase().includes(q)),
    );
  }, [live, query, source]);

  const grouped = useMemo(() => {
    const m: Record<BoardColumn, BoardIssue[]> = {
      potential: [],
      verified: [],
      synced: [],
      invalid: [],
      duplicate: [],
    };
    for (const i of filtered) m[i.column].push(i);
    for (const col of Object.values(m)) {
      col.sort(
        (a, b) =>
          (SEVERITY_ORDER[a.severity] ?? 5) - (SEVERITY_ORDER[b.severity] ?? 5) ||
          a.id.localeCompare(b.id),
      );
    }
    return m;
  }, [filtered]);

  const order = useMemo(
    () => COLUMNS.filter((c) => !collapsed[c.id]).flatMap((c) => grouped[c.id].map((i) => i.id)),
    [grouped, collapsed],
  );

  const move = useCallback(
    async (id: string, to: BoardColumn, opts: { undoable?: boolean } = { undoable: true }) => {
      const current = live.find((i) => i.id === id);
      if (!current || current.column === to) return;
      const from = current.column;
      setMoves((m) => ({ ...m, [id]: to }));
      try {
        await sendJson(`/api/issues/${encodeURIComponent(id)}/move`, { column: to });
        if (opts.undoable) {
          toast({
            message: `${id} moved to ${COLUMN_LABEL[to]}`,
            action: {
              label: 'Undo',
              onClick: () => {
                setMoves((m) => ({ ...m, [id]: from }));
                void sendJson(`/api/issues/${encodeURIComponent(id)}/move`, { column: from }).then(
                  () => router.refresh(),
                );
              },
            },
          });
        }
        router.refresh();
      } catch (err) {
        setMoves((m) => {
          const next = { ...m };
          delete next[id];
          return next;
        });
        toast({ message: (err as Error).message, tone: 'error' });
      }
    },
    [live, router, toast],
  );

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over) return;
    const to = e.over.id as BoardColumn;
    const card = live.find((i) => i.id === e.active.id);
    if (!card || card.column === to || to === 'synced' || card.column === 'synced') return;
    void move(card.id, to);
  };

  const boardRef = useRef<HTMLDivElement>(null);
  const select = (id: string | null) => {
    setSelectedId(id);
    if (id)
      requestAnimationFrame(() =>
        boardRef.current
          ?.querySelector<HTMLElement>(`[data-card="${CSS.escape(id)}"]`)
          ?.scrollIntoView({ block: 'nearest' }),
      );
  };

  useHotkeys({
    j: () => {
      const i = selectedId ? order.indexOf(selectedId) : -1;
      if (order.length) select(order[Math.min(order.length - 1, i + 1)]);
    },
    k: () => {
      const i = selectedId ? order.indexOf(selectedId) : 0;
      if (order.length) select(order[Math.max(0, i - 1)]);
    },
    e: (e) => {
      if (selected && selected.column !== 'synced') {
        e.preventDefault();
        setEditing(true);
      }
    },
    Escape: () => {
      if (editing) setEditing(false);
      else if (showRules) setShowRules(false);
      else select(null);
    },
  });

  const segments: Segment<string>[] = [
    { value: 'all', label: 'All' },
    ...sources.map((s) => ({ value: s, label: SOURCE_LABEL[s] ?? s })),
  ];

  return (
    <SplitView
      toolbar={
        <Toolbar title="Board" meta={`${issues.length} card${issues.length === 1 ? '' : 's'}`}>
          <SearchField
            value={query}
            onChange={setQuery}
            placeholder="Search cards"
            className="w-56"
          />
          {sources.length > 1 && (
            <SegmentedControl
              segments={segments}
              value={source}
              onChange={setSource}
              ariaLabel="Source"
            />
          )}
        </Toolbar>
      }
      inspector={
        selected ? (
          <CardInspector
            key={selected.id}
            card={selected}
            editing={editing}
            setEditing={setEditing}
            formatCtx={formatCtx}
            onClose={() => select(null)}
            onReverted={() => setMoves((m) => ({ ...m, [selected.id]: 'potential' }))}
          />
        ) : undefined
      }
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <DndContext sensors={sensors} onDragEnd={onDragEnd}>
          <div ref={boardRef} className="flex min-h-0 flex-1 gap-5 overflow-x-auto px-5 pt-4">
            {COLUMNS.map((col) => (
              <Column
                key={col.id}
                column={col}
                cards={grouped[col.id]}
                collapsed={collapsed[col.id]}
                onToggle={() => setCollapsed((c) => ({ ...c, [col.id]: !c[col.id] }))}
                selectedId={selectedId}
                onSelect={select}
              />
            ))}
          </div>
        </DndContext>
        <footer className="relative flex shrink-0 items-center gap-3 border-t border-border-subtle px-5 py-2 text-caption text-text-tertiary">
          <button
            type="button"
            onClick={() => setShowRules((v) => !v)}
            className="rounded-md px-1.5 py-0.5 hover:bg-surface-2 hover:text-text-primary"
            aria-expanded={showRules}
          >
            {rules.length
              ? `${rules.length} triage rule${rules.length === 1 ? '' : 's'}`
              : 'No triage rules'}
          </button>
          <span className="hidden truncate sm:inline">
            Drag a card to move it · <Kbd>j</Kbd> <Kbd>k</Kbd> to step · <Kbd>e</Kbd> to edit
          </span>
          {showRules && (
            <div className="rise-in absolute bottom-10 left-4 z-20 w-[min(420px,calc(100vw-2rem))] rounded-lg border border-border-default bg-surface-1 p-4 shadow-lg">
              <div className="mb-2 text-body font-medium text-text-primary">Triage rules</div>
              {rules.length === 0 ? (
                <p className="text-body text-text-secondary">
                  Standing decisions that keep AI runs from resurfacing the same false positives.
                  Add one with <code className="font-mono text-caption">hex rule add</code>.
                </p>
              ) : (
                <ul className="space-y-2">
                  {rules.map((r) => (
                    <li key={r.id} className="text-body">
                      <span className="text-text-primary">{r.text}</span>
                      <span className="block text-caption text-text-tertiary">
                        {r.id} · {RULE_KIND[r.kind] ?? r.kind}
                        {r.scope.length ? ` · ${r.scope.join(', ')}` : ' · whole audit'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </footer>
      </div>
    </SplitView>
  );
}

function Column({
  column,
  cards,
  collapsed,
  onToggle,
  selectedId,
  onSelect,
}: {
  column: { id: BoardColumn; label: string; hint: string };
  cards: BoardIssue[];
  collapsed: boolean;
  onToggle: () => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: column.id, disabled: column.id === 'synced' });

  if (collapsed) {
    return (
      <section
        ref={setNodeRef}
        aria-label={column.label}
        className={cn(
          'flex w-10 shrink-0 flex-col items-center rounded-lg pb-4 pt-1',
          isOver ? 'bg-accent-subtle' : 'hover:bg-surface-1',
        )}
      >
        <button
          type="button"
          onClick={onToggle}
          title={`Show ${column.label}`}
          className="flex h-full w-full flex-col items-center gap-2 pt-1 text-text-tertiary hover:text-text-primary"
        >
          <IconChevron className="h-3.5 w-3.5" />
          <span className="text-caption tabular-nums">{cards.length}</span>
          <span className="text-caption font-medium [writing-mode:vertical-rl]">
            {column.label}
          </span>
        </button>
      </section>
    );
  }

  return (
    <section
      ref={setNodeRef}
      aria-label={column.label}
      className={cn(
        'flex min-w-[200px] max-w-[360px] flex-1 flex-col rounded-lg',
        isOver && 'bg-accent-subtle',
      )}
    >
      <header className="flex shrink-0 items-baseline gap-2 px-1 pb-3 pt-1" title={column.hint}>
        <h2 className="text-heading font-medium text-text-primary">{column.label}</h2>
        <span className="text-caption tabular-nums text-text-tertiary">{cards.length}</span>
        {(column.id === 'invalid' || column.id === 'duplicate') && (
          <button
            type="button"
            onClick={onToggle}
            className="ml-auto rounded px-1 text-caption text-text-tertiary hover:text-text-primary"
          >
            Hide
          </button>
        )}
      </header>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pb-6">
        {cards.map((c) => (
          <Card key={c.id} card={c} selected={c.id === selectedId} onSelect={onSelect} />
        ))}
        {cards.length === 0 && (
          <div className="rounded-lg border border-dashed border-border-subtle px-3 py-6 text-center text-caption text-text-tertiary">
            {column.hint}
          </div>
        )}
      </div>
    </section>
  );
}

function Card({
  card,
  selected,
  onSelect,
}: {
  card: BoardIssue;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const locked = card.column === 'synced';
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: card.id,
    disabled: locked,
  });
  const style: React.CSSProperties = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 40 }
    : {};
  return (
    <article
      ref={setNodeRef}
      data-card={card.id}
      style={style}
      {...(locked ? {} : attributes)}
      {...(locked ? {} : listeners)}
      onClick={() => !transform && onSelect(card.id)}
      className={cn(
        'cursor-pointer select-none rounded-lg border bg-surface-1 px-3 py-2.5',
        selected ? 'border-accent' : 'border-border-subtle hover:border-border-default',
        isDragging && 'shadow-lg',
      )}
    >
      <h3 className="line-clamp-3 text-body text-text-primary">{card.title}</h3>
      <div className="mt-2 flex items-center gap-2 text-caption text-text-tertiary">
        <SeverityDot severity={card.severity} className="text-text-secondary" />
        <span className="min-w-0 truncate">
          {card.id} · {SOURCE_LABEL[card.source] ?? card.source}
        </span>
        <span className="ml-auto">{statusChip(card)}</span>
      </div>
    </article>
  );
}

// ─── Inspector ──────────────────────────────────────────────────────

function CardInspector({
  card,
  editing,
  setEditing,
  formatCtx,
  onClose,
  onReverted,
}: {
  card: BoardIssue;
  editing: boolean;
  setEditing: (v: boolean) => void;
  formatCtx: FormatContext;
  onClose: () => void;
  onReverted: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const locked = card.column === 'synced';
  const v = card.validation;

  const revert = async () => {
    try {
      await sendJson(`/api/issues/${encodeURIComponent(card.id)}/revert-auto`, {});
      onReverted();
      toast({ message: `${card.id} is back in Potential` });
      router.refresh();
    } catch (err) {
      toast({ message: (err as Error).message, tone: 'error' });
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(findingToHackmd(card, formatCtx));
      toast({ message: 'Copied as HackMD' });
    } catch {
      toast({ message: 'Clipboard is not available here', tone: 'error' });
    }
  };

  if (editing) return <CardEditor card={card} onDone={() => setEditing(false)} onClose={onClose} />;

  return (
    <Inspector
      eyebrow={`${card.id} · ${SOURCE_LABEL[card.source] ?? card.source} · ${COLUMN_LABEL[card.column]}`}
      title={card.title}
      subtitle={<SeverityDot severity={card.severity} className="text-text-secondary" />}
      onClose={onClose}
      actions={
        <>
          <Button
            onClick={() => setEditing(true)}
            disabled={locked}
            title={locked ? 'Synced to GitHub: edit it there' : undefined}
          >
            Edit <Kbd>e</Kbd>
          </Button>
          <Button variant="ghost" onClick={copy}>
            Copy as HackMD
          </Button>
          {card.github_issue_url && (
            <a
              href={card.github_issue_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-body text-text-secondary hover:bg-surface-2 hover:text-text-primary"
            >
              #{card.github_issue_number} <IconExternal className="h-3.5 w-3.5" />
            </a>
          )}
        </>
      }
    >
      {v?.auto_moved_to && (
        <div className="mb-4 rounded-lg bg-surface-2 px-3 py-2.5">
          <p className="text-body text-text-primary">
            An agent moved this card to {v.auto_moved_to === 'verified' ? 'Verified' : 'Rejected'}
            {v.auto_moved_to === 'verified' && v.poc_status === 'passing'
              ? ' after its PoC passed'
              : ''}
            {v.auto_moved_to === 'rejected' && v.refuters
              ? ` after ${v.refuters} refuters agreed`
              : ''}
            .
          </p>
          <Button size="sm" variant="secondary" onClick={revert} className="mt-2">
            Revert to Potential
          </Button>
        </div>
      )}

      {v && (
        <InspectorSection label="Validation">
          {v.verdict && (
            <InspectorField label="Verdict">{VERDICT[v.verdict] ?? v.verdict}</InspectorField>
          )}
          {v.validated_by && (
            <InspectorField label="By">
              {v.validated_by === 'agent' ? 'An agent' : 'The auditor'}
            </InspectorField>
          )}
          {(v.poc_file || card.poc_file) && (
            <InspectorField label="PoC">
              <span className="font-mono text-caption">{v.poc_file ?? card.poc_file}</span>
              {(v.poc_status ?? card.poc_status) && (
                <span className="ml-2 text-caption text-text-tertiary">
                  {(v.poc_status ?? card.poc_status)?.replace('_', ' ')}
                </span>
              )}
            </InspectorField>
          )}
          {v.memo && (
            <InspectorField label="Memo">
              <span className="font-mono text-caption">{v.memo}</span>
            </InspectorField>
          )}
          {v.reverted_at && (
            <InspectorField label="Reverted">
              <LocalTime iso={v.reverted_at} />
            </InspectorField>
          )}
        </InspectorSection>
      )}

      {card.description && (
        <InspectorSection label="Description">
          <MarkdownRenderer content={card.description} />
        </InspectorSection>
      )}
      {card.recommendation && (
        <InspectorSection label="Recommendation">
          <MarkdownRenderer content={card.recommendation} />
        </InspectorSection>
      )}
      {(card.resolution || card.update_from_client) && (
        <InspectorSection label="Client response">
          {card.resolution && <InspectorField label="Status">{card.resolution}</InspectorField>}
          {card.update_from_client && (
            <p className="mt-1 text-body text-text-secondary">{card.update_from_client}</p>
          )}
        </InspectorSection>
      )}

      {(card.functions.length > 0 || card.code_locations.length > 0) && (
        <InspectorSection label="Code">
          {card.functions.map((fn) => (
            <Link
              key={fn}
              href={`/review?fn=${encodeURIComponent(fn)}`}
              className="-mx-1.5 flex items-center justify-between gap-2 rounded-md px-1.5 py-1 text-body text-text-primary hover:bg-surface-2"
            >
              <span className="truncate">{fn.split('(')[0]}</span>
              <span className="shrink-0 text-caption text-text-tertiary">Review</span>
            </Link>
          ))}
          {card.functions.length === 0 &&
            Array.from(new Set(card.code_locations.map((l) => l.file))).map((f) => (
              <p key={f} className="truncate font-mono text-caption text-text-secondary">
                {f}
              </p>
            ))}
        </InspectorSection>
      )}

      {(card.duplicate_of || card.match_signals) && (
        <InspectorSection label="Duplicate">
          {card.duplicate_of && <InspectorField label="Of">{card.duplicate_of}</InspectorField>}
          {card.match_signals && (
            <p className="mt-1 text-caption text-text-secondary">
              Contract {card.match_signals.contract ? 'matches' : 'differs'} · function{' '}
              {card.match_signals.function ? 'matches' : 'differs'} · root cause{' '}
              {card.match_signals.root_cause} · attack vector {card.match_signals.attack_vector}
            </p>
          )}
          {card.reasoning && <p className="mt-1 text-body text-text-secondary">{card.reasoning}</p>}
        </InspectorSection>
      )}

      {locked && (
        <p className="mt-2 text-caption text-text-tertiary">
          Synced to GitHub and read-only here. Edit it on GitHub, then run{' '}
          <code className="font-mono">/sync-issues</code>.
        </p>
      )}
    </Inspector>
  );
}

function CardEditor({
  card,
  onDone,
  onClose,
}: {
  card: BoardIssue;
  onDone: () => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [f, setF] = useState({
    title: card.title,
    severity: card.severity as string,
    resolution: card.resolution ?? '',
    description: card.description,
    recommendation: card.recommendation,
    update_from_client: card.update_from_client ?? '',
  });
  const [saving, setSaving] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  useEffect(() => titleRef.current?.focus(), []);

  const save = async () => {
    setSaving(true);
    try {
      await sendJson(
        `/api/issues/${encodeURIComponent(card.id)}`,
        {
          ...f,
          resolution: f.resolution || undefined,
          update_from_client: f.update_from_client || undefined,
        },
        'PATCH',
      );
      toast({ message: `${card.id} saved` });
      router.refresh();
      onDone();
    } catch (err) {
      toast({ message: (err as Error).message, tone: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const field =
    'w-full rounded-md border border-border-subtle bg-surface-0 px-2.5 py-1.5 text-body text-text-primary focus:border-border-emphasis focus:outline-none';

  return (
    <Inspector
      eyebrow={`Editing ${card.id}`}
      title={f.title || card.id}
      onClose={onClose}
      actions={
        <>
          <Button variant="primary" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
          <Button variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        </>
      }
    >
      <form
        className="space-y-4 border-t border-border-subtle pt-4"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void save();
          if (e.key === 'Escape') onDone();
        }}
      >
        <Label text="Title">
          <input
            ref={titleRef}
            className={field}
            value={f.title}
            onChange={(e) => setF({ ...f, title: e.target.value })}
          />
        </Label>
        <div className="grid grid-cols-2 gap-3">
          <Label text="Severity">
            <select
              className={field}
              value={f.severity}
              onChange={(e) => setF({ ...f, severity: e.target.value })}
            >
              {SEVERITIES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </Label>
          <Label text="Resolution">
            <select
              className={field}
              value={f.resolution}
              onChange={(e) => setF({ ...f, resolution: e.target.value })}
            >
              <option value="">None</option>
              {RESOLUTIONS.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </Label>
        </div>
        <Label text="Description">
          <textarea
            className={cn(field, 'leading-6')}
            rows={10}
            value={f.description}
            onChange={(e) => setF({ ...f, description: e.target.value })}
          />
        </Label>
        <Label text="Recommendation">
          <textarea
            className={cn(field, 'leading-6')}
            rows={4}
            value={f.recommendation}
            onChange={(e) => setF({ ...f, recommendation: e.target.value })}
          />
        </Label>
        <Label text="Update from the client">
          <textarea
            className={field}
            rows={3}
            value={f.update_from_client}
            placeholder="Used by /generate-report"
            onChange={(e) => setF({ ...f, update_from_client: e.target.value })}
          />
        </Label>
        <p className="text-caption text-text-tertiary">
          <Kbd>⌘</Kbd> <Kbd>↵</Kbd> to save · <Kbd>esc</Kbd> to cancel
        </p>
      </form>
    </Inspector>
  );
}

function Label({ text, children }: { text: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-caption text-text-tertiary">{text}</span>
      {children}
    </label>
  );
}
