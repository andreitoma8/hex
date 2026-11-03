import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import { outDir } from '@/lib/server/workspace';

export const dynamic = 'force-dynamic';

const KINDS = new Set(['function', 'card', 'diagram_node', 'code_range', 'invariant', 'comment']);

/**
 * The dashboard's current selection → `.hex/focus.json`, read by the Hex MCP
 * tool `hex_focus` so the Claude Code session knows what "this" means.
 */
export async function POST(request: NextRequest) {
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  if (typeof b.ref !== 'string' || !b.ref || typeof b.kind !== 'string' || !KINDS.has(b.kind)) {
    return NextResponse.json({ error: 'ref and kind are required' }, { status: 400 });
  }
  const int = (v: unknown) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.trunc(v) : undefined;
  const focus = {
    ref: b.ref.slice(0, 500),
    kind: b.kind,
    label: typeof b.label === 'string' ? b.label.slice(0, 500) : b.ref.slice(0, 500),
    ...(typeof b.file === 'string' ? { file: b.file } : {}),
    ...(int(b.line_start) !== undefined ? { line_start: int(b.line_start) } : {}),
    ...(int(b.line_end) !== undefined ? { line_end: int(b.line_end) } : {}),
    updated_at: new Date().toISOString(),
  };
  const file = path.join(outDir(), 'focus.json');
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(focus, null, 2) + '\n', 'utf-8');
  fs.renameSync(tmp, file);
  return NextResponse.json({ ok: true });
}
