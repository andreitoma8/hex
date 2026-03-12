import chokidar from 'chokidar';
import path from 'node:path';

let watcher: chokidar.FSWatcher | null = null;
const listeners = new Set<(file: string) => void>();

/**
 * Initialize file watcher for the output directory.
 */
export function initWatcher(outputDir: string): void {
  if (watcher) return;

  watcher = chokidar.watch(
    path.join(outputDir, '**/*.{json,md,excalidraw}'),
    {
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 300,
        pollInterval: 100,
      },
    },
  );

  watcher.on('change', (filePath) => {
    const relative = path.relative(outputDir, filePath).replace(/\\/g, '/');
    for (const listener of listeners) {
      listener(relative);
    }
  });

  watcher.on('add', (filePath) => {
    const relative = path.relative(outputDir, filePath).replace(/\\/g, '/');
    for (const listener of listeners) {
      listener(relative);
    }
  });
}

/**
 * Subscribe to file change events.
 */
export function onFileChange(callback: (file: string) => void): () => void {
  listeners.add(callback);
  return () => listeners.delete(callback);
}
