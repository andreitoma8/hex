import { Command } from 'commander';
import { spawn, exec } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { logger } from '../core/logger.js';
import { loadConfig, findOutputDir } from '../core/config.js';
import { detectWhisper } from '../core/whisper.js';

export const dashboardCommand = new Command('dashboard')
  .description('Start the local dashboard and open it in the browser')
  .option('--project <dir>', 'Project directory')
  .option('--port <port>', 'Port number', '3000')
  .option('--no-open', 'Do not open browser automatically')
  .action(async (opts) => {
    const invokedFrom = path.resolve(opts.project ?? process.cwd());

    // Locate `.hex/` on disk by walking up from the invocation dir — the SAME
    // resolver the dashboard's data loaders and the rest of the CLI use, so they
    // can never disagree about which project this is.
    const outputDir = findOutputDir(invokedFrom);
    if (!outputDir) {
      logger.error(`No Hex project found in ${invokedFrom} or its parents. Run 'hex init' first.`);
      process.exit(1);
    }

    let config;
    try {
      config = loadConfig(path.dirname(outputDir));
    } catch (err) {
      logger.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }

    // Spawn Next from the directory that actually contains `.hex/` on disk —
    // anchored to where the config was found, NOT the absolute project_dir baked
    // into config at init time (which goes stale if the project is
    // moved/mounted/renamed and would make the dashboard and CLI read different
    // `.hex` dirs). The dashboard's loaders then re-derive the same dir via
    // findOutputDir(process.cwd()).
    const projectDir = path.dirname(outputDir);

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

    // Warm Whisper: if faster-whisper is installed, run a persistent helper that
    // loads the model once and serves transcription while the dashboard is up.
    // It's killed on exit (see cleanup), so the model is freed the moment you
    // close the dashboard — and never loaded more than once per session.
    const nextEnv: NodeJS.ProcessEnv = { ...process.env, PORT: port };
    let whisperChild: ReturnType<typeof spawn> | null = null;
    const engine = detectWhisper();
    if (engine?.kind === 'faster') {
      const whisperPort = (parseInt(port, 10) || 3000) + 100;
      whisperChild = spawn(engine.bin, [path.join(dashboardDir, 'whisper-server.py'), String(whisperPort)], {
        stdio: 'inherit',
        cwd: projectDir,
        env: { ...process.env },
      });
      nextEnv.HEX_WHISPER_URL = `http://127.0.0.1:${whisperPort}`;
      logger.dim('Whisper model loading locally (CPU) — held only while the dashboard runs.');
    }

    // Set cwd to the audit project so the dashboard's data loaders find .hex/
    // via process.cwd(). This replaces the old HEX_PROJECT_DIR env-var bridge,
    // which was a vestige from the monorepo days when the dashboard was started
    // from a different working directory.
    const child = spawn(nextBin, [mode, dashboardDir, '--port', port], {
      stdio: 'inherit',
      shell: true,
      cwd: projectDir,
      env: nextEnv,
    });

    if (opts.open !== false) {
      setTimeout(() => {
        openBrowser(`http://localhost:${port}`);
      }, 2000);
    }

    const cleanup = () => {
      if (whisperChild) whisperChild.kill('SIGTERM');
      child.kill('SIGTERM');
    };
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);

    child.on('close', (code) => {
      if (whisperChild) whisperChild.kill('SIGTERM');
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
