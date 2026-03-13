'use client';

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
  external: 'bg-red-600/20 text-red-400 border-red-500/30',
  public: 'bg-orange-600/20 text-orange-400 border-orange-500/30',
  internal: 'bg-blue-600/20 text-blue-400 border-blue-500/30',
  private: 'bg-gray-600/20 text-gray-400 border-gray-500/30',
};

function VisibilityBadge({ visibility }: { visibility: string }) {
  const style =
    VISIBILITY_STYLES[visibility] ?? 'bg-gray-600/20 text-gray-400 border-gray-500/30';
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${style}`}
    >
      {visibility}
    </span>
  );
}

// ─── Columns ────────────────────────────────────────────────────────

function makeWriteColumns(anyoneFnKeys: Set<string>): FilterableColumn<AccessFunction>[] {
  return [
    {
      id: 'contract',
      header: 'Contract',
      accessorKey: 'contract',
      enableColumnFilter: true,
      cell: (row) => <span className="font-medium text-gray-200">{row.contract}</span>,
    },
    {
      id: 'function',
      header: 'Function',
      accessorKey: 'function',
      cell: (row) => {
        const key = `${row.contract}::${row.function}`;
        const isAnyone = anyoneFnKeys.has(key);
        return (
          <span className="font-mono text-sm text-gray-300">
            {row.function}
            {isAnyone && (
              <span className="ml-2 inline-flex items-center rounded bg-red-600/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-red-400">
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
                className="inline-flex items-center rounded bg-gray-700 px-2 py-0.5 text-xs text-gray-300"
              >
                {mod}
              </span>
            ))}
          </div>
        ) : (
          <span className="text-gray-600">--</span>
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
  ];
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
  anyoneRole,
  otherRoles,
}: AccessClientProps) {
  const anyoneSet = new Set(anyoneFnKeys);
  const writeColumns = makeWriteColumns(anyoneSet);

  // Build a set of write-function keys for attack surface filtering
  const writeFnKeys = new Set(
    writeFunctions.map((fn) => `${fn.contract}::${fn.function}`),
  );
  const attackSurfaceFns = anyoneRole?.functions.filter(
    (fn) => writeFnKeys.has(`${fn.contract}::${fn.function}`),
  ) ?? [];

  return (
    <>
      {/* State-changing functions table */}
      <div className="mb-10">
        <h3 className="mb-3 text-lg font-semibold text-gray-200">
          State-Changing Functions
        </h3>
        <FilterableTable
          columns={writeColumns}
          data={writeFunctions}
          defaultOpen={true}
          rowClassName={(row) => {
            const key = `${row.contract}::${row.function}`;
            return anyoneSet.has(key)
              ? 'bg-red-950/30 transition-colors hover:bg-red-900/30'
              : 'bg-gray-900 transition-colors hover:bg-gray-800/70';
          }}
        />
      </div>

      {/* Read-only functions (collapsible) */}
      {readOnlyFunctions.length > 0 && (
        <div className="mb-10">
          <FilterableTable
            columns={[
              {
                id: 'contract',
                header: 'Contract',
                accessorKey: 'contract',
                enableColumnFilter: true,
                cell: (row) => <span className="font-medium text-gray-200">{row.contract}</span>,
              },
              {
                id: 'function',
                header: 'Function',
                accessorKey: 'function',
                cell: (row) => <span className="font-mono text-sm text-gray-300">{row.function}</span>,
              },
              {
                id: 'visibility',
                header: 'Visibility',
                accessorKey: 'visibility',
                cell: (row) => <VisibilityBadge visibility={row.visibility} />,
              },
              {
                id: 'mutability',
                header: 'Mutability',
                accessorKey: 'state_mutability',
                cell: (row) => <span className="text-xs text-gray-400">{row.state_mutability ?? '--'}</span>,
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
            ]}
            data={readOnlyFunctions}
            title={`Read-Only Functions (${readOnlyFunctions.length})`}
            defaultOpen={false}
          />
        </div>
      )}

      {/* Attack Surface */}
      {attackSurfaceFns.length > 0 && (
        <div className="mb-10">
          <h3 className="mb-3 text-lg font-semibold text-red-400">
            Attack Surface &mdash; Callable by Anyone
          </h3>
          <div className="rounded-lg border border-red-800/50 bg-red-950/20 p-5">
            <p className="mb-3 text-sm text-red-300/80">
              {attackSurfaceFns.length} state-changing function
              {attackSurfaceFns.length !== 1 ? 's' : ''} can be called without
              restriction. These form the primary attack surface.
            </p>
            <div className="flex flex-wrap gap-2">
              {attackSurfaceFns.map((fn) => (
                <span
                  key={`${fn.contract}::${fn.function}`}
                  className="inline-flex items-center rounded border border-red-700/50 bg-red-900/30 px-2.5 py-1 text-sm font-mono text-red-300"
                >
                  {fn.contract}.{fn.function}
                </span>
              ))}
            </div>
            {anyoneRole && anyoneRole.warnings.length > 0 && (
              <div className="mt-3 space-y-1">
                {anyoneRole.warnings.map((w, i) => (
                  <p key={i} className="text-xs text-yellow-400">
                    Warning: {w}
                  </p>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Role cards */}
      {otherRoles.length > 0 && (
        <div className="mb-8">
          <h3 className="mb-3 text-lg font-semibold text-gray-200">Roles</h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {otherRoles.map((role) => (
              <div
                key={role.role}
                className="rounded-lg border border-gray-700 bg-gray-800 p-5"
              >
                <div className="mb-2 flex items-center justify-between">
                  <h4 className="font-semibold text-gray-100">{role.role}</h4>
                  <ConfidenceBadge level={role.confidence} derivedFrom={role.derived_from} />
                </div>
                <p className="mb-3 text-sm text-gray-400">{role.description}</p>

                {role.modifier && (
                  <p className="mb-2 text-xs text-gray-500">
                    Modifier:{' '}
                    <code className="rounded bg-gray-900 px-1.5 py-0.5 text-gray-300">
                      {role.modifier}
                    </code>
                  </p>
                )}

                {role.functions.length > 0 && (
                  <div className="mb-2">
                    <p className="mb-1 text-xs font-medium uppercase text-gray-500">
                      Functions ({role.functions.length})
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {role.functions.map((fn) => (
                        <span
                          key={`${fn.contract}::${fn.function}`}
                          className="inline-flex items-center rounded bg-gray-700 px-2 py-0.5 text-xs font-mono text-gray-300"
                        >
                          {fn.contract}.{fn.function}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {role.warnings.length > 0 && (
                  <div className="mt-2 space-y-1 border-t border-gray-700 pt-2">
                    {role.warnings.map((w, i) => (
                      <p key={i} className="text-xs text-yellow-400">
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
