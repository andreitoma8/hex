import { readJsonFile } from '@/lib/data';
import { NotYetGenerated } from '@/components/NotYetGenerated';
import {
  CONFORMANCE_STATUS_DOT,
  CONFORMANCE_STATUS_TEXT,
  type ConformanceStatus,
} from '@/lib/conformance-tokens';
import { ConformanceTable } from './ConformanceTable';

// ─── Types matching CLI schema ──────────────────────────────────────

interface ConformanceItem {
  id: string;
  source: string;
  spec_text: string;
  spec_location?: Record<string, unknown>;
  status: string;
  finding: string;
  code_location?: { file: string; line_start: number; line_end: number };
  severity_hint?: string;
  confidence?: string;
}

interface ConformanceSummary {
  total_checks: number;
  conforms: number;
  deviates: number;
  partial: number;
  unverifiable: number;
  undocumented: number;
}

interface ConformanceData {
  checked_at?: string;
  sources_checked?: Record<string, unknown>;
  summary?: ConformanceSummary;
  items?: ConformanceItem[];
  checks?: Array<{
    id: string;
    requirement: string;
    status: string;
    details: string;
    spec_section?: string;
    confidence?: string;
  }>;
}

export interface ConformanceCheck {
  id: string;
  requirement: string;
  status: string;
  details: string;
  spec_section: string;
  confidence?: string;
  source?: string;
  severity_hint?: string;
  code_location?: { file: string; line_start: number; line_end: number };
  spec_url?: string;
  spec_anchor?: string;
}

const STATUS_ORDER: Record<string, number> = {
  DEVIATES: 0,
  PARTIAL: 1,
  UNVERIFIABLE: 2,
  UNDOCUMENTED: 3,
  CONFORMS: 4,
};

export default function ConformancePage() {
  const data = readJsonFile<ConformanceData>('spec-conformance.json');

  if (!data) {
    return (
      <div>
        <h2 className="mb-sp-5 text-title font-semibold text-text-primary">
          Spec Conformance
        </h2>
        <NotYetGenerated command="Use the check-spec-conformance skill" />
      </div>
    );
  }

  let checks: ConformanceCheck[];
  if (data.items) {
    checks = data.items.map((item) => {
      const loc = (item.spec_location ?? {}) as Record<string, unknown>;
      const url = typeof loc.url === 'string' ? loc.url : undefined;
      const anchor = typeof loc.section === 'string' ? loc.section : undefined;
      return {
        id: item.id,
        requirement: item.spec_text,
        status: item.status,
        details: item.finding,
        spec_section: item.source ?? '-',
        confidence: item.confidence,
        source: item.source,
        severity_hint: item.severity_hint,
        code_location: item.code_location,
        spec_url: url,
        spec_anchor: anchor,
      };
    });
  } else if (data.checks) {
    checks = data.checks.map((c) => ({
      id: c.id,
      requirement: c.requirement,
      status: c.status,
      details: c.details,
      spec_section: c.spec_section ?? '-',
      confidence: c.confidence,
    }));
  } else {
    checks = [];
  }

  checks.sort((a, b) => {
    const orderA = STATUS_ORDER[a.status] ?? 99;
    const orderB = STATUS_ORDER[b.status] ?? 99;
    return orderA - orderB;
  });

  const summary = data.summary ?? {
    total_checks: checks.length,
    conforms: checks.filter((c) => c.status === 'CONFORMS').length,
    deviates: checks.filter((c) => c.status === 'DEVIATES').length,
    partial: checks.filter((c) => c.status === 'PARTIAL').length,
    unverifiable: checks.filter((c) => c.status === 'UNVERIFIABLE').length,
    undocumented: checks.filter((c) => c.status === 'UNDOCUMENTED').length,
  };

  const summaryEntries: Array<{ status: ConformanceStatus; count: number }> = [
    { status: 'DEVIATES', count: summary.deviates },
    { status: 'PARTIAL', count: summary.partial },
    { status: 'UNVERIFIABLE', count: summary.unverifiable },
    { status: 'UNDOCUMENTED', count: summary.undocumented },
    { status: 'CONFORMS', count: summary.conforms },
  ];

  return (
    <div>
      <h2 className="mb-sp-5 text-title font-semibold text-text-primary">
        Spec Conformance
      </h2>

      {/* Summary pills */}
      <div className="mb-sp-5 flex flex-wrap gap-sp-3">
        {summaryEntries.map(({ status, count }) => (
          <div
            key={status}
            className="flex items-center gap-2 rounded-md border border-border-default bg-surface-2 px-sp-4 py-sp-2"
          >
            <span className={`inline-block h-2.5 w-2.5 rounded-full ${CONFORMANCE_STATUS_DOT[status]}`} />
            <span className={`text-caption font-medium ${CONFORMANCE_STATUS_TEXT[status]}`}>
              {status}
            </span>
            <span className="text-heading font-semibold text-text-primary">
              {count}
            </span>
          </div>
        ))}
      </div>

      <p className="mb-sp-3 text-body text-text-secondary">
        {summary.total_checks} conformance check{summary.total_checks !== 1 ? 's' : ''}
        {data.sources_checked && (
          <span className="ml-2 text-text-tertiary">
            (sources: {Object.entries(data.sources_checked)
              .filter(([, v]) => v === true || (Array.isArray(v) && v.length > 0))
              .map(([k]) => k.replace(/_/g, ' '))
              .join(', ')})
          </span>
        )}
      </p>

      <ConformanceTable checks={checks} />
    </div>
  );
}
