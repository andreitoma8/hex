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

// ─── Section component ──────────────────────────────────────────────

function CollapsibleSection({
  title,
  count,
  borderColor,
  defaultOpen = true,
  children,
}: {
  title: string;
  count: number;
  borderColor: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={`mb-6 rounded-lg border ${borderColor} overflow-hidden`}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between bg-gray-800 px-5 py-3 text-left hover:bg-gray-750 transition-colors"
      >
        <span className="text-sm font-semibold text-gray-200">
          {title} ({count})
        </span>
        <svg
          className={`h-4 w-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m19 9-7 7-7-7" />
        </svg>
      </button>
      {open && <div className="bg-gray-900/50">{children}</div>}
    </div>
  );
}

// ─── Main component ─────────────────────────────────────────────────

export function InvariantsTable({ data }: { data: ParsedInvariants }) {
  return (
    <div>
      {/* From Documentation */}
      <CollapsibleSection
        title="From Documentation"
        count={data.fromDocs.length}
        borderColor="border-gray-700"
      >
        {data.fromDocs.length === 0 ? (
          <p className="px-5 py-4 text-sm text-gray-500">No documentation invariants found.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-700 bg-gray-800/50 text-xs uppercase text-gray-400">
              <tr>
                <th className="px-4 py-2.5 w-10"></th>
                <th className="px-4 py-2.5">ID</th>
                <th className="px-4 py-2.5">Invariant</th>
                <th className="px-4 py-2.5">Enforced In</th>
                <th className="px-4 py-2.5">Source</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700/50">
              {data.fromDocs.map((inv) => (
                <tr key={inv.id} className="hover:bg-gray-800/30 transition-colors">
                  <td className="px-4 py-3"><SignalBars level={inv.confidence} /></td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-300">{inv.id}</td>
                  <td className="px-4 py-3 text-gray-200">{inv.invariant}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-400">{inv.enforced_in}</td>
                  <td className="px-4 py-3 text-xs text-gray-400">{inv.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CollapsibleSection>

      {/* From Code Analysis */}
      <CollapsibleSection
        title="From Code Analysis"
        count={data.fromCode.length}
        borderColor="border-gray-700"
      >
        {data.fromCode.length === 0 ? (
          <p className="px-5 py-4 text-sm text-gray-500">No code invariants found.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-700 bg-gray-800/50 text-xs uppercase text-gray-400">
              <tr>
                <th className="px-4 py-2.5 w-10"></th>
                <th className="px-4 py-2.5">ID</th>
                <th className="px-4 py-2.5">Invariant</th>
                <th className="px-4 py-2.5">Enforced In</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700/50">
              {data.fromCode.map((inv) => (
                <tr key={inv.id} className="hover:bg-gray-800/30 transition-colors">
                  <td className="px-4 py-3"><SignalBars level={inv.confidence} /></td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-300">{inv.id}</td>
                  <td className="px-4 py-3 text-gray-200">{inv.invariant}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-400">{inv.enforced_in}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CollapsibleSection>

      {/* Discrepancies */}
      <CollapsibleSection
        title="Discrepancies"
        count={data.discrepancies.length}
        borderColor="border-red-800/50"
        defaultOpen={true}
      >
        {data.discrepancies.length === 0 ? (
          <p className="px-5 py-4 text-sm text-gray-500">No discrepancies found.</p>
        ) : (
          <div className="divide-y divide-red-800/30">
            {data.discrepancies.map((disc) => (
              <div
                key={disc.id}
                className="border-l-4 border-l-red-500 bg-red-950/20 px-5 py-4"
              >
                <div className="mb-2 flex items-center gap-2">
                  <svg className="h-4 w-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                  </svg>
                  <span className="font-mono text-xs text-red-300">{disc.id}</span>
                  {disc.severity && disc.severity !== '-' && (
                    <SeverityBadge severity={disc.severity as 'Critical' | 'High' | 'Medium' | 'Low' | 'Info'} />
                  )}
                  <span className="text-sm font-medium text-red-200">{disc.description}</span>
                </div>
                <div className="ml-6 space-y-1 text-sm">
                  <p className="text-gray-400">
                    <span className="font-medium text-gray-300">Docs say:</span> {disc.docs_say}
                  </p>
                  {disc.doc_ref && disc.doc_ref !== '-' && (
                    <p className="text-gray-500 text-xs">
                      <span className="font-medium text-gray-400">Doc ref:</span> {disc.doc_ref}
                    </p>
                  )}
                  <p className="text-gray-400"><span className="font-medium text-gray-300">Code does:</span> {disc.code_does}</p>
                  <p className="text-red-300/80"><span className="font-medium text-red-200">Risk:</span> {disc.risk}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CollapsibleSection>

      {/* Implicit Assumptions */}
      <CollapsibleSection
        title="Implicit Assumptions"
        count={data.assumptions.length}
        borderColor="border-yellow-800/50"
      >
        {data.assumptions.length === 0 ? (
          <p className="px-5 py-4 text-sm text-gray-500">No implicit assumptions found.</p>
        ) : (
          <div className="divide-y divide-yellow-800/30">
            {data.assumptions.map((assum) => (
              <div
                key={assum.id}
                className="border-l-4 border-l-yellow-500 bg-yellow-950/10 px-5 py-4"
              >
                <div className="mb-2 flex items-center gap-2">
                  <svg className="h-4 w-4 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
                  </svg>
                  <span className="font-mono text-xs text-yellow-300">{assum.id}</span>
                  <span className="text-sm font-medium text-yellow-200">{assum.assumption}</span>
                </div>
                <div className="ml-6 space-y-1 text-sm">
                  <p className="text-gray-400"><span className="font-medium text-gray-300">Where:</span> <code className="rounded bg-gray-800 px-1.5 py-0.5 text-xs">{assum.where}</code></p>
                  <p className="text-yellow-300/80"><span className="font-medium text-yellow-200">If violated:</span> {assum.if_violated}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CollapsibleSection>
    </div>
  );
}
