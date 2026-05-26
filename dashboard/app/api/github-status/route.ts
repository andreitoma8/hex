import { NextResponse } from 'next/server';
import { readJsonFile } from '@/lib/data';

interface GithubSyncStatus {
  repo: string;
  last_synced_at: string;
  pushed?: number;
  updated?: number;
  pulled?: number;
  teammate_findings?: number;
  duplicates_detected?: number;
  errors?: string[];
}

export const dynamic = 'force-dynamic';

export async function GET() {
  const status = readJsonFile<GithubSyncStatus>('external/github/sync-status.json');
  if (!status) {
    return NextResponse.json({}, { status: 204 });
  }
  return NextResponse.json(status);
}
