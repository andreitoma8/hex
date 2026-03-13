import { NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import { getOutputDirPath } from '@/lib/data';

export async function GET() {
  const outputDir = getOutputDirPath();

  try {
    const files = fs.readdirSync(outputDir);
    const flows: { name: string; filename: string }[] = [];

    // Check for individual flow files (flow-*.excalidraw)
    for (const file of files) {
      if (/^flow-[\w-]+\.excalidraw$/.test(file)) {
        const name = file
          .replace(/^flow-/, '')
          .replace(/\.excalidraw$/, '')
          .replace(/-/g, ' ')
          .replace(/\b\w/g, (c) => c.toUpperCase());
        flows.push({ name, filename: file });
      }
    }

    // Check for legacy single flows.excalidraw
    if (flows.length === 0) {
      const legacyPath = path.join(outputDir, 'flows.excalidraw');
      if (fs.existsSync(legacyPath)) {
        flows.push({ name: 'All Flows', filename: 'flows.excalidraw' });
      }
    }

    return NextResponse.json({ flows });
  } catch {
    return NextResponse.json({ flows: [] });
  }
}
