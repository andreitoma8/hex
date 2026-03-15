'use client';

import { useState } from 'react';
import { SignalBars } from '@/components/SignalBars';
import { SeverityBadge } from '@/components/SeverityBadge';

// ─── Types ──────────────────────────────────────────────────────────

interface DocInvariant {
  id: string;
  invariant: string;
  confidence: string;
  enforced_in: string;
  source: string;
}

interface CodeInvariant {
  id: string;
  invariant: string;
  confidence: string;
  enforced_in: string;
}

interface Discrepancy {
  id: string;
  description: string;
  severity: string;
  docs_say: string;
  doc_ref?: string;
  code_does: string;
  risk: string;
}

interface Assumption {
  id: string;
  assumption: string;
  where: string;
  if_violated: string;
}

export interface ParsedInvariants {
  fromDocs: DocInvariant[];
  fromCode: CodeInvariant[];
  discrepancies: Discrepancy[];
  assumptions: Assumption[];
}

// ─── Tabs ───────────────────────────────────────────────────────────

type TabKey = 'docs' | 'code' | 'discrepancies' | 'assumptions';

interface Tab {
  key: TabKey;
  label: string;
  count: number;
  accent?: string;
}

// ─── Main component ─────────────────────────────────────────────────

export function InvariantsTable({ data }: { data: ParsedInvariants }) {
  const [activeTab, setActiveTab] = useState<TabKey>('docs');

  const tabs: Tab[] = [
    { key: 'docs', label: 'From Docs', count: data.fromDocs.length },
    { key: 'code', label: 'From Code', count: data.fromCode.length },
    { key: 'discrepancies', label: 'Discrepancies', count: data.discrepancies.length, accent: 'text-[var(--critical)]' },
    { key: 'assumptions', label: 'Assumptions', count: data.assumptions.length, accent: 'text-[var(--medium)]' },
  ];

  return (
    <div>
      {/* Segmented control */}
      <div className="mb-sp-4 inline-flex rounded-md bg-surface-3 p-1">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`rounded-sm px-sp-3 py-1.5 text-body font-medium ${
              activeTab === tab.key
                ? 'bg-surface-2 text-text-primary shadow-sm'
                : `text-text-secondary hover:text-text-primary ${tab.accent ?? ''}`
            }`}
          >
            {tab.label}
            <span className="ml-1.5 text-caption opacity-60">{tab.count}</span>
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'docs' && <DocsTab data={data.fromDocs} />}
      {activeTab === 'code' && <CodeTab data={data.fromCode} />}
      {activeTab === 'discrepancies' && <DiscrepanciesTab data={data.discrepancies} />}
      {activeTab === 'assumptions' && <AssumptionsTab data={data.assumptions} />}
    </div>
  );
}

// ─── Tab content components ─────────────────────────────────────────

