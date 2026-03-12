import { readJsonFile } from '@/lib/data';
import { NotYetGenerated } from '@/components/NotYetGenerated';
import { ConfidenceBadge } from '@/components/ConfidenceBadge';
import { ReadOnlyFunctions } from './ReadOnlyFunctions';

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

interface AccessControl {
  functions: AccessFunction[];
  roles: Role[];
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

// ─── Component ──────────────────────────────────────────────────────

export default function AccessPage() {
  const data = readJsonFile<AccessControl>('access-control.json');

  if (!data) {
    return (
      <div>
        <h2 className="mb-6 text-2xl font-bold text-gray-100">Access Control</h2>
        <NotYetGenerated command="solaudit access" />
      </div>
    );
  }

  const { functions, roles } = data;

  const writeFunctions = functions.filter(
    (fn) => fn.state_mutability !== 'view' && fn.state_mutability !== 'pure',
  );
  const readOnlyFunctions = functions.filter(
    (fn) => fn.state_mutability === 'view' || fn.state_mutability === 'pure',
  );

  // Separate "anyone" role from others
  const anyoneRole = roles.find(
    (r) => r.role.toLowerCase() === 'anyone' || r.role.toLowerCase() === 'public',
  );
  const otherRoles = roles.filter(
    (r) => r.role.toLowerCase() !== 'anyone' && r.role.toLowerCase() !== 'public',
  );

  // Set of function keys belonging to "anyone" role for highlighting
  const anyoneFnKeys = new Set(
    anyoneRole?.functions.map((f) => `${f.contract}::${f.function}`) ?? [],
  );

  return (
    <div>
      <h2 className="mb-6 text-2xl font-bold text-gray-100">Access Control</h2>

      <p className="mb-6 text-sm text-gray-400">
        {functions.length} function{functions.length !== 1 ? 's' : ''} analyzed
        ({writeFunctions.length} state-changing, {readOnlyFunctions.length} read-only)
        {' '}across {roles.length} role{roles.length !== 1 ? 's' : ''}
      </p>

      {/* ── Tier 1: State-changing functions table ── */}
      <div className="mb-10">
        <h3 className="mb-3 text-lg font-semibold text-gray-200">
          State-Changing Functions
        </h3>
        <div className="overflow-x-auto rounded-lg border border-gray-700">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-700 bg-gray-800 text-xs uppercase text-gray-400">
              <tr>
                <th className="px-4 py-3">Contract</th>
                <th className="px-4 py-3">Function</th>
                <th className="px-4 py-3">Visibility</th>
                <th className="px-4 py-3">Modifiers</th>
                <th className="px-4 py-3">Location</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700/50">
              {writeFunctions.map((fn) => {
                const key = `${fn.contract}::${fn.function}`;
                const isAnyone = anyoneFnKeys.has(key);
                return (
                  <tr
                    key={key}
                    className={
                      isAnyone
                        ? 'bg-red-950/30 transition-colors hover:bg-red-900/30'
                        : 'bg-gray-900 transition-colors hover:bg-gray-800/70'
                    }
                  >
                    <td className="px-4 py-3 font-medium text-gray-200">{fn.contract}</td>
                    <td className="px-4 py-3 font-mono text-sm text-gray-300">
                      {fn.function}
                      {isAnyone && (
                        <span className="ml-2 inline-flex items-center rounded bg-red-600/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-red-400">
                          anyone
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <VisibilityBadge visibility={fn.visibility} />
                    </td>
                    <td className="px-4 py-3">
                      {fn.modifiers.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {fn.modifiers.map((mod) => (
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
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">
                      {fn.evidence.file}:{fn.evidence.line_start}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Read-only functions (collapsible) ── */}
      {readOnlyFunctions.length > 0 && (
        <ReadOnlyFunctions functions={readOnlyFunctions} anyoneFnKeys={[...anyoneFnKeys]} />
      )}

      {/* ── Attack Surface: "anyone" role (state-changing only) ── */}
      {anyoneRole && (() => {
        // Build a set of write-function keys so we exclude view/pure from the attack surface
        const writeFnKeys = new Set(
          writeFunctions.map((fn) => `${fn.contract}::${fn.function}`),
        );
        const attackSurfaceFns = anyoneRole.functions.filter(
          (fn) => writeFnKeys.has(`${fn.contract}::${fn.function}`),
        );
        return attackSurfaceFns.length > 0 ? (
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
              {anyoneRole.warnings.length > 0 && (
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
        ) : null;
      })()}

      {/* ── Tier 2: Role cards ── */}
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
    </div>
  );
}
