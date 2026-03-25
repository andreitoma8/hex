import { Command } from 'commander';
import { logger } from '../core/logger.js';
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

export const analyzeCommand = new Command('analyze')
  .description('Run all deterministic analysis commands (stats, deps, access, state, calls, patterns, constraints, surface)')
  .option('--project <dir>', 'Project directory')
  .option('--no-coverage', 'Skip test coverage (passed to stats)')
  .action(async (opts) => {
    const steps: Array<{ name: string; command: Command }> = [
      { name: 'stats', command: statsCommand },
      { name: 'deps', command: depsCommand },
      { name: 'access', command: accessCommand },
      { name: 'state', command: stateCommand },
      { name: 'calls', command: callsCommand },
      { name: 'patterns', command: patternsCommand },
      { name: 'constraints', command: constraintsCommand },
      { name: 'surface', command: surfaceCommand },
    ];

    const results: StepResult[] = [];
    logger.info('Running full analysis pipeline...\n');

    // Prevent sub-commands from calling process.exit on failure
    const originalExit = process.exit;
    let exitCalled = false;

    for (const step of steps) {
      logger.info(`── ${step.name} ──`);

      // Build args to forward
      const args: string[] = [];
      if (opts.project) {
        args.push('--project', opts.project);
      }
      if (step.name === 'stats' && opts.coverage === false) {
        args.push('--no-coverage');
      }

      exitCalled = false;
      process.exit = ((code?: number) => {
        exitCalled = true;
        throw new Error(`Command exited with code ${code ?? 1}`);
      }) as never;

      try {
        await step.command.parseAsync(args, { from: 'user' });

        if (exitCalled) {
          results.push({ name: step.name, success: false, error: 'Command exited with non-zero code' });
        } else {
          results.push({ name: step.name, success: true });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        results.push({ name: step.name, success: false, error: message });
      }

      console.log(); // blank line between steps
    }

    // Restore process.exit
    process.exit = originalExit;

    // Summary
    const succeeded = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success);

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
