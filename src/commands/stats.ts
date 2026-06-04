import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import { logger } from '../core/logger.js';
import { loadProjectContext } from '../core/config.js';
import { normalizePath } from '../core/paths.js';
import { writeJsonOutput } from '../core/output.js';
import { parseSolidity, parseSolidityCached, type ParsedContract, type ParsedFunction } from '../parsers/solidity-parser.js';
import { countNsloc, getCommentRanges, getAssemblyRanges } from '../analysis/nsloc.js';
import { detectErcs } from '../analysis/erc-detection.js';
import { parseLcov, coveragePct } from '../parsers/lcov.js';
import { runForge, flattenFile } from '../core/external-tools.js';
import type { Stats, PerContractStats, TestCoverage } from '../types/index.js';

export const statsCommand = new Command('stats')
  .description('Generate codebase statistics')
  .option('--project <dir>', 'Project directory')
  .option('--no-coverage', 'Skip test coverage')
  .action(async (opts) => {
    const spin = logger.spinner('Generating statistics...');

    try {
      const projectDir = opts.project ?? process.cwd();
      const { config, outputDir } = loadProjectContext(projectDir);

      const perContract: PerContractStats[] = [];
      const allErcs = new Set<string>();
      const dependencyMap = new Map<string, number>();

      let totalFiles = 0;
      let totalContracts = 0;
      let totalInterfaces = 0;
      let totalLibraries = 0;
      let totalAbstract = 0;
      let totalLines = 0;
      let totalNsloc = 0;
      let totalComments = 0;
      let totalBlanks = 0;
      let totalAssembly = 0;

      spin.text = 'Parsing scope files...';

      for (const scopeFile of config.project.scope) {
        const filePath = path.resolve(config.project.project_dir, scopeFile);
        if (!fs.existsSync(filePath)) {
          logger.warn(`Scope file not found: ${scopeFile}`);
          continue;
        }

        totalFiles++;
        const source = fs.readFileSync(filePath, 'utf-8');
        const parsed = parseSolidityCached(source, scopeFile);

        // Count lines
        const commentRanges = getCommentRanges(parsed.comments);
        const assemblyRanges = getAssemblyRanges(source);
        const lineCounts = countNsloc(source, commentRanges, assemblyRanges);

        totalLines += lineCounts.totalLines;
        totalNsloc += lineCounts.nsloc;
        totalComments += lineCounts.commentLines;
        totalBlanks += lineCounts.blankLines;
        totalAssembly += lineCounts.assemblyLines;

        // Extract dependencies from imports
        for (const imp of parsed.imports) {
          const pkg = extractPackageName(imp.path);
          if (pkg) {
            dependencyMap.set(pkg, (dependencyMap.get(pkg) ?? 0) + 1);
          }
        }

        // Process each contract
        for (const contract of parsed.contracts) {
          switch (contract.type) {
            case 'interface': totalInterfaces++; break;
            case 'library': totalLibraries++; break;
            case 'abstract': totalAbstract++; break;
            default: totalContracts++; break;
          }

          const funcNames = contract.functions.map((f) => f.name);
          const ercs = detectErcs(contract.baseContracts, funcNames);
          for (const erc of ercs) allErcs.add(erc);

          const extFuncs = contract.functions.filter((f) => f.visibility === 'external').length;
          const pubFuncs = contract.functions.filter((f) => f.visibility === 'public').length;
          const intFuncs = contract.functions.filter((f) => f.visibility === 'internal').length;
          const privFuncs = contract.functions.filter((f) => f.visibility === 'private').length;

          // Per-contract nSLOC using contract body line range
          const contractNsloc = countNsloc(source, commentRanges, assemblyRanges, {
            start: contract.lineStart,
            end: contract.lineEnd,
          });

          perContract.push({
            file: normalizePath(scopeFile),
            contract: contract.name,
            type: contract.type,
            nsloc: contractNsloc.nsloc,
            functions: contract.functions.length,
            external_functions: extFuncs,
            public_functions: pubFuncs,
            internal_functions: intFuncs,
            private_functions: privFuncs,
            modifiers: contract.modifiers.length,
            events: contract.events.length,
            errors: contract.errors.length,
            assembly_lines: contractNsloc.assemblyLines,
            inherits: contract.baseContracts,
          });
        }
      }

      // Second pass: resolve inherited members via forge flatten
      spin.text = 'Resolving inherited members...';
      let totalNslocWithDeps = 0;
      let hasAnyFlattenedData = false;

      for (const scopeFile of config.project.scope) {
        const filePath = path.resolve(config.project.project_dir, scopeFile);
        if (!fs.existsSync(filePath)) continue;

        const flattenedSource = await flattenFile(config.project.project_dir, filePath);
        if (!flattenedSource) continue;

        // Count nSLOC on flattened source
        const flatParsed = parseSolidity(flattenedSource, scopeFile);
        const flatCommentRanges = getCommentRanges(flatParsed.comments);
        const flatAssemblyRanges = getAssemblyRanges(flattenedSource);
        const flatLineCounts = countNsloc(flattenedSource, flatCommentRanges, flatAssemblyRanges);

        // Assign nsloc_with_deps to each contract in this file using per-contract ranges
        const fileContracts = perContract.filter((c) => c.file === normalizePath(scopeFile));
        for (const entry of fileContracts) {
          // Find the matching contract in the flattened parse to get its line range
          const flatContract = flatParsed.contracts.find((c) => c.name === entry.contract);
          if (flatContract) {
            const flatContractNsloc = countNsloc(flattenedSource, flatCommentRanges, flatAssemblyRanges, {
              start: flatContract.lineStart,
              end: flatContract.lineEnd,
            });
            entry.nsloc_with_deps = flatContractNsloc.nsloc;
          } else {
            entry.nsloc_with_deps = flatLineCounts.nsloc;
          }
          totalNslocWithDeps += entry.nsloc_with_deps!;
          hasAnyFlattenedData = true;

          // Resolve inherited members
          const resolved = resolveInheritedMembers(entry.contract, flatParsed.contracts);
          if (resolved) {
            entry.total_functions = resolved.functions.length;
            entry.total_external_functions = resolved.functions.filter((f) => f.visibility === 'external').length;
            entry.total_public_functions = resolved.functions.filter((f) => f.visibility === 'public').length;
            entry.total_modifiers = resolved.modifiers.length;
            entry.total_events = resolved.events.length;
            entry.total_errors = resolved.errors.length;
          }
        }
      }

      // Resolve dependency versions
      const dependencies = resolveDependencyVersions(
        dependencyMap,
        config.project.project_dir,
      );

      // Run coverage if enabled
      let testCoverage: TestCoverage | null = null;
      if (opts.coverage !== false) {
        spin.text = 'Running test coverage...';
        testCoverage = await runTestCoverage(config.project.project_dir);
      }

      const stats: Stats = {
        generated_at: new Date().toISOString(),
        totals: {
          files: totalFiles,
          contracts: totalContracts,
          interfaces: totalInterfaces,
          libraries: totalLibraries,
          abstract_contracts: totalAbstract,
          total_lines: totalLines,
          nsloc: totalNsloc,
          comment_lines: totalComments,
          blank_lines: totalBlanks,
          assembly_lines: totalAssembly,
          ...(hasAnyFlattenedData ? { nsloc_with_deps: totalNslocWithDeps } : {}),
        },
        solidity_version: config.project.solidity_version,
        erc_eip_usage: [...allErcs].sort(),
        dependencies,
        test_coverage: testCoverage,
        per_contract: perContract,
      };

      const outPath = writeJsonOutput(outputDir, 'stats.json', stats);
      spin.succeed('Statistics generated');
      logger.info(`Output: ${outPath}`);
      logger.info(
        `Totals: ${totalFiles} files, ${totalContracts} contracts, ${totalNsloc} nSLOC`,
      );
    } catch (err) {
      spin.fail('Stats generation failed');
      logger.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

function extractPackageName(importPath: string): string | null {
  // @openzeppelin/contracts/... → @openzeppelin/contracts
  // solmate/... → solmate
  if (importPath.startsWith('@')) {
    const parts = importPath.split('/');
    if (parts.length >= 2) return `${parts[0]}/${parts[1]}`;
  } else if (!importPath.startsWith('.') && !importPath.startsWith('/')) {
    const parts = importPath.split('/');
    return parts[0];
  }
  return null;
}

function resolveDependencyVersions(
  depMap: Map<string, number>,
  projectDir: string,
): Array<{ package: string; version: string | null; imports: number }> {
  const deps: Array<{ package: string; version: string | null; imports: number }> = [];

  for (const [pkg, imports] of depMap) {
    let version: string | null = null;

    // Try lib/<pkg>/package.json (Foundry)
    const libPkg = path.join(projectDir, 'lib', pkg.replace('@', '').replace('/', '-'), 'package.json');
    if (fs.existsSync(libPkg)) {
      try {
        const json = JSON.parse(fs.readFileSync(libPkg, 'utf-8'));
        version = json.version ?? null;
      } catch { /* ignore */ }
    }

    // Try node_modules/<pkg>/package.json (Hardhat)
    if (!version) {
      const nmPkg = path.join(projectDir, 'node_modules', pkg, 'package.json');
      if (fs.existsSync(nmPkg)) {
        try {
          const json = JSON.parse(fs.readFileSync(nmPkg, 'utf-8'));
          version = json.version ?? null;
        } catch { /* ignore */ }
      }
    }

    deps.push({ package: pkg, version, imports });
  }

  return deps.sort((a, b) => a.package.localeCompare(b.package));
}

interface ResolvedMembers {
  functions: ParsedFunction[];
  modifiers: string[];
  events: string[];
  errors: string[];
}

function resolveInheritedMembers(
  targetName: string,
  allContracts: ParsedContract[],
): ResolvedMembers | null {
  const contractMap = new Map<string, ParsedContract>();
  for (const c of allContracts) {
    contractMap.set(c.name, c);
  }

  const target = contractMap.get(targetName);
  if (!target) return null;

  const visited = new Set<string>();
  const allFunctions: ParsedFunction[] = [];
  const allModifiers: string[] = [];
  const allEvents: string[] = [];
  const allErrors: string[] = [];

  function walk(name: string): void {
    if (visited.has(name)) return;
    visited.add(name);
    const contract = contractMap.get(name);
    if (!contract) return;
    // Walk parents first so child overrides come later
    for (const base of contract.baseContracts) {
      walk(base);
    }
    allFunctions.push(...contract.functions);
    allModifiers.push(...contract.modifiers.map((m) => m.name));
    allEvents.push(...contract.events);
    allErrors.push(...contract.errors);
  }

  walk(targetName);

  // Deduplicate functions: later entries (child) override earlier (parent) by name
  const funcMap = new Map<string, ParsedFunction>();
  for (const f of allFunctions) {
    funcMap.set(f.name, f);
  }

  // Deduplicate modifiers, events, errors by name
  const uniqueModifiers = [...new Set(allModifiers)];
  const uniqueEvents = [...new Set(allEvents)];
  const uniqueErrors = [...new Set(allErrors)];

  return {
    functions: [...funcMap.values()],
    modifiers: uniqueModifiers,
    events: uniqueEvents,
    errors: uniqueErrors,
  };
}

async function runTestCoverage(projectDir: string): Promise<TestCoverage> {
  try {
    const result = await runForge(projectDir, ['coverage', '--report', 'lcov']);

    if (result.exitCode !== 0) {
      const stderrLower = result.stderr.toLowerCase();
      if (stderrLower.includes('ir-minimum') || stderrLower.includes('stack too deep')) {
        console.warn('Retrying coverage with --ir-minimum due to stack depth issues...');
        const retry = await runForge(projectDir, ['coverage', '--report', 'lcov', '--ir-minimum']);
        if (retry.exitCode !== 0) {
          return {
            status: 'failed',
            failure_reason: `forge coverage exited with code ${retry.exitCode} (after --ir-minimum retry): ${retry.stderr.slice(0, 200)}`,
            overall_line_pct: null,
            overall_branch_pct: null,
            per_contract: [],
          };
        }
      } else {
        return {
          status: 'failed',
          failure_reason: `forge coverage exited with code ${result.exitCode}: ${result.stderr.slice(0, 200)}`,
          overall_line_pct: null,
          overall_branch_pct: null,
          per_contract: [],
        };
      }
    }

    // Read lcov.info
    const lcovPath = path.join(projectDir, 'lcov.info');
    if (!fs.existsSync(lcovPath)) {
      return {
        status: 'failed',
        failure_reason: 'lcov.info not found after forge coverage',
        overall_line_pct: null,
        overall_branch_pct: null,
        per_contract: [],
      };
    }

    const lcovText = fs.readFileSync(lcovPath, 'utf-8');
    const report = parseLcov(lcovText);

    return {
      status: 'available',
      failure_reason: null,
      overall_line_pct: coveragePct(report.totalLinesHit, report.totalLinesFound),
      overall_branch_pct: coveragePct(report.totalBranchesHit, report.totalBranchesFound),
      per_contract: report.records.map((r) => ({
        contract: path.basename(r.sourceFile, '.sol'),
        file: normalizePath(r.sourceFile),
        line_pct: coveragePct(r.linesHit, r.linesFound),
        branch_pct: coveragePct(r.branchesHit, r.branchesFound),
        uncovered_lines: r.uncoveredLines,
      })),
    };
  } catch {
    return {
      status: 'failed',
      failure_reason: 'forge command not available',
      overall_line_pct: null,
      overall_branch_pct: null,
      per_contract: [],
    };
  }
}
