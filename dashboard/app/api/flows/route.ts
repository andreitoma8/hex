import { NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import { getOutputDirPath } from '@/lib/data';

export async function GET() {
  const outputDir = getOutputDirPath();

  try {
    const files = fs.readdirSync(path.join(outputDir, 'diagrams'));
    const flows: { name: string; filename: string }[] = [];

    for (const file of files) {
      if (/^flow-[\w-]+\.mmd$/.test(file)) {
        const name = file
          .replace(/^flow-/, '')
          .replace(/\.mmd$/, '')
          .replace(/-/g, ' ')
          .replace(/\b\w/g, (c) => c.toUpperCase());
        flows.push({ name, filename: file });
      }
    }

    return NextResponse.json({ flows });
  } catch {
    return NextResponse.json({ flows: [] });
  }
}
