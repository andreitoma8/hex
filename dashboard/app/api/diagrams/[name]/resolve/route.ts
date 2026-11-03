import { NextRequest, NextResponse } from 'next/server';
import { keepEdited, useRegenerated, validName } from '@/lib/server/diagrams';

export const dynamic = 'force-dynamic';

/** Stale edited diagram: `{ action: 'use-new' | 'keep-mine' }`. */
export async function POST(request: NextRequest, { params }: { params: { name: string } }) {
  if (!validName(params.name)) return NextResponse.json({ error: 'Invalid name' }, { status: 400 });
  const { action } = (await request.json().catch(() => ({}))) as { action?: string };
  try {
    if (action === 'use-new') useRegenerated(params.name);
    else if (action === 'keep-mine') keepEdited(params.name);
    else
      return NextResponse.json(
        { error: "action must be 'use-new' or 'keep-mine'" },
        { status: 400 },
      );
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }
}
