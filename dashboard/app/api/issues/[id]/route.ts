import { NextRequest, NextResponse } from 'next/server';
import { getOutputDirPath } from '@/lib/data';
import { patchIssue } from '../../../../../src/core/issues';

export const dynamic = 'force-dynamic';

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const body = (await request.json()) as Record<string, unknown>;
  try {
    const finding = patchIssue(getOutputDirPath(), params.id, body);
    return NextResponse.json({ ok: true, id: params.id, finding });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }
}
