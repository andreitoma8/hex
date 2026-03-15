import { readJsonFile } from '@/lib/data';
import { NotYetGenerated } from '@/components/NotYetGenerated';
import { StatsClient, type StatsClientProps } from './StatsClient';

// ─── Types ──────────────────────────────────────────────────────────

interface Stats {
  generated_at: string;
  totals: StatsClientProps['totals'];
  solidity_version: string;
  erc_eip_usage: string[];
  dependencies: StatsClientProps['dependencies'];
  test_coverage: StatsClientProps['test_coverage'];
  per_contract: StatsClientProps['per_contract'];
}

// ─── Component ──────────────────────────────────────────────────────

export default function StatsPage() {
  const stats = readJsonFile<Stats>('stats.json');

  if (!stats) {
    return (
      <div>
        <h2 className="mb-sp-5 text-title font-semibold text-text-primary">Stats</h2>
        <NotYetGenerated command="solaudit stats" />
      </div>
    );
  }

  return (
    <div>
      <h2 className="mb-sp-5 text-title font-semibold text-text-primary">Stats</h2>
      <StatsClient
        totals={stats.totals}
        per_contract={stats.per_contract}
        erc_eip_usage={stats.erc_eip_usage}
        dependencies={stats.dependencies}
        test_coverage={stats.test_coverage}
      />
    </div>
  );
}
