import { Command } from 'commander';
import { logger } from '../core/logger.js';
import { loadProjectContext } from '../core/config.js';
import { writeJsonOutput } from '../core/output.js';
import { detectPatterns } from '../analysis/pattern-detection.js';

export const patternsCommand = new Command('patterns')
  .description('Detect security-relevant patterns in scope files')
  .option('--project <dir>', 'Project directory')
  .action(async (opts) => {
    const spin = logger.spinner('Detecting security patterns...');

    try {
      const projectDir = opts.project ?? process.cwd();
      const { config, outputDir } = loadProjectContext(projectDir);

      spin.text = 'Scanning scope files for security patterns...';
      const result = detectPatterns(config.project.project_dir, config.project.scope);

      const detectedFlags = Object.entries(result.flags)
        .filter(([, v]) => v.detected)
        .map(([k]) => k);

      const outPath = writeJsonOutput(outputDir, 'patterns.json', result);

      spin.succeed(`Detected ${detectedFlags.length} pattern flags`);
      if (detectedFlags.length > 0) {
        logger.info(`  Flags: ${detectedFlags.join(', ')}`);
      }
      if (result.protocol_hints.length > 0) {
        logger.info(`  Protocol hints: ${result.protocol_hints.join(', ')}`);
      }
      if (result.risk_areas.length > 0) {
        logger.info(`  Risk areas: ${result.risk_areas.length}`);
      }
      logger.dim(`  → ${outPath}`);
    } catch (err) {
      spin.fail('Pattern detection failed');
      logger.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });
