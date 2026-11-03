'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';
import { LiveStatus } from '../LiveStatus';
import {
  IconBoard,
  IconChanges,
  IconMenu,
  IconModel,
  IconMoon,
  IconReport,
  IconReview,
  IconSidebar,
  IconSun,
  IconToday,
} from './Icons';
import { Kbd } from './Kbd';
import { ResizeHandle } from './ResizeHandle';
import { SIDEBAR_EXPANDED_W, SIDEBAR_KEY } from '@/lib/pane-width';

export interface NavItem {
  href: string;
  label: string;
  icon: (p: React.SVGProps<SVGSVGElement>) => JSX.Element;
  /** Shown only in a differential audit. */
  changesOnly?: boolean;
}

/** Exactly six destinations. */
export const NAV: NavItem[] = [
  { href: '/', label: 'Today', icon: IconToday },
  { href: '/model', label: 'Model', icon: IconModel },
  { href: '/review', label: 'Review', icon: IconReview },
  { href: '/changes', label: 'Changes', icon: IconChanges, changesOnly: true },
  { href: '/issues', label: 'Board', icon: IconBoard },
  { href: '/report', label: 'Report', icon: IconReport },
];

/** Active for the route itself and anything nested under it. */
export function isActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(href + '/');
}

const EXPANDED_W = SIDEBAR_EXPANDED_W;

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const dark = !mounted || resolvedTheme !== 'light';
  return (
    <button
      type="button"
      onClick={() => setTheme(dark ? 'light' : 'dark')}
      aria-label={`Switch to ${dark ? 'light' : 'dark'} appearance`}
      title={`Switch to ${dark ? 'light' : 'dark'} appearance`}
      className="rounded-md p-1.5 text-text-tertiary hover:bg-surface-2 hover:text-text-primary"
    >
      {dark ? <IconMoon className="h-4 w-4" /> : <IconSun className="h-4 w-4" />}
    </button>
  );
}

export function Sidebar({
  projectName,
  version,
  showChanges,
}: {
  projectName: string | null;
  version: string;
  showChanges: boolean;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(SIDEBAR_KEY) === 'collapsed');
    } catch {
      /* storage blocked */
    }
  }, []);
  useEffect(() => {
    document.documentElement.style.setProperty('--sidebar-w', collapsed ? '60px' : EXPANDED_W);
  }, [collapsed]);

  const toggle = () =>
    setCollapsed((c) => {
      try {
        localStorage.setItem(SIDEBAR_KEY, c ? 'expanded' : 'collapsed');
      } catch {
        /* storage blocked */
      }
      return !c;
    });

  // ⌘\ / Ctrl+\ toggles the sidebar.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === '\\') {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const slim = collapsed && !open;

  return (
    <>
      <button
        type="button"
        aria-label="Toggle navigation"
        onClick={() => setOpen((v) => !v)}
        className="fixed left-3 top-3 z-[60] flex h-9 w-9 items-center justify-center rounded-md border border-border-subtle bg-surface-1 text-text-secondary md:hidden"
      >
        <IconMenu className="h-5 w-5" />
      </button>
      {open && (
        <div
          className="fade-in fixed inset-0 z-40 md:hidden"
          style={{ background: 'var(--overlay-bg)' }}
          onClick={() => setOpen(false)}
        />
      )}
      <nav
        aria-label="Main navigation"
        className={cn(
          'fixed left-0 top-0 z-50 flex h-screen w-[220px] flex-col border-r border-border-subtle bg-surface-1 transition-[transform,width] duration-200 ease-out md:w-[var(--sidebar-w,220px)] md:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div
          className={cn('flex items-start gap-2 pb-5 pt-5', slim ? 'justify-center px-2' : 'px-5')}
        >
          {!slim && (
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="text-heading font-semibold tracking-tight text-text-primary">
                  Hex
                </span>
                <span className="text-caption text-text-tertiary">{version}</span>
              </div>
              {projectName && (
                <div className="mt-0.5 truncate text-caption text-text-secondary">
                  {projectName}
                </div>
              )}
            </div>
          )}
          <button
            type="button"
            onClick={toggle}
            aria-label={collapsed ? 'Show sidebar' : 'Hide sidebar'}
            title={`${collapsed ? 'Show' : 'Hide'} sidebar (⌘\\)`}
            className="-mr-1 hidden rounded-md p-1.5 text-text-tertiary hover:bg-surface-2 hover:text-text-primary md:block"
          >
            <IconSidebar className="h-4 w-4" />
          </button>
        </div>

        <div className={cn('flex-1 space-y-0.5 overflow-y-auto', slim ? 'px-2' : 'px-3')}>
          {NAV.filter((i) => showChanges || !i.changesOnly).map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                title={slim ? item.label : undefined}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex h-8 items-center gap-2.5 rounded-md text-body',
                  slim ? 'justify-center px-0' : 'px-2.5',
                  active
                    ? 'bg-accent-subtle font-medium text-accent'
                    : 'text-text-secondary hover:bg-surface-2 hover:text-text-primary',
                )}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {!slim && <span>{item.label}</span>}
                {slim && <span className="sr-only">{item.label}</span>}
              </Link>
            );
          })}
        </div>

        {slim ? (
          <div className="flex flex-col items-center gap-2 border-t border-border-subtle py-3">
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent('hex:palette'))}
              title="Go to anything (⌘K)"
              className="rounded-md p-1.5 text-text-tertiary hover:bg-surface-2 hover:text-text-primary"
            >
              <Kbd>⌘K</Kbd>
            </button>
            <ThemeToggle />
          </div>
        ) : (
          <div className="space-y-3 border-t border-border-subtle px-3 py-3">
            <LiveStatus />
            <div className="flex items-center justify-between px-1">
              <button
                type="button"
                onClick={() => window.dispatchEvent(new CustomEvent('hex:palette'))}
                className="flex items-center gap-2 rounded-md px-1.5 py-1 text-caption text-text-tertiary hover:bg-surface-2 hover:text-text-primary"
              >
                <Kbd>⌘K</Kbd>
                <span>Go to anything</span>
              </button>
              <ThemeToggle />
            </div>
          </div>
        )}
        {!slim && (
          <ResizeHandle
            name="sidebar"
            edge="right"
            min={180}
            max={360}
            className="hidden md:block"
          />
        )}
      </nav>
    </>
  );
}
