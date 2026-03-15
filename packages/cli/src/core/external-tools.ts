import { spawn } from 'node:child_process';
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
 */
export async function flattenFile(projectDir: string, filePath: string): Promise<string | null> {
  try {
    const result = await runForge(projectDir, ['flatten', filePath]);
    if (result.exitCode === 0 && result.stdout.trim().length > 0) {
      return result.stdout;
    }
    return null;
  } catch {
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
