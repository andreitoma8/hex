'use client';

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { applyRefs, highlightSolidity, type Seg } from '@/lib/solidity';
import { cn } from '@/lib/cn';
import { CommentBand, Composer, linesLabel, type CommentsApi } from './CodeComments';
import {
  ChoiceMenu,
  declTarget,
  HoverCard,
  PeekBand,
  resolve,
  SegSpan,
  UsagesBand,
  useXref,
  type Choice,
  type CodeNavHandlers,
  type FileXref,
  type NavTarget,
} from './CodeNav';
import { fetchSource, invalidateSource } from '@/lib/source';

export { fetchSource, invalidateSource };

/** What the page can ask of the viewer (Shift+F12 with nothing hovered, the "Called by" button). */
export interface CodeViewerHandle {
  showUsages: (key: string) => void;
}

type NavBand =
  | { kind: 'peek'; target: NavTarget; after: number }
  | { kind: 'usages'; key: string; name: string; after: number };

interface Anchor {
  top: number;
  left: number;
}

const isTyping = () => {
  const el = document.activeElement as HTMLElement | null;
  return Boolean(
    el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)),
  );
};

/**
 * Full-file code viewer with Solidity highlighting. The selected range is
 * tinted and scrolled into view; selecting lines with the mouse reports the
 * range (the page forwards it to the focus bridge). With `comments`, the
 * auditor can comment on code: the gutter's + on any line, or "Comment" after
 * selecting lines; comments show as bands under the code they are about.
 *
 * With `nav`, references are navigable like in an IDE: Ctrl/⌘-click or F12
 * goes to the definition (interfaces resolve to where they run), Alt-click or
 * ⌥F12 peeks it inline, and on a declaration's own name (or ⇧F12) the band
 * lists its callers and uses.
 */
