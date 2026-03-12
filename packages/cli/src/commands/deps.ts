import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import { logger } from '../core/logger.js';
import { loadConfig } from '../core/config.js';
import { getOutputDir, normalizePath } from '../core/paths.js';
import { writeJsonOutput, readJsonFile } from '../core/output.js';
import { parseSolidity } from '../parsers/solidity-parser.js';
import {
  buildDependencyGraph,
  loadRemappings,
  resolveImportPath,
} from '../analysis/dependency-graph.js';
import type { Deps, Stats } from '../types/index.js';

export const depsCommand = new Command('deps')
  .description('Build contract dependency graph')
  .option('--project <dir>', 'Project directory')
  .action(async (opts) => {
    const spin = logger.spinner('Building dependency graph...');

    try {
      const projectDir = opts.project ?? process.cwd();
      const config = loadConfig(projectDir);
      const outputDir = getOutputDir(config.project.project_dir, config.settings.output_dir);

      // Load remappings
      const remappings = loadRemappings(config.project.project_dir);

      // Parse all scope files
      const fileData = new Map<
        string,
        {
          contracts: ReturnType<typeof parseSolidity>['contracts'];
          imports: ReturnType<typeof parseSolidity>['imports'];
        }
      >();

      const nslocMap = new Map<string, number>();

      // Try to load stats for nsloc data
      const stats = readJsonFile<Stats>(path.join(outputDir, 'stats.json'));

      for (const scopeFile of config.project.scope) {
        const filePath = path.resolve(config.project.project_dir, scopeFile);
        if (!fs.existsSync(filePath)) continue;

        const source = fs.readFileSync(filePath, 'utf-8');
        const parsed = parseSolidity(source, scopeFile);

        // Resolve import paths
        const resolvedImports = parsed.imports.map((imp) => ({
          ...imp,
          path: resolveImportPath(imp.path, remappings),
        }));

        fileData.set(scopeFile, {
          contracts: parsed.contracts,
          imports: resolvedImports,
        });

        // Populate nsloc map from stats
        for (const contract of parsed.contracts) {
          const statsEntry = stats?.per_contract.find(
            (e) => e.contract === contract.name,
          );
          if (statsEntry) nslocMap.set(contract.name, statsEntry.nsloc);
        }
      }

      // Build the dependency graph
      const depData = buildDependencyGraph(fileData, nslocMap);

      const deps: Deps = {
        graph: depData.graph,
        clusters: depData.clusters,
        inheritance_trees: depData.inheritanceTrees,
        topological_order: depData.topologicalOrder,
      };

      const outPath = writeJsonOutput(outputDir, 'deps.json', deps);
      spin.succeed('Dependency graph built');
      logger.info(`Output: ${outPath}`);
      logger.info(
        `Graph: ${Object.keys(deps.graph).length} contracts, ${deps.clusters.length} clusters`,
      );
    } catch (err) {
      spin.fail('Dependency graph generation failed');
      logger.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });
