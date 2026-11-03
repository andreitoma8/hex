'use client';

/**
 * Code navigation for the viewer, backed by the compiler's navigation index
 * (`.hex/xref.json`, see src/facts/xref.ts): go to definition, peek, callers
 * and uses. The call graph lives in the backend; this only walks it.
 */
import { useEffect, useMemo, useState } from 'react';
import { applyRefs, highlightSolidity, type LineRef, type Seg } from '@/lib/solidity';
import { cn } from '@/lib/cn';
import { fetchSource } from '@/lib/source';
import { StateGlyph } from './ui/StateGlyph';
import type { ReviewState } from '@/lib/types';
import type { XrefDecl, XrefRef } from '../../src/facts/xref';
import type { Implementation } from '../../src/facts/implementations';

export type { XrefDecl };

export interface FileXref {
  available: boolean;
  byLine: Map<number, LineRef[]>;
  decls: Record<string, XrefDecl>;
  impls: Record<string, Implementation[]>;
}

/** Where to take the main pane. */
export interface NavTarget {
  /** Declaration key (a facts id for functions); absent for a bare file position. */
  key?: string;
  name: string;
  file: string;
  line_start: number;
  line_end: number;
  /** The line to land on (a call site, a declaration name). */
  line?: number;
  /** Reached through this interface or virtual declaration. */
  via?: string;
}

export interface CodeNavHandlers {
  /** Navigate the main pane (one step in the history). */
  open: (t: NavTarget) => void;
  /** Review state for the hover card, when the target is in the review map. */
  stateOf?: (key: string) => ReviewState | undefined;
}

const cache = new Map<string, Promise<FileXref>>();

function loadXref(file: string): Promise<FileXref> {
  const hit = cache.get(file);
  if (hit) return hit;
  const p = fetch(`/api/xref?file=${encodeURIComponent(file)}`)
    .then(async (r) => {
      const data = (await r.json()) as {
        available?: boolean;
        refs?: XrefRef[];
        decls?: Record<string, XrefDecl>;
        impls?: Record<string, Implementation[]>;
      };
      const byLine = new Map<number, LineRef[]>();
      for (const [line, col, len, key, def] of data.refs ?? []) {
        byLine.set(line, [...(byLine.get(line) ?? []), { col, len, key, def: def === 1 }]);
      }
      return {
        available: Boolean(data.available),
        byLine,
        decls: data.decls ?? {},
        impls: data.impls ?? {},
      };
    })
    .catch(() => {
      cache.delete(file);
      return { available: false, byLine: new Map(), decls: {}, impls: {} };
    });
  cache.set(file, p);
  // The index changes when facts are rebuilt; keep entries short-lived.
  setTimeout(() => cache.delete(file), 20_000);
  return p;
}

/** The navigation index for one file; `version` bumps refetch it (the file changed). */
export function useXref(file: string | null, version = 0): FileXref | null {
  const [x, setX] = useState<FileXref | null>(null);
  useEffect(() => {
    if (!file) return;
    let live = true;
    if (version) cache.delete(file);
    void loadXref(file).then((v) => live && setX(v));
    return () => {
      live = false;
    };
  }, [file, version]);
  return x;
}

export function declTarget(key: string, d: XrefDecl, via?: string): NavTarget {
  return {
    key,
    name: d.contract ? `${d.contract}.${d.name}` : d.name,
    file: d.file,
    line_start: d.line_start,
    line_end: d.line_end,
    line: d.line,
    ...(via ? { via } : {}),
  };
}

export interface Choice {
  key: string;
  decl: XrefDecl;
  by?: Implementation['by'];
}

/**
 * Where a reference goes: its declaration, or, for an interface or virtual
 * function, where it runs. One implementation is taken directly; several come
 * back as choices; `declaration` forces the declaration itself.
 */
