'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { LiveStatus } from './LiveStatus';

/* ── Icon components ── */

function IconHome(p: React.SVGProps<SVGSVGElement>) {
  return (<svg {...p} aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="m2.25 12 8.954-8.955a1.126 1.126 0 0 1 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" /></svg>);
}
function IconProgress(p: React.SVGProps<SVGSVGElement>) {
  return (<svg {...p} aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M11.35 3.836c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15a2.25 2.25 0 0 1 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m8.9-4.414c.376.023.75.05 1.124.08 1.131.094 1.976 1.057 1.976 2.192V16.5A2.25 2.25 0 0 1 18 18.75h-2.25m-7.5-10.5H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V18.75m-7.5-10.5h6.375c.621 0 1.125.504 1.125 1.125v9.375m-8.25-3 1.5 1.5 3-3.75" /></svg>);
}
function IconStats(p: React.SVGProps<SVGSVGElement>) {
  return (<svg {...p} aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" /></svg>);
}
function IconLock(p: React.SVGProps<SVGSVGElement>) {
  return (<svg {...p} aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" /></svg>);
}
function IconFunctions(p: React.SVGProps<SVGSVGElement>) {
  return (<svg {...p} aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5" /></svg>);
}
function IconCalls(p: React.SVGProps<SVGSVGElement>) {
  return (<svg {...p} aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" /></svg>);
}
function IconShield(p: React.SVGProps<SVGSVGElement>) {
  return (<svg {...p} aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" /></svg>);
}
function IconSpec(p: React.SVGProps<SVGSVGElement>) {
  return (<svg {...p} aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M10.125 2.25h-4.5c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125v-9M10.125 2.25h.375a9 9 0 0 1 9 9v.375M10.125 2.25A3.375 3.375 0 0 1 13.5 5.625v1.5c0 .621.504 1.125 1.125 1.125h1.5a3.375 3.375 0 0 1 3.375 3.375" /></svg>);
}
function IconDiagram(p: React.SVGProps<SVGSVGElement>) {
  return (<svg {...p} aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M7.5 3.75H6A2.25 2.25 0 0 0 3.75 6v1.5M16.5 3.75H18A2.25 2.25 0 0 1 20.25 6v1.5m0 9V18A2.25 2.25 0 0 1 18 20.25h-1.5m-9 0H6A2.25 2.25 0 0 1 3.75 18v-1.5M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></svg>);
}
function IconFlows(p: React.SVGProps<SVGSVGElement>) {
  return (<svg {...p} aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 0 0 6 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0 1 18 16.5h-2.25m-7.5 0h7.5m-7.5 0-1 3m8.5-3 1 3m0 0 .5 1.5m-.5-1.5h-9.5m0 0-.5 1.5" /></svg>);
}
function IconRobot(p: React.SVGProps<SVGSVGElement>) {
  return (<svg {...p} aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.5 12H3m18 0h-1.5m-15 3.75H3m18 0h-1.5M8.25 19.5V21M12 3v1.5m3.75-1.5v1.5m-7.5 15V21M12 19.5V21m3.75-1.5V21M6.75 7.5h10.5a2.25 2.25 0 0 1 2.25 2.25v6a2.25 2.25 0 0 1-2.25 2.25H6.75a2.25 2.25 0 0 1-2.25-2.25v-6A2.25 2.25 0 0 1 6.75 7.5ZM9.75 12a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm5.25 0a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z" /></svg>);
}
function IconReport(p: React.SVGProps<SVGSVGElement>) {
  return (<svg {...p} aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" /></svg>);
}
function IconFindings(p: React.SVGProps<SVGSVGElement>) {
  return (<svg {...p} aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0ZM3.75 12h.007v.008H3.75V12Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm-.375 5.25h.007v.008H3.75v-.008Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" /></svg>);
}
function IconMenu(p: React.SVGProps<SVGSVGElement>) {
  return (<svg {...p} aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" /></svg>);
}
function IconSun(p: React.SVGProps<SVGSVGElement>) {
  return (<svg {...p} aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" /></svg>);
}
function IconMoon(p: React.SVGProps<SVGSVGElement>) {
  return (<svg {...p} aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z" /></svg>);
}

/* ── Nav structure ── */
const NAV_GROUPS = [
  { label: 'Recon', items: [
    { href: '/',         label: 'Home',     icon: IconHome     },
    { href: '/progress', label: 'Progress', icon: IconProgress },
    { href: '/stats',    label: 'Stats',    icon: IconStats    },
  ]},
  { label: 'Analysis', items: [
    { href: '/access',    label: 'Access Control', icon: IconLock      },
    { href: '/functions', label: 'Functions',      icon: IconFunctions },
    { href: '/calls',     label: 'Ext Calls',      icon: IconCalls     },
  ]},
  { label: 'Reasoning', items: [
    { href: '/invariants',  label: 'Invariants',      icon: IconShield },
    { href: '/conformance', label: 'Spec Conformance', icon: IconSpec  },
  ]},
  { label: 'Visual', items: [
    { href: '/diagram', label: 'Diagram', icon: IconDiagram },
    { href: '/flows',   label: 'Flows',   icon: IconFlows   },
  ]},
  { label: 'AI Ops', items: [
    { href: '/ai-reports', label: 'AI Reports', icon: IconRobot },
  ]},
  { label: 'Findings', items: [
    { href: '/report',       label: 'Report',       icon: IconReport   },
    { href: '/all-findings', label: 'All Findings', icon: IconFindings },
  ]},
];

export { NAV_GROUPS };

/* ── Theme toggle ── */
function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <div className="h-9" />;

  const Icon = theme === 'light' ? IconSun : IconMoon;
  const label = theme === 'light' ? 'Light' : 'Dark';

  return (
    <button
      type="button"
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
      className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-body text-text-secondary hover:bg-surface-2 hover:text-text-primary"
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span>{label}</span>
    </button>
  );
}

/* ── Layout ── */
export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => { setSidebarOpen(false); }, [pathname]);

  return (
    <div className="min-h-screen">
      {/* Mobile hamburger */}
      <button
        type="button"
        aria-label="Toggle navigation"
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="fixed left-3 top-3 z-[60] flex h-10 w-10 items-center justify-center rounded-md bg-surface-1 border border-border-default text-text-secondary hover:text-text-primary md:hidden"
      >
        <IconMenu className="h-5 w-5" />
      </button>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 md:hidden"
          style={{ background: 'var(--overlay-bg)' }}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <nav
        aria-label="Main navigation"
        className={`fixed left-0 top-0 z-50 flex h-screen w-[220px] flex-col border-r border-border-subtle bg-surface-1 transition-transform duration-200 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } md:translate-x-0`}
      >
        {/* Logo */}
        <div className="px-5 pb-4 pt-6">
          <div className="flex items-baseline gap-2">
            <span className="text-title font-semibold text-text-primary">Hex</span>
            <span className="text-caption text-text-tertiary">v0.3.2</span>
          </div>
        </div>

        {/* Nav groups */}
        <div className="flex-1 overflow-y-auto px-3 pb-4">
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="mt-6 first:mt-0">
              <div className="mb-1.5 px-3 text-caption font-medium text-text-tertiary">
                {group.label}
              </div>
              {group.items.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={isActive ? 'page' : undefined}
                    className={`group flex items-center gap-2.5 rounded-md px-3 py-2 text-body ${
                      isActive
                        ? 'bg-accent-subtle text-accent font-medium'
                        : 'text-text-secondary hover:bg-surface-2 hover:text-text-primary'
                    }`}
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="border-t border-border-subtle px-3 py-3 space-y-1">
          <LiveStatus />
          <ThemeToggle />
          <div className="flex items-center gap-1.5 px-3 py-1 text-caption text-text-tertiary">
            <kbd className="rounded border border-border-default bg-surface-2 px-1.5 py-0.5 text-[11px]">⌘K</kbd>
            <span>Quick nav</span>
          </div>
        </div>
      </nav>

      {/* Main content */}
      <main className="min-h-screen bg-surface-0 p-6 pt-16 md:ml-[220px] md:pt-6">
        <div className="mx-auto max-w-6xl">
          {children}
        </div>
      </main>
    </div>
  );
}
