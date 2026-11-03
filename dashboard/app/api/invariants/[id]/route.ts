import { NextRequest, NextResponse } from 'next/server';
import { outDir } from '@/lib/server/workspace';
import { setInvariantStatus } from '../../../../../src/core/model';

export const dynamic = 'force-dynamic';

const STATUSES = new Set(['proposed', 'accepted', 'rejected']);

/** Accept / reject (or restore to proposed) an invariant. */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const { status, rationale } = (await request.json().catch(() => ({}))) as {
    status?: string;
    rationale?: string;
  };
  if (!status || !STATUSES.has(status)) {
    return NextResponse.json(
      { error: 'status must be proposed|accepted|rejected' },
      { status: 400 },
    );
  }
  try {
    const inv = setInvariantStatus(
      outDir(),
      params.id,
      status as 'proposed' | 'accepted' | 'rejected',
      typeof rationale === 'string' && rationale.trim() ? rationale.trim() : undefined,
    );
    return NextResponse.json({ ok: true, invariant: inv });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }
}
