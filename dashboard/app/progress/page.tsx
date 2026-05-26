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
  finding_id?: string | null;
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
        <NotYetGenerated command="hex stats" />
      </div>
    );
  }

  const progress = readJsonFile<ProgressData>('progress.json');
  const findingsData = readJsonFile<{ findings: Finding[] }>('findings.json');
  const trackingRaw = readJsonFile<{ findings?: TrackingEntry[]; issues?: TrackingEntry[] }>(
    'tracking.json',
  );

  // Derive audit step completion
  const auditSteps: ProgressClientProps['auditSteps'] = AUDIT_STEPS.map((step) => ({
    label: step.label,
    completed: fileExists(step.file),
  }));

  // Merge findings from both sources
  const allFindingIds = new Set<string>();
  const trackedFindingIds = new Set<string>();
  const findingsBySeverity: Record<string, number> = {};

  for (const f of findingsData?.findings ?? []) {
    allFindingIds.add(f.id);
    findingsBySeverity[f.severity] = (findingsBySeverity[f.severity] ?? 0) + 1;
  }
  const trackingEntries = trackingRaw?.issues ?? trackingRaw?.findings ?? [];
  for (const t of trackingEntries) {
    const dedupeId = t.finding_id ?? t.id;
    if (
      t.status !== 'rejected' &&
      t.status !== 'duplicate' &&
      !allFindingIds.has(dedupeId) &&
      !allFindingIds.has(t.id)
    ) {
      allFindingIds.add(dedupeId);
      if (t.severity) {
        findingsBySeverity[t.severity] = (findingsBySeverity[t.severity] ?? 0) + 1;
      }
    }
    if (t.status === 'verified') {
      trackedFindingIds.add(dedupeId);
    }
  }

  return (
    <div>
      <h2 className="mb-sp-5 text-title font-semibold text-text-primary">Progress</h2>
      <ProgressClient
        contracts={stats.per_contract}
        totalsNsloc={stats.per_contract.reduce((s, c) => s + c.nsloc, 0)}
        reviewedContracts={progress?.reviewed_contracts ?? {}}
        auditSteps={auditSteps}
        findingsTotal={allFindingIds.size}
        findingsBySeverity={findingsBySeverity}
        findingsTracked={trackedFindingIds.size}
      />
    </div>
  );
}
