import { Command } from 'commander';
import path from 'node:path';
import { logger } from '../core/logger.js';
import { loadProjectContext } from '../core/config.js';
import { normalizePath } from '../core/paths.js';
import { writeJsonOutput, readJsonFile } from '../core/output.js';
import { buildAttackSurface } from '../analysis/attack-surface.js';
import type { AccessControl, ExternalCalls, StateVars } from '../types/index.js';
import type { PatternResult } from '../analysis/pattern-detection.js';
import type { ConstraintResult } from '../analysis/constraint-extraction.js';

export const surfaceCommand = new Command('surface')
  .description('Build attack surface summary from existing analysis data')
  .option('--project <dir>', 'Project directory')
  .action(async (opts) => {
    const spin = logger.spinner('Building attack surface...');

    try {
      const projectDir = opts.project ?? process.cwd();
      const { config, outputDir } = loadProjectContext(projectDir);

      // Read existing analysis outputs
      spin.text = 'Reading analysis artifacts...';
      const access = readJsonFile<AccessControl>(normalizePath(path.join(outputDir, 'access-control.json')));
      const calls = readJsonFile<ExternalCalls>(normalizePath(path.join(outputDir, 'external-calls.json')));
      const stateVars = readJsonFile<StateVars>(normalizePath(path.join(outputDir, 'state-vars.json')));
      const patterns = readJsonFile<PatternResult>(normalizePath(path.join(outputDir, 'patterns.json')));
      const constraints = readJsonFile<ConstraintResult>(normalizePath(path.join(outputDir, 'constraints.json')));

      if (!access && !calls) {
        spin.fail('No analysis data found — run `hex analyze` first');
        process.exit(1);
      }

      spin.text = 'Cross-referencing analysis data...';
      const result = buildAttackSurface(access, calls, stateVars, patterns, constraints);

      const outPath = writeJsonOutput(outputDir, 'attack-surface.json', result);

      spin.succeed(`Attack surface: ${result.summary.total_entry_points} entry points`);
      logger.info(`  Permissionless: ${result.summary.permissionless_count}, Role-gated: ${result.summary.role_gated_count}, Owner-only: ${result.summary.owner_only_count}`);
      logger.info(`  External dependencies: ${result.summary.external_dependency_count}`);
      if (result.summary.risk_signal_count > 0) {
        logger.warn(`  Risk signals: ${result.summary.risk_signal_count}`);
      }
      logger.dim(`  → ${outPath}`);
    } catch (err) {
      spin.fail('Attack surface analysis failed');
      logger.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });
