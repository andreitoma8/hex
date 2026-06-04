import path from 'node:path';
import { z } from 'zod';
import { ConfigSchema } from './schema.js';
import { normalizePath, getOutputDir } from './paths.js';
import { readJsonFile, writeJsonOutput } from './output.js';
import { findConfigInDir, findOutputDir } from './locate.js';

export type Config = z.infer<typeof ConfigSchema>;

// Re-export the disk-anchored resolver so existing importers keep using
// `../core/config.js`. The implementation lives in the dependency-free
// `locate.ts` so the dashboard can import it without webpack choking on our
// NodeNext `.js` sibling imports.
export { findOutputDir } from './locate.js';

/**
 * Load and validate config from an output directory.
 * Searches for config.json in the specified or default output dir.
 */
export function loadConfig(projectDir?: string): Config {
  const dir = projectDir ?? process.cwd();
  const configPath = findConfigInDir(dir);
  if (!configPath) {
    throw new Error(`No config.json found. Run 'hex init' first.\nSearched in: ${dir}`);
  }
  return parseConfigFile(configPath);
}

/** Read and validate a config.json at a known path. */
function parseConfigFile(configPath: string): Config {
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

export interface ProjectContext {
  config: Config;
  /** The directory holding config.json (e.g. `<project>/.hex`), anchored to disk. */
  outputDir: string;
}

/**
 * The single anchored resolver every data consumer should use: find the output
 * directory on disk (walking up from `searchFrom`), then load the config from
 * it. Both the CLI and the dashboard route through this so they can never
 * resolve to different `.hex` directories.
 */
export function loadProjectContext(searchFrom: string = process.cwd()): ProjectContext {
  const outputDir = findOutputDir(searchFrom);
  if (!outputDir) {
    throw new Error(
      `No Hex project found. Run 'hex init' first.\nSearched ${searchFrom} and its parent directories.`,
    );
  }
  // findOutputDir returns the directory holding config.json, so it is always at
  // <outputDir>/config.json.
  const config = parseConfigFile(path.join(outputDir, 'config.json'));
  return { config, outputDir };
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
  githubRepo?: string;
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
      ...(options.githubRepo
        ? {
            github: {
              repo: options.githubRepo,
              default_labels: ['hex', 'audit'],
              severity_label_prefix: 'severity:',
              publish_status: ['verified' as const],
            },
          }
        : {}),
    },
  };

  const outputDir = getOutputDir(options.projectDir, config.settings.output_dir);
  writeJsonOutput(outputDir, 'config.json', config);

  return config;
}
