import { readJsonFile, readMarkdownFile } from '@/lib/data';
import { latestFixReview, readConfig, readReview } from '@/lib/server/workspace';
import { EmptyState } from '@/components/ui/EmptyState';
import { Toolbar } from '@/components/ui/SplitView';
import type { FixReview } from '@/lib/types';
import { ChangesClient, type DiffData, type PriorReview } from './ChangesClient';

export const dynamic = 'force-dynamic';

/**
 * Changes answers: what changed since the last audit, and what does it reach?
 * A full audit has no diff, but its fix review still lives here.
 */
export default function ChangesPage() {
  const diff = readJsonFile<DiffData>('diff.json');
  const fixReview = latestFixReview<FixReview>();
  const config = readConfig();

  if (!diff && !fixReview) {
    const base = config?.project?.diff?.base_commit;
    return (
      <div className="flex h-full flex-col">
        <Toolbar title="Changes" />
        <EmptyState
          sentence="Changes shows what moved since the previously audited commit, and which flows it reaches."
          command={base ? 'hex diff' : 'hex init --mode diff --base <commit>'}
        />
      </div>
    );
  }

  const states: Record<string, string> = {};
  for (const r of readReview(0).rows) states[r.id] = r.state;

  return (
    <ChangesClient
      diff={diff}
      overview={readMarkdownFile('diff-overview.md')}
      prior={readJsonFile<PriorReview>('previous-audit/review.json')}
      fixReview={fixReview}
      reviewStates={states}
    />
  );
}
