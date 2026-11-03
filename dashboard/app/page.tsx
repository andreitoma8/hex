import Link from 'next/link';
import { readJsonFile } from '@/lib/data';
import { buildBoard } from '@/lib/server/board';
import { readConfig, readReview } from '@/lib/server/workspace';
import { ProgressRing } from '@/components/ui/ProgressRing';
import { StateGlyph } from '@/components/ui/StateGlyph';
import { SeverityDot } from '@/components/ui/SeverityDot';
import { EmptyState } from '@/components/ui/EmptyState';
import { IconArrowRight, IconChevron } from '@/components/ui/Icons';
import { SEVERITY_ORDER, SOURCE_LABEL, type BoardIssue } from '@/lib/types';

export const dynamic = 'force-dynamic';

interface DiffSummary {
  base_commit: string;
  head_commit: string;
  summary: { files_changed: number; impacted_entry_points: number; storage_layout_changes: number };
}

function triageNote(c: BoardIssue): string {
  const moved = c.validation?.auto_moved_to;
  if (moved) return `An agent moved it to ${moved === 'verified' ? 'Verified' : 'Rejected'}`;
  return `${SOURCE_LABEL[c.source] ?? c.source} · awaiting validation`;
}

/** Today answers one question: what should I do next? */
export default function TodayPage() {
  const config = readConfig();
  const review = readReview(5);
  const project = config?.project;
  const diffMode = project?.mode === 'diff';
  const diff = diffMode ? readJsonFile<DiffSummary>('diff.json') : null;

  const board = buildBoard();
  const triage = board
    .filter(
      (c) =>
        c.column === 'potential' ||
        (c.validation?.auto_moved_to && (c.column === 'verified' || c.column === 'invalid')),
    )
    .sort(
      (a, b) =>
        Number(Boolean(b.validation?.auto_moved_to)) -
          Number(Boolean(a.validation?.auto_moved_to)) ||
        (SEVERITY_ORDER[a.severity] ?? 5) - (SEVERITY_ORDER[b.severity] ?? 5),
    );

  const meta = [
    diffMode ? 'Differential audit' : 'Full audit',
    project?.solidity_version ? `Solidity ${project.solidity_version}` : null,
    project?.scope
      ? `${project.scope.length} file${project.scope.length === 1 ? '' : 's'} in scope`
      : null,
    project?.commit ? project.commit.slice(0, 8) : null,
  ].filter(Boolean);

  const next = review.blind_spots[0];
  const fnCount = review.rows.length;
  const left = review.counts.unread + review.counts.read + review.counts.questioned;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[720px] px-6 pb-16 pt-14 md:px-8">
        <header className="rise-in">
          <h1 className="text-display font-semibold tracking-tight text-text-primary">
            {project?.name ?? 'Hex'}
          </h1>
          <p className="mt-1.5 text-body text-text-tertiary">{meta.join(' · ')}</p>
        </header>

        {review.facts_source === null ? (
          <div className="mt-12">
            <EmptyState
              sentence="Nothing to review yet: Hex needs the compiler facts for this project."
              command="hex facts"
            />
          </div>
        ) : (
          <>
            <section className="rise-in mt-10 flex flex-col items-start gap-6 sm:flex-row sm:items-center sm:gap-8">
              <ProgressRing pct={review.pct} />
              <div className="min-w-0 flex-1">
                <h2 className="text-heading font-medium text-text-primary">
                  {review.pct === 100
                    ? 'Every in-scope function is cleared'
                    : 'In-scope code cleared'}
                </h2>
                <p className="mt-1 text-body text-text-secondary">
                  {review.cleared_nsloc.toLocaleString()} of {review.total_nsloc.toLocaleString()}{' '}
                  nSLOC · {left} of {fnCount} function{fnCount === 1 ? '' : 's'} still open
                  {review.counts.questioned > 0 && ` · ${review.counts.questioned} questioned`}
                </p>
                {next && (
                  <Link
                    href={`/review?fn=${encodeURIComponent(next.id)}`}
                    className="mt-4 inline-flex h-8 items-center gap-2 rounded-md bg-accent px-3 text-body font-medium text-accent-contrast shadow-sm hover:bg-accent-secondary"
                  >
                    Continue with {next.contract}.{next.name}
                    <IconArrowRight className="h-4 w-4" />
                  </Link>
                )}
              </div>
            </section>

            {review.facts_source === 'parser-fallback' && (
              <p className="mt-6 text-caption text-text-tertiary">
                <span
                  className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle"
                  style={{ background: 'var(--medium)' }}
                />
                Facts come from the parser fallback because the build failed, so call graphs may be
                incomplete. Fix the build and run <code className="font-mono">hex facts</code>.
              </p>
            )}
          </>
        )}

        {diffMode && (
          <Link
            href="/changes"
            className="group mt-10 flex items-center gap-4 border-y border-border-subtle py-4 hover:border-border-default"
          >
            <div className="min-w-0 flex-1">
              <div className="text-body font-medium text-text-primary">
                Changes since{' '}
                <span className="font-mono text-caption">
                  {(diff?.base_commit ?? project?.diff?.base_commit ?? '').slice(0, 8)}
                </span>
              </div>
              <div className="mt-0.5 text-caption text-text-tertiary">
                {diff
                  ? [
                      `${diff.summary.files_changed} file${diff.summary.files_changed === 1 ? '' : 's'} changed`,
                      `${diff.summary.impacted_entry_points} impacted entry point${diff.summary.impacted_entry_points === 1 ? '' : 's'}`,
                      diff.summary.storage_layout_changes
                        ? `${diff.summary.storage_layout_changes} storage layout change${diff.summary.storage_layout_changes === 1 ? '' : 's'}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')
                  : 'Run hex diff to compute the change set'}
              </div>
            </div>
            <IconChevron className="h-4 w-4 text-text-tertiary group-hover:text-text-primary" />
          </Link>
        )}

        {review.blind_spots.length > 0 && (
          <section className="mt-10">
            <h2 className="mb-2 text-heading font-medium text-text-primary">Next up</h2>
            <p className="mb-3 text-caption text-text-tertiary">
              Risky code nobody has looked at closely yet.
            </p>
            <ul className="stagger divide-y divide-border-subtle border-y border-border-subtle">
              {review.blind_spots.map((r) => (
                <li key={r.id}>
                  <Link
                    href={`/review?fn=${encodeURIComponent(r.id)}`}
                    className="group -mx-2 flex items-center gap-3 rounded-md px-2 py-2.5 hover:bg-surface-1"
                  >
                    <StateGlyph state={r.state} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-body text-text-primary">
                        {r.contract}.<span className="font-medium">{r.name}</span>
                      </span>
                      <span className="block truncate text-caption text-text-tertiary">
                        {r.risk_reasons.slice(0, 3).join(' · ') || `${r.nsloc} nSLOC`}
                      </span>
                    </span>
                    <IconChevron className="h-4 w-4 shrink-0 text-text-tertiary opacity-0 group-hover:opacity-100" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="mt-10">
          <h2 className="mb-2 text-heading font-medium text-text-primary">Needs triage</h2>
          {triage.length === 0 ? (
            <p className="text-body text-text-tertiary">No cards are waiting for you.</p>
          ) : (
            <>
              <p className="mb-3 text-caption text-text-tertiary">
                Potential cards, and cards an agent moved on its own that deserve a glance.
              </p>
              <ul className="stagger divide-y divide-border-subtle border-y border-border-subtle">
                {triage.slice(0, 8).map((c) => (
                  <li key={c.id}>
                    <Link
                      href={`/issues?card=${encodeURIComponent(c.id)}`}
                      className="group -mx-2 flex items-center gap-3 rounded-md px-2 py-2.5 hover:bg-surface-1"
                    >
                      <SeverityDot severity={c.severity} label={false} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-body text-text-primary">
                          {c.title}
                        </span>
                        <span className="block truncate text-caption text-text-tertiary">
                          {c.id} · {triageNote(c)}
                        </span>
                      </span>
                      <IconChevron className="h-4 w-4 shrink-0 text-text-tertiary opacity-0 group-hover:opacity-100" />
                    </Link>
                  </li>
                ))}
              </ul>
              {triage.length > 8 && (
                <Link
                  href="/issues"
                  className="mt-2 inline-block text-caption text-text-secondary hover:text-text-primary"
                >
                  {triage.length - 8} more on the board
                </Link>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
