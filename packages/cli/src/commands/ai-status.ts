import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { loadConfig } from '../core/config.js';
import { getOutputDir } from '../core/paths.js';
import { writeJsonOutput, readJsonFile } from '../core/output.js';
import { logger } from '../core/logger.js';
import { HexError, reportError } from '../core/errors.js';
import type { z } from 'zod';
import { AiStatusSchema, AiToolStatusSchema } from '../core/schema.js';

type AiStatus = z.infer<typeof AiStatusSchema>;
type AiToolStatus = z.infer<typeof AiToolStatusSchema>;

const POLL_DEFAULT_MS = 5 * 60 * 1000;

function loadStatus(outputDir: string): AiStatus {
  const file = path.join(outputDir, 'ai-status.json');
  const raw = readJsonFile<unknown>(file);
  if (!raw) return { tools: {} };
  const parsed = AiStatusSchema.safeParse(raw);
  if (!parsed.success) return { tools: {} };
  return parsed.data;
}

function saveStatus(outputDir: string, status: AiStatus): void {
  writeJsonOutput(outputDir, 'ai-status.json', status);
}

interface PollOutcome {
  /** Final tool status after the check. */
  status: AiToolStatus['status'];
  /** Optional findings count after fetch. */
  findingsCount?: number;
  /** Error message if the check itself failed. */
  error?: string;
}

function runAa(
  args: string[],
  cwd: string,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const child = spawn('aa', args, { cwd, shell: true, env: process.env });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout?.on('data', (d: Buffer) => stdout.push(d));
    child.stderr?.on('data', (d: Buffer) => stderr.push(d));
    child.on('close', (code) => {
      resolve({
        stdout: Buffer.concat(stdout).toString('utf-8'),
        stderr: Buffer.concat(stderr).toString('utf-8'),
        exitCode: code ?? 1,
      });
    });
    child.on('error', () => {
      resolve({ stdout: '', stderr: 'failed to spawn aa', exitCode: 1 });
    });
  });
}

async function checkAuditagent(toolStatus: AiToolStatus, projectDir: string): Promise<PollOutcome> {
  const scanId = toolStatus.scan_id;
  if (!scanId) {
    return { status: 'not_started', error: 'no scan_id recorded' };
  }
  const status = await runAa(['scan', '--status', scanId], projectDir);
  if (status.exitCode !== 0) {
    return { status: 'failed', error: status.stderr.trim() || `aa exited ${status.exitCode}` };
  }
  const out = status.stdout.toLowerCase();
  if (out.includes('failed')) {
    return { status: 'failed', error: status.stdout.trim() };
  }
  if (out.includes('running') || out.includes('pending') || out.includes('in progress')) {
    return { status: 'pending_scan' };
  }
  // Treat anything else (e.g. "completed", "complete") as done — fetch findings.
  return { status: 'completed' };
}

const CHECKERS: Record<string, (status: AiToolStatus, projectDir: string) => Promise<PollOutcome>> =
  {
    auditagent: checkAuditagent,
  };

async function tick(
  projectDir: string,
  outputDir: string,
): Promise<{ changed: boolean; pending: number; completed: number }> {
  const status = loadStatus(outputDir);
  let changed = false;
  let pending = 0;
  let completed = 0;

  for (const [name, toolStatus] of Object.entries(status.tools)) {
    if (toolStatus.status !== 'pending_scan' && toolStatus.status !== 'running') continue;
    const checker = CHECKERS[name];
    if (!checker) continue;

    const outcome = await checker(toolStatus, projectDir);
    if (outcome.status !== toolStatus.status) {
      status.tools[name] = {
        ...toolStatus,
        status: outcome.status,
        error: outcome.error,
        findings_count: outcome.findingsCount ?? toolStatus.findings_count,
        ran_at: outcome.status === 'completed' ? new Date().toISOString() : toolStatus.ran_at,
      };
      changed = true;
      if (outcome.status === 'completed') {
        completed++;
        logger.success(
          `${name}: scan ${toolStatus.scan_id ?? ''} complete — run /ingest-aa-report to ingest findings`,
        );
      } else if (outcome.status === 'failed') {
        logger.error(`${name}: scan failed${outcome.error ? ` — ${outcome.error}` : ''}`);
      }
    } else if (outcome.status === 'pending_scan' || outcome.status === 'running') {
      pending++;
      logger.info(`${name}: ${outcome.status} (scan ${toolStatus.scan_id ?? ''})`);
    }
  }

  if (changed) saveStatus(outputDir, status);
  return { changed, pending, completed };
}

function printSummary(status: AiStatus): void {
  console.log();
  if (Object.keys(status.tools).length === 0) {
    logger.info('No AI tool runs recorded yet.');
    return;
  }
  console.log(chalk.bold('  ai tool status'));
  for (const [name, tool] of Object.entries(status.tools)) {
    const colour =
      tool.status === 'completed'
        ? chalk.green
        : tool.status === 'failed'
          ? chalk.red
          : tool.status === 'pending_scan' || tool.status === 'running'
            ? chalk.cyan
            : chalk.dim;
    const detail = [
      tool.scan_id ? `scan=${tool.scan_id}` : null,
      tool.findings_count !== undefined ? `findings=${tool.findings_count}` : null,
      tool.started_at ? `started=${tool.started_at}` : null,
      tool.error ? `error=${tool.error}` : null,
    ]
      .filter(Boolean)
      .join(' ');
    console.log(`  ${colour(tool.status.padEnd(13))} ${chalk.bold(name)}  ${chalk.dim(detail)}`);
  }
  console.log();
}

export const aiStatusCommand = new Command('ai-status')
  .description(
    'Check status of async AI tool scans (e.g. auditagent). Use --watch to poll until all complete.',
  )
  .option('--project <dir>', 'Project directory')
  .option('--watch', 'Poll every 5 minutes until no scans remain pending')
  .option('--interval <ms>', 'Override poll interval in milliseconds')
  .action(async (opts) => {
    try {
      const projectDir = path.resolve(opts.project ?? process.cwd());
      // Tolerate missing config: ai-status can be queried on its own
      let outputDir: string;
      try {
        const config = loadConfig(projectDir);
        outputDir = getOutputDir(config.project.project_dir, config.settings.output_dir);
      } catch {
        outputDir = getOutputDir(projectDir);
        if (!fs.existsSync(outputDir)) {
          throw new HexError('project.missing-config');
        }
      }

      const intervalMs = opts.interval ? Number(opts.interval) : POLL_DEFAULT_MS;
      const watch = Boolean(opts.watch);

      let result = await tick(projectDir, outputDir);
      printSummary(loadStatus(outputDir));

      if (watch && result.pending > 0) {
        logger.info(
          `Watching for ${result.pending} pending scan(s) every ${Math.round(intervalMs / 1000)}s. Ctrl-C to stop.`,
        );
        while (result.pending > 0) {
          await new Promise((resolve) => setTimeout(resolve, intervalMs));
          result = await tick(projectDir, outputDir);
          if (result.changed) printSummary(loadStatus(outputDir));
        }
        logger.success('All pending scans resolved.');
      }
    } catch (err) {
      reportError(err);
      process.exit(1);
    }
  });
