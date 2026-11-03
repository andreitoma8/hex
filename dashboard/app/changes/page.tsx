import { readJsonFile, readMarkdownFile } from '@/lib/data';
import { NotYetGenerated } from '@/components/NotYetGenerated';
import { ChangesClient, type DiffData, type PriorReview } from './ChangesClient';

// Read .hex/ at request time (see app/calls/page.tsx for why).
export const dynamic = 'force-dynamic';

interface ConfigFile {
  project?: { mode?: string; diff?: { base_commit?: string } };
}

export default function ChangesPage() {
  const diff = readJsonFile<DiffData>('diff.json');
  const config = readJsonFile<ConfigFile>('config.json');

  if (!diff) {
    const base = config?.project?.diff?.base_commit;
    return (
      <div>
        <h2 className="mb-sp-5 text-title font-semibold text-text-primary">Changes</h2>
        <p className="mb-sp-4 text-body text-text-secondary">
          This page is for differential audits: what changed since the previously audited commit,
          and which flows the change reaches.
        </p>
        <NotYetGenerated
          command={base ? 'hex diff' : 'hex init --mode diff --base <commit> --scope "<globs>"'}
        />
      </div>
    );
  }

  const overview = readMarkdownFile('diff-overview.md');
  const review = readJsonFile<PriorReview>('previous-audit/review.json');

  return <ChangesClient diff={diff} overview={overview} review={review} />;
}
