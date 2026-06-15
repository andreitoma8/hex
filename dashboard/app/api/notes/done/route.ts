import { NextRequest, NextResponse } from 'next/server';
import { getOutputDirPath } from '@/lib/data';
import { setMarkedDone } from '../../../../../src/core/notes';
import { recomputeReview } from '../../../../../src/core/review';

export const dynamic = 'force-dynamic';

// Mirror dashboard/app/api/notes/route.ts. Toggle a contract's "done reading"
// flag, then recompute the derived review flag for the /progress checklist.
export async function POST(request: NextRequest) {
  const { contract, done } = (await request.json()) as { contract?: unknown; done?: unknown };
  if (typeof contract !== 'string' || typeof done !== 'boolean') {
    return NextResponse.json({ error: 'contract must be a string and done a boolean' }, { status: 400 });
  }
  try {
    const dir = getOutputDirPath();
    setMarkedDone(dir, contract, done);
    recomputeReview(dir, contract);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }
}
