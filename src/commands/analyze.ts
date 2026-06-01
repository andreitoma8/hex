import { Command } from 'commander';
import { logger } from '../core/logger.js';
import { ProgressTracker } from '../core/progress.js';
import { statsCommand } from './stats.js';
import { depsCommand } from './deps.js';
import { accessCommand } from './access.js';
import { stateCommand } from './state.js';
import { callsCommand } from './calls.js';
import { patternsCommand } from './patterns.js';
import { constraintsCommand } from './constraints.js';
import { surfaceCommand } from './surface.js';

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
  .description('Run all deterministic analysis commands (stats, deps, access, state, calls, patterns, constraints, surface)')
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

    // Phase 1: Run independent commands in parallel
    // All commands gracefully handle missing cross-command data (null guards).
    // surface is excluded — it requires all other outputs as input.
    const phase1Steps: Array<{ name: string; command: Command; args: string[] }> = [
      { name: 'stats', command: statsCommand, args: statsArgs },
      { name: 'deps', command: depsCommand, args: baseArgs },
      { name: 'access', command: accessCommand, args: baseArgs },
      { name: 'state', command: stateCommand, args: baseArgs },
      { name: 'calls', command: callsCommand, args: baseArgs },
      { name: 'patterns', command: patternsCommand, args: baseArgs },
      { name: 'constraints', command: constraintsCommand, args: baseArgs },
      { name: 'surface', command: surfaceCommand, args: baseArgs },
    ];

    const tracker = new ProgressTracker(phase1Steps.map((s) => s.name));
    tracker.start();

    const parallelSteps = phase1Steps.slice(0, -1);
    const parallelPromises = parallelSteps.map((step) => runStep(step.name, step.command, step.args, tracker));
    const phase1Results = await Promise.allSettled(parallelPromises);

    const results: StepResult[] = phase1Results.map((settled, i) => {
      if (settled.status === 'fulfilled') {
        return settled.value;
      }
      return { name: parallelSteps[i].name, success: false, error: String(settled.reason) };
    });

    // Phase 2: surface needs all other outputs
    const surfaceStep = phase1Steps[phase1Steps.length - 1];
    const surfaceResult = await runStep(surfaceStep.name, surfaceStep.command, surfaceStep.args, tracker);
    results.push(surfaceResult);

    tracker.finish();

    // Summary
    const succeeded = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success);

    console.log();
    console.log('─'.repeat(50));
    logger.info(`Analysis complete: ${succeeded}/${results.length} commands succeeded`);

    if (failed.length > 0) {
      logger.warn('Failed commands:');
      for (const f of failed) {
        logger.warn(`  ${f.name}: ${f.error}`);
      }
    }

    if (succeeded === 0) {
      process.exit(1);
    }
  });
