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
  // Returning 200 with a null body so the client can `res.json()` cleanly. A
  // genuine 204 (No Content) is invalid per HTTP spec when paired with any
  // response body, and Node 24's undici throws on the mismatch.
  return NextResponse.json(status ?? null);
}
