import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DiagramSpecSchema } from '../core/schema.js';
import type { DiagramIndexEntry, DiagramSpec } from '../types/index.js';
import { layoutDiagram } from './layout.js';
import { toExcalidraw, type ExcalidrawFile } from './excalidraw.js';

export function diagramsDir(outputDir: string): string {
  return path.join(outputDir, 'model', 'diagrams');
}

export function readDiagramIndex(outputDir: string): DiagramIndexEntry[] {
  try {
    return JSON.parse(
      fs.readFileSync(path.join(diagramsDir(outputDir), 'index.json'), 'utf-8'),
    ) as DiagramIndexEntry[];
  } catch {
    return [];
  }
}

function writeAtomic(file: string, data: unknown): void {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', 'utf-8');
  fs.renameSync(tmp, file);
}

/** Refs changed in a differential audit (depth 0), for highlighting. */
function changedRefs(outputDir: string): Set<string> {
  try {
    const diff = JSON.parse(fs.readFileSync(path.join(outputDir, 'diff.json'), 'utf-8')) as {
      impacted?: Array<{ contract: string; function: string; depth: number }>;
    };
    return new Set(
      (diff.impacted ?? []).filter((i) => i.depth === 0).map((i) => `${i.contract}.${i.function}`),
    );
  } catch {
    return new Set();
  }
}

export interface BuildOutcome {
  name: string;
  status: 'built' | 'unchanged-edited' | 'regenerated' | 'invalid';
  error?: string;
}

/**
 * Build `.excalidraw` files from `<name>.spec.json`. A scene the auditor edited
 * in the dashboard is never overwritten: when its spec changed, the new layout
 * goes to `<name>.regenerated.excalidraw` and the index marks it stale.
 */
export function buildDiagrams(
  outputDir: string,
  opts: { names?: string[]; force?: boolean } = {},
): BuildOutcome[] {
  const dir = diagramsDir(outputDir);
  if (!fs.existsSync(dir)) return [];
  const specFiles = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.spec.json'))
    .filter((f) => !opts.names?.length || opts.names.includes(f.replace(/\.spec\.json$/, '')));
  const index = new Map(readDiagramIndex(outputDir).map((e) => [e.name, e]));
  const changed = changedRefs(outputDir);
  const outcomes: BuildOutcome[] = [];

  for (const file of specFiles.sort()) {
    const raw = fs.readFileSync(path.join(dir, file), 'utf-8');
    let spec: DiagramSpec;
    try {
      const parsed = DiagramSpecSchema.safeParse(JSON.parse(raw));
      if (!parsed.success) {
        throw new Error(
          parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
        );
      }
      spec = parsed.data;
    } catch (err) {
      outcomes.push({
        name: file,
        status: 'invalid',
        error: err instanceof Error ? err.message : String(err),
      });
      continue;
    }
    const specHash = crypto
      .createHash('sha1')
      .update(JSON.stringify(spec))
      .digest('hex')
      .slice(0, 16);
    const scene = layoutDiagram(spec);
    const out: ExcalidrawFile = toExcalidraw(scene, {
      name: spec.name,
      type: spec.type,
      spec_hash: specHash,
    });
    for (const el of out.elements) {
      const ref = el.customData?.hexRef as string | undefined;
      if (ref && changed.has(ref) && el.type !== 'text') {
        el.strokeColor = '#ea580c';
        el.strokeWidth = 3;
        el.customData = { ...el.customData, hexChanged: true };
      }
    }

    const target = path.join(dir, `${spec.name}.excalidraw`);
    let existing: ExcalidrawFile | null = null;
    try {
      existing = JSON.parse(fs.readFileSync(target, 'utf-8')) as ExcalidrawFile;
    } catch {
      /* first build */
    }
    const prev = index.get(spec.name);
    const entry: DiagramIndexEntry = {
      name: spec.name,
      type: spec.type,
      title: spec.title,
      takeaway: spec.takeaway,
      spec_hash: specHash,
      built_at: new Date().toISOString(),
      edited: false,
      stale: false,
      in_report: prev?.in_report ?? false,
    };

    if (existing?.hex?.edited && !opts.force) {
      if (existing.hex.spec_hash === specHash) {
        outcomes.push({ name: spec.name, status: 'unchanged-edited' });
        index.set(spec.name, {
          ...entry,
          edited: true,
          built_at: prev?.built_at ?? entry.built_at,
        });
      } else {
        writeAtomic(path.join(dir, `${spec.name}.regenerated.excalidraw`), out);
        outcomes.push({ name: spec.name, status: 'regenerated' });
        index.set(spec.name, {
          ...entry,
          spec_hash: existing.hex.spec_hash,
          edited: true,
          stale: true,
        });
      }
      continue;
    }
    writeAtomic(target, out);
    fs.rmSync(path.join(dir, `${spec.name}.regenerated.excalidraw`), { force: true });
    index.set(spec.name, entry);
    outcomes.push({ name: spec.name, status: 'built' });
  }

  writeAtomic(
    path.join(dir, 'index.json'),
    [...index.values()].sort((a, b) => a.name.localeCompare(b.name)),
  );
  return outcomes;
}
