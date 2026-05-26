import { Command } from 'commander';
import { logger } from '../core/logger.js';
import { loadConfig } from '../core/config.js';
import { getOutputDir } from '../core/paths.js';
import { writeJsonOutput } from '../core/output.js';
import { extractConstraints } from '../analysis/constraint-extraction.js';

export const constraintsCommand = new Command('constraints')
  .description('Extract constraint variables and enforcement status')
  .option('--project <dir>', 'Project directory')
  .action(async (opts) => {
    const spin = logger.spinner('Extracting constraints...');

    try {
      const projectDir = opts.project ?? process.cwd();
      const config = loadConfig(projectDir);
      const outputDir = getOutputDir(config.project.project_dir, config.settings.output_dir);

      spin.text = 'Analyzing setter functions and validation...';
      const result = extractConstraints(config.project.project_dir, config.project.scope);

      const outPath = writeJsonOutput(outputDir, 'constraints.json', result);

      spin.succeed(`Found ${result.summary.total_setters} setter functions`);
      logger.info(`  Enforced: ${result.summary.enforced}, Unenforced: ${result.summary.unenforced}`);
      if (result.summary.missing_events > 0) {
        logger.warn(`  Missing events: ${result.summary.missing_events}`);
      }
      logger.dim(`  → ${outPath}`);
    } catch (err) {
      spin.fail('Constraint extraction failed');
      logger.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });
