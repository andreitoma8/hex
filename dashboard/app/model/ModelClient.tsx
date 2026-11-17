'use client';

import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTheme } from 'next-themes';
import { ScrollArea, SplitView, Toolbar } from '@/components/ui/SplitView';
import { Inspector, InspectorSection } from '@/components/ui/Inspector';
import { ListGroupLabel, ListRow } from '@/components/ui/ListRow';
import { Dot, SeverityDot } from '@/components/ui/SeverityDot';
import { StateGlyph, STATE_LABEL } from '@/components/ui/StateGlyph';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { IconCheck } from '@/components/ui/Icons';
import { CodeReference } from '@/components/CodeReference';
import { InlineMarkdown, MarkdownRenderer } from '@/components/MarkdownRenderer';
import { Kbd } from '@/components/ui/Kbd';
import { splitOverview } from '@/lib/overview';
import type { CanvasHandle, CanvasSelection } from '@/components/DiagramCanvas';
import { useHotkeys } from '@/lib/hotkeys';
import { setFocus } from '@/lib/focus';
import { replaceQuery } from '@/lib/url';
import { sendJson } from '@/lib/api';
import { cn } from '@/lib/cn';
import type {
  CardRef,
  DiagramIndexEntry,
  Invariant,
  ProtocolModel,
  ReviewState,
} from '@/lib/types';

const DiagramCanvas = dynamic(() => import('@/components/DiagramCanvas'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-caption text-text-tertiary">
      Loading canvas…
    </div>
  ),
});

export interface DiagramEntry extends DiagramIndexEntry {
  mtime: number;
}

export interface FnInfo {
  id: string;
  contract: string;
  name: string;
  signature: string;
  visibility: string;
  file: string;
  line_start: number;
  line_end: number;
  is_entry_point: boolean;
  callers: number;
  callees: number;
}

export interface ContractInfo {
  name: string;
  kind: string;
  file: string;
  line_start: number;
  line_end: number;
  functions: number;
  entry_points: number;
}

export interface SpecItem {
  id: string;
  source: string;
  spec_text: string;
  status: 'CONFORMS' | 'DEVIATES' | 'PARTIAL' | 'UNVERIFIABLE' | 'UNDOCUMENTED';
  finding: string;
  code_location?: { file: string; line_start?: number; line_end?: number };
  severity_hint?: string;
  confidence?: string;
}

type SectionId =
  | 'actors'
  | 'assets'
  | 'privileges'
  | 'trust'
  | 'dependencies'
  | 'accounting'
  | 'invariants'
  | 'spec';

type View =
  | { kind: 'overview' }
  | { kind: 'diagram'; name: string }
  | { kind: 'section'; id: SectionId };

const viewKeyOf = (v: View) =>
  v.kind === 'overview' ? 'o' : v.kind === 'diagram' ? `d:${v.name}` : `s:${v.id}`;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

interface Evidence {
  file: string;
  line_start: number;
  line_end?: number;
}

const SECTION_LABEL: Record<SectionId, string> = {
  actors: 'Actors',
  assets: 'Assets',
  privileges: 'Privileges',
  trust: 'Trust',
  dependencies: 'Dependencies',
  accounting: 'Accounting',
  invariants: 'Invariants',
  spec: 'Spec',
};

const SECTION_HINT: Record<SectionId, string> = {
  actors: 'Who interacts with the protocol, and how far each is trusted.',
  assets: 'What holds value, where it sits, and which functions move it.',
  privileges: 'What each privileged role can do, at worst.',
  trust: 'What has to be true outside the code for the protocol to be safe.',
  dependencies: 'External systems the protocol relies on, and how they fail.',
  accounting: 'The equations that must balance, and who moves each term.',
  invariants:
    'Properties that must always hold. Accept the ones you agree with; they feed /ai-audit and the fuzzer.',
  spec: 'How the code measures up against its documentation and standards.',
};

const CLAIM: Record<string, { label: string; color: string }> = {
  verified: { label: 'Verified', color: 'var(--success)' },
  contested: { label: 'Contested', color: 'var(--high)' },
  unverified: { label: 'Unverified', color: 'var(--neutral)' },
};

const SPEC: Record<string, { label: string; color: string }> = {
  CONFORMS: { label: 'Conforms', color: 'var(--success)' },
  DEVIATES: { label: 'Deviates', color: 'var(--critical)' },
  PARTIAL: { label: 'Partial', color: 'var(--medium)' },
  UNVERIFIABLE: { label: 'Unverifiable', color: 'var(--neutral)' },
  UNDOCUMENTED: { label: 'Undocumented', color: 'var(--neutral)' },
};

const TEST: Record<string, { label: string; color: string }> = {
  passing: { label: 'passing', color: 'var(--success)' },
  failing: { label: 'failing', color: 'var(--critical)' },
  broken: { label: 'broken', color: 'var(--high)' },
  not_written: { label: 'not written', color: 'var(--neutral)' },
};

const INV_STATUS: Record<string, string> = {
  proposed: 'Proposed',
  accepted: 'Accepted',
  rejected: 'Rejected',
};

const short = (id: string) => id.split('(')[0];

function ClaimStatus({ status }: { status?: string }) {
  const c = CLAIM[status ?? 'unverified'] ?? CLAIM.unverified;
  return (
    <span className="inline-flex items-center gap-1.5 text-caption text-text-tertiary">
      <Dot color={c.color} />
      {c.label}
    </span>
  );
}

export function ModelClient({
  model,
  overview,
  projectName,
  invariants,
  spec,
  diagrams,
  fns,
  contracts,
  states,
  cards,
  cardsByFn,
}: {
  model: ProtocolModel | null;
  overview: string | null;
  projectName: string;
  invariants: Invariant[];
  spec: SpecItem[] | null;
  diagrams: DiagramEntry[];
  fns: Record<string, FnInfo>;
  contracts: Record<string, ContractInfo>;
  states: Record<string, string>;
  cards: Record<string, CardRef>;
  cardsByFn: Record<string, string[]>;
}) {
  const params = useSearchParams();
  const router = useRouter();
  const toast = useToast();
  const { resolvedTheme } = useTheme();
  const theme: 'light' | 'dark' = resolvedTheme === 'light' ? 'light' : 'dark';

  // ── Sections present ──
  const sections = useMemo(() => {
    const out: Array<{ id: SectionId; count: number }> = [];
    const m = model;
    if (m) {
      out.push({ id: 'actors', count: m.actors.length });
      out.push({ id: 'assets', count: m.assets.length });
      out.push({ id: 'privileges', count: m.privileges.length });
      out.push({ id: 'trust', count: m.trust_assumptions.length });
      out.push({ id: 'dependencies', count: m.external_dependencies.length });
      out.push({ id: 'accounting', count: m.accounting.length });
    }
    out.push({ id: 'invariants', count: invariants.length });
    if (spec?.length) out.push({ id: 'spec', count: spec.length });
    return out;
  }, [model, invariants, spec]);

  // The overview is where a newly initialized audit starts: what the protocol does, then the
  // diagrams and sections.
  const intro = useMemo(
    () => (overview?.trim() ? splitOverview(overview, projectName) : null),
    [overview, projectName],
  );
  const hasOverview = Boolean(intro || model?.summary?.trim());

  const viewFromParams = useCallback((): View => {
    const d = params.get('d');
    if (d && diagrams.some((x) => x.name === d)) return { kind: 'diagram', name: d };
    const s = params.get('s');
    if (s === 'overview' && hasOverview) return { kind: 'overview' };
    if (s && sections.some((x) => x.id === s)) return { kind: 'section', id: s as SectionId };
    if (hasOverview) return { kind: 'overview' };
    if (diagrams[0]) return { kind: 'diagram', name: diagrams[0].name };
    return { kind: 'section', id: sections[0]?.id ?? 'invariants' };
  }, [params, diagrams, sections, hasOverview]);

  const [view, setView] = useState<View>(viewFromParams);
  const [item, setItem] = useState<string | null>(() => params.get('id'));
  const [canvasSel, setCanvasSel] = useState<CanvasSelection | null>(null);

  useEffect(() => {
    if (params.get('d') || params.get('s')) {
      setView(viewFromParams());
      setItem(params.get('id'));
    }
  }, [params]); // eslint-disable-line react-hooks/exhaustive-deps

  const viewKey = viewKeyOf(view);
  useEffect(() => {
    if (view.kind === 'overview') replaceQuery({ s: 'overview', d: null, id: null });
    else if (view.kind === 'diagram') replaceQuery({ d: view.name, s: null, id: null });
    else replaceQuery({ s: view.id, d: null, id: item });
  }, [viewKey, item]); // eslint-disable-line react-hooks/exhaustive-deps

  const open = (v: View) => {
    setView(v);
    setItem(null);
    setCanvasSel(null);
  };

  // ── Ordered list for j/k ──
  const order: View[] = useMemo(
    () => [
      ...(hasOverview ? [{ kind: 'overview' as const }] : []),
      ...diagrams.map((d) => ({ kind: 'diagram' as const, name: d.name })),
      ...sections.map((s) => ({ kind: 'section' as const, id: s.id })),
    ],
    [diagrams, sections, hasOverview],
  );
  useHotkeys({
    j: () => {
      const i = order.findIndex((v) => viewKeyOf(v) === viewKey);
      const next = order[Math.min(order.length - 1, i + 1)];
      if (next) open(next);
    },
    k: () => {
      const i = order.findIndex((v) => viewKeyOf(v) === viewKey);
      const next = order[Math.max(0, i - 1)];
      if (next) open(next);
    },
    Escape: () => {
      setItem(null);
      setCanvasSel(null);
    },
  });

  // ── Invariant status (optimistic) ──
  const [invOverride, setInvOverride] = useState<Record<string, Invariant['status']>>({});
  useEffect(() => setInvOverride({}), [invariants]);
  const invs = useMemo(
    () => invariants.map((i) => (invOverride[i.id] ? { ...i, status: invOverride[i.id] } : i)),
    [invariants, invOverride],
  );
  const setInvariant = useCallback(
    async (inv: Invariant, status: Invariant['status']) => {
      const prev = inv.status;
      setInvOverride((o) => ({ ...o, [inv.id]: status }));
      try {
        await sendJson(`/api/invariants/${encodeURIComponent(inv.id)}`, { status });
        toast({
          message: `${inv.id} ${INV_STATUS[status].toLowerCase()}`,
          action: {
            label: 'Undo',
            onClick: () => {
              setInvOverride((o) => ({ ...o, [inv.id]: prev }));
              void sendJson(`/api/invariants/${encodeURIComponent(inv.id)}`, { status: prev }).then(
                () => router.refresh(),
              );
            },
          },
        });
        router.refresh();
      } catch (err) {
        setInvOverride((o) => ({ ...o, [inv.id]: prev }));
        toast({ message: (err as Error).message, tone: 'error' });
      }
    },
    [router, toast],
  );

  // ── Focus bridge ──
  useEffect(() => {
    if (view.kind !== 'diagram' || !canvasSel) return;
    const ref = canvasSel.ref ?? canvasSel.node ?? '';
    if (!ref) return;
    const fn = resolveFn(ref, fns);
    setFocus({
      ref: fn?.id ?? ref,
      kind: 'diagram_node',
      label: canvasSel.label || ref,
      ...(fn ? { file: fn.file, line_start: fn.line_start, line_end: fn.line_end } : {}),
    });
  }, [canvasSel]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (view.kind !== 'section' || !item) return;
    if (view.id === 'invariants') {
      const inv = invariants.find((i) => i.id === item);
      if (inv) setFocus({ ref: inv.id, kind: 'invariant', label: inv.statement });
    } else if (view.id === 'privileges' && model) {
      const p = model.privileges[Number(item)];
      const fn = p ? fns[p.function] : undefined;
      if (p)
        setFocus({
          ref: p.function,
          kind: 'function',
          label: p.function,
          ...(fn ? { file: fn.file, line_start: fn.line_start, line_end: fn.line_end } : {}),
        });
    }
  }, [viewKey, item]); // eslint-disable-line react-hooks/exhaustive-deps

  const diagram =
    view.kind === 'diagram' ? (diagrams.find((d) => d.name === view.name) ?? null) : null;

  // ── Inspector ──
  let inspector: React.ReactNode;
  const ctx = { model, invariants: invs, fns, contracts, states, cards, cardsByFn, spec };
  if (view.kind === 'diagram' && canvasSel) {
    inspector = (
      <EntityInspector
        sel={canvasSel}
        ctx={ctx}
        onClose={() => setCanvasSel(null)}
        onOpenSection={(id, it) => {
          setView({ kind: 'section', id });
          setItem(it);
        }}
      />
    );
  } else if (view.kind === 'section' && item !== null) {
    inspector = (
      <ItemInspector
        section={view.id}
        item={item}
        ctx={ctx}
        onClose={() => setItem(null)}
        onInvariant={setInvariant}
      />
    );
  }

  const list = (
    <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-6 pt-1">
      {hasOverview && (
        <ListRow
          dense
          className="mt-2"
          selected={view.kind === 'overview'}
          onClick={() => open({ kind: 'overview' })}
          title="Overview"
        />
      )}
      {diagrams.length > 0 && <ListGroupLabel>Diagrams</ListGroupLabel>}
      {diagrams.map((d) => (
        <ListRow
          key={d.name}
          dense
          selected={view.kind === 'diagram' && view.name === d.name}
          onClick={() => open({ kind: 'diagram', name: d.name })}
          title={d.title}
          trailing={
            d.stale ? (
              <Dot color="var(--medium)" title="The model changed since you edited this diagram" />
            ) : d.in_report ? (
              <span title="In the report">
                <IconCheck className="h-3.5 w-3.5" />
              </span>
            ) : d.edited ? (
              'Edited'
            ) : undefined
          }
        />
      ))}
      <ListGroupLabel>Protocol</ListGroupLabel>
      {sections.map((s) => (
        <ListRow
          key={s.id}
          dense
          selected={view.kind === 'section' && view.id === s.id}
          onClick={() => open({ kind: 'section', id: s.id })}
          title={SECTION_LABEL[s.id]}
          titleClassName={s.count === 0 ? 'text-text-tertiary' : undefined}
          trailing={<span className="tabular-nums">{s.count}</span>}
        />
      ))}
    </div>
  );

  return (
    <SplitView
      toolbar={
        <Toolbar
          title="Model"
          meta={[
            projectName,
            plural(diagrams.length, 'diagram'),
            plural(invariants.length, 'invariant'),
          ].join(' · ')}
        />
      }
      list={list}
      listWidth={248}
      inspector={inspector}
      inspectorFloating={view.kind === 'diagram'}
    >
      {view.kind === 'overview' ? (
        <OverviewView
          title={intro?.title ?? projectName}
          body={intro?.body ?? null}
          summary={model?.summary ?? ''}
          start={
            diagrams[0]
              ? {
                  label: `Start with ${diagrams[0].title}`,
                  view: { kind: 'diagram', name: diagrams[0].name },
                }
              : sections[0]
                ? {
                    label: `Start with ${SECTION_LABEL[sections[0].id]}`,
                    view: { kind: 'section', id: sections[0].id },
                  }
                : null
          }
          onOpen={open}
        />
      ) : view.kind === 'diagram' ? (
        diagram ? (
          <DiagramView key={diagram.name} entry={diagram} theme={theme} onSelect={setCanvasSel} />
        ) : (
          <EmptyState
            sentence="This diagram is gone. Rebuild diagrams to bring it back."
            command="hex diagram build"
          />
        )
      ) : (
        <SectionView
          id={view.id}
          ctx={ctx}
          selected={item}
          onSelect={setItem}
          onInvariant={setInvariant}
        />
      )}
    </SplitView>
  );
}

// ─── Overview ───────────────────────────────────────────────────────

/** What the protocol is, in prose, before the pictures and the parts list. */
function OverviewView({
  title,
  body,
  summary,
  start,
  onOpen,
}: {
  title: string;
  body: string | null;
  summary: string;
  start: { label: string; view: View } | null;
  onOpen: (v: View) => void;
}) {
  return (
    <ScrollArea>
      <article className="rise-in mx-auto max-w-[760px] px-8 pb-20 pt-14">
        <p className="text-caption text-text-tertiary">Protocol overview</p>
        <h2 className="mt-1 text-display text-text-primary">{title}</h2>
        {body ? (
          <MarkdownRenderer content={body} className="mt-6" />
        ) : (
          <>
            <p className="mt-6 text-body leading-relaxed text-text-secondary">
              <InlineMarkdown>{summary}</InlineMarkdown>
            </p>
            <p className="mt-4 text-caption text-text-tertiary">
              The full overview (architecture, key contracts, dependencies) is written to
              .hex/overview.md by <span className="font-mono">/init-audit</span>.
            </p>
          </>
        )}
        {start && (
          <div className="mt-10 flex items-center gap-4 border-t border-border-subtle pt-6">
            <Button variant="primary" onClick={() => onOpen(start.view)}>
              {start.label}
            </Button>
            <span className="flex items-center gap-1.5 text-caption text-text-tertiary">
              <Kbd>j</Kbd> <Kbd>k</Kbd> move through the rest
            </span>
          </div>
        )}
      </article>
    </ScrollArea>
  );
}

