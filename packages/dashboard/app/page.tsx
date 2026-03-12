import Link from 'next/link';
import { readJsonFile, readMarkdownFile } from '@/lib/data';
import { NotYetGenerated } from '@/components/NotYetGenerated';
import { MarkdownRenderer } from '@/components/MarkdownRenderer';

interface ProjectConfig {
  project: {
    name: string;
    commit: string;
    chain: string;
    solidity_version: string;
    scope: string[];
  };
}

interface Stats {
  totals: {
    files: number;
    contracts: number;
    interfaces: number;
    libraries: number;
    abstract_contracts: number;
    total_lines: number;
    nsloc: number;
    comment_lines: number;
    blank_lines: number;
    assembly_lines: number;
  };
  per_contract: {
    external_functions: number;
  }[];
}

const NAV_LINKS = [
  {
    href: '/stats',
    label: 'Stats',
    description: 'Contract metrics, nSLOC, coverage, dependencies',
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
      </svg>
    ),
  },
  {
    href: '/access',
    label: 'Access Control',
    description: 'Roles, permissions, function visibility',
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
      </svg>
    ),
  },
  {
    href: '/state',
    label: 'State Variables',
    description: 'Storage layout, readers, writers, mutability',
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
      </svg>
    ),
  },
  {
    href: '/calls',
    label: 'External Calls',
    description: 'Cross-contract calls, trust levels, reentrancy',
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
      </svg>
    ),
  },
  {
    href: '/findings',
    label: 'Findings',
    description: 'Audit findings by severity',
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
      </svg>
    ),
  },
  {
    href: '/invariants',
    label: 'Invariants',
    description: 'Protocol invariants and properties',
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
      </svg>
    ),
  },
];

export default function HomePage() {
  const config = readJsonFile<ProjectConfig>('config.json');
  const overview = readMarkdownFile('overview.md');
  const stats = readJsonFile<Stats>('stats.json');

  const totalExternalFunctions = stats
    ? stats.per_contract.reduce((sum, c) => sum + c.external_functions, 0)
    : null;

  return (
    <div>
      {/* Project header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-100">
          {config?.project.name ?? 'SolAudit Dashboard'}
        </h1>
        {config && (
          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-gray-400">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-blue-500" />
              {config.project.chain}
            </span>
            <span className="font-mono text-xs text-gray-500">
              {config.project.commit.slice(0, 8)}
            </span>
            <span className="text-gray-600">|</span>
            <span>Solidity {config.project.solidity_version}</span>
            <span className="text-gray-600">|</span>
            <span>{config.project.scope.length} file{config.project.scope.length !== 1 ? 's' : ''} in scope</span>
          </div>
        )}
      </div>

      {/* Key stat cards */}
      {stats ? (
        <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard label="Contracts" value={stats.totals.contracts} />
          <StatCard label="nSLOC" value={stats.totals.nsloc.toLocaleString()} />
          <StatCard
            label="External Functions"
            value={totalExternalFunctions ?? 0}
          />
          <StatCard label="Assembly Lines" value={stats.totals.assembly_lines} />
        </div>
      ) : (
        <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard label="Contracts" value="--" muted />
          <StatCard label="nSLOC" value="--" muted />
          <StatCard label="External Functions" value="--" muted />
          <StatCard label="Assembly Lines" value="--" muted />
        </div>
      )}

      {/* Overview */}
      <div className="mb-8">
        <h2 className="mb-4 text-xl font-semibold text-gray-200">Overview</h2>
        {overview ? (
          <div className="rounded-lg border border-gray-700 bg-gray-800 p-6">
            <MarkdownRenderer content={overview} />
          </div>
        ) : (
          <NotYetGenerated command="solaudit overview" />
        )}
      </div>

      {/* Quick nav grid */}
      <div className="mb-8">
        <h2 className="mb-4 text-xl font-semibold text-gray-200">Quick Navigation</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {NAV_LINKS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="group flex items-start gap-4 rounded-lg border border-gray-700 bg-gray-800 p-4 transition-colors hover:border-blue-500/50 hover:bg-gray-800/80"
            >
              <div className="shrink-0 text-gray-500 transition-colors group-hover:text-blue-400">
                {item.icon}
              </div>
              <div>
                <h3 className="font-medium text-gray-200 group-hover:text-white">
                  {item.label}
                </h3>
                <p className="mt-1 text-sm text-gray-500">
                  {item.description}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  muted,
}: {
  label: string;
  value: string | number;
  muted?: boolean;
}) {
  return (
    <div className="rounded-lg border border-gray-700 bg-gray-800 p-4">
      <div
        className={`text-2xl font-bold ${muted ? 'text-gray-600' : 'text-gray-100'}`}
      >
        {value}
      </div>
      <div className="mt-1 text-sm text-gray-400">{label}</div>
    </div>
  );
}
