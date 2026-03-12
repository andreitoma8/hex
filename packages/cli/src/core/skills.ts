import fs from 'node:fs';
import path from 'node:path';

/**
 * Resolves the path to the bundled skills directory (dist/skills/).
 * Handles Windows drive letter in import.meta.url paths.
 */
export function getBundledSkillsDir(): string {
  return path.resolve(
    new URL('.', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'),
    '..', 'skills',
  );
}

/**
 * Returns the .claude/skills directory path for a given project.
 */
export function getClaudeSkillsDir(projectDir: string): string {
  return path.join(projectDir, '.claude', 'skills');
}

/**
 * Copies bundled skill .md files to Claude Code's native skill format:
 *   <targetDir>/<name>/SKILL.md
 *
 * Idempotent — skips existing unless force=true.
 * Returns count of files written.
 */
export function copySkillsToClaudeFormat(opts: {
  targetDir: string;
  force?: boolean;
}): number {
  const { targetDir, force = false } = opts;
  const bundledDir = getBundledSkillsDir();

  if (!fs.existsSync(bundledDir)) {
    throw new Error(`Bundled skills directory not found: ${bundledDir}`);
  }

  const skillFiles = fs.readdirSync(bundledDir).filter((f) => f.endsWith('.md'));
  let written = 0;

  for (const file of skillFiles) {
    const name = file.replace(/\.md$/, '');
    const skillDir = path.join(targetDir, name);
    const destPath = path.join(skillDir, 'SKILL.md');

    if (fs.existsSync(destPath) && !force) {
      continue;
    }

    if (!fs.existsSync(skillDir)) {
      fs.mkdirSync(skillDir, { recursive: true });
    }

    fs.copyFileSync(path.join(bundledDir, file), destPath);
    written++;
  }

  return written;
}
