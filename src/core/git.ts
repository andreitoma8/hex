import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { HexError } from './errors.js';

/**
 * Thin, synchronous git helpers for the differential-audit mode. Every call
 * runs with `-C <dir>` so paths in and out are relative to the Hex project
 * directory (which may be a subdirectory of the repository).
 */

function git(dir: string, args: string[]): string {
  return execFileSync('git', ['-C', dir, ...args], {
    encoding: 'utf-8',
    maxBuffer: 256 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

export function isGitRepo(dir: string): boolean {
  try {
    return git(dir, ['rev-parse', '--is-inside-work-tree']).trim() === 'true';
  } catch {
    return false;
  }
}

/** Resolve a ref to a full commit SHA, or throw `diff.base-missing`. */
export function resolveCommit(dir: string, ref: string): string {
  try {
    return git(dir, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]).trim();
  } catch {
    throw new HexError('diff.base-missing', `ref: ${ref}`);
  }
}

/** The working tree's HEAD commit, or null when it cannot be read. */
export function headCommit(dir: string): string | null {
  try {
    return git(dir, ['rev-parse', 'HEAD']).trim();
  } catch {
    return null;
  }
}

export interface ChangedFile {
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  path: string;
  old_path?: string;
}

/** `git diff --name-status -M` between two commits, paths relative to `dir`. */
export function changedFiles(dir: string, base: string, head: string): ChangedFile[] {
  const out = git(dir, ['diff', '--name-status', '-z', '-M', '--relative', base, head]);
  const parts = out.split('\0').filter((p, i, arr) => !(p === '' && i === arr.length - 1));
  const files: ChangedFile[] = [];
  for (let i = 0; i < parts.length; ) {
    const code = parts[i++];
    if (!code) continue;
    const letter = code[0];
    if (letter === 'R' || letter === 'C') {
      const oldPath = parts[i++];
      const newPath = parts[i++];
      // A copy leaves the original in place; treat the new path as added.
      if (letter === 'C') files.push({ status: 'added', path: newPath });
      else files.push({ status: 'renamed', path: newPath, old_path: oldPath });
      continue;
    }
    const p = parts[i++];
    if (letter === 'A') files.push({ status: 'added', path: p });
    else if (letter === 'D') files.push({ status: 'deleted', path: p });
    else files.push({ status: 'modified', path: p });
  }
  return files;
}

/** Added/deleted line counts per (new) path between two commits. */
export function numstat(
  dir: string,
  base: string,
  head: string,
): Map<string, { additions: number; deletions: number }> {
  const out = git(dir, ['diff', '--numstat', '-z', '-M', '--relative', base, head]);
  const parts = out.split('\0');
  const map = new Map<string, { additions: number; deletions: number }>();
  for (let i = 0; i < parts.length; ) {
    const rec = parts[i++];
    if (!rec) continue;
    const [a, d, p] = rec.split('\t');
    const additions = a === '-' ? 0 : parseInt(a, 10) || 0;
    const deletions = d === '-' ? 0 : parseInt(d, 10) || 0;
    if (p === '' || p === undefined) {
      // Rename: the record is followed by the old and new paths.
      i++; // old path
      const newPath = parts[i++];
      if (newPath) map.set(newPath, { additions, deletions });
    } else {
      map.set(p, { additions, deletions });
    }
  }
  return map;
}

/** File contents at a commit, or null when the path does not exist there. */
export function showFile(dir: string, commit: string, filePath: string): string | null {
  try {
    return git(dir, ['show', `${commit}:./${filePath}`]);
  } catch {
    return null;
  }
}

/** Every file path in the tree at `commit`, relative to `dir`. */
export function listFiles(dir: string, commit: string): string[] {
  return git(dir, ['ls-tree', '-r', '--name-only', '-z', commit]).split('\0').filter(Boolean);
}

/** Unified diff between two commits restricted to the given paths. */
export function unifiedDiff(dir: string, base: string, head: string, paths: string[]): string {
  if (paths.length === 0) return '';
  return git(dir, ['diff', '-M', '--relative', base, head, '--', ...paths]);
}

/**
 * Check out `commit` in a throwaway worktree under `cacheDir`, run `fn` with the
 * project directory inside it, then remove the worktree. Dependencies that live
 * outside git (`lib/` submodules, `node_modules/`) are symlinked from the
 * current checkout so the old commit can compile.
 */
export function withWorktree<T>(
  projectDir: string,
  commit: string,
  cacheDir: string,
  fn: (worktreeProjectDir: string) => T,
): T {
  const repoRoot = git(projectDir, ['rev-parse', '--show-toplevel']).trim();
  const rel = path.relative(repoRoot, path.resolve(projectDir));
  const wt = path.join(cacheDir, 'worktrees', commit.slice(0, 12));
  fs.rmSync(wt, { recursive: true, force: true });
  try {
    git(repoRoot, ['worktree', 'prune']);
  } catch {
    /* nothing to prune */
  }
  git(repoRoot, ['worktree', 'add', '--detach', '--force', wt, commit]);
  const wtProject = path.join(wt, rel);
  try {
    for (const dep of ['lib', 'node_modules']) {
      const src = path.join(projectDir, dep);
      const dst = path.join(wtProject, dep);
      const dstEmpty =
        !fs.existsSync(dst) || (fs.statSync(dst).isDirectory() && fs.readdirSync(dst).length === 0);
      if (fs.existsSync(src) && dstEmpty) {
        fs.rmSync(dst, { recursive: true, force: true });
        fs.symlinkSync(path.resolve(src), dst, 'dir');
      }
    }
    return fn(wtProject);
  } finally {
    try {
      git(repoRoot, ['worktree', 'remove', '--force', wt]);
    } catch {
      fs.rmSync(wt, { recursive: true, force: true });
    }
  }
}
