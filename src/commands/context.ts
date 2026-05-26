import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import { logger } from '../core/logger.js';
import { loadConfig } from '../core/config.js';
import { getOutputDir } from '../core/paths.js';
import { readJsonFile, writeMarkdownOutput } from '../core/output.js';
import { assembleContext, estimateTokens } from '../analysis/context-assembler.js';
import type { Stats, Deps } from '../types/index.js';

export const contextCommand = new Command('context')
  .description('Assemble context for AI prompts')
  .option('--project <dir>', 'Project directory')
  .option('--target <contract>', 'Target contract for focused context')
  .option('--estimate', 'Estimate token count without outputting context')
  .option('-o, --output <file>', 'Output to file instead of stdout')
  .action(async (opts) => {
    try {
      const projectDir = opts.project ?? process.cwd();
      const config = loadConfig(projectDir);
      const outputDir = getOutputDir(config.project.project_dir, config.settings.output_dir);

      // Load supporting data
      const stats = readJsonFile<Stats>(path.join(outputDir, 'stats.json'));
      const deps = readJsonFile<Deps>(path.join(outputDir, 'deps.json'));

      // Assemble context
      const context = assembleContext(config, stats, deps, {
        target: opts.target,
        estimate: opts.estimate,
      });

      if (opts.estimate) {
        const tokens = estimateTokens(context);
        logger.info(`Estimated tokens: ${tokens.toLocaleString()}`);
        logger.info(`Characters: ${context.length.toLocaleString()}`);

        if (tokens > 150_000) {
          logger.warn('Context exceeds 150k tokens. Consider using --target for focused context.');
          if (deps) {
            logger.info('Available clusters:');
            for (const cluster of deps.clusters) {
              logger.dim(`  ${cluster.id}: ${cluster.contracts.join(', ')} (${cluster.total_nsloc} nSLOC)`);
            }
          }
        }
        return;
      }

      if (opts.output) {
        const outFile = opts.output.endsWith('.md') ? opts.output : `${opts.output}.md`;
        const outPath = writeMarkdownOutput(outputDir, outFile, context);
        logger.info(`Context written to: ${outPath}`);
      } else {
        // Output to stdout
        process.stdout.write(context);
      }
    } catch (err) {
      logger.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });
