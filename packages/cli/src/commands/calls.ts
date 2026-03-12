import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import { logger } from '../core/logger.js';
import { loadConfig } from '../core/config.js';
import { getOutputDir } from '../core/paths.js';
import { writeJsonOutput, readJsonFile } from '../core/output.js';
import { parseDetectors } from '../parsers/slither.js';
import { buildExternalCalls } from '../analysis/external-calls.js';
import { runSlither } from '../core/external-tools.js';
import type { ExternalCalls, StateVars, AccessControl } from '../types/index.js';

export const callsCommand = new Command('calls')
  .description('Map external call surface')
  .option('--project <dir>', 'Project directory')
  .action(async (opts) => {
    const spin = logger.spinner('Analyzing external calls...');

    try {
      const projectDir = opts.project ?? process.cwd();
      const config = loadConfig(projectDir);
      const outputDir = getOutputDir(config.project.project_dir, config.settings.output_dir);

      // This command requires Slither
      spin.text = 'Running Slither detectors...';
      const result = await runSlither(config.project.project_dir, [
        '.',
        '--detect',
        'unchecked-transfer,unchecked-lowlevel,reentrancy-eth,reentrancy-no-eth,reentrancy-benign,reentrancy-events,calls-loop',
        '--json', '-',
      ]);

      if (result.exitCode !== 0 && !result.stdout) {
        throw new Error(
          `Slither failed (exit code ${result.exitCode}). This command requires Slither.\n${result.stderr.slice(0, 300)}`,
        );
      }

      let detectors;
      try {
        detectors = parseDetectors(JSON.parse(result.stdout));
      } catch {
        throw new Error('Failed to parse Slither output. Ensure Slither is properly installed.');
      }

      // Load supplementary data for trust level classification
      const stateVars = readJsonFile<StateVars>(path.join(outputDir, 'state-vars.json'));
      const accessControl = readJsonFile<AccessControl>(path.join(outputDir, 'access-control.json'));

      // Build immutability map
      const immutabilityMap = new Map<string, boolean>();
      if (stateVars) {
        for (const v of stateVars.variables) {
          immutabilityMap.set(v.name, v.mutability === 'immutable' || v.mutability === 'constant');
        }
      }

      // Build scope contracts set
      const scopeContracts = new Set<string>();
      if (stateVars) {
        for (const v of stateVars.variables) {
          scopeContracts.add(v.contract);
        }
      }

      // Build access-controlled setter map
      const accessControlledSetters = new Map<string, string>();
      if (accessControl) {
        for (const role of accessControl.roles) {
          if (role.role === 'anyone') continue;
          for (const func of role.functions) {
            accessControlledSetters.set(func.function, role.role);
          }
        }
      }

      const calls = buildExternalCalls(
        detectors,
        immutabilityMap,
        scopeContracts,
        accessControlledSetters,
      );

      const externalCalls: ExternalCalls = { calls };

      const outPath = writeJsonOutput(outputDir, 'external-calls.json', externalCalls);
      spin.succeed('External call analysis complete');
      logger.info(`Output: ${outPath}`);
      logger.info(`Found: ${calls.length} external calls`);
    } catch (err) {
      spin.fail('External call analysis failed');
      logger.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });
