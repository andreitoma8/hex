import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import { logger } from '../core/logger.js';
import { copySkillsToClaudeFormat, getClaudeSkillsDir } from '../core/skills.js';

export const updateSkillsCommand = new Command('update-skills')
  .description('Update skill files in .claude/skills/ from the bundled version')
  .option('--project <dir>', 'Project directory')
  .option('--keep-custom', 'Skip existing skill files instead of overwriting')
  .action(async (opts) => {
    try {
      const projectDir = path.resolve(opts.project ?? process.cwd());
      const claudeSkillsDir = getClaudeSkillsDir(projectDir);

      // Warn about legacy skills directory
      const legacyDir = path.join(projectDir, '.hex', 'skills');
      if (fs.existsSync(legacyDir)) {
        logger.warn(`Legacy skills directory found at .hex/skills/`);
        logger.warn(`Skills now live in .claude/skills/ — you can remove the legacy directory.`);
      }

      const result = copySkillsToClaudeFormat({
        targetDir: claudeSkillsDir,
        keepCustom: opts.keepCustom,
      });

      const parts: string[] = [];
      if (result.updated > 0) parts.push(`Updated: ${result.updated} skills`);
      if (result.added > 0) parts.push(`Added: ${result.added} new skills`);
      if (result.skipped > 0) parts.push(`Skipped: ${result.skipped} (--keep-custom)`);

      logger.success(parts.join(', ') || 'No skill files to process');
    } catch (err) {
      logger.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });
