'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { NAV } from './ui/Sidebar';
import { IconSearch } from './ui/Icons';
import { Kbd } from './ui/Kbd';
import { cn } from '@/lib/cn';

interface Entry {
  kind: 'page' | 'function' | 'contract' | 'card' | 'invariant' | 'diagram';
  label: string;
  detail?: string;
  href: string;
}

const KIND_LABEL: Record<Entry['kind'], string> = {
  page: 'Page',
  function: 'Function',
  contract: 'Contract',
  card: 'Card',
  invariant: 'Invariant',
  diagram: 'Diagram',
};

function score(e: Entry, words: string[]): number {
  const label = e.label.toLowerCase();
  const hay = `${label} ${(e.detail ?? '').toLowerCase()}`;
  if (!words.every((w) => hay.includes(w))) return -1;
  const first = words[0];
  let s = 0;
  if (label.startsWith(first)) s += 30;
  else if (new RegExp(`(^|[^a-z0-9])${first.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(label))
    s += 20;
  else if (label.includes(first)) s += 10;
  if (e.kind === 'page') s += 8;
  return s - label.length / 100;
}

/**
 * ⌘K: jump to a page, contract, function, card, invariant or diagram. Enter
 * navigates and selects the item on its page.
 */
export function CommandPalette({ showChanges }: { showChanges: boolean }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const [entries, setEntries] = useState<Entry[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const pages: Entry[] = useMemo(
    () =>
      NAV.filter((n) => showChanges || !n.changesOnly).map((n) => ({
        kind: 'page' as const,
        label: n.label,
        href: n.href,
      })),
    [showChanges],
  );

  const openPalette = useCallback(() => {
    setOpen(true);
    setQuery('');
    setSelected(0);
    fetch('/api/palette', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { entries: [] }))
      .then((d: { entries: Entry[] }) => setEntries(d.entries ?? []))
      .catch(() => setEntries([]));
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (open) setOpen(false);
        else openPalette();
      }
    };
    const onEvent = () => openPalette();
    window.addEventListener('keydown', onKey);
    window.addEventListener('hex:palette', onEvent);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('hex:palette', onEvent);
    };
  }, [open, openPalette]);

  useEffect(() => {
    if (open) requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  const results = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length)
      return [
        ...pages,
        ...entries.filter((e) => e.kind === 'diagram' || e.kind === 'contract'),
      ].slice(0, 30);
    return [...pages, ...entries]
      .map((e) => ({ e, s: score(e, words) }))
      .filter((x) => x.s >= 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 40)
      .map((x) => x.e);
  }, [query, pages, entries]);

  useEffect(() => setSelected(0), [query]);
  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${selected}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  const go = (e: Entry) => {
    setOpen(false);
    router.push(e.href);
  };

  if (!open) return null;

  return (
    <div
      data-hex-palette
      className="fade-in fixed inset-0 z-[9000] flex items-start justify-center px-4 pt-[14vh]"
      style={{ background: 'var(--overlay-bg)' }}
      onClick={() => setOpen(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Go to anything"
        className="rise-in w-full max-w-xl overflow-hidden rounded-lg border border-border-default bg-surface-1 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-border-subtle px-4">
          <IconSearch className="h-4 w-4 shrink-0 text-text-tertiary" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Go to a page, function, card, invariant…"
            aria-label="Search"
            className="h-12 flex-1 bg-transparent text-body text-text-primary placeholder:text-text-tertiary focus:outline-none"
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown' || (e.key === 'n' && e.ctrlKey)) {
                e.preventDefault();
                setSelected((s) => Math.min(s + 1, results.length - 1));
              } else if (e.key === 'ArrowUp' || (e.key === 'p' && e.ctrlKey)) {
                e.preventDefault();
                setSelected((s) => Math.max(s - 1, 0));
              } else if (e.key === 'Enter' && results[selected]) {
                e.preventDefault();
                go(results[selected]);
              } else if (e.key === 'Escape') {
                e.preventDefault();
                setOpen(false);
              } else if (e.key === 'Tab') {
                e.preventDefault();
              }
            }}
          />
          <Kbd>esc</Kbd>
        </div>
        <div ref={listRef} className="max-h-[52vh] overflow-y-auto p-1.5" role="listbox">
          {results.length === 0 ? (
            <div className="px-3 py-6 text-center text-body text-text-tertiary">No matches</div>
          ) : (
            results.map((e, i) => (
              <button
                key={`${e.kind}:${e.href}:${i}`}
                type="button"
                role="option"
                aria-selected={i === selected}
                data-index={i}
                onMouseMove={() => setSelected(i)}
                onClick={() => go(e)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-md px-3 py-2 text-left',
                  i === selected ? 'bg-accent-subtle' : '',
                )}
              >
                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      'block truncate text-body',
                      i === selected ? 'text-accent' : 'text-text-primary',
                    )}
                  >
                    {e.label}
                  </span>
                  {e.detail && (
                    <span className="block truncate text-caption text-text-tertiary">
                      {e.detail}
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-caption text-text-tertiary">
                  {KIND_LABEL[e.kind]}
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
