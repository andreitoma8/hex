import { Command } from 'commander';
import path from 'node:path';
import { logger } from '../core/logger.js';
import { loadProjectContext, type Config } from '../core/config.js';
import { writeJsonOutput, writeMarkdownOutput } from '../core/output.js';
import { HexError, reportError } from '../core/errors.js';
import {
  changedFiles,
  headCommit,
  isGitRepo,
  listFiles,
  numstat,
  resolveCommit,
  showFile,
  unifiedDiff,
} from '../core/git.js';
import { buildScopeModel, type FileModel } from '../analysis/code-model.js';
import {
  buildImpactIndex,
  computeImpact,
  diffCompilerLayouts,
  impactIndexFromFacts,
  diffModels,
  propagateLayoutChanges,
  summarize,
} from '../analysis/diff.js';
import { DiffSchema } from '../core/schema.js';
import { makeScopeTest } from '../core/scope.js';
import { withWorktree } from '../core/git.js';
import { loadFacts } from '../facts/query.js';
import { computeFacts } from './facts.js';
import type { Facts } from '../types/index.js';
import type { Diff } from '../types/index.js';

export interface DiffOptions {
  base?: string;
  head?: string;
  /** `.hex` dir; enables compiler facts (reuses facts.json for head, compiles base in a worktree). */
  outputDir?: string;
  /** Skip compiling the base commit (parser layout diff only). */
  noCompile?: boolean;
}

/**
 * Compiler facts for head (reused from facts.json when it matches) and base
 * (compiled in a throwaway worktree). Either may be null when the build fails.
 */
function factsForCommits(
  config: Config,
  outputDir: string,
  base: string,
  head: string,
  warnings: string[],
  noCompile: boolean,
): { baseFacts: Facts | null; headFacts: Facts | null } {
  const projectDir = config.project.project_dir;
  const cache = path.join(outputDir, '.cache');
  const exact = (f: Facts | null) => (f && f.source === 'solc-ast' ? f : null);

  let headFacts = exact(loadFacts(outputDir));
  if (headFacts && headFacts.commit !== head) headFacts = null;
  if (!headFacts && !noCompile) {
    try {
      headFacts = exact(
        headCommit(projectDir) === head
          ? computeFacts(config, projectDir, cache, { commit: head })
          : withWorktree(projectDir, head, cache, (wt) =>
              computeFacts(config, wt, path.join(cache, 'wt-head'), { commit: head }),
            ),
      );
    } catch (err) {
      warnings.push(
        `Could not compile the head commit: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
  let baseFacts: Facts | null = null;
  if (!noCompile) {
    try {
      baseFacts = exact(
        withWorktree(projectDir, base, cache, (wt) =>
          computeFacts(config, wt, path.join(cache, 'wt-base'), { commit: base }),
        ),
      );
    } catch (err) {
      warnings.push(
        `Could not compile the base commit: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
  if (!headFacts || !baseFacts) {
    warnings.push(
      'Storage layout and impact use the parser for at least one commit (the compiler build was unavailable); slot positions are inferred from declaration order.',
    );
  }
  return { baseFacts, headFacts };
}

/** Compute `diff.json` for a project (pure aside from git reads). */
export function computeProjectDiff(
  config: Config,
  opts: DiffOptions = {},
): { diff: Diff; patch: string } {
  const projectDir = config.project.project_dir;
  const baseRef = opts.base ?? config.project.diff?.base_commit;
  if (!baseRef) throw new HexError('diff.not-diff-mode');
  if (!isGitRepo(projectDir)) throw new HexError('diff.not-git', `path: ${projectDir}`);

  const headRef =
    opts.head ??
    (config.project.commit && config.project.commit !== 'unknown' ? config.project.commit : 'HEAD');
  const base = resolveCommit(projectDir, baseRef);
  const head = resolveCommit(projectDir, headRef);

  const warnings: string[] = [];
  const wt = headCommit(projectDir);
  if (wt && wt !== head) {
    warnings.push(
      `The working tree is at ${wt.slice(0, 8)}, not the head commit ${head.slice(0, 8)}. ` +
        'Other Hex analyses read the working tree; check out the head commit for consistent results.',
    );
  }

  const inScope = makeScopeTest(config);
  const changed = changedFiles(projectDir, base, head).filter(
    (f) => inScope(f.path) || (f.old_path !== undefined && inScope(f.old_path)),
  );
  const counts = numstat(projectDir, base, head);

  // Base / head sources of the changed files.
  const baseSources = new Map<string, string>();
  const headChangedSources = new Map<string, string>();
  for (const f of changed) {
    if (f.status !== 'added') {
      const src = showFile(projectDir, base, f.old_path ?? f.path);
      // Key the base side by the head path so renamed files line up.
      if (src !== null) baseSources.set(f.path, src);
    }
    if (f.status !== 'deleted') {
      const src = showFile(projectDir, head, f.path);
      if (src !== null) headChangedSources.set(f.path, src);
    }
  }

  // Head sources of the whole scope (for the call graph and state coupling).
  const headScopeSources = new Map<string, string>();
  for (const p of listFiles(projectDir, head)) {
    if (!inScope(p)) continue;
    const src = showFile(projectDir, head, p);
    if (src !== null) headScopeSources.set(p, src);
  }

  const baseModels = buildScopeModel(baseSources);
  const headScopeModels = buildScopeModel(headScopeSources);
  const headChangedModels: FileModel[] = headScopeModels.filter((m) =>
    headChangedSources.has(m.file),
  );
  // A changed file that is somehow outside the head scope listing still gets diffed.
  for (const [p, src] of headChangedSources) {
    if (!headScopeSources.has(p)) headChangedModels.push(...buildScopeModel(new Map([[p, src]])));
  }

  for (const m of [...baseModels, ...headScopeModels]) {
    if (m.parseError) warnings.push(`Could not parse ${m.file}: ${m.parseError}`);
  }

  const { changes, layout } = diffModels(baseModels, headChangedModels);
  const { baseFacts, headFacts } = opts.outputDir
    ? factsForCommits(config, opts.outputDir, base, head, warnings, Boolean(opts.noCompile))
    : { baseFacts: null, headFacts: null };
  const index = headFacts ? impactIndexFromFacts(headFacts) : buildImpactIndex(headScopeModels);
  const impacted = computeImpact(index, changes);
  const storage =
    baseFacts &&
    headFacts &&
    baseFacts.layout_source === 'compiler' &&
    headFacts.layout_source === 'compiler'
      ? diffCompilerLayouts(baseFacts, headFacts)
      : propagateLayoutChanges(layout, index.contracts);

  const files = changed
    .map((f) => ({
      path: f.path,
      status: f.status,
      ...(f.old_path ? { old_path: f.old_path } : {}),
      additions: counts.get(f.path)?.additions ?? 0,
      deletions: counts.get(f.path)?.deletions ?? 0,
    }))
    .sort((a, b) => a.path.localeCompare(b.path));

  const diff: Diff = {
    generated_at: new Date().toISOString(),
    base_commit: base,
    head_commit: head,
    analysis: headFacts ? 'compiler' : 'parser',
    layout_analysis: baseFacts && headFacts ? 'compiler' : 'declaration-order',
    warnings,
    files,
    changes,
    storage_layout_changes: storage,
    impacted,
    summary: summarize(files, changes, storage, impacted),
  };

  const parsed = DiffSchema.safeParse(diff);
  if (!parsed.success) {
    throw new Error(
      `diff.json failed validation:\n${parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n')}`,
    );
  }

  const patchPaths = [
    ...new Set(changed.flatMap((f) => (f.old_path ? [f.old_path, f.path] : [f.path]))),
  ];
  const patch = unifiedDiff(projectDir, base, head, patchPaths);
  return { diff: parsed.data, patch };
}

/**
 * Files a differential /ai-audit scan should read: every changed (non-deleted)
 * in-scope file plus every file holding an impacted function, in scope order.
 */
export function scanFiles(config: Config, diff: Diff): string[] {
  const set = new Set<string>();
  for (const f of diff.files) if (f.status !== 'deleted') set.add(f.path);
  for (const i of diff.impacted) if (i.file) set.add(i.file);
  const order = config.project.scope;
  const inOrder = order.filter((p) => set.has(p));
  const rest = [...set].filter((p) => !order.includes(p)).sort();
  return [...inOrder, ...rest];
}

const PATCH_LINE_CAP = 4000;

/** The agents' focus brief for a differential /ai-audit scan (markdown). */
export function focusBrief(diff: Diff, patch: string): string {
  const b = diff.base_commit.slice(0, 8);
  const h = diff.head_commit.slice(0, 8);
  const out: string[] = [];
  out.push('# Differential audit — focus', '');
  out.push(
    `This scan is a differential audit of \`${b}\` → \`${h}\`. The source in this bundle is the head version of the files that hold changed or impacted code. The code at \`${b}\` was audited before.`,
    '',
    '**Where your effort goes.** Spend your reading time on the code this change touched and the flows that pass through it: the changed entities first, then the impacted functions. Unchanged code is context.',
    '',
    '**What you report.** A bug in changed code, or a bug that the change makes reachable, exploitable or worse, is in scope. A bug that sits entirely in unchanged code and is reached only through unchanged paths was in scope of the previous audit: report it only when the change affects it, and say how.',
    '',
  );

  const changed = diff.changes.filter((c) => c.change !== 'comments_only');
  out.push('## Changed', '');
  if (changed.length === 0) out.push('_No code changes (comments or formatting only)._');
  for (const c of changed) {
    const where = c.kind === 'contract' ? `\`${c.entity}\`` : `\`${c.contract}.${c.entity}\``;
    out.push(`- ${where} — ${c.kind.replace('_', ' ')} ${c.change} · ${c.file}`);
  }
  out.push('');

  if (diff.storage_layout_changes.length > 0) {
    out.push('## Storage layout changes', '');
    for (const l of diff.storage_layout_changes)
      out.push(`- \`${l.contract}\` (${l.kind.replace(/_/g, ' ')}): ${l.detail}`);
    out.push('');
  }

  const impacted = diff.impacted.filter((i) => i.depth > 0);
  out.push('## Impacted (not changed)', '');
  if (impacted.length === 0) out.push('_None beyond the changed code._');
  for (const i of impacted) {
    const reasons = i.reasons.map((r) => `${r.kind.replace('_', ' ')} \`${r.via}\``).join('; ');
    const tag = i.is_entry_point ? 'entry point · ' : '';
    out.push(
      `- \`${i.contract}.${i.function}\` — ${tag}depth ${i.depth} · ${reasons} (${i.confidence})`,
    );
  }
  out.push('');

  const lines = patch.split('\n');
  out.push('## Patch', '');
  if (lines.length > PATCH_LINE_CAP) {
    out.push(
      `_The patch has ${lines.length} lines; the first ${PATCH_LINE_CAP} are below. Read \`.hex/diff/changes.patch\` for the rest._`,
      '',
    );
  }
  out.push('```diff', lines.slice(0, PATCH_LINE_CAP).join('\n').trimEnd(), '```', '');
  return out.join('\n');
}

export const diffCommand = new Command('diff')
  .description(
    'Differential audit: changed entities between base and head, and the flows they impact',
  )
  .option('--base <commit>', 'Base commit (default: config project.diff.base_commit)')
  .option('--head <commit>', 'Head commit (default: config project.commit)')
  .option('--project <dir>', 'Project directory')
  .option('--focus <file>', "Also write the /ai-audit agents' focus brief (markdown) to <file>")
  .option(
    '--scan-files',
    'Print only the files a differential /ai-audit scan reads, space separated',
  )
  .option('--no-compile', 'Do not compile the base commit (parser-only layout diff; faster)')
  .action(
    (opts: {
      base?: string;
      head?: string;
      project?: string;
      focus?: string;
      scanFiles?: boolean;
      compile?: boolean;
    }) => {
      try {
        const { config, outputDir } = loadProjectContext(opts.project ?? process.cwd());
        const { diff, patch } = computeProjectDiff(config, {
          base: opts.base,
          head: opts.head,
          outputDir,
          noCompile: opts.compile === false,
        });
        const out = writeJsonOutput(outputDir, 'diff.json', diff);
        writeMarkdownOutput(path.join(outputDir, 'diff'), 'changes.patch', patch);
        if (opts.focus) {
          const target = path.resolve(opts.focus);
          writeMarkdownOutput(path.dirname(target), path.basename(target), focusBrief(diff, patch));
        }
        if (opts.scanFiles) {
          for (const w of diff.warnings) process.stderr.write(`warning: ${w}\n`);
          console.log(scanFiles(config, diff).join(' '));
          return;
        }

        for (const w of diff.warnings) logger.warn(w);
        const s = diff.summary;
        logger.success(
          `${diff.base_commit.slice(0, 8)} → ${diff.head_commit.slice(0, 8)}: ${s.files_changed} file(s), +${s.additions}/-${s.deletions}`,
        );
        logger.dim(
          `  functions: ${s.functions_added} added, ${s.functions_modified} modified, ${s.functions_removed} removed`,
        );
        logger.dim(
          `  impact: ${s.impacted_functions} impacted function(s), ${s.impacted_entry_points} entry point(s)`,
        );
        if (s.storage_layout_changes > 0) {
          logger.warn(
            `  ${s.storage_layout_changes} storage layout change(s) — see storage_layout_changes`,
          );
        }
        logger.dim(`  ${out}`);
        if (opts.focus) logger.dim(`  focus brief: ${opts.focus}`);
      } catch (err) {
        reportError(err);
        process.exit(1);
      }
    },
  );
