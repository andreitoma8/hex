'use client';

import { useState, useMemo } from 'react';
import { FilterableTable, type FilterableColumn } from '@/components/FilterableTable';
import { CodeReference } from '@/components/CodeReference';
import { ConfidenceBadge } from '@/components/ConfidenceBadge';

// ─── Types ──────────────────────────────────────────────────────────

interface Evidence {
  file: string;
  line_start: number;
  line_end: number;
  snippet?: string;
}

interface AccessFunction {
  contract: string;
  function: string;
  visibility: string;
  state_mutability: string | null;
  modifiers: string[];
  evidence: Evidence;
}

interface RoleFunctionRef {
  contract: string;
  function: string;
}

interface Role {
  role: string;
  description: string;
  confidence: string;
  derived_from: string;
  reasoning: string;
  modifier: string | null;
  functions: RoleFunctionRef[];
  warnings: string[];
}

// ─── Helpers ────────────────────────────────────────────────────────

const VISIBILITY_STYLES: Record<string, string> = {
  external: 'bg-[var(--critical)]/15 text-[var(--critical)]',
  public: 'bg-[var(--high)]/15 text-[var(--high)]',
  internal: 'bg-[var(--low)]/15 text-[var(--low)]',
  private: 'bg-[var(--neutral)]/15 text-[var(--neutral)]',
};

function VisibilityBadge({ visibility }: { visibility: string }) {
  const style = VISIBILITY_STYLES[visibility] ?? 'bg-[var(--neutral)]/15 text-[var(--neutral)]';
  return (
    <span className={`inline-flex items-center rounded-sm px-2 py-0.5 text-caption font-medium ${style}`}>
      {visibility}
    </span>
  );
}

const TABS = ['All', 'State-Changing', 'Read-Only'] as const;
type Tab = (typeof TABS)[number];

// ─── Columns ────────────────────────────────────────────────────────

function makeColumns(anyoneFnKeys: Set<string>, showMutability: boolean): FilterableColumn<AccessFunction>[] {
  const cols: FilterableColumn<AccessFunction>[] = [
    {
      id: 'contract',
      header: 'Contract',
      accessorKey: 'contract',
      enableColumnFilter: true,
      cell: (row) => <span className="font-medium text-text-primary">{row.contract}</span>,
    },
    {
      id: 'function',
      header: 'Function',
      accessorKey: 'function',
      cell: (row) => {
        const key = `${row.contract}::${row.function}`;
        const isAnyone = anyoneFnKeys.has(key);
        return (
          <span className="font-mono text-body text-text-secondary">
            {row.function}
            {isAnyone && (
              <span className="ml-2 inline-flex items-center rounded-sm bg-[var(--critical)]/15 px-1.5 py-0.5 text-caption font-semibold uppercase text-[var(--critical)]">
                anyone
              </span>
            )}
          </span>
        );
      },
    },
    {
      id: 'visibility',
      header: 'Visibility',
      accessorKey: 'visibility',
      enableColumnFilter: true,
      cell: (row) => <VisibilityBadge visibility={row.visibility} />,
    },
  ];

  if (showMutability) {
    cols.push({
      id: 'mutability',
      header: 'Mutability',
      accessorKey: 'state_mutability',
      cell: (row) => <span className="text-caption text-text-tertiary">{row.state_mutability ?? '--'}</span>,
    });
  }

  cols.push(
    {
      id: 'modifiers',
      header: 'Modifiers',
      accessorKey: 'modifiers',
      cell: (row) =>
        row.modifiers.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {row.modifiers.map((mod: string) => (
              <span
                key={mod}
                className="inline-flex items-center rounded-sm bg-surface-3 px-2 py-0.5 text-caption text-text-secondary"
              >
                {mod}
              </span>
            ))}
          </div>
        ) : (
          <span className="text-text-tertiary">--</span>
        ),
    },
    {
      id: 'location',
      header: 'Location',
      accessorKey: 'evidence',
      cell: (row) => (
        <CodeReference
          file={row.evidence.file}
          lineStart={row.evidence.line_start}
          lineEnd={row.evidence.line_end}
          snippet={row.evidence.snippet}
        />
      ),
    },
  );

  return cols;
}

// ─── Component ──────────────────────────────────────────────────────

interface AccessClientProps {
  writeFunctions: AccessFunction[];
  readOnlyFunctions: AccessFunction[];
  anyoneFnKeys: string[];
  anyoneRole: Role | null;
  otherRoles: Role[];
}

