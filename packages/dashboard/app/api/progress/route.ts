import { NextRequest, NextResponse } from 'next/server';
import { readJsonFile, writeJsonFile } from '@/lib/data';

interface ProgressData {
  updated_at: string;
  reviewed_contracts: Record<string, boolean>;
}

const DEFAULT_PROGRESS: ProgressData = {
  updated_at: new Date().toISOString(),
  reviewed_contracts: {},
};

export async function GET() {
  const data = readJsonFile<ProgressData>('progress.json');
  return NextResponse.json(data ?? DEFAULT_PROGRESS);
}

export async function POST(request: NextRequest) {
  const body = await request.json() as { reviewed_contracts: Record<string, boolean> };

  if (!body.reviewed_contracts || typeof body.reviewed_contracts !== 'object') {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const existing = readJsonFile<ProgressData>('progress.json') ?? { ...DEFAULT_PROGRESS };

  // Merge: new values override existing
  for (const [key, value] of Object.entries(body.reviewed_contracts)) {
    existing.reviewed_contracts[key] = value;
  }
  existing.updated_at = new Date().toISOString();

  writeJsonFile('progress.json', existing);
  return NextResponse.json(existing);
}
