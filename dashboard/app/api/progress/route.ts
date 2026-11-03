import { NextRequest, NextResponse } from 'next/server';
import { outDir } from '@/lib/server/workspace';
import {
  markFunctions,
  readProgress,
  reviewSummary,
  writeProgress,
  REVIEW_STATES,
  type ReviewState,
} from '../../../../src/core/review';

export const dynamic = 'force-dynamic';

/** The review map: totals plus one row per reviewable function. */
export async function GET() {
  return NextResponse.json(reviewSummary(outDir(), { blindSpots: 10 }));
}

/**
 * Mark functions: `{ ids, state, note? }` → markFunctions (atomic write via
 * src/core/review.ts). The legacy contract checklist payload
 * `{ reviewed_contracts }` is still accepted and merged the same way.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as {
    ids?: unknown;
    state?: unknown;
    note?: unknown;
    reviewed_contracts?: unknown;
  };
  const dir = outDir();

  if (Array.isArray(body.ids)) {
    const ids = body.ids.filter((x): x is string => typeof x === 'string');
    if (
      !ids.length ||
      typeof body.state !== 'string' ||
      !REVIEW_STATES.includes(body.state as ReviewState)
    ) {
      return NextResponse.json(
        { error: 'ids must be non-empty and state one of unread|read|questioned|cleared' },
        { status: 400 },
      );
    }
    const note = typeof body.note === 'string' && body.note.trim() ? body.note.trim() : undefined;
    markFunctions(dir, ids, body.state as ReviewState, 'dashboard', note);
    const s = reviewSummary(dir);
    return NextResponse.json({
      ok: true,
      pct: s.pct,
      counts: s.counts,
      cleared_nsloc: s.cleared_nsloc,
      total_nsloc: s.total_nsloc,
    });
  }

  if (body.reviewed_contracts && typeof body.reviewed_contracts === 'object') {
    const data = readProgress(dir);
    for (const [k, v] of Object.entries(body.reviewed_contracts as Record<string, unknown>)) {
      data.reviewed_contracts[k] = Boolean(v);
    }
    writeProgress(dir, data);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
}