export function AccessClient({
  writeFunctions,
  readOnlyFunctions,
  anyoneFnKeys,
  otherRoles,
}: AccessClientProps) {
  const [activeTab, setActiveTab] = useState<Tab>('All');
  const [showUnprotectedOnly, setShowUnprotectedOnly] = useState(false);
  const anyoneSet = useMemo(() => new Set(anyoneFnKeys), [anyoneFnKeys]);

  const allFunctions = useMemo(
    () => [...writeFunctions, ...readOnlyFunctions],
    [writeFunctions, readOnlyFunctions],
  );

  const unprotectedFunctions = useMemo(() => {
    return writeFunctions.filter((fn) => anyoneSet.has(`${fn.contract}::${fn.function}`));
  }, [writeFunctions, anyoneSet]);

  const displayedData = useMemo(() => {
    switch (activeTab) {
      case 'All':
        return allFunctions;
      case 'State-Changing':
        return showUnprotectedOnly ? unprotectedFunctions : writeFunctions;
      case 'Read-Only':
        return readOnlyFunctions;
    }
  }, [activeTab, showUnprotectedOnly, allFunctions, writeFunctions, readOnlyFunctions, unprotectedFunctions]);

  const showMutability = activeTab === 'All' || activeTab === 'Read-Only';
  const columns = useMemo(
    () => makeColumns(anyoneSet, showMutability),
    [anyoneSet, showMutability],
  );

  return (
    <>
      {/* Segmented control */}
      <div className="mb-sp-5 flex flex-wrap items-center gap-sp-3">
        <div className="inline-flex overflow-x-auto rounded-md bg-surface-3 p-1">
          {TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => {
                setActiveTab(tab);
                if (tab !== 'State-Changing') setShowUnprotectedOnly(false);
              }}
              className={`whitespace-nowrap rounded-sm px-sp-3 py-1.5 text-body font-medium ${
                activeTab === tab
                  ? 'bg-surface-2 text-text-primary shadow-sm'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              {tab}
              <span className="ml-1.5 text-caption opacity-60">
                {tab === 'All' && allFunctions.length}
                {tab === 'State-Changing' && writeFunctions.length}
                {tab === 'Read-Only' && readOnlyFunctions.length}
              </span>
            </button>
          ))}
        </div>

        {/* Unprotected toggle — only visible on State-Changing tab */}
        {activeTab === 'State-Changing' && unprotectedFunctions.length > 0 && (
          <button
            type="button"
            onClick={() => setShowUnprotectedOnly((v) => !v)}
            className={`rounded-sm px-sp-3 py-1.5 text-body font-medium ${
              showUnprotectedOnly
                ? 'bg-[var(--critical)]/15 text-[var(--critical)] shadow-sm'
                : 'bg-surface-3 text-text-secondary hover:text-text-primary'
            }`}
          >
            Unprotected only
            <span className="ml-1.5 text-caption opacity-60">{unprotectedFunctions.length}</span>
          </button>
        )}
      </div>

      {/* Table */}
      <div className="mb-sp-6">
        <FilterableTable
          columns={columns}
          data={displayedData}
          defaultOpen={true}
          rowClassName={(row) => {
            const key = `${row.contract}::${row.function}`;
            return anyoneSet.has(key)
              ? 'bg-[var(--critical)]/5 hover:bg-[var(--critical)]/10'
              : 'bg-surface-1 hover:bg-surface-3';
          }}
        />
      </div>

      {/* Role cards */}
      {otherRoles.length > 0 && (
        <div className="mb-sp-6">
          <h3 className="mb-sp-3 text-heading font-medium text-text-primary">Roles</h3>
          <div className="grid gap-sp-3 sm:grid-cols-2">
            {otherRoles.map((role) => (
              <div
                key={role.role}
                className="rounded-md border border-border-default bg-surface-2 p-sp-4"
              >
                <div className="mb-sp-2 flex items-center justify-between">
                  <h4 className="text-heading font-medium text-text-primary">{role.role}</h4>
                  <ConfidenceBadge level={role.confidence} derivedFrom={role.derived_from} />
                </div>
                <p className="mb-sp-3 text-body text-text-secondary">{role.description}</p>

                {role.modifier && (
                  <p className="mb-sp-2 text-caption text-text-tertiary">
                    Modifier:{' '}
                    <code className="rounded-sm bg-surface-0 px-1.5 py-0.5 text-text-secondary">
                      {role.modifier}
                    </code>
                  </p>
                )}

                {role.functions.length > 0 && (
                  <div className="mb-sp-2">
                    <p className="mb-1 text-caption font-medium uppercase text-text-tertiary">
                      Functions ({role.functions.length})
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {role.functions.map((fn) => (
                        <span
                          key={`${fn.contract}::${fn.function}`}
                          className="inline-flex items-center rounded-sm bg-surface-3 px-2 py-0.5 font-mono text-caption text-text-secondary"
                        >
                          {fn.contract}.{fn.function}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {role.warnings.length > 0 && (
                  <div className="mt-sp-2 space-y-1 border-t border-border-subtle pt-sp-2">
                    {role.warnings.map((w, i) => (
                      <p key={i} className="text-caption text-[var(--medium)]">
                        {w}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
