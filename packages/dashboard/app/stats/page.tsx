import { readJsonFile } from '@/lib/data';
import { NotYetGenerated } from '@/components/NotYetGenerated';

// ─── Types ──────────────────────────────────────────────────────────

interface PerContractStats {
  file: string;
  contract: string;
  type: string;
  nsloc: number;
  functions: number;
  external_functions: number;
  public_functions: number;
  internal_functions: number;
  private_functions: number;
  modifiers: number;
  events: number;
  errors: number;
  assembly_lines: number;
  inherits: string[];
}

interface DependencyEntry {
  package: string;
  version: string | null;
  imports: number;
}

interface CoveragePerContract {
  contract: string;
  file: string;
  line_pct: number;
  branch_pct: number;
}

interface TestCoverage {
  status: string;
  failure_reason: string | null;
  overall_line_pct: number | null;
  overall_branch_pct: number | null;
  per_contract: CoveragePerContract[];
}

interface Stats {
  generated_at: string;
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
  solidity_version: string;
  erc_eip_usage: string[];
  dependencies: DependencyEntry[];
  test_coverage: TestCoverage | null;
  per_contract: PerContractStats[];
}

// ─── Helpers ────────────────────────────────────────────────────────

function pctBarColor(pct: number): string {
  if (pct >= 80) return 'bg-green-500';
  if (pct >= 50) return 'bg-yellow-500';
  return 'bg-red-500';
}

// ─── Component ──────────────────────────────────────────────────────

