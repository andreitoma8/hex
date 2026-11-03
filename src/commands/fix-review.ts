import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { logger } from '../core/logger.js';
import { loadProjectContext, type Config } from '../core/config.js';
import { reportError } from '../core/errors.js';
import { resolveCommit, withWorktree } from '../core/git.js';
import { FixReviewSchema } from '../core/schema.js';
import { functionsForFinding } from '../core/dedup.js';
import {
  classifyCard,
  commitsForCard,
  findUnmappedChange,
  rewriteIssueBody,
  type PocResult,
} from '../core/fix-review.js';
import { loadFacts } from '../facts/query.js';
import { computeProjectDiff } from './diff.js';
import type { FixReview, FixReviewCard } from '../types/index.js';
import type { Severity } from '../core/issues.js';

interface FindingRec {
  id: string;
  title: string;
  severity: Severity;
  description?: string;
  root_cause?: { locations?: Array<{ file: string; snippet?: string }> };
  poc?: { status?: string; file?: string | null };
  github?: { issue_number?: number };
}
interface TrackingRec {
  id: string;
  status: string;
}

function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as T;
  } catch {
    return null;
  }
}

function gitLog(projectDir: string, from: string, to: string) {
  const out = execFileSync(
    'git',
    ['-C', projectDir, 'log', '--format=%H%x1f%s%x1f%b%x1e', `${from}..${to}`],
    {
      encoding: 'utf-8',
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  return out
    .split('\x1e')
    .map((r) => r.trim())
    .filter(Boolean)
    .map((r) => {
      const [sha, subject, body] = r.split('\x1f');
      return { sha, subject, body };
    });
}

/** Run one PoC test file with forge in `dir`; map the outcome to a PoC result. */
function runPoc(dir: string, file: string): PocResult {
  if (!fs.existsSync(path.join(dir, file))) return 'missing';
  const r = spawnSync('forge', ['test', '--match-path', file, '-vv'], {
    cwd: dir,
    encoding: 'utf-8',
    timeout: 15 * 60_000,
    maxBuffer: 64 * 1024 * 1024,
  });
  const text = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  if (/Compiler run failed|Error \(\d+\)|compilation failed/i.test(text)) return 'error';
  if (r.status === 0 && /\[PASS\]/.test(text)) return 'passing';
  if (/\[FAIL/.test(text)) return 'failing';
  return 'error';
}

export function computeFixReview(
  config: Config,
  outputDir: string,
  from: string,
  to: string,
  opts: { runPocs: boolean; compile: boolean },
): FixReview {
  const projectDir = config.project.project_dir;
  const { diff } = computeProjectDiff(config, {
    base: from,
    head: to,
    outputDir,
    noCompile: !opts.compile,
  });
  const facts = loadFacts(outputDir);
  const findings =
    readJson<{ findings: FindingRec[] }>(path.join(outputDir, 'findings.json'))?.findings ?? [];
  const tracking =
    readJson<{ findings: TrackingRec[] }>(path.join(outputDir, 'tracking.json'))?.findings ?? [];
  const reportable = new Set(
    tracking.filter((t) => t.status === 'verified' || t.status === 'synced').map((t) => t.id),
  );
  const cards = findings.filter((f) => reportable.has(f.id));

  const codeChanges = diff.changes.filter(
    (c) =>
      c.change !== 'comments_only' &&
      (c.kind === 'function' || c.kind === 'modifier' || c.kind === 'state_variable'),
  );
  const changedIds = new Set(codeChanges.map((c) => `${c.contract}.${c.entity}`));
  const removedIds = new Set(
    codeChanges.filter((c) => c.change === 'removed').map((c) => `${c.contract}.${c.entity}`),
  );
  const log = gitLog(projectDir, from, to);

  // PoC results at the fix commit, in one throwaway worktree. PoC files live in
  // the auditor's checkout (test/hex-pocs), so they are copied in first.
  const after = new Map<string, PocResult>();
  if (opts.runPocs) {
    const withPoc = cards.filter((c) => c.poc?.file);
    if (withPoc.length) {
      withWorktree(projectDir, to, path.join(outputDir, '.cache'), (wt) => {
        for (const c of withPoc) {
          const file = c.poc!.file!;
          const src = path.join(projectDir, file);
          if (!fs.existsSync(src)) {
            after.set(c.id, 'missing');
            continue;
          }
          fs.mkdirSync(path.dirname(path.join(wt, file)), { recursive: true });
          fs.copyFileSync(src, path.join(wt, file));
          logger.dim(`  PoC ${c.id}: forge test --match-path ${file}`);
          after.set(c.id, runPoc(wt, file));
        }
      });
    }
  }

  const mapped = new Set<string>();
  const out: FixReviewCard[] = cards.map((c) => {
    const fns = facts ? functionsForFinding(facts, c, projectDir) : [];
    const changed = fns.filter((f) => changedIds.has(f));
    for (const f of changed) mapped.add(f);
    const commits = commitsForCard(log, { id: c.id, github_issue: c.github?.issue_number });
    const before =
      c.poc?.status === 'passing'
        ? 'passing'
        : c.poc?.status === 'failing'
          ? 'failing'
          : c.poc?.file
            ? undefined
            : 'missing';
    const pocAfter = after.get(c.id);
    const { status, evidence } = classifyCard({
      pocBefore: before as PocResult | undefined,
      pocAfter,
      cardFunctions: fns,
      changedFunctions: changed,
      removedFunctions: fns.filter((f) => removedIds.has(f)),
      commits,
    });
    const proposed: FixReviewCard['proposed'] =
      status === 'fixed'
        ? { resolution: 'Fixed' }
        : status === 'not_fixed' || status === 'unaddressed'
          ? { resolution: 'Unresolved' }
          : {};
    return {
      id: c.id,
      title: c.title,
      severity: c.severity,
      ...(c.github?.issue_number ? { github_issue: c.github.issue_number } : {}),
      status,
      evidence,
      poc: {
        ...(c.poc?.file ? { file: c.poc.file } : {}),
        ...(before ? { before: before as PocResult } : {}),
        ...(pocAfter ? { after: pocAfter } : {}),
      },
      changed_functions: changed,
      commits,
      proposed,
    };
  });

  const unmapped = codeChanges
    .filter((c) => !mapped.has(`${c.contract}.${c.entity}`))
    .map((c) => ({
      contract: c.contract,
      entity: c.entity,
      kind: c.kind,
      change: c.change,
      file: c.file,
      // Head-side impact from the diff (the change may not exist in the audit-time facts).
      impacted_entry_points: [
        ...new Set(
          diff.impacted
            .filter(
              (i) =>
                i.is_entry_point &&
                (`${i.contract}.${i.function}` === `${c.contract}.${c.entity}` ||
                  i.reasons.some(
                    (r) =>
                      r.via === `${c.contract}.${c.entity}` || r.via.startsWith(`${c.entity} `),
                  )),
            )
            .map((i) => `${i.contract}.${i.function}`),
        ),
      ].sort(),
      reviewed: false,
    }));

  const count = (s: FixReviewCard['status']) => out.filter((c) => c.status === s).length;
  return FixReviewSchema.parse({
    generated_at: new Date().toISOString(),
    from_commit: diff.base_commit,
    to_commit: diff.head_commit,
    cards: out,
    unmapped_changes: unmapped,
    summary: {
      fixed: count('fixed'),
      partially_fixed: count('partially_fixed'),
      not_fixed: count('not_fixed'),
      unaddressed: count('unaddressed'),
      unknown: count('unknown'),
      unmapped: unmapped.length,
    },
  });
}

const fixReviewPath = (outputDir: string, sha: string) =>
  path.join(outputDir, 'fix-review', `${sha.slice(0, 12)}.json`);

/**
 * The saved review of a fix commit named the way people (and the skill) name it: a short or
 * full SHA, a branch or any other ref. Files are keyed by the first 12 characters of the full SHA.
 */
function savedFixReview(config: Config, outputDir: string, ref: string): string {
  let sha = ref;
  try {
    sha = resolveCommit(config.project.project_dir, ref);
  } catch {
    /* not resolvable here (e.g. a shallow clone): match the file name instead */
  }
  const exact = fixReviewPath(outputDir, sha);
  if (fs.existsSync(exact)) return exact;
  const dir = path.dirname(exact);
  const hits = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((f) => f.endsWith('.json') && f.startsWith(ref.slice(0, 12)))
    : [];
  if (hits.length === 1) return path.join(dir, hits[0]);
  throw new Error(`No fix review for ${ref} in ${dir}; run \`hex fix-review --to ${ref}\` first.`);
}

const runCmd = new Command('run')
  .description(
    'Map fix commits to cards, re-run PoCs at the fix commit, and flag unmapped changes (default)',
  )
  .option(
    '--from <commit>',
    'Audited commit (default: settings.report.initial_commit, else project.commit)',
  )
  .option('--to <commit>', 'Fix commit (default: HEAD)')
  .option('--no-poc', 'Do not re-run PoCs')
  .option('--no-compile', 'Do not compile either commit (parser-based diff)')
  .option('--project <dir>', 'Project directory')
  .action(
    (opts: { from?: string; to?: string; poc?: boolean; compile?: boolean; project?: string }) => {
      try {
        const { config, outputDir } = loadProjectContext(opts.project ?? process.cwd());
        const projectDir = config.project.project_dir;
        const report = (config.settings as { report?: { initial_commit?: string } }).report;
        const from = resolveCommit(
          projectDir,
          opts.from ?? report?.initial_commit ?? config.project.commit,
        );
        const to = resolveCommit(projectDir, opts.to ?? 'HEAD');
        const fr = computeFixReview(config, outputDir, from, to, {
          runPocs: opts.poc !== false,
          compile: opts.compile !== false,
        });
        const file = fixReviewPath(outputDir, to);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, JSON.stringify(fr, null, 2) + '\n', 'utf-8');
        const s = fr.summary;
        logger.success(
          `${from.slice(0, 8)} → ${to.slice(0, 8)}: ${s.fixed} fixed · ${s.not_fixed} not fixed · ${s.unknown} need judgement · ${s.unaddressed} unaddressed · ${s.unmapped} unmapped change(s)`,
        );
        logger.dim(`  ${file}`);
      } catch (err) {
        reportError(err);
        process.exit(1);
      }
    },
  );

/**
 * Apply the proposals (Status + Update from the client) to the GitHub issues.
 * Outward-facing: the /fix-review skill shows the batch and gets one explicit
 * confirmation before calling this. Only the two fields change.
 */
const applyCmd = new Command('apply')
  .description(
    'Write proposed Status / Update-from-the-client to the GitHub issues (after confirmation)',
  )
  .argument('<sha>', 'Fix commit (as in .hex/fix-review/<sha>.json)')
  .option('--only <ids...>', 'Only these cards')
  .option('--dry-run', 'Print the new bodies instead of editing')
  .option('--project <dir>', 'Project directory')
  .action((sha: string, opts: { only?: string[]; dryRun?: boolean; project?: string }) => {
    try {
      const { config, outputDir } = loadProjectContext(opts.project ?? process.cwd());
      const repo = config.settings.github?.repo;
      if (!repo)
        throw new Error('settings.github.repo is not set; fix review edits GitHub issues.');
      const file = savedFixReview(config, outputDir, sha);
      const fr = FixReviewSchema.parse(JSON.parse(fs.readFileSync(file, 'utf-8')));
      let edited = 0;
      for (const card of fr.cards) {
        if (opts.only && !opts.only.includes(card.id)) continue;
        if (!card.github_issue || (!card.proposed.resolution && !card.proposed.update_from_client))
          continue;
        const body = execFileSync(
          'gh',
          [
            'issue',
            'view',
            String(card.github_issue),
            '--repo',
            repo,
            '--json',
            'body',
            '--jq',
            '.body',
          ],
          {
            encoding: 'utf-8',
          },
        ).replace(/\n$/, '');
        const next = rewriteIssueBody(body, {
          status: card.proposed.resolution,
          update: card.proposed.update_from_client,
        });
        if (next === body) continue;
        if (opts.dryRun) {
          console.log(`── #${card.github_issue} (${card.id})\n${next}\n`);
          continue;
        }
        const tmp = path.join(outputDir, '.cache', `issue-${card.github_issue}.md`);
        fs.mkdirSync(path.dirname(tmp), { recursive: true });
        fs.writeFileSync(tmp, next, 'utf-8');
        execFileSync(
          'gh',
          ['issue', 'edit', String(card.github_issue), '--repo', repo, '--body-file', tmp],
          { stdio: 'inherit' },
        );
        fs.rmSync(tmp, { force: true });
        card.applied_at = new Date().toISOString();
        edited++;
      }
      if (!opts.dryRun) {
        fs.writeFileSync(file, JSON.stringify(fr, null, 2) + '\n', 'utf-8');
        logger.success(`Edited ${edited} GitHub issue(s). Run /sync-issues to pull them back.`);
      }
    } catch (err) {
      reportError(err);
      process.exit(1);
    }
  });

const proposeCmd = new Command('propose')
  .description('Set the proposed resolution / client update for a card (used by /fix-review)')
  .argument('<sha>', 'Fix commit')
  .argument('<id>', 'Card id')
  .option('--status <s>', 'fixed | partially_fixed | not_fixed | unaddressed | unknown')
  .option('--resolution <r>', 'Fixed | Mitigated | Acknowledged | Not Fixed | Unresolved')
  .option('--update-file <path>', 'Text for "Update from the client"')
  .option('--evidence <text>', 'Why (one or two sentences)')
  .option('--project <dir>', 'Project directory')
  .action(
    (
      sha: string,
      id: string,
      opts: {
        status?: string;
        resolution?: string;
        updateFile?: string;
        evidence?: string;
        project?: string;
      },
    ) => {
      try {
        const { config, outputDir } = loadProjectContext(opts.project ?? process.cwd());
        const file = savedFixReview(config, outputDir, sha);
        const fr = FixReviewSchema.parse(JSON.parse(fs.readFileSync(file, 'utf-8')));
        const card = fr.cards.find((c) => c.id === id);
        if (!card) throw new Error(`${id} is not in ${file}`);
        if (opts.status) card.status = opts.status as FixReviewCard['status'];
        if (opts.evidence) card.evidence = opts.evidence;
        if (opts.resolution)
          card.proposed.resolution = opts.resolution as FixReviewCard['proposed']['resolution'];
        if (opts.updateFile)
          card.proposed.update_from_client = fs
            .readFileSync(path.resolve(opts.updateFile), 'utf-8')
            .trim();
        const count = (s: FixReviewCard['status']) => fr.cards.filter((c) => c.status === s).length;
        fr.summary = {
          ...fr.summary,
          fixed: count('fixed'),
          partially_fixed: count('partially_fixed'),
          not_fixed: count('not_fixed'),
          unaddressed: count('unaddressed'),
          unknown: count('unknown'),
        };
        fs.writeFileSync(file, JSON.stringify(FixReviewSchema.parse(fr), null, 2) + '\n', 'utf-8');
        logger.success(
          `${id}: ${card.status}${card.proposed.resolution ? ` → ${card.proposed.resolution}` : ''}`,
        );
      } catch (err) {
        reportError(err);
        process.exit(1);
      }
    },
  );

const reviewedCmd = new Command('reviewed')
  .description('Record the review of an unmapped change (used by /fix-review)')
  .argument('<sha>', 'Fix commit')
  .argument('<ref>', 'Contract.function, with or without the signature')
  .requiredOption('--note <text>', 'The verdict in one or two sentences, with any card filed')
  .option('--project <dir>', 'Project directory')
  .action((sha: string, ref: string, opts: { note: string; project?: string }) => {
    try {
      const { config, outputDir } = loadProjectContext(opts.project ?? process.cwd());
      const file = savedFixReview(config, outputDir, sha);
      const fr = FixReviewSchema.parse(JSON.parse(fs.readFileSync(file, 'utf-8')));
      const u = fr.unmapped_changes[findUnmappedChange(fr.unmapped_changes, ref)];
      u.reviewed = true;
      u.note = opts.note.trim();
      fs.writeFileSync(file, JSON.stringify(FixReviewSchema.parse(fr), null, 2) + '\n', 'utf-8');
      logger.success(`${u.contract}.${u.entity}: reviewed`);
    } catch (err) {
      reportError(err);
      process.exit(1);
    }
  });

export const fixReviewCommand = new Command('fix-review')
  .description('Fix review: which issues the client fixed, with PoCs re-run at the fix commit')
  .addCommand(runCmd, { isDefault: true })
  .addCommand(proposeCmd)
  .addCommand(reviewedCmd)
  .addCommand(applyCmd);
