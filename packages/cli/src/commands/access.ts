import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import { logger } from '../core/logger.js';
import { loadConfig } from '../core/config.js';
import { getOutputDir, normalizePath } from '../core/paths.js';
import { writeJsonOutput } from '../core/output.js';
import { parseSolidity } from '../parsers/solidity-parser.js';
import { parseFunctionSummary } from '../parsers/slither.js';
import { extractFunctionFacts, mergeInheritedFunctions, interpretRoles } from '../analysis/access-control.js';
import { runSlither } from '../core/external-tools.js';
import type { AccessControl } from '../types/index.js';

export const accessCommand = new Command('access')
  .description('Extract access control mapping')
  .option('--project <dir>', 'Project directory')
  .action(async (opts) => {
    const spin = logger.spinner('Analyzing access control...');

    try {
      const projectDir = opts.project ?? process.cwd();
      const config = loadConfig(projectDir);
      const outputDir = getOutputDir(config.project.project_dir, config.settings.output_dir);

      // Parse all scope files for Tier 1 facts
      spin.text = 'Parsing contracts (Tier 1)...';
      const allContracts: ReturnType<typeof parseSolidity>['contracts'] = [];
      const fileMap = new Map<string, string>(); // contractName -> filePath

      for (const scopeFile of config.project.scope) {
        const filePath = path.resolve(config.project.project_dir, scopeFile);
        if (!fs.existsSync(filePath)) continue;

        const source = fs.readFileSync(filePath, 'utf-8');
        const parsed = parseSolidity(source, scopeFile);

        for (const contract of parsed.contracts) {
          allContracts.push(contract);
          fileMap.set(contract.name, normalizePath(scopeFile));
        }
      }

      // Tier 1: Raw function facts
      let functions = extractFunctionFacts(allContracts, fileMap);

      // Tier 2: Try Slither for enhanced analysis
      spin.text = 'Running Slither analysis (Tier 2)...';
      let slitherSummary = null;
      try {
        const result = await runSlither(config.project.project_dir, [
          '.',
          '--print', 'function-summary',
          '--json', '-',
        ]);
        if (result.exitCode === 0 && result.stdout) {
          const json = JSON.parse(result.stdout);
          slitherSummary = parseFunctionSummary(json);
          logger.info('Slither analysis complete — enhanced Tier 2 data available');

          // Merge inherited functions from Slither
          functions = mergeInheritedFunctions(functions, slitherSummary, allContracts, fileMap);
          const inheritedCount = functions.filter((f) => f.inherited_from).length;
          if (inheritedCount > 0) {
            logger.info(`Found ${inheritedCount} inherited functions via Slither`);
          }
        }
      } catch {
        logger.warn('Slither not available — Tier 2 limited to naming heuristics. Inherited functions may be missing.');
      }

      // Tier 2: Role interpretation
      const roles = interpretRoles(functions, allContracts, slitherSummary);

      const accessControl: AccessControl = { functions, roles };

      const outPath = writeJsonOutput(outputDir, 'access-control.json', accessControl);
      spin.succeed('Access control analysis complete');
      logger.info(`Output: ${outPath}`);
      logger.info(
        `Found: ${functions.length} functions, ${roles.length} roles`,
      );
    } catch (err) {
      spin.fail('Access control analysis failed');
      logger.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });
