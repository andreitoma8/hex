import { readJsonFile, fileExists } from '@/lib/data';
import { NotYetGenerated } from '@/components/NotYetGenerated';
import { ProgressClient, type ProgressClientProps } from './ProgressClient';

// ─── Types ──────────────────────────────────────────────────────────

interface PerContractStats {
  file: string;
  contract: string;
  type: string;
  nsloc: number;
}

interface Stats {
  totals: { nsloc: number };
  per_contract: PerContractStats[];
}

interface ProgressData {
  updated_at: string;
  reviewed_contracts: Record<string, boolean>;
}

interface Finding {
  id: string;
  severity: string;
}

interface TrackingEntry {
  id: string;
  severity: string;
  status: string;
}

// ─── Audit Steps ────────────────────────────────────────────────────

const AUDIT_STEPS: { label: string; file: string }[] = [
  { label: 'Stats', file: 'stats.json' },
  { label: 'Dependencies', file: 'deps.json' },
  { label: 'Access Control', file: 'access-control.json' },
  { label: 'State Analysis', file: 'state-vars.json' },
  { label: 'External Calls', file: 'external-calls.json' },
  { label: 'Overview', file: 'overview.md' },
  { label: 'Diagram', file: 'diagrams/diagram.mmd' },
  { label: 'Invariants', file: 'invariants.md' },
  { label: 'Spec Conformance', file: 'spec-conformance.json' },
  { label: 'Findings', file: 'findings.json' },
];

// ─── Component ──────────────────────────────────────────────────────

export default function ProgressPage() {
  const stats = readJsonFile<Stats>('stats.json');

  if (!stats) {
    return (
      <div>
        <h2 className="mb-sp-5 text-title font-semibold text-text-primary">Progress</h2>
        <NotYetGenerated command="solaudit stats" />
      </div>
    );
  }

  const progress = readJsonFile<ProgressData>('progress.json');
  const findingsData = readJsonFile<{ findings: Finding[] }>('findings.json');
  const trackingRaw = readJsonFile<{ findings?: TrackingEntry[]; issues?: TrackingEntry[] }>('tracking.json');

  // Derive audit step completion
  const auditSteps: ProgressClientProps['auditSteps'] = AUDIT_STEPS.map((step) => ({
    label: step.label,
    completed: fileExists(step.file),
  }));

  // Merge findings from both sources
  const allFindingIds = new Set<string>();
  const findingsBySeverity: Record<string, number> = {};
  let trackedCount = 0;

  for (const f of findingsData?.findings ?? []) {
    allFindingIds.add(f.id);
    findingsBySeverity[f.severity] = (findingsBySeverity[f.severity] ?? 0) + 1;
  }
  const trackingEntries = trackingRaw?.issues ?? trackingRaw?.findings ?? [];
  for (const t of trackingEntries) {
    if (!allFindingIds.has(t.id)) {
      allFindingIds.add(t.id);
      if (t.severity) {
        findingsBySeverity[t.severity] = (findingsBySeverity[t.severity] ?? 0) + 1;
      }
    }
    if (t.status === 'verified' || t.status === 'confirmed' || t.status === 'mitigated') {
      trackedCount++;
    }
  }

  return (
    <div>
      <h2 className="mb-sp-5 text-title font-semibold text-text-primary">Progress</h2>
      <ProgressClient
        contracts={stats.per_contract}
        totalsNsloc={stats.totals.nsloc}
        reviewedContracts={progress?.reviewed_contracts ?? {}}
        auditSteps={auditSteps}
        findingsTotal={allFindingIds.size}
        findingsBySeverity={findingsBySeverity}
        findingsTracked={trackedCount}
      />
    </div>
  );
}
