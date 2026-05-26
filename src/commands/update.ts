import { Command } from 'commander';
import { spawn, execSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { logger } from '../core/logger.js';
import { copySkillsToClaudeFormat, getClaudeSkillsDir } from '../core/skills.js';

interface InstallContext {
  /** 'global' | 'local' | 'unknown' */
  kind: 'global' | 'local' | 'unknown';
  /** Filesystem location of the running script's package (the dir containing package.json). */
  packageDir: string;
  /** For local installs: the directory the user should run `npm install` in. */
  installDir?: string;
}

export const updateCommand = new Command('update')
  .description('Update hex-audit to the latest version, then re-sync skills in the current project')
  .option('-y, --yes', 'Skip the post-install skill-sync prompt (treat as yes)')
  .option('--check', "Only show current vs latest version, don't install")
  .option('--project <dir>', 'Project directory for the post-install skill sync (default: cwd)')
  .action(async (opts) => {
    try {
      const ctx = detectInstall();
      const current = readCurrentVersion(ctx.packageDir);
      const latest = fetchLatestVersion();

      logger.info(`current: ${current}`);
      logger.info(`latest:  ${latest}`);

      if (current === latest) {
        logger.success('Already on latest.');
        if (!opts.check) await maybeRunSkillSync(opts);
        return;
      }

      if (opts.check) {
        logger.info(
          `An update is available (${current} → ${latest}). Run \`hex update\` to install.`,
        );
        return;
      }

      if (ctx.kind === 'unknown') {
        logger.warn(
          'Could not determine how hex-audit was installed. Looks like you ran via npx or a cache.',
        );
        logger.info(
          'Run `npx hex-audit@latest <command>` next time, or install globally: `npm install -g hex-audit@latest`.',
        );
        process.exit(1);
      }

      const installCmd =
        ctx.kind === 'global'
          ? ['npm', 'install', '-g', 'hex-audit@latest']
          : ['npm', 'install', 'hex-audit@latest'];
      const cwd = ctx.kind === 'global' ? process.cwd() : (ctx.installDir ?? process.cwd());

      logger.info(`Running: ${installCmd.join(' ')}${ctx.kind === 'local' ? ` (in ${cwd})` : ''}`);
      const ok = await runInstall(installCmd, cwd);
      if (!ok) {
        logger.error('Install failed. See the npm output above.');
        process.exit(1);
      }

      logger.success(`Updated ${current} → ${latest}.`);
      await maybeRunSkillSync(opts);
    } catch (err) {
      logger.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

function detectInstall(): InstallContext {
  // Resolve the real path of the binary that was launched, so symlinks
  // (npm's global bin shim → actual file) don't confuse us.
  const argv1 = process.argv[1] ?? '';
  let realScript = argv1;
  try {
    realScript = fs.realpathSync(argv1);
  } catch {
    /* leave argv1 as-is */
  }
  // package root is two levels up from <pkg>/dist/index.js
  const packageDir = path.resolve(path.dirname(realScript), '..');

  // Compare against npm's reported global prefix.
  let globalRoot = '';
  try {
    globalRoot = execSync('npm root -g', { encoding: 'utf-8' }).trim();
  } catch {
    /* npm might be missing — treat as unknown */
  }

  if (globalRoot && realScript.startsWith(globalRoot)) {
    return { kind: 'global', packageDir };
  }

  // Local install: package dir is somewhere under a project's node_modules.
  const nodeModulesIdx = packageDir.lastIndexOf(`${path.sep}node_modules${path.sep}`);
  if (nodeModulesIdx !== -1) {
    const installDir = packageDir.slice(0, nodeModulesIdx);
    return { kind: 'local', packageDir, installDir };
  }

  // Could be in dev (running from a checkout) or via npx cache.
  if (fs.existsSync(path.join(packageDir, 'package.json'))) {
    // Heuristic: if .git exists at packageDir, we're in a dev checkout — no update needed.
    if (fs.existsSync(path.join(packageDir, '.git'))) {
      logger.warn('Running from a git checkout — `hex update` is for installed packages.');
      logger.info('To update your checkout: `git pull && npm install && npm run build`.');
      process.exit(0);
    }
  }

  return { kind: 'unknown', packageDir };
}

function readCurrentVersion(packageDir: string): string {
  const pkgPath = path.join(packageDir, 'package.json');
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as { version?: string };
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

function fetchLatestVersion(): string {
  try {
    return execSync('npm view hex-audit version', {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    throw new Error('Could not fetch the latest version from the npm registry. Are you online?');
  }
}

function runInstall(cmd: string[], cwd: string): Promise<boolean> {
  return new Promise((resolve) => {
    const [bin, ...args] = cmd;
    const child = spawn(bin, args, { cwd, stdio: 'inherit', shell: true });
    child.on('close', (code) => resolve(code === 0));
    child.on('error', () => resolve(false));
  });
}

async function maybeRunSkillSync(opts: { yes?: boolean; project?: string }): Promise<void> {
  const projectDir = path.resolve(opts.project ?? process.cwd());
  const claudeSkillsDir = getClaudeSkillsDir(projectDir);
  if (!fs.existsSync(claudeSkillsDir)) {
    logger.dim(`Skills: skipped (no .claude/skills/ in ${projectDir}).`);
    return;
  }

  if (!opts.yes) {
    const answer = await prompt(`Re-copy skills into ${claudeSkillsDir}? [Y/n] `);
    const yes = answer.trim() === '' || /^y(es)?$/i.test(answer.trim());
    if (!yes) {
      logger.dim('Skills: skipped (declined).');
      return;
    }
  }

  const result = copySkillsToClaudeFormat({ targetDir: claudeSkillsDir });
  const parts: string[] = [];
  if (result.updated > 0) parts.push(`Updated: ${result.updated}`);
  if (result.added > 0) parts.push(`Added: ${result.added}`);
  if (result.removed > 0) parts.push(`Removed: ${result.removed}`);
  logger.success(`Skills: ${parts.join(', ') || 'no changes'}.`);
}

async function prompt(question: string): Promise<string> {
  if (!stdin.isTTY) return '';
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    return await rl.question(question);
  } finally {
    rl.close();
  }
}
