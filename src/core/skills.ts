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

/** Names of the skills Hex installed last time, so cleanup never touches others. */
export const MANIFEST_FILE = '.hex-skills.json';

/**
 * Skill names Hex has shipped in earlier releases. Used only when no manifest
 * exists yet (first run after upgrading), so a renamed or removed Hex skill
 * from an older install is still cleaned up while third-party skills are not.
 */
const LEGACY_HEX_SKILLS = [
  'check-spec-conformance',
  'compare-findings',
  'conformance-to-findings',
  'diane',
  'generate-diagram',
  'generate-flows',
  'generate-overleaf',
  'generate-overview',
  'generate-poc',
  'generate-report',
  'identify-invariants',
  'ingest-aa-report',
  'init-audit',
  'run-ai-analysis',
  'sync-github',
  'sync-issues',
  'validate-ai-finding',
  'validate-all-findings',
  'validate-finding',
  'validate-issue',
  'write-finding',
];

interface BundledSkill {
  name: string;
  /** Single-file skill (`<name>.md`) or directory skill (`<name>/SKILL.md` + resources). */
  kind: 'file' | 'dir';
  source: string;
}

function listBundledSkills(bundledDir: string): BundledSkill[] {
  const out: BundledSkill[] = [];
  for (const entry of fs.readdirSync(bundledDir, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith('.md')) {
      out.push({
        name: entry.name.replace(/\.md$/, ''),
        kind: 'file',
        source: path.join(bundledDir, entry.name),
      });
    } else if (
      entry.isDirectory() &&
      fs.existsSync(path.join(bundledDir, entry.name, 'SKILL.md'))
    ) {
      out.push({ name: entry.name, kind: 'dir', source: path.join(bundledDir, entry.name) });
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

function readManifest(targetDir: string): string[] | null {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(targetDir, MANIFEST_FILE), 'utf-8')) as {
      skills?: unknown;
    };
    return Array.isArray(raw.skills)
      ? raw.skills.filter((s): s is string => typeof s === 'string')
      : null;
  } catch {
    return null;
  }
}

/**
 * Copies bundled skills to Claude Code's native skill format:
 *   - `<name>.md`       → <targetDir>/<name>/SKILL.md
 *   - `<name>/` (dir)   → <targetDir>/<name>/ (recursively, replacing the old copy)
 *
 * By default, overwrites existing skills. Use keepCustom=true to skip existing.
 * Skills Hex installed previously (per the manifest) that are no longer bundled
 * are removed, so renames and deletions propagate across upgrades. Skills Hex
 * never installed are left alone.
 * Returns { updated, added, skipped, removed } counts.
 */
export function copySkillsToClaudeFormat(opts: {
  targetDir: string;
  keepCustom?: boolean;
  /** Override the bundled skills location (tests). */
  bundledDir?: string;
}): {
  updated: number;
  added: number;
  skipped: number;
  removed: number;
} {
  const { targetDir, keepCustom = false } = opts;
  const bundledDir = opts.bundledDir ?? getBundledSkillsDir();

  if (!fs.existsSync(bundledDir)) {
    throw new Error(`Bundled skills directory not found: ${bundledDir}`);
  }

  const skills = listBundledSkills(bundledDir);
  const bundledNames = new Set(skills.map((s) => s.name));
  const previouslyInstalled = readManifest(targetDir) ?? LEGACY_HEX_SKILLS;

  let updated = 0;
  let added = 0;
  let skipped = 0;
  let removed = 0;

  fs.mkdirSync(targetDir, { recursive: true });

  for (const skill of skills) {
    const skillDir = path.join(targetDir, skill.name);
    const destPath = path.join(skillDir, 'SKILL.md');
    const exists = fs.existsSync(destPath);

    if (exists && keepCustom) {
      skipped++;
      continue;
    }

    if (skill.kind === 'file') {
      fs.mkdirSync(skillDir, { recursive: true });
      fs.copyFileSync(skill.source, destPath);
    } else {
      // A directory skill is owned wholesale by Hex: replace it so files removed
      // upstream do not linger next to the new version.
      fs.rmSync(skillDir, { recursive: true, force: true });
      fs.cpSync(skill.source, skillDir, { recursive: true });
    }
    if (exists) updated++;
    else added++;
  }

  // Remove skills Hex installed earlier that are no longer bundled. For a
  // single-file skill only SKILL.md is removed (and the dir if then empty), so
  // sibling files the user added survive.
  for (const name of previouslyInstalled) {
    if (bundledNames.has(name)) continue;
    const orphanDir = path.join(targetDir, name);
    const skillPath = path.join(orphanDir, 'SKILL.md');
    if (!fs.existsSync(skillPath)) continue;
    if (fs.existsSync(path.join(orphanDir, 'references'))) {
      fs.rmSync(orphanDir, { recursive: true, force: true });
    } else {
      fs.rmSync(skillPath);
      if (fs.readdirSync(orphanDir).length === 0) fs.rmdirSync(orphanDir);
    }
    removed++;
  }

  fs.writeFileSync(
    path.join(targetDir, MANIFEST_FILE),
    JSON.stringify({ skills: [...bundledNames] }, null, 2) + '\n',
    'utf-8',
  );

  return { updated, added, skipped, removed };
}