function DocsTab({ data }: { data: DocInvariant[] }) {
  if (data.length === 0) {
    return <p className="py-sp-4 text-body text-text-tertiary">No documentation invariants found.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-md border border-border-default">
      <table className="w-full text-left text-body">
        <thead className="border-b border-border-default bg-surface-2 text-caption font-medium uppercase tracking-wider text-text-tertiary">
          <tr>
            <th className="w-10 px-sp-4 py-sp-2"></th>
            <th className="px-sp-4 py-sp-2">ID</th>
            <th className="px-sp-4 py-sp-2">Invariant</th>
            <th className="px-sp-4 py-sp-2">Enforced In</th>
            <th className="px-sp-4 py-sp-2">Source</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border-subtle">
          {data.map((inv) => (
            <tr key={inv.id} className="h-9 bg-surface-1 hover:bg-surface-3">
              <td className="px-sp-4 py-sp-2"><SignalBars level={inv.confidence} /></td>
              <td className="px-sp-4 py-sp-2 font-mono text-caption text-text-secondary">{inv.id}</td>
              <td className="px-sp-4 py-sp-2 text-text-primary">{inv.invariant}</td>
              <td className="px-sp-4 py-sp-2 font-mono text-caption text-text-tertiary">{inv.enforced_in}</td>
              <td className="px-sp-4 py-sp-2 text-caption text-text-tertiary">{inv.source}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CodeTab({ data }: { data: CodeInvariant[] }) {
  if (data.length === 0) {
    return <p className="py-sp-4 text-body text-text-tertiary">No code invariants found.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-md border border-border-default">
      <table className="w-full text-left text-body">
        <thead className="border-b border-border-default bg-surface-2 text-caption font-medium uppercase tracking-wider text-text-tertiary">
          <tr>
            <th className="w-10 px-sp-4 py-sp-2"></th>
            <th className="px-sp-4 py-sp-2">ID</th>
            <th className="px-sp-4 py-sp-2">Invariant</th>
            <th className="px-sp-4 py-sp-2">Enforced In</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border-subtle">
          {data.map((inv) => (
            <tr key={inv.id} className="h-9 bg-surface-1 hover:bg-surface-3">
              <td className="px-sp-4 py-sp-2"><SignalBars level={inv.confidence} /></td>
              <td className="px-sp-4 py-sp-2 font-mono text-caption text-text-secondary">{inv.id}</td>
              <td className="px-sp-4 py-sp-2 text-text-primary">{inv.invariant}</td>
              <td className="px-sp-4 py-sp-2 font-mono text-caption text-text-tertiary">{inv.enforced_in}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DiscrepanciesTab({ data }: { data: Discrepancy[] }) {
  if (data.length === 0) {
    return <p className="py-sp-4 text-body text-text-tertiary">No discrepancies found.</p>;
  }

  return (
    <div className="space-y-sp-2">
      {data.map((disc) => (
        <div
          key={disc.id}
          className="rounded-md border border-border-default border-l-4 border-l-[var(--critical)] bg-surface-2 px-sp-4 py-sp-3"
        >
          <div className="mb-sp-2 flex items-center gap-2">
            <span className="font-mono text-caption text-[var(--critical)]">{disc.id}</span>
            {disc.severity && disc.severity !== '-' && (
              <SeverityBadge severity={disc.severity as 'Critical' | 'High' | 'Medium' | 'Low' | 'Info'} />
            )}
            <span className="text-heading font-medium text-text-primary">{disc.description}</span>
          </div>
          <div className="ml-sp-5 space-y-1 text-body">
            <p className="text-text-secondary">
              <span className="font-medium text-text-primary">Docs say:</span> {disc.docs_say}
            </p>
            {disc.doc_ref && disc.doc_ref !== '-' && (
              <p className="text-caption text-text-tertiary">
                <span className="font-medium">Doc ref:</span> {disc.doc_ref}
              </p>
            )}
            <p className="text-text-secondary">
              <span className="font-medium text-text-primary">Code does:</span> {disc.code_does}
            </p>
            <p className="text-[var(--critical)]/80">
              <span className="font-medium text-[var(--critical)]">Risk:</span> {disc.risk}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

function AssumptionsTab({ data }: { data: Assumption[] }) {
  if (data.length === 0) {
    return <p className="py-sp-4 text-body text-text-tertiary">No implicit assumptions found.</p>;
  }

  return (
    <div className="space-y-sp-2">
      {data.map((assum) => (
        <div
          key={assum.id}
          className="rounded-md border border-border-default border-l-4 border-l-[var(--medium)] bg-surface-2 px-sp-4 py-sp-3"
        >
          <div className="mb-sp-2 flex items-center gap-2">
            <span className="font-mono text-caption text-[var(--medium)]">{assum.id}</span>
            <span className="text-heading font-medium text-text-primary">{assum.assumption}</span>
          </div>
          <div className="ml-sp-5 space-y-1 text-body">
            <p className="text-text-secondary">
              <span className="font-medium text-text-primary">Where:</span>{' '}
              <code className="rounded-sm bg-surface-0 px-1.5 py-0.5 text-caption">{assum.where}</code>
            </p>
            <p className="text-[var(--medium)]/80">
              <span className="font-medium text-[var(--medium)]">If violated:</span> {assum.if_violated}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
