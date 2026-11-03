import { buildBoard, cardRefs } from '@/lib/server/board';
import {
  contractNoteView,
  isDiffMode,
  readFacts,
  readGeneralNote,
  readReview,
  unprocessedSessions,
} from '@/lib/server/workspace';
import { EmptyState } from '@/components/ui/EmptyState';
import { Toolbar } from '@/components/ui/SplitView';
import type { ContractNoteView } from '@/lib/types';
import { ReviewClient, type FnDetail, type FnLabel } from './ReviewClient';

export const dynamic = 'force-dynamic';

/** Review answers: which function do I read next, and what do I know about it? */
export default function ReviewPage() {
  const review = readReview(10);
  const facts = readFacts();

  if (!facts || review.rows.length === 0) {
    return (
      <div className="flex h-full flex-col">
        <Toolbar title="Review" />
        <EmptyState
          sentence={
            facts
              ? 'No in-scope functions with code were found in the facts.'
              : 'Review needs the compiler facts for this project.'
          }
          command="hex facts"
        />
      </div>
    );
  }

  const rowIds = new Set(review.rows.map((r) => r.id));
  const details: Record<string, FnDetail> = {};
  const labels: Record<string, FnLabel> = {};
  for (const f of facts.functions) {
    labels[f.id] = {
      id: f.id,
      contract: f.contract,
      name: f.name,
      file: f.file,
      line_start: f.line_start,
      line_end: f.line_end,
    };
    if (!rowIds.has(f.id)) continue;
    details[f.id] = {
      signature: f.signature,
      kind: f.kind,
      visibility: f.visibility,
      mutability: f.mutability,
      modifiers: f.modifiers,
      calls: f.calls.filter((c) => c.kind !== 'modifier').map((c) => c.to),
      // A modifier's "callers" are the functions it guards.
      called_by: f.called_by.map((c) => c.from),
      called_at: Object.fromEntries(
        f.called_by.filter((c) => c.at?.length).map((c) => [c.from, c.at!]),
      ),
      external_calls: f.external_calls.map((c) => ({
        target: c.target_type,
        member: c.member,
        kind: c.kind,
        line: c.line,
      })),
      reads: f.reads,
      writes: f.writes,
      emits: f.emits,
    };
  }

  const board = buildBoard();
  const contracts = Array.from(new Set(review.rows.map((r) => r.contract))).sort();
  const notes: Record<string, ContractNoteView> = {};
  for (const c of contracts) notes[c] = contractNoteView(c);

  return (
    <ReviewClient
      rows={review.rows}
      blindSpots={review.blind_spots.map((b) => b.id)}
      details={details}
      labels={labels}
      cards={cardRefs(board)}
      notes={notes}
      diffMode={isDiffMode()}
      generalNote={readGeneralNote()}
      pendingSessions={unprocessedSessions()}
    />
  );
}
