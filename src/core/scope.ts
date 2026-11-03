import { minimatch } from 'minimatch';
import type { Config } from './config.js';

/**
 * Scope membership for any path, including paths that only exist at another
 * commit: the raw --scope globs when recorded, else the resolved file list.
 * Exclude globs always apply.
 */
export function makeScopeTest(config: Config): (p: string) => boolean {
  const globs = config.project.scope_globs;
  const exclude = config.project.exclude ?? [];
  const listed = new Set(config.project.scope);
  const excluded = (p: string) => exclude.some((g) => minimatch(p, g, { dot: true }));
  if (!globs || globs.length === 0) return (p) => listed.has(p) && !excluded(p);
  return (p) =>
    p.endsWith('.sol') &&
    (listed.has(p) || globs.some((g) => minimatch(p, g, { dot: true }))) &&
    !excluded(p);
}
