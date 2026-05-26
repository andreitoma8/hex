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

interface FindingsData {
  findings: { id: string; severity: string }[];
}

interface ExternalCallsData {
  calls: unknown[];
}

const NAV_LINKS = [
  {
    href: '/stats',
    label: 'Stats',
    description: 'Contract metrics, nSLOC, coverage',
    icon: (
      <svg
        className="h-5 w-5"
        aria-hidden="true"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z"
        />
      </svg>
    ),
  },
  {
    href: '/access',
    label: 'Access Control',
    description: 'Roles, permissions, visibility',
    icon: (
      <svg
        className="h-5 w-5"
        aria-hidden="true"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z"
        />
      </svg>
    ),
  },
  {
    href: '/calls',
    label: 'External Calls',
    description: 'Cross-contract calls, trust levels',
    icon: (
      <svg
        className="h-5 w-5"
        aria-hidden="true"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5"
        />
      </svg>
    ),
  },
  {
    href: '/issues',
    label: 'Issues',
    description: 'Potential, verified, invalid, and duplicate issues',
    icon: (
      <svg
        className="h-5 w-5"
        aria-hidden="true"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0ZM3.75 12h.007v.008H3.75V12Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm-.375 5.25h.007v.008H3.75v-.008Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z"
        />
      </svg>
    ),
  },
  {
    href: '/diagram',
    label: 'Diagram',
    description: 'Contract architecture visualization',
    icon: (
      <svg
        className="h-5 w-5"
        aria-hidden="true"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M7.5 3.75H6A2.25 2.25 0 0 0 3.75 6v1.5M16.5 3.75H18A2.25 2.25 0 0 1 20.25 6v1.5m0 9V18A2.25 2.25 0 0 1 18 20.25h-1.5m-9 0H6A2.25 2.25 0 0 1 3.75 18v-1.5M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
        />
      </svg>
    ),
  },
];

export default function HomePage() {
  const config = readJsonFile<ProjectConfig>('config.json');
  const overview = readMarkdownFile('overview.md');
  const stats = readJsonFile<Stats>('stats.json');
  const findingsData = readJsonFile<FindingsData>('findings.json');
  const externalCallsData = readJsonFile<ExternalCallsData>('external-calls.json');

  const totalExternalFunctions = stats
    ? stats.per_contract.reduce((sum, c) => sum + c.external_functions, 0)
    : null;
  const totalFindings = findingsData?.findings?.length ?? null;
  const totalExternalCalls = externalCallsData?.calls?.length ?? null;

  return (
    <div>
      {/* Project header */}
      <div className="mb-6">
        <h1 className="text-title font-semibold text-text-primary">
          {config?.project.name ?? 'Hex Dashboard'}
        </h1>
        {config && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-accent-subtle px-2.5 py-1 text-caption font-medium text-accent">
              {config.project.chain}
            </span>
            <span className="rounded-md bg-surface-2 px-2.5 py-1 text-caption text-text-tertiary">
              {config.project.commit.slice(0, 8)}
            </span>
            <span className="text-caption text-text-tertiary">
              Solidity {config.project.solidity_version}
            </span>
            <span className="text-caption text-text-tertiary">
              {config.project.scope.length} file{config.project.scope.length !== 1 ? 's' : ''} in
              scope
            </span>
          </div>
        )}
      </div>

      {/* KPI cards */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 stagger">
        <KpiCard label="Contracts" value={stats?.totals.contracts} href="/stats" />
        <KpiCard label="nSLOC" value={stats?.totals.nsloc?.toLocaleString()} href="/stats" />
        <KpiCard label="Functions" value={totalExternalFunctions} href="/functions" />
        <KpiCard label="Ext Calls" value={totalExternalCalls} href="/calls" />
        <KpiCard label="Issues" value={totalFindings} href="/issues" />
      </div>

      {/* Overview */}
      <div className="mb-6">
        {overview ? (
          <div className="rounded-lg border border-border-subtle bg-surface-1 p-6">
            <div className="mx-auto max-w-3xl">
              <MarkdownRenderer content={overview} />
            </div>
          </div>
        ) : (
          <NotYetGenerated command="hex overview" />
        )}
      </div>

      {/* Quick nav tiles */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 stagger">
        {NAV_LINKS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="group flex items-start gap-3 rounded-lg border border-border-subtle bg-surface-1 p-4 hover:border-border-default hover:bg-surface-2"
          >
            <div className="shrink-0 text-text-tertiary group-hover:text-accent">{item.icon}</div>
            <div>
              <h3 className="text-heading font-medium text-text-primary group-hover:text-accent">
                {item.label}
              </h3>
              <p className="mt-0.5 text-caption text-text-secondary">{item.description}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  href,
}: {
  label: string;
  value: string | number | null | undefined;
  href?: string;
}) {
  const isMuted = value == null;
  const inner = (
    <div
      className={`rounded-lg border border-border-subtle bg-surface-1 p-4 ${href ? 'hover:border-border-default hover:bg-surface-2 cursor-pointer' : ''}`}
    >
      <div
        className={`text-display scale-in ${isMuted ? 'text-text-tertiary' : 'text-text-primary'}`}
      >
        {value ?? '--'}
      </div>
      <div className="mt-1 text-caption text-text-secondary">{label}</div>
    </div>
  );
  if (href) {
    return <Link href={href}>{inner}</Link>;
  }
  return inner;
}
