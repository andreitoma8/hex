import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';

function getProjectDir(): string {
  return process.env.SOLAUDIT_PROJECT_DIR ?? process.cwd();
}

export async function GET(request: NextRequest) {
  const file = request.nextUrl.searchParams.get('file');
  const start = parseInt(request.nextUrl.searchParams.get('start') ?? '1', 10);
  const end = parseInt(request.nextUrl.searchParams.get('end') ?? '0', 10);

  if (!file) {
    return NextResponse.json({ error: 'Missing file parameter' }, { status: 400 });
  }

  // Security: resolve and validate path is within project directory
  const projectDir = getProjectDir();
  const resolved = path.resolve(projectDir, file);
  if (!resolved.startsWith(path.resolve(projectDir))) {
    return NextResponse.json({ error: 'Path outside project directory' }, { status: 403 });
  }

  try {
    const content = fs.readFileSync(resolved, 'utf-8');
    const lines = content.split('\n');
    const startLine = Math.max(1, start);
    const endLine = end > 0 ? Math.min(end, lines.length) : lines.length;
    const slice = lines.slice(startLine - 1, endLine).join('\n');
    return NextResponse.json({ code: slice });
  } catch {
    return NextResponse.json({ error: `File not found: ${file}` }, { status: 404 });
  }
}
