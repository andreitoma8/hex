import fs from 'node:fs';
import path from 'node:path';

/**
 * Locate the Hex output directory on disk. Dependency-free (node builtins only)
 * so it can be imported by both the CLI and the Next.js dashboard without
 * dragging in the rest of `src/core` — the dashboard's webpack can't resolve our
 * NodeNext `.js`-suffixed relative imports, so anything it imports from here must
 * not import other `src/core` modules.
 */

/** Candidate output-directory names, in priority order (`.hex` is current). */
export const OUTPUT_DIR_NAMES = ['.hex', '.solaudit', 'solaudit-output'];

function norm(p: string): string {
  return p.replace(/\\/g, '/');
}

/**
 * Find a config.json directly under `dir` (in one of the candidate output dirs,
 * or `dir` itself). Returns the normalized path to config.json, or null.
 */
export function findConfigInDir(dir: string): string | null {
  const candidates = [
    ...OUTPUT_DIR_NAMES.map((name) => path.join(dir, name, 'config.json')),
    // Also check if `dir` itself is an output dir.
    path.join(dir, 'config.json'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return norm(candidate);
    }
  }
  return null;
}

/**
 * Locate the Hex output directory by **walking up** the directory tree from
 * `searchFrom`, checking each ancestor for a `<dir>/config.json`. Returns the
 * directory the config.json actually lives in (e.g. `<project>/.hex`) — anchored
 * to disk rather than to the absolute `project_dir` string baked into config.json
 * at init time (which goes stale if the project is moved/mounted/renamed and
 * makes the CLI and dashboard disagree about which `.hex` to use).
 *
 * Returns null if no config.json is found in `searchFrom` or any ancestor.
 */
export function findOutputDir(searchFrom: string = process.cwd()): string | null {
  let dir = path.resolve(searchFrom);
  // Loop until the filesystem root (parent === self).
  for (;;) {
    const configPath = findConfigInDir(dir);
    if (configPath) {
      return norm(path.dirname(configPath));
    }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}
