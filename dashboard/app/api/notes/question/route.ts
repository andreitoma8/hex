import { NextRequest, NextResponse } from 'next/server';
import { getOutputDirPath } from '@/lib/data';
import { answerQuestion } from '../../../../../src/core/notes';
import { recomputeReview } from '../../../../../src/core/review';

export const dynamic = 'force-dynamic';

// Mirror dashboard/app/api/notes/route.ts. Record an answer to a question, then
// recompute the derived review flag for the /progress checklist.
export async function POST(request: NextRequest) {
  const { contract, id, answer } = (await request.json()) as {
    contract?: unknown;
    id?: unknown;
    answer?: unknown;
  };
  if (typeof contract !== 'string' || typeof id !== 'string' || typeof answer !== 'string') {
    return NextResponse.json({ error: 'contract, id and answer must be strings' }, { status: 400 });
  }
  try {
    const dir = getOutputDirPath();
    answerQuestion(dir, contract, id, answer);
    recomputeReview(dir, contract);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }
}