export function CodeViewer({
  file,
  range,
  onSelectRange,
  comments,
  nav,
  focusLine,
  currentKey,
  handle,
  className,
}: {
  file: string;
  range?: { start: number; end: number } | null;
  onSelectRange?: (start: number, end: number) => void;
  comments?: CommentsApi;
  nav?: CodeNavHandlers;
  /** A line to land on and mark (a call site, a declaration name). */
  focusLine?: number | null;
  /** The declaration being read (⇧F12 with nothing hovered lists its callers). */
  currentKey?: string;
  handle?: React.MutableRefObject<CodeViewerHandle | null>;
  className?: string;
}) {
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [composer, setComposer] = useState<{ start: number; end: number } | null>(null);
  const [pill, setPill] = useState<{ start: number; end: number; top: number } | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const sourceVersion = comments?.sourceVersion ?? 0;
  const x = useXref(nav ? file : null, sourceVersion);
  const [armed, setArmed] = useState(false);
  const [band, setBand] = useState<NavBand | null>(null);
  const [menu, setMenu] = useState<
    (Anchor & { choices: Choice[]; via: string; mode: 'go' | 'peek'; after: number }) | null
  >(null);
  const [hover, setHover] = useState<(Anchor & { key: string }) | null>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hovered = useRef<{ key: string; line: number; def: boolean; el: HTMLElement } | null>(null);
  // The reference just acted on gets no hover card until the pointer leaves it.
  const quiet = useRef<Element | null>(null);

  useEffect(() => {
    setComposer(null);
    setPill(null);
    setBand(null);
    setMenu(null);
    setHover(null);
  }, [file]);
  // After a jump the pointer has not moved, but the element it was over is gone:
  // F12 must not act on a reference that is no longer on screen.
  useEffect(() => {
    hovered.current = null;
    quiet.current = null;
  }, [file, range?.start, focusLine]);

  // The selection pill goes away with the selection, on Esc, and when the file reloads.
  useEffect(() => {
    if (!pill) return;
    const onChange = () => {
      if (window.getSelection()?.isCollapsed) setPill(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPill(null);
    };
    document.addEventListener('selectionchange', onChange);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('selectionchange', onChange);
      window.removeEventListener('keydown', onKey);
    };
  }, [pill]);
  useEffect(() => setPill(null), [sourceVersion]);

  useEffect(() => {
    let live = true;
    setError(null);
    if (sourceVersion) invalidateSource(file);
    fetchSource(file)
      .then((c) => live && setCode(c))
      .catch((e: Error) => {
        if (!live) return;
        setCode(null);
        setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [file, sourceVersion]);

  const lines = useMemo(() => (code === null ? [] : highlightSolidity(code)), [code]);
  const segLines: Seg[][] = useMemo(
    () =>
      lines.map((toks, i) => (x?.available ? applyRefs(toks, x.byLine.get(i + 1) ?? []) : toks)),
    [lines, x],
  );

  // Scroll the selected range into view: near the top when it's long, centered when it fits.
  // A focus line (a call site) wins: it lands a third of the way down.
  useEffect(() => {
    const el = scroller.current;
    if (!el || lines.length === 0) return;
    if (focusLine) {
      const row = el.querySelector<HTMLElement>(`[data-line="${focusLine}"]`);
      if (row) {
        el.scrollTo({ top: Math.max(0, row.offsetTop - el.clientHeight / 3), behavior: 'smooth' });
        return;
      }
    }
    if (!range) return;
    const first = el.querySelector<HTMLElement>(`[data-line="${range.start}"]`);
    if (!first) return;
    const lineH = first.offsetHeight || 20;
    const rangeH = (range.end - range.start + 1) * lineH;
    const top =
      first.offsetTop - (rangeH < el.clientHeight * 0.6 ? (el.clientHeight - rangeH) / 3 : 48);
    el.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  }, [range?.start, range?.end, focusLine, lines.length, file]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Navigation ──
  const anchorOf = (el: Element): Anchor => {
    const s = scroller.current!;
    const r = el.getBoundingClientRect();
    const sr = s.getBoundingClientRect();
    return { top: r.bottom - sr.top + s.scrollTop + 4, left: r.left - sr.left + s.scrollLeft };
  };

  const showUsages = useCallback(
    (key: string, line?: number) => {
      const d = x?.decls[key];
      const name = d ? `${d.contract ? `${d.contract}.` : ''}${d.name}` : key.replace(/\(.*$/, '');
      setMenu(null);
      setHover(null);
      setBand({ kind: 'usages', key, name, after: line ?? d?.line ?? range?.start ?? 1 });
    },
    [x, range?.start],
  );
  useEffect(() => {
    if (handle) handle.current = { showUsages: (key) => showUsages(key) };
  }, [handle, showUsages]);

  const go = (xr: FileXref, key: string, line: number, declaration: boolean, at: Anchor) => {
    const r = resolve(xr, key, { declaration });
    if (!r || !nav) return;
    if ('target' in r) {
      setBand(null);
      nav.open(r.target);
    } else setMenu({ ...at, choices: r.choices, via: key, mode: 'go', after: line });
  };

  const peek = (xr: FileXref, key: string, line: number, at: Anchor) => {
    const r = resolve(xr, key);
    if (!r) return;
    if ('target' in r) setBand({ kind: 'peek', target: r.target, after: line });
    else setMenu({ ...at, choices: r.choices, via: key, mode: 'peek', after: line });
  };

  const onRef = (
    e: React.MouseEvent | KeyboardEvent,
    xr: FileXref,
    key: string,
    line: number,
    def: boolean,
    el: Element,
    action?: 'go' | 'peek' | 'usages',
  ) => {
    const mod = e.metaKey || e.ctrlKey;
    const act =
      action ?? (def && (mod || e.altKey) ? 'usages' : mod ? 'go' : e.altKey ? 'peek' : null);
    if (!act) return;
    e.preventDefault();
    e.stopPropagation();
    setHover(null);
    quiet.current = el;
    if (act === 'usages') showUsages(key, line);
    else if (act === 'go') go(xr, key, line, mod && e.altKey, anchorOf(el));
    else peek(xr, key, line, anchorOf(el));
  };

  const onCodeClick = (e: React.MouseEvent) => {
    if (!nav || !x?.available) return;
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-ref]');
    const row = el?.closest<HTMLElement>('[data-line]');
    if (!el || !row) return;
    onRef(e, x, el.dataset.ref!, Number(row.dataset.line), el.dataset.def === '1', el);
  };

  const onCodeOver = (e: React.MouseEvent) => {
    if (!nav || !x?.available) return;
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-ref]');
    const row = el?.closest<HTMLElement>('[data-line]');
    if (!el || !row) return;
    if (hovered.current?.el === el) return;
    hovered.current = {
      key: el.dataset.ref!,
      line: Number(row.dataset.line),
      def: el.dataset.def === '1',
      el,
    };
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    setHover(null);
    hoverTimer.current = setTimeout(() => {
      if (hovered.current?.el !== el || menu || armed || quiet.current === el) return;
      setHover({ key: el.dataset.ref!, ...anchorOf(el) });
    }, 450);
  };

  const onCodeOut = (e: React.MouseEvent) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-ref]');
    if (!el || el.contains(e.relatedTarget as Node)) return;
    if (hovered.current?.el === el) hovered.current = null;
    if (quiet.current === el) quiet.current = null;
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    setHover(null);
  };

  // Keys: Ctrl/⌘ arms underlines; F12 / ⌥F12 / ⇧F12; Esc closes; ↵ opens a peek.
  useEffect(() => {
    if (!nav) return;
    const down = (e: KeyboardEvent) => {
      if (e.key === 'Control' || e.key === 'Meta') {
        setArmed(true);
        setHover(null);
      }
      if (isTyping()) return;
      if (e.key === 'Escape' && (band || menu || hover)) {
        setBand(null);
        setMenu(null);
        setHover(null);
        return;
      }
      if (e.key === 'Enter' && band?.kind === 'peek' && !menu) {
        e.preventDefault();
        nav.open(band.target);
        setBand(null);
        return;
      }
      if (e.key !== 'F12' || !x?.available) return;
      const h = hovered.current;
      if (e.shiftKey) {
        e.preventDefault();
        if (h) showUsages(h.key, h.line);
        else if (currentKey) showUsages(currentKey);
        return;
      }
      if (!h) return;
      onRef(e, x, h.key, h.line, h.def, h.el, h.def ? 'usages' : e.altKey ? 'peek' : 'go');
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === 'Control' || e.key === 'Meta') setArmed(false);
    };
    const blur = () => setArmed(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }); // re-bound each render: it reads the current band, menu and hover

  const onMouseUp = () => {
    if (!onSelectRange) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.anchorNode || !sel.focusNode) return;
    const lineOf = (n: Node) =>
      Number(
        (n instanceof Element ? n : n.parentElement)?.closest<HTMLElement>('[data-line]')?.dataset
          .line ?? 0,
      );
    const a = lineOf(sel.anchorNode);
    const b = lineOf(sel.focusNode);
    if (!a || !b) return;
    const start = Math.min(a, b);
    const end = Math.max(a, b);
    onSelectRange(start, end);
    if (comments && scroller.current) {
      const row = scroller.current.querySelector<HTMLElement>(`[data-line="${end}"]`);
      if (row) setPill({ start, end, top: row.offsetTop + row.offsetHeight + 2 });
    }
  };

  const openComposer = (start: number, end: number) => {
    window.getSelection()?.removeAllRanges();
    setPill(null);
    setComposer({ start, end });
  };

  if (error) {
    return (
      <div
        className={cn(
          'flex h-full items-center justify-center p-6 text-body text-text-tertiary',
          className,
        )}
      >
        {error}
      </div>
    );
  }

  const gutter = String(lines.length).length;
  const indent = `${gutter + 3}ch`;
  // Comments render under the last line of their code; stale ones past the
  // end of a shortened file render at the end.
  const bandsAfter = new Map<number, NonNullable<CommentsApi>['comments']>();
  for (const c of comments?.comments ?? []) {
    const at = Math.min(c.line_end, lines.length);
    bandsAfter.set(at, [...(bandsAfter.get(at) ?? []), c]);
  }

  return (
    <div
      ref={scroller}
      className={cn(
        'relative h-full overflow-auto bg-[var(--code-bg)]',
        armed && 'nav-armed',
        className,
      )}
      onMouseUp={onMouseUp}
      onClick={onCodeClick}
      onMouseOver={onCodeOver}
      onMouseOut={onCodeOut}
    >
      {hover && x && nav && !menu && (
        <HoverCard
          refKey={hover.key}
          x={x}
          nav={nav}
          style={{ top: hover.top, left: hover.left }}
        />
      )}
      {menu && (
        <ChoiceMenu
          choices={menu.choices}
          style={{ top: menu.top, left: menu.left }}
          onClose={() => setMenu(null)}
          onPick={(c) => {
            const t = declTarget(c.key, c.decl, c.by ? menu.via : undefined);
            setMenu(null);
            if (menu.mode === 'go') {
              setBand(null);
              nav?.open(t);
            } else setBand({ kind: 'peek', target: t, after: menu.after });
          }}
        />
      )}
      {pill && comments && !composer && (
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => openComposer(pill.start, pill.end)}
          className="fade-in absolute z-10 rounded-md border border-border-default bg-surface-1 px-2.5 py-1 font-sans text-caption font-medium text-text-primary shadow-sm hover:bg-surface-2"
          style={{ top: pill.top, left: `calc(${indent} + 8px)` }}
        >
          Comment on {linesLabel(pill.start, pill.end)}
        </button>
      )}
      {code === null ? (
        <div className="p-6 text-caption text-text-tertiary">Loading {file}…</div>
      ) : (
        <pre className="min-w-fit py-4 font-mono text-[12.5px] leading-5 text-text-primary">
          {lines.map((toks, idx) => {
            const n = idx + 1;
            const inRange = range && n >= range.start && n <= range.end;
            const commenting = composer && n >= composer.start && n <= composer.end;
            const segs = segLines[idx] ?? toks;
            return (
              <Fragment key={n}>
                <div
                  data-line={n}
                  className={cn(
                    'group/line flex pr-6',
                    inRange && 'bg-[var(--code-highlight)]',
                    n === focusLine && 'bg-[var(--code-focus)]',
                    commenting && 'bg-accent-subtle',
                  )}
                >
                  <span
                    className={cn(
                      'sticky left-0 shrink-0 select-none bg-[var(--code-bg)] pl-4 pr-4 text-right tabular-nums',
                      inRange ? 'text-text-secondary' : 'text-text-tertiary opacity-70',
                    )}
                    style={{ width: indent }}
                  >
                    {comments && (
                      <button
                        type="button"
                        aria-label={`Comment on line ${n}`}
                        title={`Comment on line ${n}`}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => openComposer(n, n)}
                        className="absolute left-0.5 top-1/2 flex h-4 w-4 -translate-y-1/2 items-center justify-center rounded font-sans text-[13px] leading-none text-text-secondary opacity-0 hover:bg-surface-3 hover:text-text-primary focus-visible:opacity-100 group-hover/line:opacity-100"
                      >
                        +
                      </button>
                    )}
                    {n}
                  </span>
                  <code className="whitespace-pre">
                    {segs.length === 0 ? ' ' : segs.map((t, i) => <SegSpan key={i} seg={t} />)}
                  </code>
                </div>
                {comments &&
                  bandsAfter
                    .get(n)
                    ?.map((c) => (
                      <CommentBand key={c.id} comment={c} api={comments} indent={indent} />
                    ))}
                {band?.kind === 'peek' && band.after === n && nav && (
                  <PeekBand
                    target={band.target}
                    indent={indent}
                    onOpen={() => {
                      nav.open(band.target);
                      setBand(null);
                    }}
                    onClose={() => setBand(null)}
                    onRefClick={(e, inner, key, line) => {
                      const el = e.target as Element;
                      if (e.metaKey || e.ctrlKey) {
                        e.preventDefault();
                        go(inner, key, line, e.altKey, anchorOf(el));
                      } else if (e.altKey) {
                        e.preventDefault();
                        const r = resolve(inner, key);
                        if (r && 'target' in r) setBand({ ...band, target: r.target });
                        else if (r)
                          setMenu({
                            ...anchorOf(el),
                            choices: r.choices,
                            via: key,
                            mode: 'peek',
                            after: band.after,
                          });
                      }
                    }}
                  />
                )}
                {band?.kind === 'usages' && band.after === n && nav && (
                  <UsagesBand
                    refKey={band.key}
                    name={band.name}
                    indent={indent}
                    onClose={() => setBand(null)}
                    onGo={(t) => {
                      setBand(null);
                      nav.open(t);
                    }}
                  />
                )}
                {comments && composer && composer.end === n && (
                  <Composer
                    indent={indent}
                    label={`Comment on ${linesLabel(composer.start, composer.end)}`}
                    onCancel={() => setComposer(null)}
                    onSubmit={async (text) => {
                      if (await comments.add(composer.start, composer.end, text)) setComposer(null);
                    }}
                  />
                )}
              </Fragment>
            );
          })}
        </pre>
      )}
    </div>
  );
}
