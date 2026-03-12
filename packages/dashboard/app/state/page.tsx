import { readJsonFile } from '@/lib/data';
import { NotYetGenerated } from '@/components/NotYetGenerated';
import { ConfidenceBadge } from '@/components/ConfidenceBadge';

// ─── Types ──────────────────────────────────────────────────────────

interface ReadWriteInfo {
  functions: string[];
  confidence: string;
  derived_from: string;
  warnings?: string[];
}

interface StateVariable {
  contract: string;
  name: string;
  type: string;
  visibility: string;
  mutability: string;
  value?: string;
  evidence: {
    file: string;
    line_start: number;
    line_end: number;
    snippet?: string;
  };
  written_by: ReadWriteInfo;
  read_by: ReadWriteInfo;
  has_setter: boolean;
  is_bounded: boolean;
  bound_description?: string | null;
  is_unused?: boolean;
  storage_slot?: number | null;
}

interface StateVars {
  variables: StateVariable[];
  storage_layout_source: string | null;
}

// ─── Helpers ────────────────────────────────────────────────────────

function rowBgClass(v: StateVariable): string {
  if (v.is_unused) return 'bg-red-950/30';
  if (v.mutability === 'mutable' && !v.is_bounded) return 'bg-yellow-950/20';
  if (v.mutability === 'constant' || v.mutability === 'immutable') return 'bg-green-950/20';
  return 'bg-gray-900';
}

function rowHoverClass(v: StateVariable): string {
  if (v.is_unused) return 'hover:bg-red-900/30';
  if (v.mutability === 'mutable' && !v.is_bounded) return 'hover:bg-yellow-900/20';
  if (v.mutability === 'constant' || v.mutability === 'immutable')
    return 'hover:bg-green-900/20';
  return 'hover:bg-gray-800/70';
}

const MUTABILITY_STYLES: Record<string, string> = {
  mutable: 'bg-yellow-600/20 text-yellow-400 border-yellow-500/30',
  constant: 'bg-green-600/20 text-green-400 border-green-500/30',
  immutable: 'bg-green-600/20 text-green-400 border-green-500/30',
};

function MutabilityBadge({ mutability }: { mutability: string }) {
  const style =
    MUTABILITY_STYLES[mutability] ?? 'bg-gray-600/20 text-gray-400 border-gray-500/30';
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${style}`}
    >
      {mutability}
    </span>
  );
}

const VISIBILITY_STYLES: Record<string, string> = {
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

export default function StatePage() {
  const data = readJsonFile<StateVars>('state-vars.json');

  if (!data) {
    return (
      <div>
        <h2 className="mb-6 text-2xl font-bold text-gray-100">State Variables</h2>
        <NotYetGenerated command="solaudit state" />
      </div>
    );
  }

  const { variables } = data;

  const unusedCount = variables.filter((v) => v.is_unused).length;
  const unboundedCount = variables.filter(
    (v) => v.mutability === 'mutable' && !v.is_bounded,
  ).length;
  const constantCount = variables.filter(
    (v) => v.mutability === 'constant' || v.mutability === 'immutable',
  ).length;

  return (
    <div>
      <h2 className="mb-6 text-2xl font-bold text-gray-100">State Variables</h2>

      <p className="mb-4 text-sm text-gray-400">
        {variables.length} variable{variables.length !== 1 ? 's' : ''} found
      </p>

      {/* Legend */}
      <div className="mb-6 flex flex-wrap gap-4 text-xs text-gray-400">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded bg-red-950/60 border border-red-800/50" />
          Unused ({unusedCount})
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded bg-yellow-950/60 border border-yellow-800/50" />
          Mutable + Unbounded ({unboundedCount})
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded bg-green-950/60 border border-green-800/50" />
          Constant / Immutable ({constantCount})
        </span>
      </div>

      {/* Main table */}
      <div className="overflow-x-auto rounded-lg border border-gray-700">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-gray-700 bg-gray-800 text-xs uppercase text-gray-400">
            <tr>
              <th className="px-4 py-3">Contract</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Visibility</th>
              <th className="px-4 py-3">Mutability</th>
              <th className="px-4 py-3">Readers</th>
              <th className="px-4 py-3">Writers</th>
              <th className="px-4 py-3 text-center">Setter</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700/50">
            {variables.map((v) => (
              <tr
                key={`${v.contract}::${v.name}`}
                className={`${rowBgClass(v)} ${rowHoverClass(v)} transition-colors`}
              >
                <td className="px-4 py-3 font-medium text-gray-200">{v.contract}</td>
                <td className="px-4 py-3">
                  <span className="font-mono text-sm text-gray-300">{v.name}</span>
                  {v.is_unused && (
                    <span className="ml-2 inline-flex items-center rounded bg-red-600/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-red-400">
                      unused
                    </span>
                  )}
                  {v.mutability === 'mutable' && !v.is_bounded && (
                    <span className="ml-2 inline-flex items-center rounded bg-yellow-600/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-yellow-400">
                      unbounded
                    </span>
                  )}
                </td>
                <td className="max-w-[180px] truncate px-4 py-3 font-mono text-xs text-gray-400">
                  {v.type}
                </td>
                <td className="px-4 py-3">
                  <VisibilityBadge visibility={v.visibility} />
                </td>
                <td className="px-4 py-3">
                  <MutabilityBadge mutability={v.mutability} />
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-1">
                    {v.read_by.functions.length > 0 ? (
                      <>
                        {v.read_by.functions.slice(0, 3).map((fn) => (
                          <span
                            key={fn}
                            className="inline-flex items-center rounded bg-gray-700 px-1.5 py-0.5 text-xs font-mono text-gray-300"
                          >
                            {fn}
                          </span>
                        ))}
                        {v.read_by.functions.length > 3 && (
                          <span className="text-xs text-gray-500">
                            +{v.read_by.functions.length - 3}
                          </span>
                        )}
                        <ConfidenceBadge
                          level={v.read_by.confidence}
                          derivedFrom={v.read_by.derived_from}
                        />
                      </>
                    ) : (
                      <span className="text-gray-600">--</span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-1">
                    {v.written_by.functions.length > 0 ? (
                      <>
                        {v.written_by.functions.slice(0, 3).map((fn) => (
                          <span
                            key={fn}
                            className="inline-flex items-center rounded bg-gray-700 px-1.5 py-0.5 text-xs font-mono text-gray-300"
                          >
                            {fn}
                          </span>
                        ))}
                        {v.written_by.functions.length > 3 && (
                          <span className="text-xs text-gray-500">
                            +{v.written_by.functions.length - 3}
                          </span>
                        )}
                        <ConfidenceBadge
                          level={v.written_by.confidence}
                          derivedFrom={v.written_by.derived_from}
                        />
                      </>
                    ) : (
                      <span className="text-gray-600">--</span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-center">
                  {v.has_setter ? (
                    <span className="text-green-400">Yes</span>
                  ) : (
                    <span className="text-gray-600">No</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
