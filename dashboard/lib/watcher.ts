import chokidar from 'chokidar';
import path from 'node:path';

let watcher: chokidar.FSWatcher | null = null;
const listeners = new Set<(file: string) => void>();

/**
 * Files the dashboard itself writes on every selection (focus.json) or that
 * are scratch (atomic-write temps, caches, raw audio) must not trigger a
 * refresh — otherwise selecting something would re-render the page.
 */
function ignored(rel: string): boolean {
  return (
    rel === 'focus.json' ||
    rel.endsWith('.tmp') ||
    rel.startsWith('.cache/') ||
    rel.startsWith('notes/audio/') ||
    rel.split('/').some((s) => s === 'node_modules')
  );
}

/** Watch `.hex/` for data the dashboard renders, including diagrams and report figures. */
export function initWatcher(outputDir: string): void {
  if (watcher) return;

  watcher = chokidar.watch(
    [
      path.join(outputDir, '**/*.{json,md,mmd,txt,tex,excalidraw}'),
      path.join(outputDir, 'ai-audit/**/*.tsv'),
      path.join(outputDir, 'report/figures/*.png'),
    ],
    {
      ignoreInitial: true,
      ignored: (p: string) =>
        /[\\/]\.cache([\\/]|$)|[\\/]node_modules([\\/]|$)|[\\/]notes[\\/]audio([\\/]|$)/.test(p),
      awaitWriteFinish: { stabilityThreshold: 250, pollInterval: 100 },
    },
  );

  const emit = (filePath: string) => {
    const rel = path.relative(outputDir, filePath).replace(/\\/g, '/');
    if (ignored(rel)) return;
    for (const l of listeners) l(rel);
  };
  watcher.on('change', emit);
  watcher.on('add', emit);
  watcher.on('unlink', emit);
}

/** Subscribe to file change events. */
export function onFileChange(callback: (file: string) => void): () => void {
  listeners.add(callback);
  return () => listeners.delete(callback);
}
