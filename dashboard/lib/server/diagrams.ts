/**
 * Diagram files under `.hex/model/diagrams/` as the dashboard edits them.
 * Mirrors the contract in src/diagrams/build.ts: an edited scene carries
 * `hex.edited = true` and is never overwritten by a rebuild; a rebuild of an
 * edited scene writes `<name>.regenerated.excalidraw` and marks the index
 * entry `stale`. Node builtins only.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { DiagramIndexEntry } from '@/lib/types';
import { outDir } from './workspace';

const NAME = /^[a-z0-9][a-z0-9-]*$/;

export function validName(name: string): boolean {
  return NAME.test(name);
}

export function diagramsDir(): string {
  return path.join(outDir(), 'model', 'diagrams');
}

export function figuresDir(): string {
  return path.join(outDir(), 'report', 'figures');
}

function writeJsonAtomic(file: string, data: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', 'utf-8');
  fs.renameSync(tmp, file);
}

function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as T;
  } catch {
    return null;
  }
}

export function readIndex(): DiagramIndexEntry[] {
  return readJson<DiagramIndexEntry[]>(path.join(diagramsDir(), 'index.json')) ?? [];
}

function updateIndex(name: string, patch: Partial<DiagramIndexEntry>): DiagramIndexEntry | null {
  const index = readIndex();
  const entry = index.find((e) => e.name === name);
  if (!entry) return null;
  Object.assign(entry, patch);
  writeJsonAtomic(path.join(diagramsDir(), 'index.json'), index);
  return entry;
}

export interface SceneFile {
  type: 'excalidraw';
  version: number;
  source?: string;
  elements: unknown[];
  appState?: Record<string, unknown>;
  files?: Record<string, unknown>;
  hex?: { name: string; type: string; spec_hash: string; edited?: boolean };
}

const scenePath = (name: string) => path.join(diagramsDir(), `${name}.excalidraw`);
const regenPath = (name: string) => path.join(diagramsDir(), `${name}.regenerated.excalidraw`);
const figurePath = (name: string) => path.join(figuresDir(), `${name}.png`);

export function sceneMtime(name: string): number {
  try {
    return Math.floor(fs.statSync(scenePath(name)).mtimeMs);
  } catch {
    return 0;
  }
}

export function figureMtime(name: string): number {
  try {
    return Math.floor(fs.statSync(figurePath(name)).mtimeMs);
  } catch {
    return 0;
  }
}

export function readScene(name: string): SceneFile | null {
  return readJson<SceneFile>(scenePath(name));
}

/** Save the auditor's edit: the scene becomes `edited` and rebuilds keep it. */
export function saveEditedScene(
  name: string,
  scene: {
    elements: unknown[];
    appState?: Record<string, unknown>;
    files?: Record<string, unknown>;
  },
): { mtime: number } {
  const prev = readScene(name);
  const index = readIndex().find((e) => e.name === name);
  const appState = scene.appState ?? prev?.appState ?? {};
  const next: SceneFile = {
    type: 'excalidraw',
    version: 2,
    source: prev?.source ?? 'hex',
    elements: scene.elements,
    appState: {
      viewBackgroundColor: (appState.viewBackgroundColor as string) ?? '#ffffff',
      gridSize: (appState.gridSize as number | null) ?? null,
    },
    files: scene.files ?? prev?.files ?? {},
    hex: {
      name,
      type: prev?.hex?.type ?? index?.type ?? 'custom',
      spec_hash: prev?.hex?.spec_hash ?? index?.spec_hash ?? '',
      edited: true,
    },
  };
  writeJsonAtomic(scenePath(name), next);
  updateIndex(name, { edited: true });
  return { mtime: sceneMtime(name) };
}

/** "Use new layout": the regenerated scene replaces the edited one. */
export function useRegenerated(name: string): void {
  const regen = readJson<SceneFile>(regenPath(name));
  if (!regen) throw new Error(`No regenerated layout for ${name}`);
  writeJsonAtomic(scenePath(name), {
    ...regen,
    hex: { ...(regen.hex ?? { name, type: 'custom' }), edited: false },
  });
  fs.rmSync(regenPath(name), { force: true });
  updateIndex(name, {
    edited: false,
    stale: false,
    ...(regen.hex?.spec_hash ? { spec_hash: regen.hex.spec_hash } : {}),
  });
}

/**
 * "Keep mine": drop the regenerated layout and adopt its spec hash, so the
 * next rebuild sees the edited scene as current instead of regenerating again.
 */
export function keepEdited(name: string): void {
  const regen = readJson<SceneFile>(regenPath(name));
  const current = readScene(name);
  const specHash = regen?.hex?.spec_hash ?? current?.hex?.spec_hash ?? '';
  if (current) {
    writeJsonAtomic(scenePath(name), {
      ...current,
      hex: { ...(current.hex ?? { name, type: 'custom' }), spec_hash: specHash, edited: true },
    });
  }
  fs.rmSync(regenPath(name), { force: true });
  updateIndex(name, { stale: false, edited: true, ...(specHash ? { spec_hash: specHash } : {}) });
}

/** "Use in report": write `.hex/report/figures/<name>.png`. */
export function writeFigure(name: string, png: Buffer): void {
  fs.mkdirSync(figuresDir(), { recursive: true });
  const tmp = figurePath(name) + '.tmp';
  fs.writeFileSync(tmp, png);
  fs.renameSync(tmp, figurePath(name));
  updateIndex(name, { in_report: true });
}

export function removeFigure(name: string): void {
  fs.rmSync(figurePath(name), { force: true });
  updateIndex(name, { in_report: false });
}

export function readFigure(name: string): Buffer | null {
  try {
    return fs.readFileSync(figurePath(name));
  } catch {
    return null;
  }
}

/** Every PNG under report/figures (the report shows those in the index's `in_report`, plus any others). */
export function listFigures(): string[] {
  try {
    return fs
      .readdirSync(figuresDir())
      .filter((f) => f.endsWith('.png'))
      .map((f) => f.replace(/\.png$/, ''))
      .filter(validName)
      .sort();
  } catch {
    return [];
  }
}
