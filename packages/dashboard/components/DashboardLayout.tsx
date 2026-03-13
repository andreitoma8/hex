'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_ITEMS = [
  { href: '/', label: 'Home' },
  { href: '/stats', label: 'Stats' },
  { href: '/access', label: 'Access Control' },
  { href: '/functions', label: 'Functions' },
  { href: '/calls', label: 'External Calls' },
  { href: '/invariants', label: 'Invariants' },
  { href: '/conformance', label: 'Spec Conformance' },
  { href: '/annotations', label: 'Annotations' },
  { href: '/findings', label: 'Findings' },
  { href: '/tracking', label: 'Tracking' },
  { href: '/diagram', label: 'Diagram' },
  { href: '/flows', label: 'Flows' },
];

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <nav className="w-56 bg-gray-800 border-r border-gray-700 p-4 flex flex-col gap-1 shrink-0">
        <div className="mb-6">
          <h1 className="text-lg font-bold text-white">SolAudit</h1>
          <p className="text-xs text-gray-400">Dashboard</p>
        </div>
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`px-3 py-2 rounded text-sm transition-colors ${
              pathname === item.href
                ? 'bg-blue-600 text-white'
                : 'text-gray-300 hover:bg-gray-700 hover:text-white'
            }`}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      {/* Main content */}
      <main className="flex-1 p-6 overflow-auto">
        {children}
      </main>
    </div>
  );
}
