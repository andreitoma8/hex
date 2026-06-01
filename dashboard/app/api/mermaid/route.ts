import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import { getOutputDirPath } from '@/lib/data';

export async function GET(request: NextRequest) {
  const filename = request.nextUrl.searchParams.get('file');

  if (!filename || !/^[\w.-]+\.mmd$/.test(filename)) {
    return NextResponse.json({ error: 'Invalid filename' }, { status: 400 });
  }

  const outputDir = getOutputDirPath();
  const filePath = path.join(outputDir, 'diagrams', filename);

  try {
    const syntax = fs.readFileSync(filePath, 'utf-8');
    return NextResponse.json({ syntax });
  } catch {
    return NextResponse.json(
      { error: `File not found: ${filename}` },
      { status: 404 },
    );
  }
}