// ─── Diagram view ───────────────────────────────────────────────────

function DiagramView({
  entry,
  theme,
  onSelect,
}: {
  entry: DiagramEntry;
  theme: 'light' | 'dark';
  onSelect: (s: CanvasSelection | null) => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const handle = useRef<CanvasHandle | null>(null);
  const [save, setSave] = useState<'saving' | 'saved' | 'error' | null>(null);
  const [inReport, setInReport] = useState(entry.in_report);
  const [busy, setBusy] = useState(false);
  const [styling, setStyling] = useState(false);
  useEffect(() => setInReport(entry.in_report), [entry.in_report]);
  useEffect(() => {
    if (save !== 'saved') return;
    const t = setTimeout(() => setSave(null), 1600);
    return () => clearTimeout(t);
  }, [save]);

  const onReady = useCallback((h: CanvasHandle | null) => {
    handle.current = h;
  }, []);
  const onSaved = useCallback(
    (s: 'saving' | 'saved' | 'error') => {
      setSave(s);
      if (s === 'saved') router.refresh();
    },
    [router],
  );

  const addToReport = async () => {
    if (!handle.current) return;
    setBusy(true);
    try {
      const blob = await handle.current.exportPng();
      const res = await fetch(`/api/diagrams/${encodeURIComponent(entry.name)}/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'image/png' },
        body: blob,
      });
      if (!res.ok) throw new Error('Could not write the figure');
      setInReport(true);
      toast({ message: `Added to the report as figures/${entry.name}.png` });
      router.refresh();
    } catch (err) {
      toast({ message: (err as Error).message, tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const removeFromReport = async () => {
    setBusy(true);
    try {
      await fetch(`/api/diagrams/${encodeURIComponent(entry.name)}/export`, { method: 'DELETE' });
      setInReport(false);
      toast({
        message: 'Removed from the report',
        action: { label: 'Undo', onClick: () => void addToReport() },
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const resolve = async (action: 'use-new' | 'keep-mine') => {
    try {
      await sendJson(`/api/diagrams/${encodeURIComponent(entry.name)}/resolve`, { action });
      toast({ message: action === 'use-new' ? 'Switched to the new layout' : 'Kept your edits' });
      router.refresh();
    } catch (err) {
      toast({ message: (err as Error).message, tone: 'error' });
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-start gap-x-6 gap-y-3 border-b border-border-subtle px-6 py-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-3">
            <h2 className="text-heading font-semibold text-text-primary">{entry.title}</h2>
            <span className="text-caption text-text-tertiary">
              {save === 'saving'
                ? 'Saving…'
                : save === 'saved'
                  ? 'Saved'
                  : save === 'error'
                    ? "Couldn't save"
                    : entry.edited
                      ? 'Edited'
                      : ''}
            </span>
          </div>
          <p className="mt-1 max-w-3xl text-body text-text-secondary">{entry.takeaway}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            onClick={() => setStyling((v) => !v)}
            aria-pressed={styling}
            title="Show colors, strokes and fonts for the selected shapes"
            className={styling ? 'bg-surface-2 text-text-primary' : undefined}
          >
            Style
          </Button>
          {inReport ? (
            <Button
              onClick={removeFromReport}
              disabled={busy}
              aria-pressed
              title="Take this diagram out of the report"
            >
              <IconCheck className="h-4 w-4" /> In report
            </Button>
          ) : (
            <Button variant="primary" onClick={addToReport} disabled={busy}>
              {busy ? 'Exporting…' : 'Use in report'}
            </Button>
          )}
        </div>
      </div>
      {entry.stale && (
        <div className="fade-in flex shrink-0 flex-wrap items-center gap-3 border-b border-border-subtle bg-surface-1 px-6 py-2.5">
          <Dot color="var(--medium)" />
          <span className="flex-1 text-body text-text-secondary">
            The model changed since you edited this diagram.
          </span>
          <Button size="sm" variant="secondary" onClick={() => resolve('use-new')}>
            Use new layout
          </Button>
          <Button size="sm" variant="ghost" onClick={() => resolve('keep-mine')}>
            Keep mine
          </Button>
        </div>
      )}
      <div className={cn('hex-canvas relative min-h-0 flex-1', styling && 'hex-canvas--style')}>
        <DiagramCanvas
          name={entry.name}
          mtime={entry.mtime}
          theme={theme}
          onSelect={onSelect}
          onSaved={onSaved}
          onReady={onReady}
        />
      </div>
    </div>
  );
}

// ─── Sections ───────────────────────────────────────────────────────

interface Ctx {
  model: ProtocolModel | null;
  invariants: Invariant[];
  fns: Record<string, FnInfo>;
  contracts: Record<string, ContractInfo>;
  states: Record<string, string>;
  cards: Record<string, CardRef>;
  cardsByFn: Record<string, string[]>;
  spec: SpecItem[] | null;
}

interface RowSpec {
  key: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  trailing?: React.ReactNode;
  actions?: React.ReactNode;
}

function SectionView({
  id,
  ctx,
  selected,
  onSelect,
  onInvariant,
}: {
  id: SectionId;
  ctx: Ctx;
  selected: string | null;
  onSelect: (k: string) => void;
  onInvariant: (inv: Invariant, s: Invariant['status']) => void;
}) {
  const m = ctx.model;
  let rows: RowSpec[] = [];
  let empty = '';
  switch (id) {
    case 'actors':
      rows = (m?.actors ?? []).map((a) => ({
        key: a.id,
        title: a.name,
        subtitle: `${a.kind.replace('_', ' ')} · ${a.trust.replace('_', ' ')}${
          a.powers.length
            ? ` · ${a.powers
                .map(short)
                .map((p) => p.split('.').pop())
                .join(', ')}`
            : ''
        }`,
        trailing: <ClaimStatus status={a.status} />,
      }));
      empty = 'No actors in the model yet.';
      break;
    case 'assets':
      rows = (m?.assets ?? []).map((a) => ({
        key: a.id,
        title: a.name,
        subtitle: `${a.kind}${a.held_by.length ? ` · held by ${a.held_by.join(', ')}` : ''}${a.moved_by.length ? ` · moved by ${a.moved_by.map((f) => short(f).split('.').pop()).join(', ')}` : ''}`,
        trailing: <ClaimStatus status={a.status} />,
      }));
      empty = 'No assets in the model yet.';
      break;
    case 'privileges':
      rows = (m?.privileges ?? []).map((p, i) => ({
        key: String(i),
        title: (
          <span>
            {actorName(m, p.actor)} can{' '}
            <span className="font-medium">{short(p.function).split('.').pop()}</span>: {p.effect}
          </span>
        ),
        subtitle: `At worst: ${p.worst_case}${p.timelock ? ` · timelock ${p.timelock}` : ''}`,
        trailing: <ClaimStatus status={p.status} />,
      }));
      empty = 'No privileged functions in the model.';
      break;
    case 'trust':
      rows = (m?.trust_assumptions ?? []).map((t) => ({
        key: t.claim_id,
        title: t.text,
        trailing: <ClaimStatus status={t.status} />,
      }));
      empty = 'No trust assumptions recorded.';
      break;
    case 'dependencies':
      rows = (m?.external_dependencies ?? []).map((d) => ({
        key: d.id,
        title: d.name,
        subtitle: `${d.kind}${d.failure_modes.length ? ` · ${d.failure_modes.join('; ')}` : ''}`,
        trailing: <ClaimStatus status={d.status} />,
      }));
      empty = 'No external dependencies recorded.';
      break;
    case 'accounting':
      rows = (m?.accounting ?? []).map((a) => ({
        key: a.id,
        title: a.name,
        subtitle: a.equation,
        trailing: <ClaimStatus status={a.status} />,
      }));
      empty = 'No accounting equations recorded.';
      break;
    case 'invariants':
      rows = ctx.invariants.map((inv) => {
        const t = inv.test ? TEST[inv.test.status] : null;
        return {
          key: inv.id,
          title: inv.statement,
          subtitle: (
            <span className="inline-flex flex-wrap items-center gap-x-2">
              <span>
                {inv.id} · {inv.kind} · {INV_STATUS[inv.status]}
              </span>
              {inv.verification?.status === 'contested' && (
                <span className="inline-flex items-center gap-1.5">
                  · <Dot color={CLAIM.contested.color} /> Contested
                </span>
              )}
              {inv.test && t && (
                <span className="inline-flex items-center gap-1.5">
                  · <Dot color={t.color} /> {inv.test.tool} {t.label}
                </span>
              )}
              {inv.issue_id && <span>· {inv.issue_id}</span>}
            </span>
          ),
          actions:
            inv.status === 'proposed' ? (
              <span className="flex shrink-0 gap-1">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={(e) => {
                    e.stopPropagation();
                    onInvariant(inv, 'accepted');
                  }}
                >
                  Accept
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={(e) => {
                    e.stopPropagation();
                    onInvariant(inv, 'rejected');
                  }}
                >
                  Reject
                </Button>
              </span>
            ) : undefined,
        };
      });
      empty = 'No invariants yet. /init-audit proposes them from the model.';
      break;
    case 'spec':
      rows = (ctx.spec ?? []).map((s) => ({
        key: s.id,
        title: s.spec_text,
        subtitle: `${s.id} · ${s.source.replace('_', ' ')}`,
        trailing: (
          <span className="inline-flex items-center gap-1.5 text-caption text-text-tertiary">
            <Dot color={SPEC[s.status]?.color ?? 'var(--neutral)'} />
            {SPEC[s.status]?.label ?? s.status}
          </span>
        ),
      }));
      empty = 'No spec conformance checks yet.';
      break;
  }

  return (
    <ScrollArea>
      <div className="mx-auto max-w-[780px] px-8 pb-16 pt-8">
        <h2 className="text-title font-semibold text-text-primary">{SECTION_LABEL[id]}</h2>
        <p className="mt-1 text-body text-text-tertiary">{SECTION_HINT[id]}</p>
        {rows.length === 0 ? (
          <p className="mt-8 text-body text-text-tertiary">{empty}</p>
        ) : (
          <div className="stagger -mx-2 mt-6">
            {rows.map((r) => (
              <div
                key={r.key}
                role="button"
                tabIndex={0}
                onClick={() => onSelect(r.key)}
                onKeyDown={(e) => e.key === 'Enter' && onSelect(r.key)}
                className={cn(
                  'flex cursor-pointer items-start gap-4 rounded-md px-2 py-2.5',
                  selected === r.key ? 'bg-accent-subtle' : 'hover:bg-surface-1',
                )}
              >
                <div className="min-w-0 flex-1">
                  <div
                    className={cn(
                      'text-body',
                      selected === r.key ? 'text-accent' : 'text-text-primary',
                    )}
                  >
                    {r.title}
                  </div>
                  {r.subtitle && (
                    <div className="mt-0.5 text-caption text-text-tertiary">{r.subtitle}</div>
                  )}
                </div>
                {selected !== r.key && r.actions}
                {r.trailing && <div className="shrink-0 pt-0.5">{r.trailing}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
    </ScrollArea>
  );
}

function actorName(m: ProtocolModel | null, id: string): string {
  return m?.actors.find((a) => a.id === id)?.name ?? id;
}

function resolveFn(ref: string, fns: Record<string, FnInfo>): FnInfo | null {
  if (fns[ref]) return fns[ref];
  if (ref.includes('.') && !ref.includes('(')) {
    const [contract, name] = ref.split('.');
    return Object.values(fns).find((f) => f.contract === contract && f.name === name) ?? null;
  }
  return null;
}

// ─── Inspectors ─────────────────────────────────────────────────────

function EvidenceList({ evidence }: { evidence?: Evidence[] }) {
  if (!evidence?.length) return null;
  return (
    <InspectorSection label="Evidence">
      <div className="flex flex-col items-start gap-1">
        {evidence.map((e, i) => (
          <CodeReference key={i} file={e.file} lineStart={e.line_start} lineEnd={e.line_end} />
        ))}
      </div>
    </InspectorSection>
  );
}

function FnLinks({ ids, ctx, label }: { ids: string[]; ctx: Ctx; label: string }) {
  if (!ids.length) return null;
  return (
    <InspectorSection label={label}>
      {ids.map((id) => {
        const st = ctx.states[id] as ReviewState | undefined;
        return (
          <Link
            key={id}
            href={`/review?fn=${encodeURIComponent(id)}`}
            className="-mx-1.5 flex items-center gap-2 rounded-md px-1.5 py-1 text-body text-text-primary hover:bg-surface-2"
          >
            {st ? <StateGlyph state={st} className="h-3 w-3" /> : <span className="h-3 w-3" />}
            <span className="truncate">{short(id)}</span>
          </Link>
        );
      })}
    </InspectorSection>
  );
}

function CardLinks({ ids, ctx }: { ids: string[]; ctx: Ctx }) {
  if (!ids.length) return null;
  return (
    <InspectorSection label="Cards">
      {ids.map((id) => {
        const c = ctx.cards[id];
        return (
          <Link
            key={id}
            href={`/issues?card=${encodeURIComponent(id)}`}
            className="-mx-1.5 flex items-center gap-2 rounded-md px-1.5 py-1 text-body text-text-primary hover:bg-surface-2"
          >
            {c && <SeverityDot severity={c.severity} label={false} />}
            <span className="min-w-0 flex-1 truncate">{c?.title ?? id}</span>
            <span className="shrink-0 text-caption text-text-tertiary">{id}</span>
          </Link>
        );
      })}
    </InspectorSection>
  );
}

function FunctionBody({ fn, ctx }: { fn: FnInfo; ctx: Ctx }) {
  const st = (ctx.states[fn.id] as ReviewState | undefined) ?? null;
  const m = ctx.model;
  const privileges = (m?.privileges ?? []).filter((p) => p.function === fn.id);
  const actors = (m?.actors ?? []).filter((a) => a.powers.includes(fn.id));
  const assets = (m?.assets ?? []).filter((a) => a.moved_by.includes(fn.id));
  const invs = ctx.invariants.filter((i) => i.scope.functions.includes(fn.id));
  return (
    <>
      <InspectorSection label="Code">
        <CodeReference file={fn.file} lineStart={fn.line_start} lineEnd={fn.line_end} />
        <p className="mt-1.5 text-caption text-text-tertiary">
          {fn.callers} caller{fn.callers === 1 ? '' : 's'} · {fn.callees} callee
          {fn.callees === 1 ? '' : 's'}
          {fn.is_entry_point ? ' · entry point' : ''}
        </p>
      </InspectorSection>
      {st && (
        <InspectorSection label="Review">
          <p className="flex items-center gap-2 text-body text-text-primary">
            <StateGlyph state={st} /> {STATE_LABEL[st]}
          </p>
        </InspectorSection>
      )}
      {(privileges.length > 0 || actors.length > 0 || assets.length > 0) && (
        <InspectorSection label="In the model">
          <ul className="space-y-1 text-body text-text-secondary">
            {actors.map((a) => (
              <li key={a.id}>Only {a.name} can call it.</li>
            ))}
            {privileges.map((p, i) => (
              <li key={i}>
                {p.effect}. At worst: {p.worst_case}.
              </li>
            ))}
            {assets.map((a) => (
              <li key={a.id}>Moves {a.name}.</li>
            ))}
          </ul>
        </InspectorSection>
      )}
      {invs.length > 0 && (
        <InspectorSection label="Invariants">
          {invs.map((i) => (
            <p key={i.id} className="text-body text-text-secondary">
              {i.statement} <span className="text-caption text-text-tertiary">{i.id}</span>
            </p>
          ))}
        </InspectorSection>
      )}
      <CardLinks ids={ctx.cardsByFn[fn.id] ?? []} ctx={ctx} />
    </>
  );
}

function ReviewButton({ fnId }: { fnId: string }) {
  return (
    <Link
      href={`/review?fn=${encodeURIComponent(fnId)}`}
      className="inline-flex h-8 items-center rounded-md border border-border-default bg-surface-0 px-3 text-body font-medium text-text-primary shadow-sm hover:bg-surface-2"
    >
      Open in Review
    </Link>
  );
}

function EntityInspector({
  sel,
  ctx,
  onClose,
  onOpenSection,
}: {
  sel: CanvasSelection;
  ctx: Ctx;
  onClose: () => void;
  onOpenSection: (id: SectionId, item: string) => void;
}) {
  const ref = sel.ref ?? sel.node ?? '';
  const fn = resolveFn(ref, ctx.fns);
  if (fn) {
    return (
      <Inspector
        eyebrow={`Function · ${fn.contract}${sel.changed ? ' · changed' : ''}`}
        title={fn.name}
        subtitle={<span className="font-mono">{fn.signature}</span>}
        onClose={onClose}
        actions={<ReviewButton fnId={fn.id} />}
      >
        <FunctionBody fn={fn} ctx={ctx} />
      </Inspector>
    );
  }
  const contract = ctx.contracts[ref];
  if (contract) {
    return (
      <Inspector
        eyebrow={`Contract · ${contract.kind}`}
        title={contract.name}
        onClose={onClose}
        actions={
          <Link
            href={`/review?contract=${encodeURIComponent(contract.name)}`}
            className="inline-flex h-8 items-center rounded-md border border-border-default bg-surface-0 px-3 text-body font-medium text-text-primary shadow-sm hover:bg-surface-2"
          >
            Open in Review
          </Link>
        }
      >
        <InspectorSection label="Code">
          <CodeReference
            file={contract.file}
            lineStart={contract.line_start}
            lineEnd={contract.line_end}
          />
          <p className="mt-1.5 text-caption text-text-tertiary">
            {contract.functions} functions · {contract.entry_points} entry points
          </p>
        </InspectorSection>
      </Inspector>
    );
  }
  const m = ctx.model;
  const actor = m?.actors.find((a) => a.id === ref);
  if (actor) return <ItemInspector section="actors" item={actor.id} ctx={ctx} onClose={onClose} />;
  const asset = m?.assets.find((a) => a.id === ref);
  if (asset) return <ItemInspector section="assets" item={asset.id} ctx={ctx} onClose={onClose} />;
  const dep = m?.external_dependencies.find((d) => d.id === ref);
  if (dep)
    return <ItemInspector section="dependencies" item={dep.id} ctx={ctx} onClose={onClose} />;
  const acc = m?.accounting.find((a) => a.id === ref);
  if (acc) return <ItemInspector section="accounting" item={acc.id} ctx={ctx} onClose={onClose} />;
  const inv = ctx.invariants.find((i) => i.id === ref);
  if (inv) {
    return (
      <Inspector eyebrow="Invariant" title={inv.statement} onClose={onClose}>
        <Button variant="secondary" onClick={() => onOpenSection('invariants', inv.id)}>
          Open in Invariants
        </Button>
      </Inspector>
    );
  }
  return (
    <Inspector
      eyebrow={sel.changed ? 'Diagram node · changed' : 'Diagram node'}
      title={sel.label || ref}
      onClose={onClose}
    >
      <p className="border-t border-border-subtle pt-3 text-body text-text-tertiary">
        This node isn’t linked to code or the model.
      </p>
    </Inspector>
  );
}

function ItemInspector({
  section,
  item,
  ctx,
  onClose,
  onInvariant,
}: {
  section: SectionId;
  item: string;
  ctx: Ctx;
  onClose: () => void;
  onInvariant?: (inv: Invariant, s: Invariant['status']) => void;
}) {
  const m = ctx.model;
  switch (section) {
    case 'actors': {
      const a = m?.actors.find((x) => x.id === item);
      if (!a) return null;
      return (
        <Inspector
          eyebrow={`Actor · ${a.kind.replace('_', ' ')}`}
          title={a.name}
          subtitle={`${a.trust.replace('_', ' ')}`}
          onClose={onClose}
        >
          {a.description && <p className="pb-4 text-body text-text-secondary">{a.description}</p>}
          <ClaimSection status={a.status} note={a.note} by={a.verified_by} />
          <FnLinks ids={a.powers} ctx={ctx} label="Can call" />
          <EvidenceList evidence={a.evidence} />
        </Inspector>
      );
    }
    case 'assets': {
      const a = m?.assets.find((x) => x.id === item);
      if (!a) return null;
      return (
        <Inspector
          eyebrow={`Asset · ${a.kind}`}
          title={a.name}
          subtitle={a.held_by.length ? `Held by ${a.held_by.join(', ')}` : undefined}
          onClose={onClose}
        >
          {a.description && <p className="pb-4 text-body text-text-secondary">{a.description}</p>}
          <ClaimSection status={a.status} note={a.note} by={a.verified_by} />
          <FnLinks ids={a.moved_by} ctx={ctx} label="Moved by" />
          <EvidenceList evidence={a.evidence} />
        </Inspector>
      );
    }
    case 'privileges': {
      const p = m?.privileges[Number(item)];
      if (!p) return null;
      const fn = ctx.fns[p.function];
      return (
        <Inspector
          eyebrow={`Privilege · ${actorName(m, p.actor)}`}
          title={short(p.function).split('.').pop() ?? p.function}
          subtitle={fn ? <span className="font-mono">{fn.signature}</span> : p.function}
          onClose={onClose}
          actions={fn ? <ReviewButton fnId={fn.id} /> : undefined}
        >
          <InspectorSection label="Effect">
            <p className="text-body text-text-secondary">{p.effect}</p>
          </InspectorSection>
          <InspectorSection label="Worst case">
            <p className="text-body text-text-primary">{p.worst_case}</p>
            {p.timelock && (
              <p className="mt-1 text-caption text-text-tertiary">Timelock {p.timelock}</p>
            )}
          </InspectorSection>
          <ClaimSection status={p.status} note={p.note} by={p.verified_by} />
          <EvidenceList evidence={p.evidence} />
          {fn && <CardLinks ids={ctx.cardsByFn[fn.id] ?? []} ctx={ctx} />}
        </Inspector>
      );
    }
    case 'trust': {
      const t = m?.trust_assumptions.find((x) => x.claim_id === item);
      if (!t) return null;
      return (
        <Inspector eyebrow="Trust assumption" title={t.text} onClose={onClose}>
          <ClaimSection status={t.status} note={t.note} by={t.verified_by} />
          <EvidenceList evidence={t.evidence} />
        </Inspector>
      );
    }
    case 'dependencies': {
      const d = m?.external_dependencies.find((x) => x.id === item);
      if (!d) return null;
      return (
        <Inspector eyebrow={`Dependency · ${d.kind}`} title={d.name} onClose={onClose}>
          {d.failure_modes.length > 0 && (
            <InspectorSection label="How it can fail">
              <ul className="space-y-1 text-body text-text-secondary">
                {d.failure_modes.map((f, i) => (
                  <li key={i}>{f}</li>
                ))}
              </ul>
            </InspectorSection>
          )}
          <ClaimSection status={d.status} note={d.note} by={d.verified_by} />
          <FnLinks ids={d.used_by} ctx={ctx} label="Used by" />
          <EvidenceList evidence={d.evidence} />
        </Inspector>
      );
    }
    case 'accounting': {
      const a = m?.accounting.find((x) => x.id === item);
      if (!a) return null;
      return (
        <Inspector eyebrow="Accounting" title={a.name} subtitle={a.equation} onClose={onClose}>
          <InspectorSection label="Terms">
            <ul className="space-y-2">
              {a.terms.map((t, i) => (
                <li key={i} className="text-body">
                  <div className="text-text-primary">{t.term}</div>
                  <div className="text-caption text-text-tertiary">
                    {t.updated_by
                      .map(
                        (u) =>
                          `${short(u.function).split('.').pop()} ${u.direction === 'increase' ? '↑' : u.direction === 'decrease' ? '↓' : '='}`,
                      )
                      .join(' · ')}
                  </div>
                </li>
              ))}
            </ul>
          </InspectorSection>
          <ClaimSection status={a.status} note={a.note} by={a.verified_by} />
          <EvidenceList evidence={a.evidence} />
        </Inspector>
      );
    }
    case 'invariants': {
      const inv = ctx.invariants.find((x) => x.id === item);
      if (!inv) return null;
      const t = inv.test ? TEST[inv.test.status] : null;
      return (
        <Inspector
          eyebrow={`${inv.id} · ${inv.kind} · ${INV_STATUS[inv.status]}`}
          title={inv.statement}
          subtitle={
            inv.on_chain_enforced
              ? 'Enforced on-chain'
              : 'Not enforced on-chain: it holds only if the code is right'
          }
          onClose={onClose}
          actions={
            onInvariant ? (
              inv.status === 'accepted' ? (
                <Button onClick={() => onInvariant(inv, 'rejected')}>Reject</Button>
              ) : inv.status === 'rejected' ? (
                <Button onClick={() => onInvariant(inv, 'accepted')}>Accept</Button>
              ) : (
                <>
                  <Button variant="primary" onClick={() => onInvariant(inv, 'accepted')}>
                    Accept
                  </Button>
                  <Button variant="ghost" onClick={() => onInvariant(inv, 'rejected')}>
                    Reject
                  </Button>
                </>
              )
            ) : undefined
          }
        >
          {inv.verification && (
            <InspectorSection
              label={
                inv.verification.status === 'contested'
                  ? 'Contested by the skeptic'
                  : 'Verified by the skeptic'
              }
            >
              <p className="flex items-start gap-2 text-body text-text-secondary">
                <Dot color={CLAIM[inv.verification.status].color} className="mt-1.5" />
                <span>
                  {inv.verification.note ??
                    'The code maintains this on every path the skeptic checked.'}
                </span>
              </p>
            </InspectorSection>
          )}
          {inv.rationale && (
            <InspectorSection label="Rationale">
              <p className="text-body text-text-secondary">{inv.rationale}</p>
            </InspectorSection>
          )}
          {inv.test && t && (
            <InspectorSection label="Test">
              <p className="flex items-center gap-2 text-body text-text-primary">
                <Dot color={t.color} /> {inv.test.tool} {t.label}
                {inv.test.property_id && (
                  <span className="text-caption text-text-tertiary">{inv.test.property_id}</span>
                )}
              </p>
              {inv.test.runs !== undefined && (
                <p className="mt-1 text-caption text-text-tertiary">
                  {inv.test.runs.toLocaleString()} runs
                </p>
              )}
              {(inv.test.repro_file || inv.test.file) && (
                <p className="mt-1 truncate font-mono text-caption text-text-secondary">
                  {inv.test.repro_file ?? inv.test.file}
                </p>
              )}
            </InspectorSection>
          )}
          {inv.issue_id && <CardLinks ids={[inv.issue_id]} ctx={ctx} />}
          <FnLinks ids={inv.scope.functions} ctx={ctx} label="Scope" />
          {inv.scope.functions.length === 0 && inv.scope.contracts.length > 0 && (
            <InspectorSection label="Scope">
              <p className="text-body text-text-secondary">{inv.scope.contracts.join(', ')}</p>
            </InspectorSection>
          )}
          <EvidenceList evidence={inv.evidence} />
        </Inspector>
      );
    }
    case 'spec': {
      const s = ctx.spec?.find((x) => x.id === item);
      if (!s) return null;
      return (
        <Inspector
          eyebrow={`${s.id} · ${s.source.replace('_', ' ')}`}
          title={s.spec_text}
          onClose={onClose}
        >
          <InspectorSection label="Verdict">
            <p className="flex items-center gap-2 text-body text-text-primary">
              <Dot color={SPEC[s.status]?.color ?? 'var(--neutral)'} />{' '}
              {SPEC[s.status]?.label ?? s.status}
              {s.confidence && (
                <span className="text-caption text-text-tertiary">{s.confidence} confidence</span>
              )}
            </p>
            {s.finding && (
              <p className="mt-1.5 text-body text-text-secondary">
                <InlineMarkdown>{s.finding}</InlineMarkdown>
              </p>
            )}
          </InspectorSection>
          {s.code_location?.file && (
            <InspectorSection label="Code">
              <CodeReference
                file={s.code_location.file}
                lineStart={s.code_location.line_start}
                lineEnd={s.code_location.line_end}
              />
            </InspectorSection>
          )}
        </Inspector>
      );
    }
  }
  return null;
}

function ClaimSection({ status, note, by }: { status?: string; note?: string; by?: string }) {
  const c = CLAIM[status ?? 'unverified'] ?? CLAIM.unverified;
  return (
    <InspectorSection label="Claim">
      <p className="flex items-center gap-2 text-body text-text-primary">
        <Dot color={c.color} /> {c.label}
        {by && <span className="text-caption text-text-tertiary">by {by}</span>}
      </p>
      {note && <p className="mt-1 text-body text-text-secondary">{note}</p>}
    </InspectorSection>
  );
}
