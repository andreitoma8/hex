import fs from 'node:fs';
import path from 'node:path';
import { projectRoot } from './workspace';

/**
 * Resolve `file` inside the audited project, or null. Both sides go through
 * realpath (no symlink escapes), the target must be the root or sit under
 * `root + sep` (no `/proj-evil` prefix tricks), and dotfiles, dot-dirs
 * (`.env`, `.git`, `.hex`) and anything under node_modules are refused.
 */
export function resolveSafe(file: string): string | null {
  let root: string;
  try {
    root = fs.realpathSync(projectRoot());
  } catch {
    return null;
  }
  let target: string;
  try {
    target = fs.realpathSync(path.resolve(root, file));
  } catch {
    return null;
  }
  if (target !== root && !target.startsWith(root + path.sep)) return null;
  const segments = path.relative(root, target).split(path.sep);
  if (segments.some((s) => s.startsWith('.') || s === 'node_modules')) return null;
  return target;
}
