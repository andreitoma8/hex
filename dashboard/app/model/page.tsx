import { readJsonFile } from '@/lib/data';
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

interface SpecFile {
  items?: SpecItem[];
}

/** Model answers: how does this protocol hold value and power, and what must stay true? */
export default function ModelPage() {
  const dir = outDir();
  const model = readProtocolModel(dir);
  const invariants = readInvariants(dir).invariants;
  const spec = readJsonFile<SpecFile>('spec-conformance.json');
  const diagrams: DiagramEntry[] = readIndex().map((d) => ({ ...d, mtime: sceneMtime(d.name) }));

  if (!model && diagrams.length === 0 && invariants.length === 0 && !spec?.items?.length) {
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
