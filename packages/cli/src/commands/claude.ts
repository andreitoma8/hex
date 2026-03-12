import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import { logger } from '../core/logger.js';
import { copySkillsToClaudeFormat, getClaudeSkillsDir } from '../core/skills.js';

export const claudeCommand = new Command('claude')
  .description('Copy skill files to .claude/skills/ for Claude Code discovery')
  .option('--project <dir>', 'Project directory (default: cwd)')
  .option('--force', 'Overwrite existing skill files')
  .action(async (opts) => {
    try {
      const projectDir = path.resolve(opts.project ?? process.cwd());

      if (!fs.existsSync(projectDir)) {
        throw new Error(`Project directory not found: ${projectDir}`);
      }

      const claudeSkillsDir = getClaudeSkillsDir(projectDir);

      // Warn about legacy skills directory
      const legacyDir = path.join(projectDir, '.solaudit', 'skills');
      if (fs.existsSync(legacyDir)) {
        logger.warn(`Legacy skills directory found at .solaudit/skills/`);
        logger.warn(`Skills now live in .claude/skills/ — you can remove the legacy directory.`);
      }

      const count = copySkillsToClaudeFormat({
        targetDir: claudeSkillsDir,
        force: opts.force,
      });

      logger.success(`Copied ${count} skills to .claude/skills/`);
      logger.info('');
      logger.info('Skills are now available as native Claude Code slash commands.');
      logger.info('Open Claude Code and type / to see them (e.g., /init-audit).');
      logger.info('');
      logger.info('Next steps:');
      logger.dim('  claude             # Open Claude Code');
      logger.dim('  /init-audit        # Initialize and run the full analysis pipeline');
    } catch (err) {
      logger.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });
