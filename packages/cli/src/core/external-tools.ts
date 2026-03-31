import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { logger } from './logger.js';

export interface ToolInfo {
  name: string;
  available: boolean;
  version: string | null;
}

interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Run a command and capture output.
 */
function exec(
  command: string,
  args: string[],
  options: { cwd?: string; env?: Record<string, string>; timeout?: number } = {},
): Promise<ExecResult> {
  return new Promise((resolve) => {
    const env = {
      ...process.env,
      PYTHONIOENCODING: 'utf-8',
      ...options.env,
    };

    const child = spawn(command, args, {
      cwd: options.cwd,
      env,
      shell: true,
      timeout: options.timeout ?? 120_000,
    });

    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];

    child.stdout.on('data', (data: Buffer) => stdout.push(data));
    child.stderr.on('data', (data: Buffer) => stderr.push(data));

    child.on('close', (code) => {
      resolve({
        stdout: Buffer.concat(stdout).toString('utf-8'),
        stderr: Buffer.concat(stderr).toString('utf-8'),
        exitCode: code ?? 1,
      });
    });

    child.on('error', () => {
      resolve({
        stdout: '',
        stderr: `Failed to start: ${command}`,
        exitCode: 1,
      });
    });
  });
}

/**
 * Check if a tool is available by running its version command.
 */
async function checkTool(
  name: string,
  command: string,
  args: string[],
): Promise<ToolInfo> {
  const result = await exec(command, args);
  if (result.exitCode === 0) {
    const version = result.stdout.trim().split('\n')[0] ?? null;
    return { name, available: true, version };
  }
  return { name, available: false, version: null };
}

/**
 * Detect all supported external tools.
 */
export async function detectTools(): Promise<ToolInfo[]> {
  const checks = await Promise.all([
    checkTool('solc', 'solc', ['--version']),
    checkTool('slither', 'slither', ['--version']),
    checkTool('forge', 'forge', ['--version']),
  ]);
  return checks;
}

/**
 * Require a tool to be available, throwing if not found.
 */
export async function requireTool(name: string): Promise<void> {
  const tools = await detectTools();
  const tool = tools.find((t) => t.name === name);
  if (!tool?.available) {
    throw new Error(
      `Required tool '${name}' not found. Please install it and ensure it's in your PATH.`,
    );
  }
}

/**
 * Run Slither with JSON output.
 */
export async function runSlither(
  dir: string,
  args: string[],
): Promise<ExecResult> {
  logger.dim(`Running: slither ${args.join(' ')}`);
  return exec('slither', args, { cwd: dir, timeout: 300_000 });
}

/**
 * Get Slither function-summary output with file-based caching.
 * access.ts and state.ts both run the identical `slither . --print function-summary --json -`
 * command. This cache ensures it only runs once per analysis session.
 */
export async function getSlitherFunctionSummary(
  projectDir: string,
  outputDir: string,
): Promise<ExecResult> {
  const cacheDir = path.join(outputDir, '.cache');
  const cachePath = path.join(cacheDir, 'slither-function-summary.json');

  // Use cache if it exists and is less than 5 minutes old
  try {
    const stat = fs.statSync(cachePath);
    if (Date.now() - stat.mtimeMs < 5 * 60 * 1000) {
      const cached = JSON.parse(fs.readFileSync(cachePath, 'utf-8')) as ExecResult;
      logger.dim('Using cached Slither function-summary');
      return cached;
    }
  } catch {
    // Cache miss — run Slither
  }

  const result = await runSlither(projectDir, ['.', '--print', 'function-summary', '--json', '-']);

  // Cache the result on success
  if (result.exitCode === 0) {
    try {
      fs.mkdirSync(cacheDir, { recursive: true });
      fs.writeFileSync(cachePath, JSON.stringify(result));
    } catch {
      // Non-fatal — caching is best-effort
    }
  }

  return result;
}

/**
 * Run Forge (Foundry).
 */
export async function runForge(
  dir: string,
  args: string[],
): Promise<ExecResult> {
  logger.dim(`Running: forge ${args.join(' ')}`);
  return exec('forge', args, { cwd: dir, timeout: 300_000 });
}

/**
 * Flatten a Solidity file using forge flatten.
 * Results are cached in-memory so repeated calls (e.g., from stats + access
 * during `hex analyze`) skip the subprocess.
 */
const flattenCache = new Map<string, string | null>();

export async function flattenFile(projectDir: string, filePath: string): Promise<string | null> {
  const key = `${projectDir}:${filePath}`;
  if (flattenCache.has(key)) {
    return flattenCache.get(key)!;
  }

  try {
    const result = await runForge(projectDir, ['flatten', filePath]);
    const value = result.exitCode === 0 && result.stdout.trim().length > 0
      ? result.stdout
      : null;
    flattenCache.set(key, value);
    return value;
  } catch {
    flattenCache.set(key, null);
    return null;
  }
}

/**
 * Run solc.
 */
export async function runSolc(
  dir: string,
  args: string[],
): Promise<ExecResult> {
  logger.dim(`Running: solc ${args.join(' ')}`);
  return exec('solc', args, { cwd: dir });
}
