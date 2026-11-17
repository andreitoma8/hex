import { readJsonFile, readMarkdownFile } from '@/lib/data';
import { buildBoard, cardRefs } from '@/lib/server/board';
import { readIndex, sceneMtime } from '@/lib/server/diagrams';
import { outDir, readFacts, readReview } from '@/lib/server/workspace';
import { readInvariants, readProtocolModel } from '../../../src/core/model';
import { EmptyState } from '@/components/ui/EmptyState';
import { Toolbar } from '@/components/ui/SplitView';
import {
  ModelClient,
  type ContractInfo,
  type DiagramEntry,
  type FnInfo,
  type SpecItem,
} from './ModelClient';

export const dynamic = 'force-dynamic';

const READING_ORDER = ['custody', 'privilege', 'accounting', 'sequence', 'state-machine'];
const readingRank = (type: string) => {
  const i = READING_ORDER.indexOf(type);
  return i < 0 ? READING_ORDER.length : i;
};

interface SpecFile {
  items?: SpecItem[];
}

/** Model answers: how does this protocol hold value and power, and what must stay true? */
export default function ModelPage() {
  const dir = outDir();
  const model = readProtocolModel(dir);
  const invariants = readInvariants(dir).invariants;
  const spec = readJsonFile<SpecFile>('spec-conformance.json');
  // Reading order for someone new to the protocol: where the value sits, who controls it, how
  // it is accounted, how it moves, how it changes state. Stable: index order within a kind.
  const diagrams: DiagramEntry[] = readIndex()
    .map((d) => ({ ...d, mtime: sceneMtime(d.name) }))
    .sort((a, b) => readingRank(a.type) - readingRank(b.type));
  // Written by /init-audit's synthesizer: what the protocol does, key contracts, architecture.
  const overview = readMarkdownFile('overview.md');
  const projectName =
    readJsonFile<{ project?: { name?: string } }>('config.json')?.project?.name ?? 'Protocol';

  if (
    !model &&
    !overview &&
    diagrams.length === 0 &&
    invariants.length === 0 &&
    !spec?.items?.length
  ) {
    return (
      <div className="flex h-full flex-col">
        <Toolbar title="Model" />
        <EmptyState
          sentence="The protocol model (actors, assets, privileges, invariants and diagrams) is built by the audit kickoff."
          command="/init-audit"
        />
      </div>
    );
  }

  const facts = readFacts();
  const review = readReview(0);
  const states: Record<string, string> = {};
  for (const r of review.rows) states[r.id] = r.state;

  const fns: Record<string, FnInfo> = {};
  const contracts: Record<string, ContractInfo> = {};
  if (facts) {
    for (const f of facts.functions) {
      fns[f.id] = {
        id: f.id,
        contract: f.contract,
        name: f.name,
        signature: f.signature,
        visibility: f.visibility,
        file: f.file,
        line_start: f.line_start,
        line_end: f.line_end,
        is_entry_point: f.is_entry_point,
        callers: f.called_by.filter((c) => c.kind !== 'modifier').length,
        callees: f.calls.filter((c) => c.kind !== 'modifier').length,
      };
    }
    for (const c of facts.contracts) {
      contracts[c.name] = {
        name: c.name,
        kind: c.kind,
        file: c.file,
        line_start: c.line_start,
        line_end: c.line_end,
        functions: facts.functions.filter((f) => f.contract === c.name).length,
        entry_points: facts.entry_points[c.name]?.length ?? 0,
      };
    }
  }

  const board = buildBoard();
  const cardsByFn: Record<string, string[]> = {};
  for (const c of board) {
    if (c.column === 'duplicate' || c.column === 'invalid') continue;
    for (const fn of c.functions) cardsByFn[fn] = [...(cardsByFn[fn] ?? []), c.id];
  }

  return (
    <ModelClient
      model={model}
      overview={overview}
      projectName={projectName}
      invariants={invariants}
      spec={spec?.items ?? null}
      diagrams={diagrams}
      fns={fns}
      contracts={contracts}
      states={states}
      cards={cardRefs(board)}
      cardsByFn={cardsByFn}
    />
  );
}
