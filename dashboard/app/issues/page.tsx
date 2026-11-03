import { buildBoard } from '@/lib/server/board';
import { outDir, readConfig } from '@/lib/server/workspace';
import { readRules } from '../../../src/core/rules';
import { EmptyState } from '@/components/ui/EmptyState';
import { Toolbar } from '@/components/ui/SplitView';
import { BoardClient } from './BoardClient';

export const dynamic = 'force-dynamic';

/** Board answers: which cards need a decision? */
export default function BoardPage() {
  const issues = buildBoard();
  const config = readConfig();
  const rules = readRules(outDir());

  if (issues.length === 0) {
    return (
      <div className="flex h-full flex-col">
        <Toolbar title="Board" />
        <EmptyState
          sentence="No cards yet. Findings from you, agents and scans land here."
          command="/init-audit"
        />
      </div>
    );
  }

  return (
    <BoardClient
      issues={issues}
      rules={rules.map((r) => ({ id: r.id, kind: r.kind, text: r.text, scope: r.scope ?? [] }))}
      formatCtx={{
        repositoryUrl: config?.settings?.report?.repository_url,
        commit: config?.settings?.report?.initial_commit,
      }}
    />
  );
}