export function resolve(
  x: FileXref,
  key: string,
  opts: { declaration?: boolean } = {},
): { target: NavTarget } | { choices: Choice[] } | null {
  const decl = x.decls[key];
  if (!decl) return null;
  const impls = (x.impls[key] ?? []).filter((i) => x.decls[i.id]);
  if (opts.declaration || impls.length === 0) return { target: declTarget(key, decl) };
  if (impls.length === 1) return { target: declTarget(impls[0].id, x.decls[impls[0].id], key) };
  return {
    choices: [{ key, decl }, ...impls.map((i) => ({ key: i.id, decl: x.decls[i.id], by: i.by }))],
  };
}

const KIND_WORD: Record<XrefDecl['kind'], string> = {
  contract: 'contract',
  interface: 'interface',
  library: 'library',
  function: 'function',
  modifier: 'modifier',
  state_var: 'state variable',
  event: 'event',
  error: 'error',
  struct: 'struct',
  enum: 'enum',
  type: 'type',
  constant: 'constant',
};

const shortName = (key: string, d?: XrefDecl) =>
  d ? `${d.contract ? `${d.contract}.` : ''}${d.name}` : key.replace(/\(.*$/, '');

/** Quiet card under a reference: what it is, where it runs, what the NatSpec says. */
export function HoverCard({
  refKey,
  x,
  nav,
  style,
}: {
  refKey: string;
  x: FileXref;
  nav: CodeNavHandlers;
  style: React.CSSProperties;
}) {
  const d = x.decls[refKey];
  if (!d) return null;
  const impls = (x.impls[refKey] ?? []).filter((i) => x.decls[i.id]);
  const state = nav.stateOf?.(refKey);
  return (
    <div
      role="tooltip"
      className="fade-in pointer-events-none absolute z-30 w-max max-w-[440px] rounded-lg border border-border-default bg-surface-1 px-3 py-2.5 font-sans shadow-lg"
      style={style}
    >
      <div className="flex items-center gap-2 text-caption text-text-tertiary">
        {state && <StateGlyph state={state} className="h-3 w-3" />}
        <span>
          {d.kind === 'function' && d.contract ? '' : `${KIND_WORD[d.kind]} · `}
          {d.contract ?? d.file}
          {!d.in_scope && ' · out of scope'}
        </span>
      </div>
      {d.signature && (
        <div className="mt-1 font-mono text-[12.5px] leading-5 text-text-primary">
          {d.signature}
        </div>
      )}
      {impls.length > 0 && (
        <div className="mt-1 text-caption text-text-secondary">
          Runs in{' '}
          {impls.map((i, n) => (
            <span key={i.id}>
              {n > 0 && ', '}
              <span className="font-mono">{shortName(i.id, x.decls[i.id])}</span>
              {i.by === 'signature' && ' (same signature)'}
            </span>
          ))}
        </div>
      )}
      {d.doc && <p className="mt-1.5 text-body text-text-secondary">{d.doc}</p>}
      <div className="mt-1.5 text-caption text-text-tertiary">
        Ctrl/⌘-click or F12 to go · Alt-click or ⌥F12 to peek
      </div>
    </div>
  );
}

/** Pick where to go when an interface or virtual function has several implementations. */
export function ChoiceMenu({
  choices,
  style,
  onPick,
  onClose,
}: {
  choices: Choice[];
  style: React.CSSProperties;
  onPick: (c: Choice) => void;
  onClose: () => void;
}) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowDown') setI((v) => Math.min(choices.length - 1, v + 1));
      else if (e.key === 'ArrowUp') setI((v) => Math.max(0, v - 1));
      else if (e.key === 'Enter') onPick(choices[i]);
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [choices, i, onPick, onClose]);
  return (
    <div
      role="menu"
      className="fade-in absolute z-40 min-w-[280px] rounded-lg border border-border-default bg-surface-1 p-1 font-sans shadow-lg"
      style={style}
    >
      {choices.map((c, n) => (
        <button
          key={c.key}
          type="button"
          role="menuitem"
          onMouseEnter={() => setI(n)}
          onClick={() => onPick(c)}
          className={cn(
            'flex w-full items-baseline gap-3 rounded-md px-2.5 py-1.5 text-left',
            n === i ? 'bg-surface-2' : '',
          )}
        >
          <span className="font-mono text-caption text-text-primary">
            {shortName(c.key, c.decl)}
          </span>
          <span className="ml-auto text-caption text-text-tertiary">
            {c.by === 'override'
              ? 'override'
              : c.by === 'signature'
                ? 'same signature'
                : KIND_WORD[c.decl.kind]}
          </span>
        </button>
      ))}
    </div>
  );
}

