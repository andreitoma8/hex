import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import { logger } from '../core/logger.js';
import { loadProjectContext, type Config } from '../core/config.js';
import { writeJsonOutput } from '../core/output.js';
import { reportError } from '../core/errors.js';
import { makeScopeTest } from '../core/scope.js';
import { headCommit, isGitRepo } from '../core/git.js';
import { FactsSchema } from '../core/schema.js';
import { buildForFacts } from '../facts/build.js';
import { extractFacts } from '../facts/extract.js';
import { factsFromSources } from '../facts/fallback.js';
import { FACT_QUERIES, loadFacts, runFactQuery, type FactQuery } from '../facts/query.js';
import { extractXref, type Xref } from '../facts/xref.js';
import type { Facts } from '../types/index.js';

/**
 * Compile (into `.hex/.cache`) and extract exact facts; fall back to the parser
 * when the build fails. Exported for `hex diff` (base-commit worktrees).
 */
export function computeFacts(
  config: Config,
  projectDir: string,
  cacheDir: string,
  opts: { commit?: string } = {},
): Facts {
  return computeFactsAndXref(config, projectDir, cacheDir, opts).facts;
}

/**
 * Facts plus the navigation index (`xref.json`: declarations and every
 * reference to them) from the same build. No index under the parser fallback.
 */
export function computeFactsAndXref(
  config: Config,
  projectDir: string,
  cacheDir: string,
  opts: { commit?: string } = {},
): { facts: Facts; xref: Xref | null } {
  const inScope = makeScopeTest(config);
  const scope = config.project.scope;
  const build = buildForFacts(projectDir, cacheDir, {
    includeScripts: scope.some((f) => f.endsWith('.s.sol') || f.startsWith('script/')),
    includeTests: scope.some((f) => f.endsWith('.t.sol')),
  });
  if (!build.error && build.toolchain) {
    return {
      facts: extractFacts(build.buildInfos, {
        inScope,
        commit: opts.commit,
        toolchain: build.toolchain,
      }),
      xref: extractXref(build.buildInfos, { inScope, commit: opts.commit }),
    };
  }
  const sources = new Map<string, string>();
  for (const f of scope) {
    const p = path.join(projectDir, f);
    if (fs.existsSync(p)) sources.set(f, fs.readFileSync(p, 'utf-8'));
  }
  return {
    facts: factsFromSources(sources, { inScope, commit: opts.commit, reason: build.error }),
    xref: null,
  };
}

const buildCmd = new Command('build')
  .description('Compile into .hex/.cache and write exact facts to .hex/facts.json (default)')
  .option('--project <dir>', 'Project directory')
  .action((opts: { project?: string }) => {
    try {
      const { config, outputDir } = loadProjectContext(opts.project ?? process.cwd());
      const projectDir = config.project.project_dir;
      const commit = isGitRepo(projectDir) ? (headCommit(projectDir) ?? undefined) : undefined;
      const { facts, xref } = computeFactsAndXref(
        config,
        projectDir,
        path.join(outputDir, '.cache'),
        { commit },
      );
      const parsed = FactsSchema.parse(facts);
      const out = writeJsonOutput(outputDir, 'facts.json', parsed);
      // The dashboard's code navigation; a stale index from an older build would mislead.
      if (xref) writeJsonOutput(outputDir, 'xref.json', xref);
      else fs.rmSync(path.join(outputDir, 'xref.json'), { force: true });

      const inScopeFns = parsed.functions.filter((f) => f.in_scope && f.kind !== 'modifier');
      const eps = Object.values(parsed.entry_points).flat().length;
      if (parsed.source === 'parser-fallback') {
        logger.warn(
          'Build failed; facts approximated by the parser (calls by name, layout without packing).',
        );
      }
      logger.success(
        `facts (${parsed.source}${parsed.compiler ? `, solc ${parsed.compiler.version.split('+')[0]}` : ''}): ` +
          `${parsed.contracts.filter((c) => c.in_scope).length} contracts, ${inScopeFns.length} functions, ${eps} entry points`,
      );
      for (const w of parsed.warnings.slice(0, 5)) logger.dim(`  ${w}`);
      if (parsed.warnings.length > 5)
        logger.dim(`  … ${parsed.warnings.length - 5} more warnings in facts.json`);
      logger.dim(`  ${out}`);
    } catch (err) {
      reportError(err);
      process.exit(1);
    }
  });

const queryCmd = new Command('query')
  .description(`Query exact facts: ${FACT_QUERIES.join(' | ')}`)
  .argument('<query>', FACT_QUERIES.join(' | '))
  .argument(
    '[ref]',
    'Function (`Vault.withdraw`, `Vault.withdraw(uint256)`, `withdraw`), state var, or contract',
  )
  .option('--transitive', 'callers / callees: follow the whole chain')
  .option('--project <dir>', 'Project directory')
  .action(
    (query: string, ref: string | undefined, opts: { transitive?: boolean; project?: string }) => {
      try {
        if (!(FACT_QUERIES as readonly string[]).includes(query)) {
          logger.error(`Unknown query "${query}". Use one of: ${FACT_QUERIES.join(', ')}`);
          process.exit(1);
        }
        const { outputDir } = loadProjectContext(opts.project ?? process.cwd());
        const facts = loadFacts(outputDir);
        if (!facts) {
          logger.error('No .hex/facts.json yet. Run `hex facts` (or `hex analyze`) first.');
          process.exit(1);
        }
        const result = runFactQuery(facts, query as FactQuery, ref, {
          transitive: opts.transitive,
        });
        console.log(JSON.stringify(result, null, 2));
      } catch (err) {
        reportError(err);
        process.exit(1);
      }
    },
  );

export const factsCommand = new Command('facts')
  .description(
    'Exact facts from the compiler AST: call graph, reads/writes, inheritance, storage layout',
  )
  .addCommand(buildCmd, { isDefault: true })
  .addCommand(queryCmd);
