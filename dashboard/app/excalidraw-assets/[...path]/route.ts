import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';

export const dynamic = 'force-dynamic';

declare const __non_webpack_require__: NodeRequire | undefined;

let assetRoot: string | null | undefined;

/**
 * Excalidraw's hand-drawn fonts, served from the installed package so
 * diagrams render offline (window.EXCALIDRAW_ASSET_PATH points here). If the
 * package can't be located, Excalidraw falls back to its CDN.
 */
function root(): string | null {
  if (assetRoot !== undefined) return assetRoot;
  assetRoot = null;
  try {
    const req = typeof __non_webpack_require__ === 'function' ? __non_webpack_require__ : null;
    const entry = req?.resolve('@excalidraw/excalidraw');
    if (entry) {
      const dir = path.dirname(entry);
      if (fs.existsSync(path.join(dir, 'fonts'))) assetRoot = dir;
    }
  } catch {
    /* fall through */
  }
  return assetRoot;
}

const TYPES: Record<string, string> = {
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
};

export async function GET(_req: NextRequest, { params }: { params: { path: string[] } }) {
  const base = root();
  const rel = params.path.join('/');
  if (!base || !rel.startsWith('fonts/') || rel.includes('..')) {
    return new NextResponse(null, { status: 404 });
  }
  const file = path.join(base, rel);
  const type = TYPES[path.extname(file)];
  if (!type || !file.startsWith(path.join(base, 'fonts') + path.sep))
    return new NextResponse(null, { status: 404 });
  try {
    const data = fs.readFileSync(file);
    return new NextResponse(new Uint8Array(data), {
      headers: { 'Content-Type': type, 'Cache-Control': 'public, max-age=31536000, immutable' },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