const TOKEN_CLASS: Record<string, string | undefined> = {
  comment: 'tok-comment',
  string: 'tok-string',
  number: 'tok-number',
  keyword: 'tok-keyword',
  type: 'tok-type',
  builtin: 'tok-builtin',
  fn: 'tok-fn',
};

/** One highlighted, navigable segment (shared by the viewer and the peek). */
export function SegSpan({ seg }: { seg: Seg }) {
  return (
    <span
      className={cn(TOKEN_CLASS[seg.kind], seg.ref && 'nav-ref')}
      {...(seg.ref ? { 'data-ref': seg.ref, ...(seg.def ? { 'data-def': '1' } : {}) } : {})}
    >
      {seg.text}
    </span>
  );
}

/**
 * Inline peek (VS Code's Peek Definition): the target's code in a band under
 * the line that referenced it. References inside are navigable too.
 */
export function PeekBand({
  target,
  indent,
  onOpen,
  onClose,
  onRefClick,
}: {
  target: NavTarget;
  indent: string;
  onOpen: () => void;
  onClose: () => void;
  /** A click on a reference inside the peek (the viewer decides go or peek). */
  onRefClick: (e: React.MouseEvent, x: FileXref, key: string, line: number) => void;
}) {
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const x = useXref(target.file);
  useEffect(() => {
    let live = true;
    setCode(null);
    setError(null);
    fetchSource(target.file)
      .then((c) => live && setCode(c))
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [target.file]);
  const lines = useMemo(() => (code === null ? [] : highlightSolidity(code)), [code]);
  const shown = lines.slice(target.line_start - 1, target.line_end);

  return (
    <div
      data-band="peek"
      className="rise-in whitespace-normal border-y border-border-default bg-surface-1"
      style={{ paddingLeft: indent }}
      onClick={(e) => {
        const el = (e.target as HTMLElement).closest<HTMLElement>('[data-ref]');
        const row = (e.target as HTMLElement).closest<HTMLElement>('[data-peek-line]');
        if (el && row && x) onRefClick(e, x, el.dataset.ref!, Number(row.dataset.peekLine));
      }}
    >
      <div className="flex items-center gap-3 py-2 pr-4 font-sans">
        <span className="font-mono text-caption text-text-primary">{target.name}</span>
        <span className="truncate font-mono text-caption text-text-tertiary">
          {target.file}:{target.line_start}
        </span>
        {target.via && (
          <span className="shrink-0 text-caption text-text-tertiary">
            via {target.via.replace(/\(.*$/, '')}
          </span>
        )}
        {/* Not right-aligned: the band is as wide as the longest code line. */}
        <span className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={onOpen}
            className="rounded-md px-2 py-0.5 text-caption font-medium text-text-primary hover:bg-surface-2"
          >
            Open ↵
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close peek"
            className="rounded-md px-2 py-0.5 text-caption text-text-tertiary hover:bg-surface-2 hover:text-text-primary"
          >
            Esc
          </button>
        </span>
      </div>
      <div className="max-h-[332px] overflow-auto border-t border-border-subtle bg-[var(--code-bg)] py-2">
        {error ? (
          <div className="px-3 py-2 font-sans text-caption text-text-tertiary">{error}</div>
        ) : code === null ? (
          <div className="px-3 py-2 font-sans text-caption text-text-tertiary">Loading…</div>
        ) : (
          <pre className="min-w-fit font-mono text-[12.5px] leading-5 text-text-primary">
            {shown.map((toks, i) => {
              const n = target.line_start + i;
              const segs = x?.available ? applyRefs(toks, x.byLine.get(n) ?? []) : toks;
              return (
                <div
                  key={n}
                  data-peek-line={n}
                  className={cn('flex pr-6', n === target.line && 'bg-[var(--code-highlight)]')}
                >
                  <span className="w-[5ch] shrink-0 select-none pr-3 text-right tabular-nums text-text-tertiary opacity-70">
                    {n}
                  </span>
                  <code className="whitespace-pre">
                    {segs.length === 0 ? ' ' : segs.map((s, j) => <SegSpan key={j} seg={s} />)}
                  </code>
                </div>
              );
            })}
          </pre>
        )}
      </div>
    </div>
  );
}

interface Site {
  from?: string;
  fromName?: string;
  fromStart?: number;
  fromEnd?: number;
  file: string;
  line: number;
  code: string;
  kind: string;
}

const SITE_WORD: Record<string, string> = {
  internal: 'call',
  external: 'external call',
  library: 'library call',
  super: 'super call',
  this: 'this. call',
  virtual: 'dispatch',
  modifier: 'modifier',
  constructor: 'base constructor',
  read: 'reads',
  write: 'writes',
  use: 'uses',
};

/** Upstream: every call site (functions) or use (state, events, types), one row each. */
export function UsagesBand({
  refKey,
  name,
  indent,
  onGo,
  onClose,
}: {
  refKey: string;
  name: string;
  indent: string;
  onGo: (t: NavTarget) => void;
  onClose: () => void;
}) {
  const [sites, setSites] = useState<Site[] | null>(null);
  const [kind, setKind] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setSites(null);
    void fetch(`/api/nav?key=${encodeURIComponent(refKey)}`)
      .then((r) => r.json())
      .then((d: { sites?: Site[]; decl?: XrefDecl | null }) => {
        if (!live) return;
        setSites(d.sites ?? []);
        setKind(d.decl?.kind ?? null);
      })
      .catch(() => live && setSites([]));
    return () => {
      live = false;
    };
  }, [refKey]);
  const callable = kind === 'function' || kind === 'modifier' || (!kind && refKey.includes('('));
  const title = callable
    ? kind === 'modifier'
      ? 'Functions guarded by'
      : 'Callers of'
    : 'Uses of';

  return (
    <div
      data-band="usages"
      className="rise-in whitespace-normal border-y border-border-default bg-surface-1 font-sans"
      style={{ paddingLeft: indent }}
    >
      <div className="flex items-center gap-3 py-2 pr-4">
        <span className="text-caption text-text-secondary">
          {title} <span className="font-mono text-text-primary">{name}</span>
        </span>
        <span className="text-caption tabular-nums text-text-tertiary">{sites?.length ?? ''}</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="rounded-md px-2 py-0.5 text-caption text-text-tertiary hover:bg-surface-2 hover:text-text-primary"
        >
          Esc
        </button>
      </div>
      <div className="max-h-[300px] overflow-auto border-t border-border-subtle">
        {sites === null ? (
          <div className="py-2 text-caption text-text-tertiary">Loading…</div>
        ) : sites.length === 0 ? (
          <div className="py-2 text-caption text-text-tertiary">
            {callable
              ? 'Nothing in the compiled code calls it.'
              : 'No other uses in the compiled code.'}
          </div>
        ) : (
          <ul className="divide-y divide-border-subtle">
            {sites.map((s, i) => (
              <li key={i}>
                <button
                  type="button"
                  onClick={() =>
                    onGo({
                      ...(s.from ? { key: s.from } : {}),
                      name: s.fromName ?? `${s.file}:${s.line}`,
                      file: s.file,
                      line_start: s.fromStart ?? s.line,
                      line_end: s.fromEnd ?? s.line,
                      line: s.line,
                    })
                  }
                  className="flex w-full items-baseline gap-3 py-1.5 pr-4 text-left hover:bg-surface-2"
                >
                  <span className="w-[200px] shrink-0 truncate font-mono text-caption text-text-primary">
                    {s.fromName ?? s.file}
                  </span>
                  <span className="w-[86px] shrink-0 text-caption text-text-tertiary">
                    {SITE_WORD[s.kind] ?? s.kind} · {s.line}
                  </span>
                  <span className="min-w-0 truncate font-mono text-caption text-text-secondary">
                    {s.code}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
