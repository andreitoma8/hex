import { readJsonFile } from '@/lib/data';
import { NotYetGenerated } from '@/components/NotYetGenerated';
import { ConfidenceBadge } from '@/components/ConfidenceBadge';

// ─── Types ──────────────────────────────────────────────────────────

interface ConfidenceValue {
  value: boolean | string;
  confidence: string;
  derived_from: string;
  reasoning?: string;
  warnings?: string[];
  guard_type?: string;
}

interface Evidence {
  file: string;
  line_start: number;
  line_end: number;
  snippet?: string;
}

interface ExternalCall {
  contract: string;
  function: string;
  evidence: Evidence;
  target: string;
  method: string;
  return_checked: ConfidenceValue;
  inside_reentrancy_guard: ConfidenceValue;
  call_type: string;
  trust_level: ConfidenceValue;
}

interface ExternalCalls {
  calls: ExternalCall[];
}

// ─── Helpers ────────────────────────────────────────────────────────

function trustLevelBg(trust: string): string {
  const t = trust.toLowerCase();
  if (t === 'external' || t === 'untrusted') return 'bg-red-950/30';
  if (t === 'semi-trusted' || t === 'semi_trusted') return 'bg-yellow-950/20';
  if (t === 'trusted') return 'bg-green-950/20';
  return 'bg-gray-900';
}

function trustLevelHover(trust: string): string {
  const t = trust.toLowerCase();
  if (t === 'external' || t === 'untrusted') return 'hover:bg-red-900/30';
  if (t === 'semi-trusted' || t === 'semi_trusted') return 'hover:bg-yellow-900/20';
  if (t === 'trusted') return 'hover:bg-green-900/20';
  return 'hover:bg-gray-800/70';
}

const TRUST_BADGE_STYLES: Record<string, string> = {
  external: 'bg-red-600/20 text-red-400 border-red-500/30',
  untrusted: 'bg-red-600/20 text-red-400 border-red-500/30',
  'semi-trusted': 'bg-yellow-600/20 text-yellow-400 border-yellow-500/30',
  semi_trusted: 'bg-yellow-600/20 text-yellow-400 border-yellow-500/30',
  trusted: 'bg-green-600/20 text-green-400 border-green-500/30',
};

function TrustBadge({ trust }: { trust: string }) {
  const style =
    TRUST_BADGE_STYLES[trust.toLowerCase()] ??
    'bg-gray-600/20 text-gray-400 border-gray-500/30';
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${style}`}
    >
      {trust}
    </span>
  );
}

function BoolIndicator({ value, label }: { value: boolean | string; label?: string }) {
  const isTrue =
    value === true || value === 'true' || value === 'yes';
  return (
    <span className={isTrue ? 'text-green-400' : 'text-red-400'}>
      {label ?? (isTrue ? 'Yes' : 'No')}
    </span>
  );
}

// ─── Component ──────────────────────────────────────────────────────

export default function CallsPage() {
  const data = readJsonFile<ExternalCalls>('external-calls.json');

  if (!data) {
    return (
      <div>
        <h2 className="mb-6 text-2xl font-bold text-gray-100">External Calls</h2>
        <NotYetGenerated command="solaudit calls" />
      </div>
    );
  }

  const { calls } = data;

  // Counts by trust level
  const trustCounts: Record<string, number> = {};
  for (const c of calls) {
    const t = String(c.trust_level.value);
    trustCounts[t] = (trustCounts[t] ?? 0) + 1;
  }

  const uncheckedReturns = calls.filter(
    (c) => c.return_checked.value === false || c.return_checked.value === 'false',
  ).length;

  const unguardedCalls = calls.filter(
    (c) =>
      c.inside_reentrancy_guard.value === false ||
      c.inside_reentrancy_guard.value === 'false',
  ).length;

  return (
    <div>
      <h2 className="mb-6 text-2xl font-bold text-gray-100">External Calls</h2>

      <p className="mb-4 text-sm text-gray-400">
        {calls.length} external call{calls.length !== 1 ? 's' : ''} found
      </p>

      {/* Summary cards */}
      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {Object.entries(trustCounts).map(([level, count]) => (
          <div
            key={level}
            className="rounded-lg border border-gray-700 bg-gray-800 p-4"
          >
            <div className="text-2xl font-bold text-gray-100">{count}</div>
            <div className="mt-1 flex items-center gap-2">
              <TrustBadge trust={level} />
            </div>
          </div>
        ))}
        {uncheckedReturns > 0 && (
          <div className="rounded-lg border border-red-800/50 bg-red-950/20 p-4">
            <div className="text-2xl font-bold text-red-400">{uncheckedReturns}</div>
            <div className="mt-1 text-sm text-red-300/70">Unchecked returns</div>
          </div>
        )}
        {unguardedCalls > 0 && (
          <div className="rounded-lg border border-yellow-800/50 bg-yellow-950/20 p-4">
            <div className="text-2xl font-bold text-yellow-400">{unguardedCalls}</div>
            <div className="mt-1 text-sm text-yellow-300/70">No reentrancy guard</div>
          </div>
        )}
      </div>

      {/* Main table */}
      <div className="overflow-x-auto rounded-lg border border-gray-700">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-gray-700 bg-gray-800 text-xs uppercase text-gray-400">
            <tr>
              <th className="px-4 py-3">Contract</th>
              <th className="px-4 py-3">Function</th>
              <th className="px-4 py-3">Target</th>
              <th className="px-4 py-3">Method</th>
              <th className="px-4 py-3 text-center">Return Checked</th>
              <th className="px-4 py-3 text-center">Reentrancy Guard</th>
              <th className="px-4 py-3">Call Type</th>
              <th className="px-4 py-3">Trust Level</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700/50">
            {calls.map((call, idx) => {
              const trustStr = String(call.trust_level.value);
              return (
                <tr
                  key={`${call.contract}::${call.function}::${call.target}::${idx}`}
                  className={`${trustLevelBg(trustStr)} ${trustLevelHover(trustStr)} transition-colors`}
                >
                  <td className="px-4 py-3 font-medium text-gray-200">
                    {call.contract}
                  </td>
                  <td className="px-4 py-3 font-mono text-sm text-gray-300">
                    {call.function}
                  </td>
                  <td className="max-w-[180px] truncate px-4 py-3 font-mono text-sm text-gray-300">
                    {call.target}
                  </td>
                  <td className="px-4 py-3 font-mono text-sm text-gray-400">
                    {call.method}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      <BoolIndicator value={call.return_checked.value} />
                      <ConfidenceBadge
                        level={call.return_checked.confidence}
                        derivedFrom={call.return_checked.derived_from}
                      />
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      <BoolIndicator value={call.inside_reentrancy_guard.value} />
                      {call.inside_reentrancy_guard.guard_type && (
                        <span className="text-xs text-gray-500">
                          ({call.inside_reentrancy_guard.guard_type})
                        </span>
                      )}
                      <ConfidenceBadge
                        level={call.inside_reentrancy_guard.confidence}
                        derivedFrom={call.inside_reentrancy_guard.derived_from}
                      />
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center rounded bg-gray-700 px-2 py-0.5 text-xs text-gray-300">
                      {call.call_type}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <TrustBadge trust={trustStr} />
                      <ConfidenceBadge
                        level={call.trust_level.confidence}
                        derivedFrom={call.trust_level.derived_from}
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
