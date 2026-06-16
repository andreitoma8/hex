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
} from '../core/issues.js';

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
  .requiredOption('--to <column>', 'Target column: potential | verified | rejected (alias: invalid) | duplicate')
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
  .requiredOption('--source <source>', 'manual | conformance | auditagent | github')
  .requiredOption('--title <title>', 'Issue title')
  .option(
    '--source-ref <ref>',
    'Origin record id (conformance item id, auditagent id, GitHub issue number)',
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
        const source = opts.source as 'manual' | 'conformance' | 'auditagent' | 'github';
        if (!['manual', 'conformance', 'auditagent', 'github'].includes(source)) {
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

export const issueCommand = new Command('issue')
  .description('Inspect and mutate issues on the board (new / move / patch / sync-set / show)')
  .addCommand(newCmd)
  .addCommand(moveCmd)
  .addCommand(patchCmd)
  .addCommand(syncSetCmd)
  .addCommand(showCmd);
