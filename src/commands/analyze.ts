import { Command } from 'commander';
import { logger } from '../core/logger.js';
import { ProgressTracker } from '../core/progress.js';
import { statsCommand } from './stats.js';
import { diffCommand } from './diff.js';
import { factsCommand } from './facts.js';
import { loadProjectContext } from '../core/config.js';

interface StepResult {
  name: string;
  success: boolean;
  error?: string;
}

async function runStep(
  name: string,
  command: Command,
  args: string[],
  tracker: ProgressTracker,
): Promise<StepResult> {
  tracker.update(name, 'running');
  // Each step gets its own process.exit trap to avoid shared-state issues in parallel
  const originalExit = process.exit;
  let exitCalled = false;

  process.exit = ((code?: number) => {
    exitCalled = true;
    throw new Error(`Command exited with code ${code ?? 1}`);
  }) as never;

  try {
    await command.parseAsync(args, { from: 'user' });
    if (exitCalled) {
      tracker.update(name, 'failed', 'non-zero exit');
      return { name, success: false, error: 'Command exited with non-zero code' };
    }
    tracker.update(name, 'ok');
    return { name, success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    tracker.update(name, 'failed', truncate(message, 60));
    return { name, success: false, error: message };
  } finally {
    process.exit = originalExit;
  }
}

function truncate(message: string, max: number): string {
  const single = message.replace(/\s+/g, ' ').trim();
  return single.length > max ? single.slice(0, max - 1) + '…' : single;
}

export const analyzeCommand = new Command('analyze')
  .description(
    'Run the deterministic layer: stats (nSLOC, ERCs, coverage) and facts (compiler AST); plus diff in differential mode',
  )
  .option('--project <dir>', 'Project directory')
  .option('--no-coverage', 'Skip test coverage (passed to stats)')
  .action(async (opts) => {
    const baseArgs: string[] = [];
    if (opts.project) {
      baseArgs.push('--project', opts.project);
    }
    const statsArgs = [...baseArgs];
    if (opts.coverage === false) {
      statsArgs.push('--no-coverage');
    }

    let diffMode = false;
    try {
      diffMode = loadProjectContext(opts.project ?? process.cwd()).config.project.mode === 'diff';
    } catch {
      /* no config — every step reports it individually */
    }

    // facts compiles; stats may run `forge coverage`. Run them one after the
    // other so two forge processes never fight over the same project.
    const steps: Array<{ name: string; command: Command; args: string[] }> = [
      { name: 'facts', command: factsCommand, args: baseArgs },
      { name: 'stats', command: statsCommand, args: statsArgs },
      ...(diffMode ? [{ name: 'diff', command: diffCommand, args: baseArgs }] : []),
    ];
    const tracker = new ProgressTracker(steps.map((s) => s.name));
    tracker.start();
    const results: StepResult[] = [];
    for (const step of steps) {
      results.push(await runStep(step.name, step.command, step.args, tracker));
    }
    tracker.finish();

    const succeeded = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success);
    console.log();
    console.log('─'.repeat(50));
    logger.info(`Analysis complete: ${succeeded}/${results.length} steps succeeded`);
    if (failed.length > 0) {
      logger.warn('Failed steps:');
      for (const f of failed) logger.warn(`  ${f.name}: ${f.error}`);
    }
    if (succeeded === 0) process.exit(1);
  });
