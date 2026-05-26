import { Command } from 'commander';
import { spawn, exec } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { logger } from '../core/logger.js';
import { loadConfig } from '../core/config.js';

export const dashboardCommand = new Command('dashboard')
  .description('Start the local dashboard and open it in the browser')
  .option('--project <dir>', 'Project directory')
  .option('--port <port>', 'Port number', '3000')
  .option('--no-open', 'Do not open browser automatically')
  .action(async (opts) => {
    const projectDir = path.resolve(opts.project ?? process.cwd());

    try {
      loadConfig(projectDir);
    } catch {
      logger.error(`No Hex project found in ${projectDir}. Run 'hex init' first.`);
      process.exit(1);
    }

    const dashboardDir = getDashboardDir();
    if (!fs.existsSync(dashboardDir)) {
      logger.error(
        `Could not find the dashboard at ${dashboardDir}. The hex-audit package may be corrupted; try \`hex update\` or reinstall.`,
      );
      process.exit(1);
    }

    const port = opts.port;
    const prebuilt = fs.existsSync(path.join(dashboardDir, '.next'));
    const mode = prebuilt ? 'start' : 'dev';

    logger.info(`Starting dashboard on http://localhost:${port}`);
    logger.info(`Project: ${projectDir}`);
    if (!prebuilt) {
      logger.dim('(dev mode — no .next/ found; first request may be slow)');
    }

    // Use the next binary that ships with this package.
    const nextBin = resolveNextBin(dashboardDir);
    const child = spawn(nextBin, [mode, dashboardDir, '--port', port], {
      stdio: 'inherit',
      shell: true,
      env: {
        ...process.env,
        HEX_PROJECT_DIR: projectDir,
        SOLAUDIT_PROJECT_DIR: projectDir,
        PORT: port,
      },
    });

    if (opts.open !== false) {
      setTimeout(() => {
        openBrowser(`http://localhost:${port}`);
      }, 2000);
    }

    const cleanup = () => {
      child.kill('SIGTERM');
    };
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);

    child.on('close', (code) => {
      process.exit(code ?? 0);
    });
  });

function getPackageRoot(): string {
  // After `tsc`, this file is at <pkg>/dist/commands/dashboard.js, so two
  // `..` segments land us at the package root.
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, '..', '..');
}

function getDashboardDir(): string {
  return path.join(getPackageRoot(), 'dashboard');
}

function resolveNextBin(dashboardDir: string): string {
  // 1. Package root node_modules (installed location).
  const pkgRoot = getPackageRoot();
  const fromPkg = path.join(pkgRoot, 'node_modules', '.bin', 'next');
  if (fs.existsSync(fromPkg)) return fromPkg;
  // 2. Some pnpm/yarn layouts hoist into the dashboard's own node_modules.
  const fromDash = path.join(dashboardDir, 'node_modules', '.bin', 'next');
  if (fs.existsSync(fromDash)) return fromDash;
  // 3. Last-resort: rely on PATH (e.g., `npx next`).
  return 'next';
}

function openBrowser(url: string): void {
  const command =
    process.platform === 'darwin'
      ? `open "${url}"`
      : process.platform === 'win32'
        ? `start "" "${url}"`
        : `xdg-open "${url}"`;

  exec(command, (err) => {
    if (err) {
      logger.warn(`Could not open browser automatically. Visit ${url}`);
    }
  });
}
