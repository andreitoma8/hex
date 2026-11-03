import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import { resolveSafe } from '@/lib/server/safe-path';

export const dynamic = 'force-dynamic';

const MAX_BYTES = 2 * 1024 * 1024;

export async function GET(request: NextRequest) {
  const file = request.nextUrl.searchParams.get('file');
  if (!file) return NextResponse.json({ error: 'Missing file parameter' }, { status: 400 });

  const target = resolveSafe(file);
  if (!target) return NextResponse.json({ error: 'File not available' }, { status: 403 });

  try {
    const stat = fs.statSync(target);
    if (!stat.isFile()) return NextResponse.json({ error: 'Not a file' }, { status: 400 });
    if (stat.size > MAX_BYTES)
      return NextResponse.json({ error: 'File too large' }, { status: 413 });
    const content = fs.readFileSync(target, 'utf-8');

    const startParam = request.nextUrl.searchParams.get('start');
    const endParam = request.nextUrl.searchParams.get('end');
    if (!startParam && !endParam) {
      // The code viewer needs the whole file.
      return NextResponse.json({ code: content, start: 1, lines: content.split('\n').length });
    }
    const lines = content.split('\n');
    const start = Math.max(1, parseInt(startParam ?? '1', 10) || 1);
    const end = Math.min(lines.length, parseInt(endParam ?? '0', 10) || lines.length);
    return NextResponse.json({
      code: lines.slice(start - 1, end).join('\n'),
      start,
      lines: lines.length,
    });
  } catch {
    return NextResponse.json({ error: `File not found: ${file}` }, { status: 404 });
  }
}
