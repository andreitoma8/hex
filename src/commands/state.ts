import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import { logger } from '../core/logger.js';
import { loadProjectContext } from '../core/config.js';
import { normalizePath } from '../core/paths.js';
import { writeJsonOutput } from '../core/output.js';
import { parseSolidity, parseSolidityCached } from '../parsers/solidity-parser.js';
import { parseFunctionSummary } from '../parsers/slither.js';
import { parseStorageLayout } from '../parsers/solc.js';
import { extractStateVariables } from '../analysis/state-variables.js';
import { getSlitherFunctionSummary, runSolc } from '../core/external-tools.js';
import type { StateVars } from '../types/index.js';

export const stateCommand = new Command('state')
  .description('Generate state variable inventory')
  .option('--project <dir>', 'Project directory')
  .action(async (opts) => {
    const spin = logger.spinner('Analyzing state variables...');

    try {
      const projectDir = opts.project ?? process.cwd();
      const { config, outputDir } = loadProjectContext(projectDir);

      // Parse all scope files
      spin.text = 'Parsing contracts...';
      const allContracts: ReturnType<typeof parseSolidity>['contracts'] = [];
      const fileMap = new Map<string, string>();

      for (const scopeFile of config.project.scope) {
        const filePath = path.resolve(config.project.project_dir, scopeFile);
        if (!fs.existsSync(filePath)) continue;

        const source = fs.readFileSync(filePath, 'utf-8');
        const parsed = parseSolidityCached(source, scopeFile);

        for (const contract of parsed.contracts) {
          allContracts.push(contract);
          fileMap.set(contract.name, normalizePath(scopeFile));
        }
      }

      // Try Slither for read/write data
      spin.text = 'Running Slither data dependency analysis...';
      let slitherSummary = null;
      try {
        const result = await getSlitherFunctionSummary(config.project.project_dir, outputDir);
        if (result.exitCode === 0 && result.stdout) {
          slitherSummary = parseFunctionSummary(JSON.parse(result.stdout));
        }
      } catch {
        logger.warn('Slither not available — read/write tracking limited');
      }

      // Try solc for storage layout
      spin.text = 'Checking storage layout...';
      let storageLayout = null;
      try {
        // Try reading from forge build artifacts
        const outDir = path.join(config.project.project_dir, 'out');
        if (fs.existsSync(outDir)) {
          for (const contract of allContracts) {
            const artifactPath = path.join(outDir, `${contract.name}.sol`, `${contract.name}.json`);
            if (fs.existsSync(artifactPath)) {
              const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf-8'));
              if (artifact.storageLayout) {
                storageLayout = parseStorageLayout(
                  { contracts: { '': { [contract.name]: { storageLayout: artifact.storageLayout } } } },
                  contract.name,
                );
              }
            }
          }
        }
      } catch {
        logger.dim('Storage layout not available from build artifacts');
      }

      // Extract state variables
      const result = extractStateVariables(
        allContracts,
        fileMap,
        slitherSummary,
        storageLayout,
      );

      const stateVars: StateVars = {
        variables: result.variables,
        storage_layout_source: result.storageLayoutSource,
        storage_collisions: result.storageCollisions,
      };

      const outPath = writeJsonOutput(outputDir, 'state-vars.json', stateVars);
      spin.succeed('State variable analysis complete');
      logger.info(`Output: ${outPath}`);
      logger.info(`Found: ${stateVars.variables.length} state variables`);

      const unused = stateVars.variables.filter((v) => v.is_unused);
      if (unused.length > 0) {
        logger.warn(`${unused.length} potentially unused variables detected`);
      }
    } catch (err) {
      spin.fail('State variable analysis failed');
      logger.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });
