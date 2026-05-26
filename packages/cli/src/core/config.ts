import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { ConfigSchema } from './schema.js';
import { normalizePath, getOutputDir } from './paths.js';
import { readJsonFile, writeJsonOutput } from './output.js';

export type Config = z.infer<typeof ConfigSchema>;

/**
 * Load and validate config from an output directory.
 * Searches for config.json in the specified or default output dir.
 */
export function loadConfig(projectDir?: string): Config {
  const dir = projectDir ?? process.cwd();
  const configPath = findConfigFile(dir);
  if (!configPath) {
    throw new Error(`No config.json found. Run 'hex init' first.\nSearched in: ${dir}`);
  }

  const raw = readJsonFile<unknown>(configPath);
  if (!raw) {
    throw new Error(`Failed to read config file: ${configPath}`);
  }

  const result = ConfigSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(
      `Invalid config.json:\n${result.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n')}`,
    );
  }

  return result.data;
}

/**
 * Search for config.json in common output directory locations.
 */
function findConfigFile(projectDir: string): string | null {
  const candidates = [
    path.join(projectDir, '.hex', 'config.json'),
    path.join(projectDir, '.solaudit', 'config.json'),
    path.join(projectDir, 'solaudit-output', 'config.json'),
  ];

  // Also check if projectDir itself is an output dir
  candidates.push(path.join(projectDir, 'config.json'));

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return normalizePath(candidate);
    }
  }
  return null;
}

export interface CreateConfigOptions {
  name: string;
  projectDir: string;
  commit: string;
  chain?: string;
  solidityVersion: string;
  docsUrl?: string;
  scope: string[];
  exclude?: string[];
  outputDir?: string;
}

/**
 * Create a new config.json in the output directory.
 */
export function createConfig(options: CreateConfigOptions): Config {
  const config: Config = {
    version: '1.0',
    project: {
      name: options.name,
      project_dir: normalizePath(options.projectDir),
      commit: options.commit,
      chain: options.chain ?? 'ethereum',
      solidity_version: options.solidityVersion,
      docs_url: options.docsUrl,
      scope: options.scope.map(normalizePath),
      exclude: (options.exclude ?? []).map(normalizePath),
    },
    settings: {
      output_dir: options.outputDir ?? '.hex',
      ai_model: 'claude-sonnet-4-20250514',
      finding_template: 'default',
    },
  };

  const outputDir = getOutputDir(options.projectDir, config.settings.output_dir);
  writeJsonOutput(outputDir, 'config.json', config);

  return config;
}
