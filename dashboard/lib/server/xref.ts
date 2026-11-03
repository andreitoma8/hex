import fs from 'node:fs';
import path from 'node:path';
import { getOutputDirPath } from '@/lib/data';
import type { Xref, XrefDecl } from '../../../src/facts/xref';

let cache: { file: string; mtime: number; data: Xref } | null = null;

/** `.hex/xref.json`, parsed once per change on disk; null when `hex facts` has not written it. */
export function readXref(): Xref | null {
  const file = path.join(getOutputDirPath(), 'xref.json');
  let mtime: number;
  try {
    mtime = fs.statSync(file).mtimeMs;
  } catch {
    cache = null;
    return null;
  }
  if (cache && cache.file === file && cache.mtime === mtime) return cache.data;
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf-8')) as Xref;
    cache = { file, mtime, data };
    return data;
  } catch {
    return null;
  }
}

/** The function or modifier whose body holds `line` (the innermost, if nested). */
export function enclosingDecl(
  xref: Xref,
  file: string,
  line: number,
): { key: string; decl: XrefDecl } | null {
  let best: { key: string; decl: XrefDecl } | null = null;
  for (const [key, decl] of Object.entries(xref.decls)) {
    if (decl.file !== file || (decl.kind !== 'function' && decl.kind !== 'modifier')) continue;
    if (line < decl.line_start || line > decl.line_end) continue;
    if (!best || decl.line_end - decl.line_start < best.decl.line_end - best.decl.line_start)
      best = { key, decl };
  }
  return best;
}
