import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import { logger } from '../core/logger.js';
import { loadProjectContext } from '../core/config.js';
import { normalizePath } from '../core/paths.js';
import { writeJsonOutput } from '../core/output.js';
import { parseSolidity, parseSolidityCached } from '../parsers/solidity-parser.js';
import { parseFunctionSummary } from '../parsers/slither.js';
import { extractFunctionFacts, mergeInheritedFunctions, mergeInheritedFromFlatten, interpretRoles } from '../analysis/access-control.js';
import { getSlitherFunctionSummary, flattenFile } from '../core/external-tools.js';
import type { AccessControl } from '../types/index.js';

export const accessCommand = new Command('access')
  .description('Extract access control mapping')
  .option('--project <dir>', 'Project directory')
  .action(async (opts) => {
    const spin = logger.spinner('Analyzing access control...');

    try {
      const projectDir = opts.project ?? process.cwd();
      const { config, outputDir } = loadProjectContext(projectDir);

      // Parse all scope files for Tier 1 facts
      spin.text = 'Parsing contracts (Tier 1)...';
      const allContracts: ReturnType<typeof parseSolidity>['contracts'] = [];
      const fileMap = new Map<string, string>(); // contractName -> filePath

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

      // Tier 1: Raw function facts
      let functions = extractFunctionFacts(allContracts, fileMap);

      // Tier 2: Try Slither for enhanced analysis
      spin.text = 'Running Slither analysis (Tier 2)...';
      let slitherSummary = null;
      try {
        const result = await getSlitherFunctionSummary(config.project.project_dir, outputDir);
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

      // Tier 2b: Flatten-based inherited function resolution (fallback for missing Slither data)
      // Find contracts that have parents but no inherited functions yet
      const needsFlatten = allContracts.filter(
        (c) => c.type !== 'interface' && c.baseContracts.length > 0
          && !functions.some((f) => f.contract === c.name && f.inherited_from),
      );

      if (needsFlatten.length > 0) {
        spin.text = 'Resolving inherited members via flatten...';
        const flattenCache = new Map<string, ReturnType<typeof parseSolidity> | null>();

        for (const contract of needsFlatten) {
          const scopeFile = fileMap.get(contract.name);
          if (!scopeFile) continue;

          // Cache flattened parse per file (multiple contracts may share a file)
          if (!flattenCache.has(scopeFile)) {
            const filePath = path.resolve(config.project.project_dir, scopeFile);
            const flattenedSource = await flattenFile(config.project.project_dir, filePath);
            flattenCache.set(scopeFile, flattenedSource ? parseSolidity(flattenedSource, scopeFile) : null);
          }

          const flatParsed = flattenCache.get(scopeFile);
          if (!flatParsed) continue;

          functions = mergeInheritedFromFlatten(
            functions, flatParsed.contracts, contract, scopeFile,
          );
        }

        const flatInheritedCount = functions.filter((f) => f.inherited_from).length;
        if (flatInheritedCount > 0) {
          logger.info(`Found ${flatInheritedCount} inherited functions via flatten`);
        }
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
