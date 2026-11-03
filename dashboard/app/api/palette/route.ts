import { NextResponse } from 'next/server';
import { buildBoard } from '@/lib/server/board';
import { readIndex } from '@/lib/server/diagrams';
import { outDir, readFacts } from '@/lib/server/workspace';
import { readInvariants } from '../../../../src/core/model';

export const dynamic = 'force-dynamic';

export interface PaletteEntry {
  kind: 'function' | 'contract' | 'card' | 'invariant' | 'diagram';
  label: string;
  detail?: string;
  href: string;
}

/** Everything ⌘K can jump to beyond the six pages. */
export async function GET() {
  const entries: PaletteEntry[] = [];
  const facts = readFacts();
  if (facts) {
    const interfaces = new Set(
      facts.contracts.filter((c) => c.kind === 'interface').map((c) => c.name),
    );
    for (const c of facts.contracts) {
      if (!c.in_scope || c.kind === 'interface') continue;
      entries.push({
        kind: 'contract',
        label: c.name,
        detail: c.file,
        href: `/review?contract=${encodeURIComponent(c.name)}`,
      });
    }
    for (const f of facts.functions) {
      if (!f.in_scope || interfaces.has(f.contract) || f.nsloc <= 0) continue;
      entries.push({
        kind: 'function',
        label: `${f.contract}.${f.name}`,
        detail: f.signature,
        href: `/review?fn=${encodeURIComponent(f.id)}`,
      });
    }
  }
  for (const c of buildBoard()) {
    entries.push({
      kind: 'card',
      label: c.title,
      detail: `${c.id} · ${c.severity}`,
      href: `/issues?card=${encodeURIComponent(c.id)}`,
    });
  }
  for (const i of readInvariants(outDir()).invariants) {
    entries.push({
      kind: 'invariant',
      label: i.statement,
      detail: i.id,
      href: `/model?s=invariants&id=${encodeURIComponent(i.id)}`,
    });
  }
  for (const d of readIndex()) {
    entries.push({
      kind: 'diagram',
      label: d.title,
      detail: 'Diagram',
      href: `/model?d=${encodeURIComponent(d.name)}`,
    });
  }
  return NextResponse.json({ entries });
}
