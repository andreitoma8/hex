import { NextRequest, NextResponse } from 'next/server';
import { getOutputDirPath } from '@/lib/data';
import { revertAutoMove } from '../../../../../../src/core/issues';

export const dynamic = 'force-dynamic';

/** Undo an agent's auto-move: back to Potential, auto flag cleared. */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const entry = revertAutoMove(getOutputDirPath(), params.id);
    return NextResponse.json({ ok: true, id: params.id, status: entry.status });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }
}
