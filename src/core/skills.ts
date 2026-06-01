import fs from 'node:fs';
import path from 'node:path';

/**
 * Resolves the path to the bundled skills directory (dist/skills/).
 * Handles Windows drive letter in import.meta.url paths.
 */
export function getBundledSkillsDir(): string {
  return path.resolve(
    new URL('.', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'),
    '..',
    'skills',
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
 * Skill directories under targetDir that no longer have a matching bundled
 * skill are removed (so renames and deletions cleanly propagate across upgrades).
 * Returns { updated, added, skipped, removed } counts.
 */
export function copySkillsToClaudeFormat(opts: { targetDir: string; keepCustom?: boolean }): {
  updated: number;
  added: number;
  skipped: number;
  removed: number;
} {
  const { targetDir, keepCustom = false } = opts;
  const bundledDir = getBundledSkillsDir();

  if (!fs.existsSync(bundledDir)) {
    throw new Error(`Bundled skills directory not found: ${bundledDir}`);
  }

  const skillFiles = fs.readdirSync(bundledDir).filter((f) => f.endsWith('.md'));
  const bundledNames = new Set(skillFiles.map((f) => f.replace(/\.md$/, '')));

  let updated = 0;
  let added = 0;
  let skipped = 0;
  let removed = 0;

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

  // Clean up orphaned skill directories: anything under targetDir that holds
  // a SKILL.md but doesn't match a bundled skill name. We only remove
  // <skillDir>/SKILL.md and the directory itself if empty afterwards — never
  // sibling files the user might have added intentionally.
  if (fs.existsSync(targetDir)) {
    for (const entry of fs.readdirSync(targetDir)) {
      if (bundledNames.has(entry)) continue;
      const orphanDir = path.join(targetDir, entry);
      const stat = fs.statSync(orphanDir);
      if (!stat.isDirectory()) continue;
      const skillPath = path.join(orphanDir, 'SKILL.md');
      if (fs.existsSync(skillPath)) {
        fs.rmSync(skillPath);
        // Remove the directory only if it's now empty
        if (fs.readdirSync(orphanDir).length === 0) {
          fs.rmdirSync(orphanDir);
        }
        removed++;
      }
    }
  }

  return { updated, added, skipped, removed };
}
