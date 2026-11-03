import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs';
import { readFacts } from '@/lib/server/workspace';
import { resolveSafe } from '@/lib/server/safe-path';
import { enclosingDecl, readXref } from '@/lib/server/xref';
import { callSites, readers, writers } from '../../../../src/facts/query';
import type { XrefDecl } from '../../../../src/facts/xref';

export const dynamic = 'force-dynamic';

export interface NavSite {
  /** The function the site sits in (a facts id), when there is one. */
  from?: string;
  fromName?: string;
  /** That function's lines, so the viewer can open it whole. */
  fromStart?: number;
  fromEnd?: number;
  file: string;
  line: number;
  /** The source line, trimmed, for the list. */
  code: string;
  kind: string;
}

/**
 * GET ?key=<decl key> → upstream for one declaration: for functions and
 * modifiers, every call site (facts call graph, including virtual dispatch);
 * for state variables and everything else, every place the code refers to it,
 * with reads and writes told apart.
 */
export async function GET(request: NextRequest) {
  const key = request.nextUrl.searchParams.get('key');
  if (!key) return NextResponse.json({ error: 'Missing key' }, { status: 400 });
  const xref = readXref();
  const facts = readFacts();
  const decl: XrefDecl | undefined = xref?.decls[key];

  const lines = new Map<string, string[]>();
  const codeAt = (file: string, line: number) => {
    if (!lines.has(file)) {
      const abs = resolveSafe(file);
      let text: string[] = [];
      try {
        if (abs) text = fs.readFileSync(abs, 'utf-8').split(/\r?\n/);
      } catch {
        /* unreadable: no snippet */
      }
      lines.set(file, text);
    }
    return (lines.get(file)![line - 1] ?? '').trim();
  };
  const nameOf = (id: string) => {
    const d = xref?.decls[id];
    return d ? `${d.contract ? `${d.contract}.` : ''}${d.name}` : id.replace(/\(.*$/, '');
  };

  let sites: NavSite[] = [];
  const isCallable = decl
    ? decl.kind === 'function' || decl.kind === 'modifier'
    : key.includes('(');
  if (isCallable && facts) {
    const fns = new Map(facts.functions.map((f) => [f.id, f]));
    sites = callSites(facts, key)
      .filter((s) => s.line)
      .map((s) => ({
        from: s.from,
        fromName: nameOf(s.from),
        fromStart: fns.get(s.from)?.line_start,
        fromEnd: fns.get(s.from)?.line_end,
        file: s.file,
        line: s.line!,
        code: codeAt(s.file, s.line!),
        kind: s.kind,
      }));
  } else if (xref) {
    const writing = new Set(facts && decl?.kind === 'state_var' ? writers(facts, key) : []);
    const reading = new Set(facts && decl?.kind === 'state_var' ? readers(facts, key) : []);
    for (const [file, refs] of Object.entries(xref.refs)) {
      for (const [line, , , k, def] of refs) {
        if (k !== key || def) continue;
        const enc = enclosingDecl(xref, file, line);
        const kind =
          decl?.kind !== 'state_var'
            ? 'use'
            : enc && writing.has(enc.key)
              ? 'write'
              : enc && reading.has(enc.key)
                ? 'read'
                : 'use';
        sites.push({
          ...(enc
            ? {
                from: enc.key,
                fromName: nameOf(enc.key),
                fromStart: enc.decl.line_start,
                fromEnd: enc.decl.line_end,
              }
            : {}),
          file,
          line,
          code: codeAt(file, line),
          kind,
        });
      }
    }
  }
  // One row per line: `totalShares == 0 ? x : y / totalShares` is one use, not two.
  const seen = new Set<string>();
  sites = sites
    .filter((s) => {
      const k = `${s.from ?? ''}|${s.file}|${s.line}|${s.kind}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);

  const impls = (xref?.impls[key] ?? []).map((i) => ({ ...i, decl: xref?.decls[i.id] ?? null }));
  return NextResponse.json({ key, decl: decl ?? null, impls, sites });
}
