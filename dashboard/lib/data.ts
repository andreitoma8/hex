import fs from 'node:fs';
import path from 'node:path';
import { findOutputDir } from '../../src/core/locate';

function getOutputDir(): string {
  // Anchor to the output dir on disk, walking up from cwd. This is the SAME
  // resolver the `hex` CLI uses (src/core/config), so the dashboard and the CLI
  // can never read/write different `.hex` directories — even if the dashboard
  // is launched from a subdir or the stored project_dir has gone stale.
  try {
    const found = findOutputDir(process.cwd());
    if (found) return found;
  } catch {
    /* fall through to the cwd default */
  }
  return path.join(process.cwd(), '.hex');
}

/**
 * Read and parse a JSON file from the output directory.
 */
export function readJsonFile<T>(filename: string): T | null {
  try {
    const filePath = path.join(getOutputDir(), filename);
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

/**
 * Read a markdown file from the output directory.
 */
export function readMarkdownFile(filename: string): string | null {
  try {
    const filePath = path.join(getOutputDir(), filename);
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}

/**
 * Write a JSON file to the output directory.
 */
export function writeJsonFile(filename: string, data: unknown): void {
  const filePath = path.join(getOutputDir(), filename);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * Check if a file exists in the output directory.
 */
export function fileExists(filename: string): boolean {
  try {
    const filePath = path.join(getOutputDir(), filename);
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
}

/**
 * Get the output directory path.
 */
export function getOutputDirPath(): string {
  return getOutputDir();
}

/**
 * List subdirectory names within a directory relative to the output dir.
 */
export function listSubdirs(dir: string): string[] {
  try {
    const fullPath = path.join(getOutputDir(), dir);
    if (!fs.existsSync(fullPath)) return [];
    return fs.readdirSync(fullPath, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {
    return [];
  }
}

/**
 * Read a JSON file from a nested path within the output directory.
 */
export function readNestedJsonFile<T>(nestedPath: string): T | null {
  try {
    const filePath = path.join(getOutputDir(), nestedPath);
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}
