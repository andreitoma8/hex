'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { NAV_GROUPS } from './DashboardLayout';

type NavItem = { href: string; label: string };

const ALL_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) =>
  g.items.map((item) => ({ href: item.href, label: `${g.label} / ${item.label}` })),
);

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const results = query.trim()
    ? ALL_ITEMS.filter((item) =>
        item.label.toLowerCase().includes(query.toLowerCase()) ||
        item.href.includes(query.toLowerCase()),
      )
    : ALL_ITEMS;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
        setQuery('');
        setSelected(0);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Reset selection when results change
  useEffect(() => setSelected(0), [query]);

  const navigate = (href: string) => {
    router.push(href);
    setOpen(false);
    setQuery('');
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[9000] flex items-start justify-center px-4 pt-[12vh]"
      style={{ background: 'var(--overlay-bg)' }}
      onClick={() => setOpen(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Quick navigation"
        className="w-full max-w-lg rounded-lg border border-border-default bg-surface-1 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center border-b border-border-default px-4 py-3 gap-2">
          <span className="text-accent text-body font-medium shrink-0" aria-hidden="true">&gt;</span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="search pages..."
            aria-label="Search pages"
            className="flex-1 bg-transparent text-body text-text-primary placeholder-text-tertiary outline-none"
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSelected((s) => Math.min(s + 1, results.length - 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSelected((s) => Math.max(s - 1, 0));
              } else if (e.key === 'Enter' && results[selected]) {
                navigate(results[selected].href);
              } else if (e.key === 'Tab') {
                e.preventDefault(); // focus trap
              }
            }}
          />
          <kbd
            className="shrink-0 border border-border-default px-1.5 py-0.5 text-caption text-text-tertiary"
            style={{ borderRadius: 'var(--radius-sm)' }}
          >
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-72 overflow-y-auto py-1">
          {results.length === 0 ? (
            <div className="px-4 py-3 text-body text-text-tertiary">no results</div>
          ) : (
            results.map((item, i) => (
              <button
                key={item.href}
                type="button"
                className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-body ${
                  i === selected
                    ? 'bg-accent-subtle text-accent'
                    : 'text-text-secondary hover:bg-surface-2 hover:text-text-primary'
                }`}
                onClick={() => navigate(item.href)}
                onMouseEnter={() => setSelected(i)}
              >
                <span className="text-text-tertiary text-caption shrink-0">
                  {i === selected ? '>' : ' '}
                </span>
                <span>{item.label}</span>
                <span className="ml-auto text-caption text-text-tertiary shrink-0">
                  {item.href}
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
