import { NextRequest, NextResponse } from 'next/server';
import { readJsonFile, writeJsonFile } from '@/lib/data';

interface TrackingEntry {
  id: string;
  status?: string;
  duplicate_of?: string | null;
  [key: string]: unknown;
}

interface TrackingFile {
  findings: TrackingEntry[];
}

// Map a board column to the canonical tracking status it persists as.
const COLUMN_TO_STATUS: Record<string, string> = {
  potential: 'pending_validation',
  verified: 'verified',
  invalid: 'rejected',
  duplicate: 'duplicate',
};

const STATUS_VALUES = new Set([
  'pending_validation',
  'unverified',
  'verified',
  'rejected',
  'duplicate',
]);

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const id = params.id;
  const body = (await request.json()) as {
    column?: string;
    status?: string;
    duplicate_of?: string | null;
  };

  let nextStatus: string | undefined;
  if (body.status) {
    if (!STATUS_VALUES.has(body.status)) {
      return NextResponse.json({ error: `Invalid status: ${body.status}` }, { status: 400 });
    }
    nextStatus = body.status;
  } else if (body.column) {
    nextStatus = COLUMN_TO_STATUS[body.column];
    if (!nextStatus) {
      return NextResponse.json({ error: `Invalid column: ${body.column}` }, { status: 400 });
    }
  } else {
    return NextResponse.json(
      { error: "Body must include either 'column' or 'status'" },
      { status: 400 },
    );
  }

  const tracking = readJsonFile<TrackingFile>('tracking.json') ?? { findings: [] };
  const entry = tracking.findings.find((e) => e.id === id);
  if (!entry) {
    return NextResponse.json({ error: `Issue ${id} not found in tracking.json` }, { status: 404 });
  }

  entry.status = nextStatus;
  if (body.duplicate_of !== undefined) {
    entry.duplicate_of = body.duplicate_of;
  }
  // Clearing duplicate_of when leaving the duplicate column reduces stale refs.
  if (nextStatus !== 'duplicate' && entry.duplicate_of) {
    entry.duplicate_of = null;
  }

  writeJsonFile('tracking.json', tracking);
  return NextResponse.json({ ok: true, id, status: nextStatus });
}
