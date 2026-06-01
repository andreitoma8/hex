import fs from 'node:fs';
import path from 'node:path';
import { normalizePath, splitLines } from '../core/paths.js';
import type { Config, Deps, Stats } from '../types/index.js';

export interface ContextOptions {
  target?: string;
  estimate?: boolean;
  outputFile?: string;
}

/**
 * Assemble context for AI prompts from scope files.
 */
export function assembleContext(
  config: Config,
  stats: Stats | null,
  deps: Deps | null,
  options: ContextOptions,
): string {
  const projectDir = config.project.project_dir;
  const commit = config.project.commit;
  const name = config.project.name;

  const lines: string[] = [];
  lines.push(`# Context: ${name} @ ${commit}`);
  lines.push('');

  if (options.target && deps) {
    // Targeted context: include target contract and its dependencies
    const targetContracts = getTargetDependencies(options.target, deps);
    const targetFiles = getFilesForContracts(targetContracts, stats);
    for (const file of targetFiles) {
      appendFileContext(lines, projectDir, file, stats);
    }
  } else {
    // Full context: all scope files
    for (const file of config.project.scope) {
      appendFileContext(lines, projectDir, file, stats);
    }
  }

  return lines.join('\n');
}

/**
 * Get all contracts that a target depends on, from the dependency graph.
 */
function getTargetDependencies(target: string, deps: Deps): string[] {
  const visited = new Set<string>();
  const queue = [target];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);

    const node = deps.graph[current];
    if (!node) continue;

    for (const dep of [...node.inherits, ...node.imports, ...node.calls]) {
      if (!visited.has(dep)) queue.push(dep);
    }
  }

  return [...visited];
}

/**
 * Get file paths for a set of contract names.
 */
function getFilesForContracts(contracts: string[], stats: Stats | null): string[] {
  if (!stats) return [];

  const files = new Set<string>();
  for (const c of contracts) {
    const entry = stats.per_contract.find((e) => e.contract === c);
    if (entry) files.add(entry.file);
  }
  return [...files];
}

/**
 * Append a file's content to the context output.
 */
function appendFileContext(
  lines: string[],
  projectDir: string,
  relativeFile: string,
  stats: Stats | null,
): void {
  const filePath = path.resolve(projectDir, relativeFile);
  if (!fs.existsSync(filePath)) return;

  const content = fs.readFileSync(filePath, 'utf-8');
  const nsloc = stats?.per_contract.find((e) => e.file === relativeFile)?.nsloc;
  const nslocLabel = nsloc ? ` (${nsloc} nSLOC)` : '';

  lines.push(`## File: ${normalizePath(relativeFile)}${nslocLabel}`);
  lines.push('```solidity');
  lines.push(content);
  lines.push('```');
  lines.push('');
}

/**
 * Estimate token count for the assembled context.
 * Uses a simple heuristic: ~4 characters per token.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