export default function StatsPage() {
  const stats = readJsonFile<Stats>('stats.json');

  if (!stats) {
    return (
      <div>
        <h2 className="mb-6 text-2xl font-bold text-gray-100">Stats</h2>
        <NotYetGenerated command="solaudit stats" />
      </div>
    );
  }

  const { totals, per_contract, erc_eip_usage, dependencies, test_coverage } = stats;

  return (
    <div>
      <h2 className="mb-6 text-2xl font-bold text-gray-100">Stats</h2>

      {/* Summary cards */}
      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <SummaryCard label="Files" value={totals.files} />
        <SummaryCard label="Contracts" value={totals.contracts} />
        <SummaryCard label="Interfaces" value={totals.interfaces} />
        <SummaryCard label="Libraries" value={totals.libraries} />
        <SummaryCard label="Abstract" value={totals.abstract_contracts} />
        <SummaryCard label="Total Lines" value={totals.total_lines.toLocaleString()} />
        <SummaryCard label="nSLOC" value={totals.nsloc.toLocaleString()} />
        <SummaryCard label="Comments" value={totals.comment_lines.toLocaleString()} />
        <SummaryCard label="Blank Lines" value={totals.blank_lines.toLocaleString()} />
        <SummaryCard label="Assembly" value={totals.assembly_lines} />
      </div>

      {/* ERC/EIP badges */}
      {erc_eip_usage.length > 0 && (
        <div className="mb-8">
          <h3 className="mb-3 text-lg font-semibold text-gray-200">ERC / EIP Usage</h3>
          <div className="flex flex-wrap gap-2">
            {erc_eip_usage.map((erc) => (
              <span
                key={erc}
                className="inline-flex items-center rounded-full border border-purple-500/30 bg-purple-600/20 px-3 py-1 text-sm font-medium text-purple-300"
              >
                {erc}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Per-contract table */}
      <div className="mb-8">
        <h3 className="mb-3 text-lg font-semibold text-gray-200">Per-Contract Breakdown</h3>
        <div className="overflow-x-auto rounded-lg border border-gray-700">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-700 bg-gray-800 text-xs uppercase text-gray-400">
              <tr>
                <th className="px-4 py-3">File</th>
                <th className="px-4 py-3">Contract</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3 text-right">nSLOC</th>
                <th className="px-4 py-3 text-right">Functions</th>
                <th className="px-4 py-3 text-right">Modifiers</th>
                <th className="px-4 py-3 text-right">Events</th>
                <th className="px-4 py-3 text-right">Errors</th>
                <th className="px-4 py-3 text-right">Assembly</th>
                <th className="px-4 py-3">Inherits</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700/50">
              {per_contract.map((c) => (
                <tr
                  key={`${c.file}:${c.contract}`}
                  className="bg-gray-900 transition-colors hover:bg-gray-800/70"
                >
                  <td className="max-w-[200px] truncate px-4 py-3 font-mono text-xs text-gray-400">
                    {c.file}
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-200">{c.contract}</td>
                  <td className="px-4 py-3">
                    <TypeBadge type={c.type} />
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-gray-300">{c.nsloc}</td>
                  <td className="px-4 py-3 text-right font-mono text-gray-300">{c.functions}</td>
                  <td className="px-4 py-3 text-right font-mono text-gray-300">{c.modifiers}</td>
                  <td className="px-4 py-3 text-right font-mono text-gray-300">{c.events}</td>
                  <td className="px-4 py-3 text-right font-mono text-gray-300">{c.errors}</td>
                  <td className="px-4 py-3 text-right font-mono text-gray-300">
                    {c.assembly_lines > 0 ? (
                      <span className="text-yellow-400">{c.assembly_lines}</span>
                    ) : (
                      0
                    )}
                  </td>
                  <td className="max-w-[200px] truncate px-4 py-3 text-xs text-gray-400">
                    {c.inherits.length > 0 ? c.inherits.join(', ') : '--'}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t border-gray-600 bg-gray-800 font-medium text-gray-300">
              <tr>
                <td className="px-4 py-3" colSpan={3}>
                  Total ({per_contract.length} contracts)
                </td>
                <td className="px-4 py-3 text-right font-mono">
                  {per_contract.reduce((s, c) => s + c.nsloc, 0)}
                </td>
                <td className="px-4 py-3 text-right font-mono">
                  {per_contract.reduce((s, c) => s + c.functions, 0)}
                </td>
                <td className="px-4 py-3 text-right font-mono">
                  {per_contract.reduce((s, c) => s + c.modifiers, 0)}
                </td>
                <td className="px-4 py-3 text-right font-mono">
                  {per_contract.reduce((s, c) => s + c.events, 0)}
                </td>
                <td className="px-4 py-3 text-right font-mono">
                  {per_contract.reduce((s, c) => s + c.errors, 0)}
                </td>
                <td className="px-4 py-3 text-right font-mono">
                  {per_contract.reduce((s, c) => s + c.assembly_lines, 0)}
                </td>
                <td className="px-4 py-3" />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Test coverage */}
      {test_coverage && test_coverage.status === 'available' && (
        <div className="mb-8">
          <h3 className="mb-3 text-lg font-semibold text-gray-200">Test Coverage</h3>

          {/* Overall */}
          <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {test_coverage.overall_line_pct != null && (
              <div className="rounded-lg border border-gray-700 bg-gray-800 p-4">
                <div className="mb-1 text-sm text-gray-400">Line Coverage</div>
                <div className="text-2xl font-bold text-gray-100">
                  {test_coverage.overall_line_pct.toFixed(1)}%
                </div>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-gray-700">
                  <div
                    className={`h-full rounded-full ${pctBarColor(test_coverage.overall_line_pct)}`}
                    style={{ width: `${Math.min(test_coverage.overall_line_pct, 100)}%` }}
                  />
                </div>
              </div>
            )}
            {test_coverage.overall_branch_pct != null && (
              <div className="rounded-lg border border-gray-700 bg-gray-800 p-4">
                <div className="mb-1 text-sm text-gray-400">Branch Coverage</div>
                <div className="text-2xl font-bold text-gray-100">
                  {test_coverage.overall_branch_pct.toFixed(1)}%
                </div>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-gray-700">
                  <div
                    className={`h-full rounded-full ${pctBarColor(test_coverage.overall_branch_pct)}`}
                    style={{ width: `${Math.min(test_coverage.overall_branch_pct, 100)}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Per-contract coverage bars */}
          {test_coverage.per_contract.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-gray-700">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-gray-700 bg-gray-800 text-xs uppercase text-gray-400">
                  <tr>
                    <th className="px-4 py-3">Contract</th>
                    <th className="px-4 py-3">File</th>
                    <th className="px-4 py-3">Line %</th>
                    <th className="px-4 py-3 w-48">Line Coverage</th>
                    <th className="px-4 py-3">Branch %</th>
                    <th className="px-4 py-3 w-48">Branch Coverage</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700/50">
                  {test_coverage.per_contract.map((cov) => (
                    <tr
                      key={`${cov.file}:${cov.contract}`}
                      className="bg-gray-900 transition-colors hover:bg-gray-800/70"
                    >
                      <td className="px-4 py-3 font-medium text-gray-200">{cov.contract}</td>
                      <td className="max-w-[200px] truncate px-4 py-3 font-mono text-xs text-gray-400">
                        {cov.file}
                      </td>
                      <td className="px-4 py-3 font-mono text-gray-300">
                        {cov.line_pct.toFixed(1)}%
                      </td>
                      <td className="px-4 py-3">
                        <div className="h-2 w-full overflow-hidden rounded-full bg-gray-700">
                          <div
                            className={`h-full rounded-full ${pctBarColor(cov.line_pct)}`}
                            style={{ width: `${Math.min(cov.line_pct, 100)}%` }}
                          />
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-gray-300">
                        {cov.branch_pct.toFixed(1)}%
                      </td>
                      <td className="px-4 py-3">
                        <div className="h-2 w-full overflow-hidden rounded-full bg-gray-700">
                          <div
                            className={`h-full rounded-full ${pctBarColor(cov.branch_pct)}`}
                            style={{ width: `${Math.min(cov.branch_pct, 100)}%` }}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Dependencies */}
      {dependencies.length > 0 && (
        <div className="mb-8">
          <h3 className="mb-3 text-lg font-semibold text-gray-200">Dependencies</h3>
          <div className="overflow-x-auto rounded-lg border border-gray-700">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-gray-700 bg-gray-800 text-xs uppercase text-gray-400">
                <tr>
                  <th className="px-4 py-3">Package</th>
                  <th className="px-4 py-3">Version</th>
                  <th className="px-4 py-3 text-right">Imports</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700/50">
                {dependencies.map((dep) => (
                  <tr
                    key={dep.package}
                    className="bg-gray-900 transition-colors hover:bg-gray-800/70"
                  >
                    <td className="px-4 py-3 font-medium text-gray-200">{dep.package}</td>
                    <td className="px-4 py-3 font-mono text-sm text-gray-400">
                      {dep.version ?? '--'}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-gray-300">
                      {dep.imports}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Local sub-components ───────────────────────────────────────────

function SummaryCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-gray-700 bg-gray-800 p-4">
      <div className="text-2xl font-bold text-gray-100">{value}</div>
      <div className="mt-1 text-sm text-gray-400">{label}</div>
    </div>
  );
}

const TYPE_BADGE_STYLES: Record<string, string> = {
  contract: 'bg-blue-600/20 text-blue-400 border-blue-500/30',
  interface: 'bg-cyan-600/20 text-cyan-400 border-cyan-500/30',
  library: 'bg-purple-600/20 text-purple-400 border-purple-500/30',
  abstract: 'bg-orange-600/20 text-orange-400 border-orange-500/30',
};

function TypeBadge({ type }: { type: string }) {
  const style = TYPE_BADGE_STYLES[type] ?? 'bg-gray-600/20 text-gray-400 border-gray-500/30';
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${style}`}
    >
      {type}
    </span>
  );
}
