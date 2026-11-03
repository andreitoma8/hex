import { NextRequest, NextResponse } from 'next/server';
import { removeFigure, validName, writeFigure } from '@/lib/server/diagrams';

export const dynamic = 'force-dynamic';

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

/** "Use in report": the PNG body becomes `.hex/report/figures/<name>.png`. */
export async function POST(request: NextRequest, { params }: { params: { name: string } }) {
  if (!validName(params.name)) return NextResponse.json({ error: 'Invalid name' }, { status: 400 });
  const buf = Buffer.from(await request.arrayBuffer());
  if (buf.length < 8 || !buf.subarray(0, 4).equals(PNG_MAGIC)) {
    return NextResponse.json({ error: 'Body must be a PNG' }, { status: 400 });
  }
  if (buf.length > 20 * 1024 * 1024)
    return NextResponse.json({ error: 'PNG too large' }, { status: 413 });
  writeFigure(params.name, buf);
  return NextResponse.json({ ok: true });
}

/** Take the figure out of the report. */
export async function DELETE(_req: NextRequest, { params }: { params: { name: string } }) {
  if (!validName(params.name)) return NextResponse.json({ error: 'Invalid name' }, { status: 400 });
  removeFigure(params.name);
  return NextResponse.json({ ok: true });
}
