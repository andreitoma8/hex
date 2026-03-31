import path from 'node:path';

/**
 * Normalize a file path to use forward slashes (for consistent JSON output).
 */
export function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, '/');
}

/**
 * Resolve a path relative to the project directory.
 */
export function resolveFromProject(projectDir: string, ...segments: string[]): string {
  return normalizePath(path.resolve(projectDir, ...segments));
}

/**
 * Make a path relative to the project directory.
 */
export function makeRelative(projectDir: string, absolutePath: string): string {
  return normalizePath(path.relative(projectDir, absolutePath));
}

/**
 * Get the output directory path from the project dir and config output_dir setting.
 */
export function getOutputDir(projectDir: string, outputDir: string = '.hex'): string {
  return resolveFromProject(projectDir, outputDir);
}

/**
 * Split text into lines, handling both Unix and Windows line endings.
 */
export function splitLines(text: string): string[] {
  return text.split(/\r?\n/);
}
