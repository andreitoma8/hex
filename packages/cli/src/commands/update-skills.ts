import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import { logger } from '../core/logger.js';
import { loadConfig } from '../core/config.js';
import { getOutputDir } from '../core/paths.js';

export const updateSkillsCommand = new Command('update-skills')
  .description('Update skill files from the bundled version')
  .option('--project <dir>', 'Project directory')
  .option('--force', 'Overwrite existing skills')
  .action(async (opts) => {
    try {
      const projectDir = opts.project ?? process.cwd();
      const config = loadConfig(projectDir);
      const outputDir = getOutputDir(config.project.project_dir, config.settings.output_dir);
      const skillsDir = path.join(outputDir, 'skills');

      if (!fs.existsSync(skillsDir)) {
        fs.mkdirSync(skillsDir, { recursive: true });
      }

      const bundledSkillsDir = path.resolve(
        new URL('.', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'),
        '..', 'skills',
      );

      if (!fs.existsSync(bundledSkillsDir)) {
        logger.error('Bundled skills directory not found');
        process.exit(1);
      }

      const skillFiles = fs.readdirSync(bundledSkillsDir).filter((f) => f.endsWith('.md'));
      let updated = 0;

      for (const file of skillFiles) {
        const destPath = path.join(skillsDir, file);
        if (fs.existsSync(destPath) && !opts.force) {
          logger.dim(`Skipping existing: ${file}`);
          continue;
        }
        fs.copyFileSync(path.join(bundledSkillsDir, file), destPath);
        updated++;
      }

      logger.success(`Updated ${updated} skill files`);
    } catch (err) {
      logger.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });
