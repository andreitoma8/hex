import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import { logger } from '../core/logger.js';
import { loadProjectContext } from '../core/config.js';
import { reportError } from '../core/errors.js';
import {
  moveIssue,
  patchIssue,
  createIssue,
  markSynced,
  type BoardColumn,
  type Severity,
  type Resolution,
  type GithubLink,
  type SyncFields,
  COLUMN_TO_STATUS,
  ISSUE_SOURCES,
  recordValidation,
  revertAutoMove,
  type IssueSource,
  type Verdict,
} from '../core/issues.js';
import { dedupCandidates, excludeByRule, markDuplicate, type MatchSignals } from '../core/dedup.js';
import { readRules } from '../core/rules.js';

function readFileTrim(p: string): string {
  return fs.readFileSync(path.resolve(p), 'utf-8').trim();
}

/** Commander collector for repeatable options (e.g. --file a --file b). */
function collect(value: string, previous: string[]): string[] {
  return previous.concat([value]);
}

function resolveOutputDir(opts: { project?: string }): string {
  return loadProjectContext(opts.project ?? process.cwd()).outputDir;
}

const moveCmd = new Command('move')
  .description('Move an issue between board columns (potential | verified | rejected | duplicate)')
  .argument('<id>', 'Issue id (e.g. H-001)')
  .requiredOption(
    '--to <column>',
    'Target column: potential | verified | rejected (alias: invalid) | duplicate',
  )
  .option('--duplicate-of <id>', 'When moving to duplicate, the canonical issue this duplicates')
  .option('--project <dir>', 'Project directory')
  .action((id: string, opts: { to: string; duplicateOf?: string; project?: string }) => {
    try {
      const column = opts.to as BoardColumn;
      if (!(column in COLUMN_TO_STATUS)) {
        logger.error(
          `Invalid --to: ${opts.to}. Use one of: ${Object.keys(COLUMN_TO_STATUS).join(', ')}`,
        );
        process.exit(1);
      }
      const outputDir = resolveOutputDir(opts);
      const entry = moveIssue(outputDir, id, column, opts.duplicateOf);
      logger.success(
        `${id} → ${column} (status: ${entry.status})${opts.duplicateOf ? ` [dup of ${opts.duplicateOf}]` : ''}`,
      );
    } catch (err) {
      reportError(err);
      process.exit(1);
    }
  });

const patchCmd = new Command('patch')
  .description('Edit fields on an issue (materializes a findings.json entry if needed)')
  .argument('<id>', 'Issue id')
  .option('--title <title>', 'New title')
  .option('--severity <severity>', 'Critical | High | Medium | Low | Info')
  .option('--resolution <resolution>', 'Fixed | Mitigated | Acknowledged | Not Fixed | Unresolved')
  .option('--description-file <path>', 'Read the description from this file')
  .option('--recommendation-file <path>', 'Read the recommendation from this file')
  .option('--update-from-client <text>', 'Client update text')
  .option('--notes <text>', 'Tracking notes')
  .option('--file <path>', 'Affected file path (repeatable; sets the File(s) line)', collect, [])
  .option('--project <dir>', 'Project directory')
  .action(
    (
      id: string,
      opts: {
        title?: string;
        severity?: string;
        resolution?: string;
        descriptionFile?: string;
        recommendationFile?: string;
        updateFromClient?: string;
        notes?: string;
        file?: string[];
        project?: string;
      },
    ) => {
      try {
        const updates: Record<string, unknown> = {};
        if (opts.title != null) updates.title = opts.title;
        if (opts.severity != null) updates.severity = opts.severity;
        if (opts.resolution != null) updates.resolution = opts.resolution;
        if (opts.updateFromClient != null) updates.update_from_client = opts.updateFromClient;
        if (opts.notes != null) updates.notes = opts.notes;
        if (opts.file != null && opts.file.length > 0) updates.files = opts.file;
        if (opts.descriptionFile != null) {
          updates.description = fs.readFileSync(path.resolve(opts.descriptionFile), 'utf-8').trim();
        }
        if (opts.recommendationFile != null) {
          updates.recommendation = fs
            .readFileSync(path.resolve(opts.recommendationFile), 'utf-8')
            .trim();
        }
        if (Object.keys(updates).length === 0) {
          logger.error(
            'Nothing to patch. Pass at least one of --title/--severity/--resolution/--description-file/--recommendation-file/--update-from-client/--notes/--file.',
          );
          process.exit(1);
        }
        const outputDir = resolveOutputDir(opts);
        const updated = patchIssue(outputDir, id, updates);
        logger.success(`Patched ${id} (${Object.keys(updates).join(', ')})`);
        logger.dim(`severity=${updated.severity}  resolution=${updated.resolution ?? '(none)'}`);
      } catch (err) {
        reportError(err);
        process.exit(1);
      }
    },
  );

const showCmd = new Command('show')
  .description('Print the merged finding + tracking record for an issue id')
  .argument('<id>', 'Issue id')
  .option('--project <dir>', 'Project directory')
  .action((id: string, opts: { project?: string }) => {
    try {
      const outputDir = resolveOutputDir(opts);
      const findings = JSON.parse(
        fs.readFileSync(path.join(outputDir, 'findings.json'), 'utf-8'),
      ) as { findings: Array<{ id: string }> };
      const tracking = (() => {
        try {
          return JSON.parse(fs.readFileSync(path.join(outputDir, 'tracking.json'), 'utf-8')) as {
            findings: Array<{ id: string }>;
          };
        } catch {
          return { findings: [] as Array<{ id: string }> };
        }
      })();
      const finding = findings.findings.find((f) => f.id === id) ?? null;
      const track = tracking.findings.find((t) => t.id === id) ?? null;
      if (!finding && !track) {
        logger.error(`No issue with id ${id} in findings.json or tracking.json`);
        process.exit(1);
      }
      console.log(JSON.stringify({ id, finding, tracking: track }, null, 2));
    } catch (err) {
      reportError(err);
      process.exit(1);
    }
  });

const newCmd = new Command('new')
  .description('Create a new issue with a uniform H-NNN id and print it')
  .requiredOption('--source <source>', ISSUE_SOURCES.join(' | '))
  .requiredOption('--title <title>', 'Issue title')
  .option(
    '--source-ref <ref>',
    'Origin record id (conformance item id, auditagent / ai-audit id, GitHub issue number, prior-audit finding id)',
  )
  .option('--severity <severity>', 'Critical | High | Medium | Low | Info')
  .option('--file <path>', 'Affected file path (repeatable; sets the File(s) line)', collect, [])
  .option('--project <dir>', 'Project directory')
  .action(
    (opts: {
      source: string;
      title: string;
      sourceRef?: string;
      severity?: string;
      file?: string[];
      project?: string;
    }) => {
      try {
        const source = opts.source as IssueSource;
        if (!ISSUE_SOURCES.includes(source)) {
          logger.error(`Invalid --source: ${opts.source}`);
          process.exit(1);
        }
        const outputDir = resolveOutputDir(opts);
        const id = createIssue(outputDir, {
          source,
          source_ref: opts.sourceRef ?? null,
          title: opts.title,
          severity: opts.severity as Severity | undefined,
          files: opts.file && opts.file.length > 0 ? opts.file : undefined,
        });
        // Print the bare id on stdout so skills can capture it.
        console.log(id);
      } catch (err) {
        reportError(err);
        process.exit(1);
      }
    },
  );

const syncSetCmd = new Command('sync-set')
  .description('Mark an issue synced to GitHub (only /sync-issues should call this)')
  .argument('<id>', 'Local issue id (H-NNN)')
  .requiredOption('--issue-number <n>', 'GitHub issue number')
  .requiredOption('--issue-url <url>', 'GitHub issue URL')
  .option('--state <state>', 'open | closed', 'open')
  .option('--title <title>', 'Title from GitHub')
  .option('--severity <severity>', 'Severity from GitHub')
  .option('--resolution <resolution>', 'Status/resolution from GitHub')
  .option('--description-file <path>', 'Description body from GitHub')
  .option('--recommendation-file <path>', 'Recommendation body from GitHub')
  .option('--update-from-client-file <path>', 'Client update body from GitHub')
  .option('--project <dir>', 'Project directory')
  .action(
    (
      id: string,
      opts: {
        issueNumber: string;
        issueUrl: string;
        state?: string;
        title?: string;
        severity?: string;
        resolution?: string;
        descriptionFile?: string;
        recommendationFile?: string;
        updateFromClientFile?: string;
        project?: string;
      },
    ) => {
      try {
        const outputDir = resolveOutputDir(opts);
        const github: GithubLink = {
          issue_number: parseInt(opts.issueNumber, 10),
          issue_url: opts.issueUrl,
          state: opts.state === 'closed' ? 'closed' : 'open',
          last_synced_at: new Date().toISOString(),
          sync_status: 'in_sync',
          comments: [],
        };
        const fields: SyncFields = {};
        if (opts.title != null) fields.title = opts.title;
        if (opts.severity != null) fields.severity = opts.severity as Severity;
        if (opts.resolution != null) fields.resolution = opts.resolution as Resolution;
        if (opts.descriptionFile != null) fields.description = readFileTrim(opts.descriptionFile);
        if (opts.recommendationFile != null)
          fields.recommendation = readFileTrim(opts.recommendationFile);
        if (opts.updateFromClientFile != null)
          fields.update_from_client = readFileTrim(opts.updateFromClientFile);

        markSynced(outputDir, id, github, fields);
        logger.success(`${id} synced to GitHub issue #${github.issue_number} (locked)`);
      } catch (err) {
        reportError(err);
        process.exit(1);
      }
    },
  );

const validationCmd = new Command('validation')
  .description('Record a validation verdict, memo and PoC result on a card')
  .argument('<id>', 'Issue id')
  .requiredOption('--verdict <verdict>', 'reproduced | refuted | uncertain | valid_no_poc')
  .option('--by <who>', 'auditor | agent', 'auditor')
  .option('--memo <path>', 'Validation memo path (e.g. .hex/validations/H-012_memo.md)')
  .option('--poc <path>', 'PoC test file')
  .option('--poc-status <status>', 'passing | failing | not_started')
  .option('--refuters <n>', 'Independent refuter agents that agreed (auto-reject needs 2)')
  .option('--reality-gate', 'The finding passed the reality gate (true and security-relevant)')
  .option(
    '--auto-move',
    'Agent only: move the card when the verdict is conclusive (see autoMoveTarget)',
  )
  .option('--project <dir>', 'Project directory')
  .action(
    (
      id: string,
      opts: {
        verdict: string;
        by: string;
        memo?: string;
        poc?: string;
        pocStatus?: string;
        refuters?: string;
        realityGate?: boolean;
        autoMove?: boolean;
        project?: string;
      },
    ) => {
      try {
        const verdicts = ['reproduced', 'refuted', 'uncertain', 'valid_no_poc'];
        if (!verdicts.includes(opts.verdict))
          throw new Error(`--verdict must be one of ${verdicts.join(', ')}`);
        if (opts.by !== 'auditor' && opts.by !== 'agent')
          throw new Error('--by must be auditor or agent');
        const outputDir = resolveOutputDir(opts);
        const { movedTo } = recordValidation(
          outputDir,
          id,
          {
            verdict: opts.verdict as Verdict,
            validated_by: opts.by,
            memo: opts.memo,
            poc_file: opts.poc,
            poc_status: opts.pocStatus as 'passing' | 'failing' | 'not_started' | undefined,
            refuters: opts.refuters !== undefined ? parseInt(opts.refuters, 10) : undefined,
            reality_gate: opts.realityGate === true,
          },
          { autoMove: opts.autoMove },
        );
        logger.success(`${id}: ${opts.verdict}${movedTo ? ` → auto-moved to ${movedTo}` : ''}`);
      } catch (err) {
        reportError(err);
        process.exit(1);
      }
    },
  );

const revertAutoCmd = new Command('revert-auto')
  .description("Undo an agent's auto-move: back to Potential")
  .argument('<id>', 'Issue id')
  .option('--project <dir>', 'Project directory')
  .action((id: string, opts: { project?: string }) => {
    try {
      revertAutoMove(resolveOutputDir(opts), id);
      logger.success(`${id} → potential (auto-move reverted)`);
    } catch (err) {
      reportError(err);
      process.exit(1);
    }
  });

const dedupCmd = new Command('dedup')
  .description(
    'Rank cards that may duplicate <id> (exact function overlap first) and print the match rules',
  )
  .argument('<id>', 'Issue id')
  .option('--json', 'Machine-readable output')
  .option('--project <dir>', 'Project directory')
  .action((id: string, opts: { json?: boolean; project?: string }) => {
    try {
      const outputDir = resolveOutputDir(opts);
      const report = dedupCandidates(outputDir, id);
      const rules = readRules(outputDir);
      if (opts.json) {
        console.log(JSON.stringify({ ...report, triage_rules: rules }, null, 2));
        return;
      }
      console.log(`${id} touches: ${report.functions.join(', ') || '(no exact function found)'}`);
      if (report.candidates.length === 0) console.log('No candidates.');
      for (const c of report.candidates) {
        const sig = [
          c.same_function ? 'same function' : c.same_contract ? 'same contract' : '',
          `title ${c.title_similarity}`,
        ]
          .filter(Boolean)
          .join(', ');
        console.log(
          `  ${c.strength === 'strong' ? '●' : '○'} ${c.id} [${c.status}, ${c.source}] ${c.title} (${sig})`,
        );
      }
      console.log('\n' + report.rules);
      if (rules.length) {
        console.log('\nTriage rules (exclude with `hex issue exclude <id> --rule R-NNN`):');
        for (const r of rules) console.log(`  ${r.id} ${r.kind}: ${r.text}`);
      }
    } catch (err) {
      reportError(err);
      process.exit(1);
    }
  });

const markDuplicateCmd = new Command('mark-duplicate')
  .description('Move <id> to Duplicate of --of and record the match signals (one step)')
  .argument('<id>', 'Issue id that is the duplicate')
  .requiredOption('--of <canonical>', 'Canonical issue id')
  .requiredOption('--root-cause <v>', 'same | overlapping | different')
  .requiredOption('--attack-vector <v>', 'same | overlapping | different')
  .option('--same-contract', 'Contract matches')
  .option('--same-function', 'Function matches')
  .requiredOption('--reasoning <text>', 'One sentence: which signals carried the call')
  .option('--confidence <lvl>', 'high | medium | low', 'high')
  .option('--project <dir>', 'Project directory')
  .action(
    (
      id: string,
      opts: {
        of: string;
        rootCause: string;
        attackVector: string;
        sameContract?: boolean;
        sameFunction?: boolean;
        reasoning: string;
        confidence: string;
        project?: string;
      },
    ) => {
      try {
        const agree = ['same', 'overlapping', 'different'];
        if (!agree.includes(opts.rootCause) || !agree.includes(opts.attackVector)) {
          throw new Error('--root-cause/--attack-vector must be same | overlapping | different');
        }
        const signals: MatchSignals = {
          contract: opts.sameContract === true,
          function: opts.sameFunction === true,
          root_cause: opts.rootCause as MatchSignals['root_cause'],
          attack_vector: opts.attackVector as MatchSignals['attack_vector'],
        };
        markDuplicate(resolveOutputDir(opts), id, opts.of, {
          signals,
          reasoning: opts.reasoning,
          confidence: opts.confidence as 'high' | 'medium' | 'low',
        });
        logger.success(`${id} → duplicate of ${opts.of}`);
      } catch (err) {
        reportError(err);
        process.exit(1);
      }
    },
  );

const excludeCmd = new Command('exclude')
  .description('Reject <id> because a triage rule covers it (records the rule)')
  .argument('<id>', 'Issue id')
  .requiredOption('--rule <id>', 'Triage rule id (R-NNN)')
  .option('--project <dir>', 'Project directory')
  .action((id: string, opts: { rule: string; project?: string }) => {
    try {
      const outputDir = resolveOutputDir(opts);
      const rule = readRules(outputDir).find((r) => r.id === opts.rule);
      if (!rule) throw new Error(`No triage rule ${opts.rule}`);
      excludeByRule(outputDir, id, rule.id, rule.text);
      logger.success(`${id} → rejected (${rule.id})`);
    } catch (err) {
      reportError(err);
      process.exit(1);
    }
  });

export const issueCommand = new Command('issue')
  .description(
    'Inspect and mutate issues on the board (new / move / patch / show / validation / dedup / mark-duplicate / exclude / sync-set)',
  )
  .addCommand(newCmd)
  .addCommand(validationCmd)
  .addCommand(revertAutoCmd)
  .addCommand(dedupCmd)
  .addCommand(markDuplicateCmd)
  .addCommand(excludeCmd)
  .addCommand(moveCmd)
  .addCommand(patchCmd)
  .addCommand(syncSetCmd)
  .addCommand(showCmd);
