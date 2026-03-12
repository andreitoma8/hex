import fs from 'node:fs';
import path from 'node:path';
import { normalizePath } from './paths.js';

/**
 * Atomic write: write to .tmp file then rename, to avoid partial reads by dashboard watcher.
 */
function atomicWrite(filePath: string, content: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const tmpPath = filePath + '.tmp';
  fs.writeFileSync(tmpPath, content, 'utf-8');
  fs.renameSync(tmpPath, filePath);
}

/**
 * Write a JSON output file with pretty-printing.
 */
export function writeJsonOutput(dir: string, filename: string, data: unknown): string {
  const filePath = normalizePath(path.join(dir, filename));
  const content = JSON.stringify(data, null, 2) + '\n';
  atomicWrite(filePath, content);
  return filePath;
}

/**
 * Write a markdown output file.
 */
export function writeMarkdownOutput(dir: string, filename: string, content: string): string {
  const filePath = normalizePath(path.join(dir, filename));
  atomicWrite(filePath, content);
  return filePath;
}

/**
 * Read and parse a JSON file, returning null if it doesn't exist.
 */
export function readJsonFile<T>(filePath: string): T | null {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}
