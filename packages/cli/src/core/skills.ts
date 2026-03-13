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
 * By default, overwrites existing skills. Use keepCustom=true to skip existing.
 * Returns { updated, added, skipped } counts.
 */
export function copySkillsToClaudeFormat(opts: {
  targetDir: string;
  keepCustom?: boolean;
}): { updated: number; added: number; skipped: number } {
  const { targetDir, keepCustom = false } = opts;
  const bundledDir = getBundledSkillsDir();

  if (!fs.existsSync(bundledDir)) {
    throw new Error(`Bundled skills directory not found: ${bundledDir}`);
  }

  const skillFiles = fs.readdirSync(bundledDir).filter((f) => f.endsWith('.md'));
  let updated = 0;
  let added = 0;
  let skipped = 0;

  for (const file of skillFiles) {
    const name = file.replace(/\.md$/, '');
    const skillDir = path.join(targetDir, name);
    const destPath = path.join(skillDir, 'SKILL.md');
    const exists = fs.existsSync(destPath);

    if (exists && keepCustom) {
      skipped++;
      continue;
    }

    if (!fs.existsSync(skillDir)) {
      fs.mkdirSync(skillDir, { recursive: true });
    }

    fs.copyFileSync(path.join(bundledDir, file), destPath);
    if (exists) {
      updated++;
    } else {
      added++;
    }
  }

  return { updated, added, skipped };
}
