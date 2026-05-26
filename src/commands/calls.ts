import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import { logger } from '../core/logger.js';
import { loadConfig } from '../core/config.js';
import { getOutputDir, normalizePath } from '../core/paths.js';
import { writeJsonOutput, readJsonFile } from '../core/output.js';
import { parseDetectors } from '../parsers/slither.js';
import { extractExternalCalls } from '../parsers/solidity-parser.js';
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

      // Tier 1: AST-based external call extraction
      spin.text = 'Parsing contracts for external calls (AST)...';
      const allAstCalls: ReturnType<typeof extractExternalCalls> = [];

      for (const scopeFile of config.project.scope) {
        const filePath = path.resolve(config.project.project_dir, scopeFile);
        if (!fs.existsSync(filePath)) continue;

        const source = fs.readFileSync(filePath, 'utf-8');
        const calls = extractExternalCalls(source, normalizePath(scopeFile));
        allAstCalls.push(...calls);
      }

      logger.info(`AST extraction found ${allAstCalls.length} external calls`);

      // Tier 2: Try Slither for enrichment (unchecked returns, reentrancy)
      let slitherDetectors = undefined;
      try {
        spin.text = 'Running Slither detectors for enrichment...';
        const result = await runSlither(config.project.project_dir, [
          '.',
          '--detect',
          'unchecked-transfer,unchecked-lowlevel,reentrancy-eth,reentrancy-no-eth,reentrancy-benign,reentrancy-events,calls-loop',
          '--json', '-',
        ]);

        if (result.exitCode === 0 && result.stdout) {
          slitherDetectors = parseDetectors(JSON.parse(result.stdout));
          logger.info('Slither enrichment available — enhanced return check and reentrancy data');
        }
      } catch {
        logger.warn('Slither not available — return check and reentrancy guard data will have low confidence');
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
        allAstCalls,
        immutabilityMap,
        scopeContracts,
        accessControlledSetters,
        slitherDetectors,
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
