import { NextRequest, NextResponse } from 'next/server';
import { readScene, saveEditedScene, sceneMtime, validName } from '@/lib/server/diagrams';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: { name: string } }) {
  if (!validName(params.name)) return NextResponse.json({ error: 'Invalid name' }, { status: 400 });
  const scene = readScene(params.name);
  if (!scene) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ scene, mtime: sceneMtime(params.name) });
}

/** Save an edited scene: writes `<name>.excalidraw` (hex.edited) and marks the index entry edited. */
export async function PUT(request: NextRequest, { params }: { params: { name: string } }) {
  if (!validName(params.name)) return NextResponse.json({ error: 'Invalid name' }, { status: 400 });
  const body = (await request.json().catch(() => null)) as {
    elements?: unknown;
    appState?: Record<string, unknown>;
    files?: Record<string, unknown>;
  } | null;
  if (!body || !Array.isArray(body.elements)) {
    return NextResponse.json({ error: 'elements must be an array' }, { status: 400 });
  }
  try {
    const { mtime } = saveEditedScene(params.name, {
      elements: body.elements,
      appState: body.appState,
      files: body.files,
    });
    return NextResponse.json({ ok: true, mtime });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
