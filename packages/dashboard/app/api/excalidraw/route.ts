import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import { getOutputDirPath } from '@/lib/data';

export async function GET(request: NextRequest) {
  const filename = request.nextUrl.searchParams.get('file');

  if (!filename || !/^[\w.-]+\.excalidraw$/.test(filename)) {
    return NextResponse.json({ error: 'Invalid filename' }, { status: 400 });
  }

  const outputDir = getOutputDirPath();
  const filePath = path.join(outputDir, filename);

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const json = JSON.parse(content);
    return NextResponse.json(json);
  } catch {
    return NextResponse.json(
      { error: `File not found: ${filename}` },
      { status: 404 },
    );
  }
}
