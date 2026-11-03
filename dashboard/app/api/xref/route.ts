import { NextRequest, NextResponse } from 'next/server';
import { readXref } from '@/lib/server/xref';
import type { XrefDecl } from '../../../../src/facts/xref';

export const dynamic = 'force-dynamic';

/**
 * GET ?file=src/Vault.sol → what the code viewer needs to make that file
 * navigable: its references, the declarations they point at (and the
 * declarations in the file), and where interface or virtual targets run.
 */
export async function GET(request: NextRequest) {
  const file = request.nextUrl.searchParams.get('file');
  if (!file) return NextResponse.json({ error: 'Missing file' }, { status: 400 });
  const xref = readXref();
  if (!xref) return NextResponse.json({ available: false });
  const refs = xref.refs[file] ?? [];
  const keys = new Set(refs.map((r) => r[3]));
  for (const [k, d] of Object.entries(xref.decls)) if (d.file === file) keys.add(k);
  const impls: Record<string, (typeof xref.impls)[string]> = {};
  for (const k of [...keys]) {
    const list = xref.impls[k];
    if (!list) continue;
    impls[k] = list;
    for (const i of list) keys.add(i.id);
  }
  const decls: Record<string, XrefDecl> = {};
  for (const k of keys) if (xref.decls[k]) decls[k] = xref.decls[k];
  return NextResponse.json({ available: true, refs, decls, impls });
}
