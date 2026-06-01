import { NextRequest, NextResponse } from 'next/server';
import { getOutputDirPath } from '@/lib/data';
import { moveIssue, type BoardColumn, COLUMN_TO_STATUS } from '../../../../../../src/core/issues';

export const dynamic = 'force-dynamic';

const STATUS_TO_COLUMN: Record<string, BoardColumn> = {
  pending_validation: 'potential',
  unverified: 'potential',
  verified: 'verified',
  rejected: 'invalid',
  duplicate: 'duplicate',
};

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const body = (await request.json()) as { column?: string; status?: string };

  // Accept either a board column directly, or a tracking status that maps to one.
  let column: BoardColumn | undefined;
  if (body.column && body.column in COLUMN_TO_STATUS) {
    column = body.column as BoardColumn;
  } else if (body.status && STATUS_TO_COLUMN[body.status]) {
    column = STATUS_TO_COLUMN[body.status];
  }

  if (!column) {
    return NextResponse.json(
      {
        error:
          "Body must include a valid 'column' (potential|verified|invalid|duplicate) or 'status'",
      },
      { status: 400 },
    );
  }

  try {
    const entry = moveIssue(getOutputDirPath(), params.id, column);
    return NextResponse.json({ ok: true, id: params.id, status: entry.status });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }
}
