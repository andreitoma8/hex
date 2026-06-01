import fs from 'node:fs';
import path from 'node:path';

function getProjectDir(): string {
  // The `hex dashboard` CLI spawns Next.js with cwd = the user's audit project,
  // so process.cwd() is authoritative. (The HEX_PROJECT_DIR env var was a
  // vestige from the old monorepo layout and has been removed.)
  return process.cwd();
}

function getOutputDir(): string {
  const projectDir = getProjectDir();
  // Try .hex/ first, fall back to .solaudit/ for backwards compat
  try {
    const hexConfigPath = path.join(projectDir, '.hex', 'config.json');
    if (fs.existsSync(hexConfigPath)) {
      return path.join(projectDir, '.hex');
    }
    const legacyConfigPath = path.join(projectDir, '.solaudit', 'config.json');
    if (fs.existsSync(legacyConfigPath)) {
      return path.join(projectDir, '.solaudit');
    }
  } catch { /* ignore */ }
  return path.join(projectDir, '.hex');
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
