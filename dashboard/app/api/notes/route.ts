import { NextRequest, NextResponse } from 'next/server';
import { getOutputDirPath } from '@/lib/data';
import { writeNote } from '../../../../src/core/notes';

export const dynamic = 'force-dynamic';

// Mirror dashboard/app/api/issues/[id]/route.ts: import the canonical
// notes-mutation module across the src/ <-> dashboard/ boundary (works via
// experimental.externalDir) and call it in-process. The CLI, the /diane skill,
// and this route all write notes through the same code path.
export async function PUT(request: NextRequest) {
  const { target, body } = (await request.json()) as { target?: unknown; body?: unknown };
  if (typeof target !== 'string' || typeof body !== 'string') {
    return NextResponse.json({ error: 'target and body must be strings' }, { status: 400 });
  }
  try {
    writeNote(getOutputDirPath(), target, body);
    return NextResponse.json({ ok: true, target });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }
}
