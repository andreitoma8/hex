import { Command } from 'commander';
import { spawn, exec } from 'node:child_process';
import { createRequire } from 'node:module';
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

    // Verify the project is initialized
    try {
      loadConfig(projectDir);
    } catch {
      logger.error(
        `No SolAudit project found in ${projectDir}. Run 'solaudit init' first.`,
      );
      process.exit(1);
    }

    // Resolve the dashboard package directory
    const dashboardDir = resolveDashboardDir();
    if (!dashboardDir) {
      logger.error(
        'Could not find the dashboard package. Make sure solaudit is installed correctly.',
      );
      process.exit(1);
    }

    const port = opts.port;

    logger.info(`Starting dashboard on http://localhost:${port}`);
    logger.info(`Project: ${projectDir}`);

    // Spawn next dev
    const child = spawn('npx', ['next', 'dev', '--port', port], {
      cwd: dashboardDir,
      stdio: 'inherit',
      shell: true,
      env: {
        ...process.env,
        SOLAUDIT_PROJECT_DIR: projectDir,
      },
    });

    // Open browser after a short delay
    if (opts.open !== false) {
      setTimeout(() => {
        openBrowser(`http://localhost:${port}`);
      }, 2000);
    }

    // Forward signals for clean shutdown
    const cleanup = () => {
      child.kill('SIGTERM');
    };
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);

    child.on('close', (code) => {
      process.exit(code ?? 0);
    });
  });

function resolveDashboardDir(): string | null {
  // Strategy 1: sibling package in monorepo
  const cliDir = path.dirname(
    fileURLToPath(import.meta.url),
  );
  // cliDir is something like .../packages/cli/dist/commands or .../packages/cli/src/commands
  // Navigate up to packages/ then into dashboard/
  const monorepoCandidate = path.resolve(cliDir, '..', '..', '..', 'dashboard');
  if (
    fs.existsSync(monorepoCandidate) &&
    fs.existsSync(path.join(monorepoCandidate, 'package.json'))
  ) {
    return monorepoCandidate;
  }

  // Strategy 2: installed as node_modules dependency
  try {
    const require = createRequire(import.meta.url);
    const resolved = require.resolve('solaudit-dashboard/package.json');
    return path.dirname(resolved);
  } catch {
    // not found
  }

  return null;
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
