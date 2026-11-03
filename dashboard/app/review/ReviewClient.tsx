'use client';

import { LocalTime } from '@/components/ui/LocalTime';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { SplitView, Toolbar } from '@/components/ui/SplitView';
import { Inspector, InspectorSection } from '@/components/ui/Inspector';
import { ListGroupLabel, ListRow } from '@/components/ui/ListRow';
import { SearchField } from '@/components/ui/SearchField';
import { SegmentedControl, type Segment } from '@/components/ui/SegmentedControl';
import { StateGlyph, STATE_LABEL } from '@/components/ui/StateGlyph';
import { SeverityDot } from '@/components/ui/SeverityDot';
import { RiskMeter } from '@/components/ui/RiskMeter';
import { Button } from '@/components/ui/Button';
import { Kbd } from '@/components/ui/Kbd';
import { EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { IconChevron } from '@/components/ui/Icons';
import { CodeViewer, type CodeViewerHandle } from '@/components/CodeViewer';
import { useCodeComments } from '@/components/CodeComments';
import { CodeReference } from '@/components/CodeReference';
import type { CodeNavHandlers, NavTarget, XrefDecl } from '@/components/CodeNav';
import { DianeNote } from '@/components/DianeNote';
import { MarkdownRenderer } from '@/components/MarkdownRenderer';
import { RecordButton } from '@/components/RecordButton';
import { useHotkeys } from '@/lib/hotkeys';
import { setFocus } from '@/lib/focus';
import { replaceQuery } from '@/lib/url';
import { sendJson } from '@/lib/api';
import { cn } from '@/lib/cn';
import type { CardRef, ContractNoteView, ReviewRow, ReviewState } from '@/lib/types';

export interface FnDetail {
  signature: string;
  kind: string;
  visibility: string;
  mutability: string;
  modifiers: string[];
  calls: string[];
  called_by: string[];
  /** Caller id → the caller's lines that make the call. */
  called_at?: Record<string, number[]>;
  external_calls: Array<{ target: string; member: string; kind: string; line: number }>;
  reads: string[];
  writes: string[];
  emits: string[];
}

export interface FnLabel {
  id: string;
  contract: string;
  name: string;
  file: string;
  line_start: number;
  line_end: number;
}

type Filter = 'all' | 'unread' | 'questioned' | 'changed' | 'blind';

/** A position that is not a review-map function: an interface, library code, a state variable. */
interface FileLoc {
  file: string;
  start: number;
  end: number;
  key?: string;
  name: string;
}

/** One step of the walked flow (the code header's trail). */
interface TrailEntry {
  label: string;
  via?: string;
  url: string;
}

const shortLabel = (t: { key?: string; name: string }) =>
  (t.key ?? t.name).replace(/\(.*$/, '').split('.').pop() ?? t.name;

interface Override {
  state: ReviewState;
  note?: string;
}

export function ReviewClient({
  rows,
  blindSpots,
  details,
  labels,
  cards,
  notes,
  diffMode,
  generalNote,
  pendingSessions,
}: {
  rows: ReviewRow[];
  blindSpots: string[];
  details: Record<string, FnDetail>;
  labels: Record<string, FnLabel>;
  cards: Record<string, CardRef>;
  notes: Record<string, ContractNoteView>;
  diffMode: boolean;
  generalNote: string;
  pendingSessions: number;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();

  // Optimistic marks, dropped whenever fresh rows arrive from the server.
  const [overrides, setOverrides] = useState<Record<string, Override>>({});
  useEffect(() => setOverrides({}), [rows]);

  const live: ReviewRow[] = useMemo(
    () =>
      rows.map((r) =>
        overrides[r.id]
          ? { ...r, state: overrides[r.id].state, note: overrides[r.id].note ?? r.note }
          : r,
      ),
    [rows, overrides],
  );
  const byId = useMemo(() => new Map(live.map((r) => [r.id, r])), [live]);

  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [showGeneral, setShowGeneral] = useState(false);

  const initial = useCallback((): string | null => {
    const fn = params.get('fn');
    if (fn && rows.some((r) => r.id === fn)) return fn;
    const contract = params.get('contract');
    if (contract) {
      const first = rows.find((r) => r.contract === contract);
      if (first) return first.id;
    }
    return blindSpots[0] ?? rows[0]?.id ?? null;
  }, [params, rows, blindSpots]);

  const parseAt = (): FileLoc | null => {
    const m = /^(.*):(\d+)-(\d+)$/.exec(params.get('at') ?? '');
    if (!m) return null;
    return {
      file: m[1],
      start: Number(m[2]),
      end: Number(m[3]),
      ...(params.get('key') ? { key: params.get('key')! } : {}),
      name: params.get('name') ?? m[1],
    };
  };
  const [fileLoc, setFileLoc] = useState<FileLoc | null>(parseAt);
  const [selectedId, setSelectedId] = useState<string | null>(() => (parseAt() ? null : initial()));
  const [focusLine, setFocusLine] = useState<number | null>(
    () => Number(params.get('line')) || null,
  );
  // The URL is the location: ⌘K, links, Back/Forward and navigation jumps all go through it.
  useEffect(() => {
    setFocusLine(Number(params.get('line')) || null);
    const at = parseAt();
    if (at) {
      setFileLoc(at);
      setSelectedId(null);
      return;
    }
    setFileLoc(null);
    if (params.get('fn') || params.get('contract')) setSelectedId(initial());
  }, [params]); // eslint-disable-line react-hooks/exhaustive-deps

  const selected = selectedId ? (byId.get(selectedId) ?? null) : null;

  // ── Walking flows: every jump is a history entry; the trail shows the path. ──
  const [trail, setTrail] = useState<TrailEntry[]>([]);
  const [pos, setPos] = useState(0);
  const viewer = useRef<CodeViewerHandle | null>(null);
  useEffect(() => {
    const st = window.history.state as { hexTrail?: TrailEntry[]; hexPos?: number } | null;
    if (st?.hexTrail?.length) {
      setTrail(st.hexTrail);
      setPos(st.hexPos ?? 0);
    }
    const onPop = (e: PopStateEvent) => {
      const s2 = e.state as { hexTrail?: TrailEntry[]; hexPos?: number } | null;
      if (s2?.hexTrail) {
        setTrail(s2.hexTrail);
        setPos(s2.hexPos ?? 0);
      }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  /** Start the trail over at the current location (a pick from the list). */
  const resetTrail = (entry: TrailEntry) => {
    setTrail([entry]);
    setPos(0);
    // Our own state object (no Next markers): Next then copies its internals in
    // and syncs useSearchParams with the URL, on this call and on Back/Forward.
    window.history.replaceState({ hexTrail: [entry], hexPos: 0 }, '', entry.url);
  };
  // The first location seeds the trail.
  useEffect(() => {
    if (trail.length) return;
    const label = selected ? selected.name : fileLoc ? shortLabel(fileLoc) : null;
    if (label) resetTrail({ label, url: window.location.pathname + window.location.search });
  }, [selected?.id, fileLoc?.file]); // eslint-disable-line react-hooks/exhaustive-deps

  const open = useCallback(
    (t: NavTarget) => {
      const row = t.key ? byId.get(t.key) : undefined;
      const url = new URL(window.location.href);
      for (const k of ['fn', 'at', 'key', 'name', 'line', 'contract']) url.searchParams.delete(k);
      if (row) url.searchParams.set('fn', row.id);
      else {
        url.searchParams.set('at', `${t.file}:${t.line_start}-${t.line_end}`);
        if (t.key) url.searchParams.set('key', t.key);
        url.searchParams.set('name', t.name);
      }
      if (t.line) url.searchParams.set('line', String(t.line));
      const entry: TrailEntry = {
        label: row ? row.name : shortLabel(t),
        ...(t.via ? { via: t.via.replace(/\(.*$/, '').split('.')[0] } : {}),
        url: url.pathname + url.search,
      };
      const next = [...trail.slice(0, pos + 1), entry];
      window.history.pushState({ hexTrail: next, hexPos: next.length - 1 }, '', entry.url);
      setTrail(next);
      setPos(next.length - 1);
      // Apply right away; the URL effect will agree once Next syncs the params.
      setFocusLine(t.line ?? null);
      if (row) {
        setFileLoc(null);
        setSelectedId(row.id);
      } else {
        setFileLoc({
          file: t.file,
          start: t.line_start,
          end: t.line_end,
          ...(t.key ? { key: t.key } : {}),
          name: t.name,
        });
        setSelectedId(null);
      }
    },
    [byId, trail, pos],
  );

  const nav: CodeNavHandlers = useMemo(
    () => ({ open, stateOf: (key: string) => byId.get(key)?.state }),
    [open, byId],
  );

  useEffect(() => {
    if (!selected) return;
    replaceQuery({ fn: selected.id, contract: null, at: null, key: null, name: null });
    setFocus({
      ref: selected.id,
      kind: 'function',
      label: `${selected.contract}.${details[selected.id]?.signature ?? selected.name}`,
      file: selected.file,
      line_start: selected.line_start,
      line_end: selected.line_end,
    });
  }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── List: filter + search, grouped by contract (blind spots keep their rank) ──
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list: ReviewRow[];
    if (filter === 'blind')
      list = blindSpots.map((id) => byId.get(id)).filter((r): r is ReviewRow => Boolean(r));
    else
      list = live.filter((r) =>
        filter === 'unread'
          ? r.state === 'unread'
          : filter === 'questioned'
            ? r.state === 'questioned'
            : filter === 'changed'
              ? r.diff_depth !== undefined
              : true,
      );
    if (q) {
      list = list.filter((r) =>
        `${r.contract}.${r.name} ${details[r.id]?.signature ?? ''}`.toLowerCase().includes(q),
      );
    }
    return list;
  }, [live, byId, filter, query, blindSpots, details]);

  const groups = useMemo(() => {
    if (filter === 'blind') return [{ contract: null as string | null, rows: visible }];
    const m = new Map<string, ReviewRow[]>();
    for (const r of visible) m.set(r.contract, [...(m.get(r.contract) ?? []), r]);
    return Array.from(m.entries()).map(([contract, rs]) => ({
      contract: contract as string | null,
      rows: rs,
    }));
  }, [visible, filter]);

  const order = useMemo(() => groups.flatMap((g) => g.rows.map((r) => r.id)), [groups]);

  const listRef = useRef<HTMLDivElement>(null);
  const select = useCallback(
    (id: string) => {
      setSelectedId(id);
      setFileLoc(null);
      setFocusLine(null);
      const row = rows.find((r) => r.id === id);
      if (row) resetTrail({ label: row.name, url: `/review?fn=${encodeURIComponent(id)}` });
      requestAnimationFrame(() =>
        listRef.current
          ?.querySelector<HTMLElement>(`[data-id="${CSS.escape(id)}"]`)
          ?.scrollIntoView({ block: 'nearest' }),
      );
    },
    [rows],
  ); // eslint-disable-line react-hooks/exhaustive-deps

  const step = (d: 1 | -1) => {
    if (!order.length) return;
    const i = selectedId ? order.indexOf(selectedId) : -1;
    const next = order[Math.max(0, Math.min(order.length - 1, i === -1 ? 0 : i + d))];
    if (next) select(next);
  };

  // ── Marking ──
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const mark = useCallback(
    async (row: ReviewRow, state: ReviewState, note?: string, opts: { silent?: boolean } = {}) => {
      const prev: Override = { state: row.state, note: row.note };
      setOverrides((o) => ({ ...o, [row.id]: { state, note } }));
      try {
        await sendJson('/api/progress', { ids: [row.id], state, ...(note ? { note } : {}) });
        if (!opts.silent) {
          toast({
            message:
              state === 'unread'
                ? `${row.name} marked unread`
                : `${row.name} marked ${STATE_LABEL[state].toLowerCase()}`,
            action: {
              label: 'Undo',
              onClick: () => {
                setOverrides((o) => ({ ...o, [row.id]: prev }));
                void sendJson('/api/progress', {
                  ids: [row.id],
                  state: prev.state,
                  ...(prev.note ? { note: prev.note } : {}),
                }).then(() => router.refresh());
              },
            },
          });
        }
        router.refresh();
      } catch (err) {
        setOverrides((o) => ({ ...o, [row.id]: prev }));
        toast({ message: (err as Error).message, tone: 'error' });
      }
    },
    [router, toast],
  );

  const toggle = (state: ReviewState) => {
    if (!selected) return;
    if (state === 'questioned' && selected.state !== 'questioned') {
      void mark(selected, 'questioned', selected.note);
      requestAnimationFrame(() => noteRef.current?.focus());
      return;
    }
    void mark(
      selected,
      selected.state === state ? 'unread' : state,
      state === 'questioned' ? selected.note : undefined,
    );
  };

  useHotkeys({
    j: () => step(1),
    k: () => step(-1),
    ArrowDown: (e) => {
      e.preventDefault();
      step(1);
    },
    ArrowUp: (e) => {
      e.preventDefault();
      step(-1);
    },
    r: () => toggle('read'),
    c: () => toggle('cleared'),
    q: () => toggle('questioned'),
    e: (e) => {
      if (selected?.state === 'questioned') {
        e.preventDefault();
        noteRef.current?.focus();
      }
    },
  });

  // ── Totals (local, so marks show instantly) ──
  const totals = useMemo(() => {
    const total = live.reduce((s, r) => s + r.nsloc, 0);
    const cleared = live.filter((r) => r.state === 'cleared').reduce((s, r) => s + r.nsloc, 0);
    return { total, cleared, pct: total ? Math.round((cleared * 100) / total) : 0 };
  }, [live]);

  const segments: Segment<Filter>[] = [
    { value: 'all', label: 'All' },
    { value: 'unread', label: 'Unread' },
    { value: 'questioned', label: 'Questioned' },
    ...(diffMode ? [{ value: 'changed' as const, label: 'Changed' }] : []),
    { value: 'blind', label: 'Blind spots' },
  ];

  const contractStats = useMemo(() => {
    const m = new Map<string, { cleared: number; total: number }>();
    for (const r of live) {
      const s = m.get(r.contract) ?? { cleared: 0, total: 0 };
      s.total++;
      if (r.state === 'cleared') s.cleared++;
      m.set(r.contract, s);
    }
    return m;
  }, [live]);

  const toolbar = (
    <Toolbar
      title="Review"
      meta={
        <span className="inline-flex items-center gap-2.5">
          <span className="relative inline-block h-1 w-20 overflow-hidden rounded-full bg-surface-3 align-middle">
            <span
              className="absolute inset-y-0 left-0 rounded-full"
              style={{
                width: `${totals.pct}%`,
                background: 'var(--success)',
                transition: 'width 400ms var(--ease-out)',
              }}
            />
          </span>
          <span className="tabular-nums">{totals.pct}% cleared</span>
        </span>
      }
    >
      <Button variant="ghost" onClick={() => setShowGeneral((v) => !v)} aria-expanded={showGeneral}>
        General note
        <IconChevron
          className={cn(
            'h-3.5 w-3.5 transition-transform duration-200',
            showGeneral && 'rotate-90',
          )}
        />
      </Button>
      <RecordButton contract={selected?.contract ?? 'general'} pending={pendingSessions} />
    </Toolbar>
  );

  // What the code pane shows: the selected function, or a file position.
  const view = selected
    ? { file: selected.file, start: selected.line_start, end: selected.line_end, key: selected.id }
    : fileLoc
      ? { file: fileLoc.file, start: fileLoc.start, end: fileLoc.end, key: fileLoc.key }
      : null;
  const callers = selected ? details[selected.id]?.called_by.length : undefined;

  const list = (
    <>
      <div className="space-y-2 border-b border-border-subtle p-3">
        <SearchField value={query} onChange={setQuery} placeholder="Search functions" />
        <SegmentedControl
          segments={segments}
          value={filter}
          onChange={setFilter}
          ariaLabel="Filter functions"
          size="sm"
          fill
        />
      </div>
      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-2 pb-6 pt-1">
        {visible.length === 0 ? (
          <p className="px-3 py-8 text-center text-body text-text-tertiary">
            {query
              ? 'No functions match.'
              : filter === 'questioned'
                ? 'Nothing is questioned.'
                : 'Nothing here.'}
          </p>
        ) : (
          groups.map((g) => (
            <div key={g.contract ?? 'blind'}>
              {g.contract && (
                <ListGroupLabel
                  trailing={`${contractStats.get(g.contract)?.cleared ?? 0}/${contractStats.get(g.contract)?.total ?? 0}`}
                >
                  {g.contract}
                </ListGroupLabel>
              )}
              {g.rows.map((r) => (
                <ListRow
                  key={r.id}
                  data-id={r.id}
                  dense
                  selected={r.id === selectedId}
                  onClick={() => select(r.id)}
                  leading={<StateGlyph state={r.state} />}
                  title={filter === 'blind' ? `${r.contract}.${r.name}` : r.name}
                  trailing={<RiskMeter risk={r.risk} />}
                />
              ))}
            </div>
          ))
        )}
      </div>
    </>
  );

  return (
    <SplitView
      toolbar={
        <>
          {toolbar}
          {showGeneral && (
            <div className="fade-in max-h-[38vh] shrink-0 overflow-y-auto border-b border-border-subtle bg-surface-1 px-6 py-4">
              {generalNote.trim() ? (
                <div className="max-w-3xl">
                  <MarkdownRenderer content={generalNote} />
                </div>
              ) : (
                <p className="text-body text-text-tertiary">
                  No protocol-wide notes yet. Record a narration with nothing selected, then run{' '}
                  <code className="font-mono text-caption">/diane</code>.
                </p>
              )}
            </div>
          )}
        </>
      }
      list={list}
      listWidth={312}
      inspector={
        selected ? (
          <FunctionInspector
            row={selected}
            detail={details[selected.id]}
            labels={labels}
            reviewable={byId}
            cards={cards}
            note={notes[selected.contract]}
            onOpen={open}
            onToggle={toggle}
            onSaveNote={(n) => void mark(selected, 'questioned', n, { silent: true })}
            noteRef={noteRef}
          />
        ) : fileLoc ? (
          <DeclInspector loc={fileLoc} reviewable={byId} onOpen={open} />
        ) : undefined
      }
    >
      {view ? (
        <>
          <div className="flex h-10 shrink-0 items-center gap-1 border-b border-border-subtle pl-2 pr-4">
            <Trail trail={trail} pos={pos} />
            <span className="ml-auto shrink-0 truncate pl-3 font-mono text-caption text-text-tertiary">
              {view.file}:{view.start}
            </span>
            {view.key && (callers ?? 0) > 0 && (
              <Button
                size="sm"
                variant="ghost"
                className="ml-1"
                title="Callers and call sites (⇧F12)"
                onClick={() => viewer.current?.showUsages(view.key!)}
              >
                {details[selected?.id ?? '']?.kind === 'modifier' ? 'Guards' : 'Called by'}{' '}
                {callers}
              </Button>
            )}
          </div>
          <div className="min-h-0 flex-1">
            <CommentedCode
              file={view.file}
              range={{ start: view.start, end: view.end }}
              focusLine={focusLine}
              nav={nav}
              currentKey={view.key}
              handle={viewer}
              onSelectRange={(start, end) => {
                setFocus({
                  ref: `${view.file}:${start}-${end}`,
                  kind: 'code_range',
                  label: `${view.file}:${start}-${end}`,
                  file: view.file,
                  line_start: start,
                  line_end: end,
                });
              }}
            />
          </div>
        </>
      ) : (
        <EmptyState sentence="Pick a function on the left to read it here." />
      )}
    </SplitView>
  );
}

/** Back, forward, and the path walked so far (older steps are clickable). */
function Trail({ trail, pos }: { trail: TrailEntry[]; pos: number }) {
  const btn =
    'flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-text-tertiary hover:bg-surface-2 hover:text-text-primary disabled:pointer-events-none disabled:opacity-30';
  const shown = trail.slice(Math.max(0, pos - 4), Math.min(trail.length, pos + 3));
  const offset = Math.max(0, pos - 4);
  return (
    <div className="flex min-w-0 items-center gap-0.5">
      <button
        type="button"
        className={btn}
        disabled={pos === 0}
        onClick={() => window.history.back()}
        aria-label="Back"
        title="Back (Alt+←)"
      >
        <IconChevron className="h-3.5 w-3.5 rotate-180" />
      </button>
      <button
        type="button"
        className={btn}
        disabled={pos >= trail.length - 1}
        onClick={() => window.history.forward()}
        aria-label="Forward"
        title="Forward (Alt+→)"
      >
        <IconChevron className="h-3.5 w-3.5" />
      </button>
      <nav aria-label="Flow" className="ml-1 flex min-w-0 items-center gap-1 overflow-hidden">
        {offset > 0 && <span className="text-caption text-text-tertiary">…</span>}
        {shown.map((t, i) => {
          const at = offset + i;
          return (
            <span key={at} className="flex min-w-0 items-center gap-1">
              {i > 0 && <IconChevron className="h-3 w-3 shrink-0 text-text-tertiary" />}
              <button
                type="button"
                disabled={at === pos}
                onClick={() => window.history.go(at - pos)}
                className={cn(
                  'truncate rounded px-1 font-mono text-caption',
                  at === pos
                    ? 'text-text-primary'
                    : at < pos
                      ? 'text-text-secondary hover:text-text-primary'
                      : 'text-text-tertiary hover:text-text-secondary',
                )}
              >
                {t.label}
              </button>
              {t.via && (
                <span className="shrink-0 text-caption text-text-tertiary">via {t.via}</span>
              )}
            </span>
          );
        })}
      </nav>
    </div>
  );
}

/** The code pane with the auditor's comments (one hook per open file) and navigation. */
function CommentedCode({
  file,
  range,
  onSelectRange,
  focusLine,
  nav,
  currentKey,
  handle,
}: {
  file: string;
  range: { start: number; end: number };
  onSelectRange: (start: number, end: number) => void;
  focusLine: number | null;
  nav: CodeNavHandlers;
  currentKey?: string;
  handle: React.MutableRefObject<CodeViewerHandle | null>;
}) {
  const comments = useCodeComments(file);
  return (
    <CodeViewer
      file={file}
      range={range}
      onSelectRange={onSelectRange}
      comments={comments}
      nav={nav}
      focusLine={focusLine}
      currentKey={currentKey}
      handle={handle}
    />
  );
}

const DECL_KIND: Record<string, string> = {
  contract: 'Contract',
  interface: 'Interface',
  library: 'Library',
  function: 'Function',
  modifier: 'Modifier',
  state_var: 'State variable',
  event: 'Event',
  error: 'Error',
  struct: 'Struct',
  enum: 'Enum',
  type: 'Type',
  constant: 'Constant',
};

interface NavSite {
  from?: string;
  fromName?: string;
  fromStart?: number;
  fromEnd?: number;
  file: string;
  line: number;
  code: string;
  kind: string;
}

/** A declaration that is not in the review map: what it is, where it runs, who uses it. */
function DeclInspector({
  loc,
  reviewable,
  onOpen,
}: {
  loc: FileLoc;
  reviewable: Map<string, ReviewRow>;
  onOpen: (t: NavTarget) => void;
}) {
  const [data, setData] = useState<{
    decl: XrefDecl | null;
    impls: Array<{ id: string; by: string; decl: XrefDecl | null }>;
    sites: NavSite[];
  } | null>(null);
  useEffect(() => {
    setData(null);
    if (!loc.key) return;
    let live = true;
    void fetch(`/api/nav?key=${encodeURIComponent(loc.key)}`)
      .then((r) => r.json())
      .then((d) => live && setData(d))
      .catch(() => live && setData(null));
    return () => {
      live = false;
    };
  }, [loc.key]);
  useEffect(() => {
    setFocus({
      ref: `${loc.file}:${loc.start}-${loc.end}`,
      kind: 'code_range',
      label: loc.key ?? `${loc.file}:${loc.start}-${loc.end}`,
      file: loc.file,
      line_start: loc.start,
      line_end: loc.end,
    });
  }, [loc.file, loc.start, loc.end, loc.key]);

  const d = data?.decl;
  const goSite = (s: NavSite) =>
    onOpen({
      ...(s.from ? { key: s.from } : {}),
      name: s.fromName ?? s.file,
      file: s.file,
      line_start: s.fromStart ?? s.line,
      line_end: s.fromEnd ?? s.line,
      line: s.line,
    });
  const groups: Array<[string, NavSite[]]> = [];
  for (const [label, kinds] of [
    ['Written by', ['write']],
    ['Read by', ['read']],
    [d?.kind === 'modifier' ? 'Guards' : d?.kind === 'function' ? 'Called by' : 'Used in', null],
  ] as Array<[string, string[] | null]>) {
    const list = (data?.sites ?? []).filter((s) =>
      kinds ? kinds.includes(s.kind) : !['write', 'read'].includes(s.kind),
    );
    if (list.length) groups.push([label, list]);
  }

  return (
    <Inspector
      eyebrow={`${d ? DECL_KIND[d.kind] : 'Code'}${d?.contract ? ` · ${d.contract}` : ''}${d && !d.in_scope ? ' · out of scope' : ''}`}
      title={d?.name ?? loc.name}
      subtitle={d?.signature ? <span className="font-mono">{d.signature}</span> : undefined}
    >
      <InspectorSection label="Where">
        <CodeReference file={loc.file} lineStart={loc.start} lineEnd={loc.end} />
        {d?.doc && <p className="mt-2 text-body text-text-secondary">{d.doc}</p>}
      </InspectorSection>
      {(data?.impls.length ?? 0) > 0 && (
        <InspectorSection label="Runs in">
          <ul>
            {data!.impls.map((i) => (
              <li key={i.id}>
                <button
                  type="button"
                  onClick={() =>
                    i.decl &&
                    onOpen({
                      key: i.id,
                      name: `${i.decl.contract ?? ''}.${i.decl.name}`,
                      file: i.decl.file,
                      line_start: i.decl.line_start,
                      line_end: i.decl.line_end,
                      line: i.decl.line,
                      via: loc.key,
                    })
                  }
                  className="-mx-1.5 flex w-[calc(100%+12px)] items-center gap-2 rounded-md px-1.5 py-1 text-left hover:bg-surface-2"
                >
                  {reviewable.get(i.id) ? (
                    <StateGlyph state={reviewable.get(i.id)!.state} className="h-3 w-3" />
                  ) : (
                    <span className="h-3 w-3 shrink-0" />
                  )}
                  <span className="min-w-0 flex-1 truncate text-body text-text-primary">
                    {i.decl ? `${i.decl.contract}.${i.decl.name}` : i.id}
                  </span>
                  <span className="shrink-0 text-caption text-text-tertiary">
                    {i.by === 'signature' ? 'same signature' : 'override'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </InspectorSection>
      )}
      {groups.map(([label, list]) => (
        <InspectorSection
          key={label}
          label={label}
          trailing={<span className="text-caption text-text-tertiary">{list.length}</span>}
        >
          <ul>
            {list.map((s, i) => (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => goSite(s)}
                  className="-mx-1.5 flex w-[calc(100%+12px)] items-center gap-2 rounded-md px-1.5 py-1 text-left hover:bg-surface-2"
                >
                  {s.from && reviewable.get(s.from) ? (
                    <StateGlyph state={reviewable.get(s.from)!.state} className="h-3 w-3" />
                  ) : (
                    <span className="h-3 w-3 shrink-0" />
                  )}
                  <span className="min-w-0 flex-1 truncate text-body text-text-primary">
                    {s.fromName ?? s.file}
                  </span>
                  <span className="shrink-0 text-caption text-text-tertiary">line {s.line}</span>
                </button>
              </li>
            ))}
          </ul>
        </InspectorSection>
      ))}
      {!loc.key && <p className="text-body text-text-tertiary">A position in {loc.file}.</p>}
    </Inspector>
  );
}

// ─── Inspector ──────────────────────────────────────────────────────

function FunctionInspector({
  row,
  detail,
  labels,
  reviewable,
  cards,
  note,
  onOpen,
  onToggle,
  onSaveNote,
  noteRef,
}: {
  row: ReviewRow;
  detail?: FnDetail;
  labels: Record<string, FnLabel>;
  reviewable: Map<string, ReviewRow>;
  cards: Record<string, CardRef>;
  note?: ContractNoteView;
  onOpen: (t: NavTarget) => void;
  onToggle: (s: ReviewState) => void;
  onSaveNote: (n: string) => void;
  noteRef: React.RefObject<HTMLTextAreaElement>;
}) {
  const [draft, setDraft] = useState(row.note ?? '');
  useEffect(() => setDraft(row.note ?? ''), [row.id, row.note]);

  const vis = detail
    ? [
        row.is_entry_point ? 'Entry point' : detail.visibility,
        detail.mutability !== 'nonpayable' ? detail.mutability : null,
      ]
    : [];

  return (
    <Inspector
      eyebrow={
        <span>
          {row.contract} · {vis.filter(Boolean).join(' · ')}
        </span>
      }
      title={row.name}
      subtitle={<span className="font-mono">{detail?.signature ?? row.name}</span>}
      actions={
        <div className="w-full space-y-3">
          <div className="flex items-center gap-2">
            <StateButton active={row.state === 'read'} onClick={() => onToggle('read')} k="r">
              Read
            </StateButton>
            <StateButton
              active={row.state === 'questioned'}
              onClick={() => onToggle('questioned')}
              k="q"
            >
              Question
            </StateButton>
            {row.state === 'cleared' ? (
              <StateButton active onClick={() => onToggle('cleared')} k="c">
                Cleared
              </StateButton>
            ) : (
              <Button
                variant="primary"
                onClick={() => onToggle('cleared')}
                className="flex-1"
                title="Clear (c)"
              >
                Clear
              </Button>
            )}
          </div>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-text-tertiary">
            <span className="inline-flex items-center gap-1">
              <Kbd>r</Kbd> read
            </span>
            <span className="inline-flex items-center gap-1">
              <Kbd>q</Kbd> question
            </span>
            <span className="inline-flex items-center gap-1">
              <Kbd>c</Kbd> clear
            </span>
            <span className="inline-flex items-center gap-1">
              <Kbd>j</Kbd>
              <Kbd>k</Kbd> move
            </span>
          </p>
          {row.state === 'questioned' && (
            <textarea
              ref={noteRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => draft.trim() !== (row.note ?? '') && onSaveNote(draft.trim())}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey))
                  (e.target as HTMLTextAreaElement).blur();
                if (e.key === 'Escape') (e.target as HTMLTextAreaElement).blur();
              }}
              rows={2}
              placeholder="What's the question?"
              className="fade-in w-full resize-y rounded-md border border-border-subtle bg-surface-0 px-2.5 py-2 text-body text-text-primary placeholder:text-text-tertiary focus:border-border-emphasis focus:outline-none"
            />
          )}
          {row.by && row.state !== 'unread' && (
            <p className="text-caption text-text-tertiary">
              {STATE_LABEL[row.state]} by {row.by}
              {row.updated_at ? ' · ' : ''}
              {row.updated_at && <LocalTime iso={row.updated_at} />}
            </p>
          )}
        </div>
      }
    >
      {row.risk_reasons.length > 0 && (
        <InspectorSection label="Why it matters">
          <p className="text-body text-text-secondary">
            {capitalize(row.risk_reasons.join(', '))}.
          </p>
          <p className="mt-1 text-caption text-text-tertiary">
            {row.nsloc} nSLOC ·{' '}
            {row.ai_seen ? 'an /ai-audit scan raised something here' : 'no /ai-audit coverage yet'}
          </p>
        </InspectorSection>
      )}

      {row.cards.length > 0 && (
        <InspectorSection label="Cards">
          <ul className="space-y-1">
            {row.cards.map((id) => {
              const c = cards[id];
              return (
                <li key={id}>
                  <Link
                    href={`/issues?card=${encodeURIComponent(id)}`}
                    className="-mx-1.5 flex items-center gap-2 rounded-md px-1.5 py-1 text-body text-text-primary hover:bg-surface-2"
                  >
                    {c && <SeverityDot severity={c.severity} label={false} />}
                    <span className="min-w-0 flex-1 truncate">{c?.title ?? id}</span>
                    <span className="shrink-0 text-caption text-text-tertiary">{id}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </InspectorSection>
      )}

      {detail && (
        <>
          <RefList
            label={detail.kind === 'modifier' ? 'Guards' : 'Called by'}
            ids={detail.called_by}
            at={detail.called_at}
            labels={labels}
            reviewable={reviewable}
            onOpen={onOpen}
          />
          <RefList
            label="Calls"
            ids={detail.calls}
            labels={labels}
            reviewable={reviewable}
            onOpen={onOpen}
          />
          {(detail.modifiers.length > 0 || detail.external_calls.length > 0) && (
            <InspectorSection label="Guards and external calls">
              {detail.modifiers.length > 0 && (
                <p className="text-body text-text-secondary">
                  Modifiers{' '}
                  <span className="font-mono text-caption text-text-primary">
                    {detail.modifiers.join(', ')}
                  </span>
                </p>
              )}
              {detail.external_calls.map((c, i) => (
                <p key={i} className="flex items-baseline justify-between gap-2 text-body">
                  <span className="truncate font-mono text-caption text-text-primary">
                    {c.target}.{c.member}
                  </span>
                  <span className="shrink-0 text-caption text-text-tertiary">
                    {c.kind === 'low_level' ? 'low-level · ' : ''}line {c.line}
                  </span>
                </p>
              ))}
            </InspectorSection>
          )}
          {(detail.reads.length > 0 || detail.writes.length > 0) && (
            <InspectorSection label="State">
              {detail.writes.length > 0 && <VarLine label="Writes" vars={detail.writes} />}
              {detail.reads.length > 0 && <VarLine label="Reads" vars={detail.reads} />}
            </InspectorSection>
          )}
        </>
      )}

      {note && <DianeNote note={note} fnId={row.id} fnName={row.name} />}
    </Inspector>
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function StateButton({
  active,
  onClick,
  k,
  children,
}: {
  active: boolean;
  onClick: () => void;
  k: string;
  children: React.ReactNode;
}) {
  return (
    <Button
      variant="secondary"
      onClick={onClick}
      aria-pressed={active}
      title={`${active ? 'Undo' : ''} (${k})`.trim()}
      className={cn('flex-1', active && 'border-border-emphasis bg-surface-3')}
    >
      {children}
    </Button>
  );
}

function VarLine({ label, vars }: { label: string; vars: string[] }) {
  return (
    <p className="flex gap-3 py-0.5 text-body">
      <span className="w-14 shrink-0 text-text-tertiary">{label}</span>
      <span className="min-w-0 flex-1 break-words font-mono text-caption leading-6 text-text-primary">
        {vars.map((v) => v.split('.').slice(1).join('.') || v).join(', ')}
      </span>
    </p>
  );
}

/** Callers or callees; each row opens its code in the main pane (a step in the flow). */
function RefList({
  label,
  ids,
  at,
  labels,
  reviewable,
  onOpen,
}: {
  label: string;
  ids: string[];
  /** Caller id → its lines that make the call: "Called by" rows land on the call. */
  at?: Record<string, number[]>;
  labels: Record<string, FnLabel>;
  reviewable: Map<string, ReviewRow>;
  onOpen: (t: NavTarget) => void;
}) {
  const [all, setAll] = useState(false);
  if (ids.length === 0) return null;
  const shown = all ? ids : ids.slice(0, 6);
  return (
    <InspectorSection
      label={label}
      trailing={<span className="text-caption text-text-tertiary">{ids.length}</span>}
    >
      <ul>
        {shown.map((id) => {
          const l = labels[id];
          const r = reviewable.get(id);
          const lines = at?.[id] ?? [];
          return (
            <li key={id}>
              <button
                type="button"
                onClick={() =>
                  l &&
                  onOpen({
                    key: id,
                    name: `${l.contract}.${l.name}`,
                    file: l.file,
                    line_start: l.line_start,
                    line_end: l.line_end,
                    ...(lines[0] ? { line: lines[0] } : {}),
                  })
                }
                className="-mx-1.5 flex w-[calc(100%+12px)] items-center gap-2 rounded-md px-1.5 py-1 text-left hover:bg-surface-2"
              >
                {r ? (
                  <StateGlyph state={r.state} className="h-3 w-3" />
                ) : (
                  <span className="h-3 w-3 shrink-0" />
                )}
                <span className="min-w-0 flex-1 truncate text-body text-text-primary">
                  {l ? `${l.contract}.${l.name}` : id}
                </span>
                {lines.length > 0 && (
                  <span className="shrink-0 text-caption tabular-nums text-text-tertiary">
                    line {lines.join(', ')}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      {ids.length > 6 && !all && (
        <button
          type="button"
          onClick={() => setAll(true)}
          className="mt-1 text-caption text-text-secondary hover:text-text-primary"
        >
          Show {ids.length - 6} more
        </button>
      )}
    </InspectorSection>
  );
}
