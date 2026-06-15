import { NextRequest, NextResponse } from 'next/server';
import { getOutputDirPath } from '@/lib/data';
import { closeLead, reopenLead } from '../../../../../src/core/notes';
import { recomputeReview } from '../../../../../src/core/review';

export const dynamic = 'force-dynamic';

// Mirror dashboard/app/api/notes/route.ts: import the canonical notes-mutation
// module across the src/ <-> dashboard/ boundary and call it in-process. After
// mutating a lead, recompute the contract's derived review flag so the
// /progress checklist auto-ticks.
export async function POST(request: NextRequest) {
  const { contract, id, action, status } = (await request.json()) as {
    contract?: unknown;
    id?: unknown;
    action?: unknown;
    status?: unknown;
  };
  if (typeof contract !== 'string' || typeof id !== 'string' || typeof action !== 'string') {
    return NextResponse.json({ error: 'contract, id and action must be strings' }, { status: 400 });
  }
  try {
    const dir = getOutputDirPath();
    if (action === 'reopen') {
      reopenLead(dir, contract, id);
    } else if (action === 'close') {
      const closeStatus = status === 'dismissed' || status === 'logged' ? status : 'dismissed';
      closeLead(dir, contract, id, closeStatus);
    } else {
      return NextResponse.json({ error: `unknown action ${action}` }, { status: 400 });
    }
    recomputeReview(dir, contract);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }
}
