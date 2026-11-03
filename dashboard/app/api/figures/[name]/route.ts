import { NextRequest, NextResponse } from 'next/server';
import { readFigure, validName } from '@/lib/server/diagrams';

export const dynamic = 'force-dynamic';

/** Serve `.hex/report/figures/<name>.png` for report thumbnails. */
export async function GET(_req: NextRequest, { params }: { params: { name: string } }) {
  const name = params.name.replace(/\.png$/, '');
  if (!validName(name)) return NextResponse.json({ error: 'Invalid name' }, { status: 400 });
  const png = readFigure(name);
  if (!png) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return new NextResponse(new Uint8Array(png), {
    headers: { 'Content-Type': 'image/png', 'Cache-Control': 'no-cache' },
  });
}
