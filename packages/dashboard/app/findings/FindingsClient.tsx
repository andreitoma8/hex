'use client';

import { FilterableTable, type FilterableColumn } from '@/components/FilterableTable';
import { SeverityBadge } from '@/components/SeverityBadge';
import { CodeReference } from '@/components/CodeReference';

// ─── Types ──────────────────────────────────────────────────────────

interface Finding {
  id: string;
  title: string;
  severity: string;
  likelihood?: string;
  impact?: string;
  category?: string;
  description?: string;
  impact_detail?: string;
  root_cause?: {
    summary: string;
    locations: { file: string; line_start: number; line_end: number; snippet?: string }[];
  };
  poc?: { status: string; file: string | null; validation_memo?: string | null };
  recommendation?: string;
  references?: {
    annotation_id: string | null;
    annotation_location: string | null;
    external_links: string[];
  };
}

type Severity = 'Critical' | 'High' | 'Medium' | 'Low' | 'Info';

// ─── Columns ────────────────────────────────────────────────────────

const columns: FilterableColumn<Finding>[] = [
  {
    id: 'id',
    header: 'ID',
    accessorKey: 'id',
    cell: (row) => (
      <span className="whitespace-nowrap font-mono text-xs text-gray-300">{row.id}</span>
    ),
  },
  {
    id: 'title',
    header: 'Title',
    accessorKey: 'title',
    cell: (row) => <span className="font-medium text-gray-200">{row.title}</span>,
  },
  {
    id: 'severity',
    header: 'Severity',
    accessorKey: 'severity',
    enableColumnFilter: true,
    cell: (row) => <SeverityBadge severity={(row.severity ?? 'Info') as Severity} />,
  },
  {
    id: 'category',
    header: 'Category',
    accessorKey: 'category',
    enableColumnFilter: true,
    cell: (row) => (
      <span className="inline-flex items-center rounded bg-gray-700 px-2 py-0.5 text-xs text-gray-300">
        {row.category ?? '-'}
      </span>
    ),
  },
];

// ─── Expanded row detail ────────────────────────────────────────────

function FindingDetail({ finding }: { finding: Finding }) {
  return (
    <div className="space-y-4 text-sm">
      {/* Description */}
      {finding.description && (
        <div>
          <h4 className="mb-1 text-xs font-semibold uppercase text-gray-400">Description</h4>
          <p className="text-gray-300">{finding.description}</p>
        </div>
      )}

      {/* Impact */}
      {finding.impact_detail && (
        <div>
          <h4 className="mb-1 text-xs font-semibold uppercase text-gray-400">Impact</h4>
          <p className="text-gray-300">{finding.impact_detail}</p>
        </div>
      )}

      {/* Likelihood & Impact ratings */}
      {(finding.likelihood || finding.impact) && (
        <div className="flex gap-4">
          {finding.likelihood && (
            <span className="text-xs text-gray-400">
              Likelihood: <span className="text-gray-200">{finding.likelihood}</span>
            </span>
          )}
          {finding.impact && (
            <span className="text-xs text-gray-400">
              Impact: <span className="text-gray-200">{finding.impact}</span>
            </span>
          )}
        </div>
      )}

      {/* Root Cause */}
      {finding.root_cause && (
        <div>
          <h4 className="mb-1 text-xs font-semibold uppercase text-gray-400">Root Cause</h4>
          <p className="mb-2 text-gray-300">{finding.root_cause.summary}</p>
          {finding.root_cause.locations.map((loc, i) => (
            <div key={i} className="mb-2">
              <CodeReference
                file={loc.file}
                lineStart={loc.line_start}
                lineEnd={loc.line_end}
                snippet={loc.snippet}
              />
              {loc.snippet && (
                <pre className="mt-1 overflow-x-auto rounded bg-gray-950 p-3 text-xs text-gray-400">
                  {loc.snippet}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Recommendation */}
      {finding.recommendation && (
        <div>
          <h4 className="mb-1 text-xs font-semibold uppercase text-gray-400">Recommendation</h4>
          <p className="text-gray-300">{finding.recommendation}</p>
        </div>
      )}

      {/* PoC */}
      {finding.poc && finding.poc.file && (
        <div>
          <h4 className="mb-1 text-xs font-semibold uppercase text-gray-400">Proof of Concept</h4>
          <p className="text-gray-400 text-xs">
            <code className="rounded bg-gray-800 px-1.5 py-0.5">{finding.poc.file}</code>
            <span className="ml-2">({finding.poc.status})</span>
          </p>
        </div>
      )}

      {/* References */}
      {finding.references && (finding.references.annotation_id || (finding.references.external_links?.length ?? 0) > 0) && (
        <div>
          <h4 className="mb-1 text-xs font-semibold uppercase text-gray-400">References</h4>
          {finding.references.annotation_id && (
            <p className="text-xs text-gray-400">
              Annotation: {finding.references.annotation_id}
              {finding.references.annotation_location && ` (${finding.references.annotation_location})`}
            </p>
          )}
          {finding.references.external_links?.map((link, i) => (
            <p key={i} className="text-xs text-blue-400">{link}</p>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Component ──────────────────────────────────────────────────────

export function FindingsClient({ findings }: { findings: Finding[] }) {
  return (
    <FilterableTable
      columns={columns}
      data={findings}
      defaultOpen={true}
      expandedRow={(finding) => <FindingDetail finding={finding} />}
    />
  );
}
