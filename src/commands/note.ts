import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import { logger } from '../core/logger.js';
import { loadProjectContext } from '../core/config.js';
import { reportError } from '../core/errors.js';
import {
  readNote,
  writeNote,
  appendNote,
  readNotesIndex,
  setActiveContract,
  createSession,
  latestUnprocessedSession,
  markSessionProcessed,
  readContractNote,
  writeContractNote,
  setMarkedDone,
  addLeadIdempotent,
  resolveNoteTarget,
  type ContractNote,
} from '../core/notes.js';
import { recomputeReview } from '../core/review.js';
import { commentsForFile, commentsMarkdown, readComments } from '../core/comments.js';

function resolveOutputDir(opts: { project?: string }): string {
  return loadProjectContext(opts.project ?? process.cwd()).outputDir;
}

function readFileTrim(p: string): string {
  return fs.readFileSync(path.resolve(p), 'utf-8').trim();
}

const readCmd = new Command('read')
  .description('Print a note doc (target: "general" or a contract name)')
  .argument('<target>', '"general" or a contract name')
  .option('--project <dir>', 'Project directory')
  .action((target: string, opts: { project?: string }) => {
    try {
      process.stdout.write(readNote(resolveOutputDir(opts), target));
    } catch (err) {
      reportError(err);
      process.exit(1);
    }
  });

const writeCmd = new Command('write')
  .description('Replace a note doc with the contents of a file')
  .argument('<target>', '"general" or a contract name')
  .requiredOption('--body-file <path>', 'Read the note body from this file')
  .option('--project <dir>', 'Project directory')
  .action((target: string, opts: { bodyFile: string; project?: string }) => {
    try {
      writeNote(resolveOutputDir(opts), target, readFileTrim(opts.bodyFile));
      logger.success(`Wrote note: ${target}`);
    } catch (err) {
      reportError(err);
      process.exit(1);
    }
  });

const appendCmd = new Command('append')
  .description('Append a block to a note doc (Diane accretes notes this way)')
  .argument('<target>', '"general" or a contract name')
  .requiredOption('--body-file <path>', 'Read the block to append from this file')
  .option('--project <dir>', 'Project directory')
  .action((target: string, opts: { bodyFile: string; project?: string }) => {
    try {
      appendNote(resolveOutputDir(opts), target, readFileTrim(opts.bodyFile));
      logger.success(`Appended to note: ${target}`);
    } catch (err) {
      reportError(err);
      process.exit(1);
    }
  });

const listCmd = new Command('list')
  .description('Print the notes index (active contract, contracts, sessions) as JSON')
  .option('--project <dir>', 'Project directory')
  .action((opts: { project?: string }) => {
    try {
      console.log(JSON.stringify(readNotesIndex(resolveOutputDir(opts)), null, 2));
    } catch (err) {
      reportError(err);
      process.exit(1);
    }
  });

const activeCmd = new Command('active')
  .description('Set the active contract (the one being narrated)')
  .argument('<name>', 'Contract name')
  .option('--project <dir>', 'Project directory')
  .action((name: string, opts: { project?: string }) => {
    try {
      setActiveContract(resolveOutputDir(opts), name);
      logger.success(`Active contract → ${name}`);
    } catch (err) {
      reportError(err);
      process.exit(1);
    }
  });

// ─── structured contract note (Diane v2) ───────────────────────────

const showCmd = new Command('show')
  .description("Print a contract's structured note (Leads / Description / Questions) as JSON")
  .argument('<contract>', 'Contract name (e.g. Vault.sol)')
  .option('--project <dir>', 'Project directory')
  .action((contract: string, opts: { project?: string }) => {
    try {
      // `Vault` and `Vault.sol` are the same note: resolve like `note lead` does.
      const outputDir = resolveOutputDir(opts);
      const note = readContractNote(outputDir, resolveNoteTarget(outputDir, contract));
      console.log(JSON.stringify(note, null, 2));
    } catch (err) {
      reportError(err);
      process.exit(1);
    }
  });

const setCmd = new Command('set')
  .description(
    "Replace a contract's structured note from a JSON file (Diane's read-merge-write path)",
  )
  .argument('<contract>', 'Contract name (e.g. Vault.sol)')
  .requiredOption('--json-file <path>', 'JSON file holding the full ContractNote')
  .option('--project <dir>', 'Project directory')
  .action((contract: string, opts: { jsonFile: string; project?: string }) => {
    try {
      const outputDir = resolveOutputDir(opts);
      const note = JSON.parse(
        fs.readFileSync(path.resolve(opts.jsonFile), 'utf-8'),
      ) as ContractNote;
      writeContractNote(outputDir, contract, note);
      const reviewed = recomputeReview(outputDir, contract);
      logger.success(`Saved note: ${contract}${reviewed ? ' (reviewed ✓)' : ''}`);
    } catch (err) {
      reportError(err);
      process.exit(1);
    }
  });

const doneCmd = new Command('done')
  .description('Mark a contract as done reading (part of the auto-review rule); --undo to clear')
  .argument('<contract>', 'Contract name (e.g. Vault.sol)')
  .option('--undo', 'Clear the done flag')
  .option('--project <dir>', 'Project directory')
  .action((contract: string, opts: { undo?: boolean; project?: string }) => {
    try {
      const outputDir = resolveOutputDir(opts);
      setMarkedDone(outputDir, contract, !opts.undo);
      const reviewed = recomputeReview(outputDir, contract);
      logger.success(
        `${contract} marked ${opts.undo ? 'not done' : 'done'}${reviewed ? ' (reviewed ✓)' : ''}`,
      );
    } catch (err) {
      reportError(err);
      process.exit(1);
    }
  });

const leadCmd = new Command('lead')
  .description('Add an open lead to a contract note (idempotent on --source + --source-ref)')
  .argument('<contract>', 'Contract name (e.g. Vault); matched to an existing note target if any')
  .requiredOption('--text <text>', 'Lead text (inline markdown)')
  .option('--source <source>', 'Who raised it, e.g. ai-audit')
  .option('--source-ref <ref>', 'Origin key; a second call with the same key is a no-op')
  .option('--project <dir>', 'Project directory')
  .action(
    (
      contract: string,
      opts: { text: string; source?: string; sourceRef?: string; project?: string },
    ) => {
      try {
        const outputDir = resolveOutputDir(opts);
        const target = resolveNoteTarget(outputDir, contract);
        const { lead, created } = addLeadIdempotent(outputDir, target, opts.text, {
          source: opts.source,
          source_ref: opts.sourceRef,
        });
        if (created) recomputeReview(outputDir, target);
        // Bare id on stdout so skills can capture it.
        console.log(lead.id);
        if (!created) process.stderr.write(`(exists on ${target}; not added again)\n`);
      } catch (err) {
        reportError(err);
        process.exit(1);
      }
    },
  );

// ─── session subcommands ────────────────────────────────────────────

const sessionLatestCmd = new Command('latest')
  .description(
    'Print the latest unprocessed narration session (with transcript) as JSON, for /diane',
  )
  .option('--project <dir>', 'Project directory')
  .action((opts: { project?: string }) => {
    try {
      const session = latestUnprocessedSession(resolveOutputDir(opts));
      console.log(JSON.stringify(session, null, 2));
    } catch (err) {
      reportError(err);
      process.exit(1);
    }
  });

const sessionAddCmd = new Command('add')
  .description(
    'Register a session from an existing transcript file (no audio/whisper — useful for testing)',
  )
  .requiredOption('--transcript-file <path>', 'Transcript text file')
  .requiredOption('--contract <name>', 'Contract this session covers')
  .option('--ts <iso>', 'Timestamp (defaults to now)')
  .option('--project <dir>', 'Project directory')
  .action((opts: { transcriptFile: string; contract: string; ts?: string; project?: string }) => {
    try {
      const ts = (opts.ts ?? new Date().toISOString()).replace(/[:.]/g, '-');
      const session = createSession(resolveOutputDir(opts), {
        ts,
        contract: opts.contract,
        transcript: readFileTrim(opts.transcriptFile),
      });
      logger.success(`Session added: ${session.file} (contract: ${session.contract})`);
    } catch (err) {
      reportError(err);
      process.exit(1);
    }
  });

const sessionMarkCmd = new Command('mark-processed')
  .description('Mark a session as ingested by Diane')
  .argument('<file>', 'Session file (relative path from `hex note session latest`)')
  .option('--project <dir>', 'Project directory')
  .action((file: string, opts: { project?: string }) => {
    try {
      markSessionProcessed(resolveOutputDir(opts), file);
      logger.success(`Session marked processed: ${file}`);
    } catch (err) {
      reportError(err);
      process.exit(1);
    }
  });

const sessionCmd = new Command('session')
  .description('Manage narration sessions (latest / add / mark-processed)')
  .addCommand(sessionLatestCmd)
  .addCommand(sessionAddCmd)
  .addCommand(sessionMarkCmd);

// ─── code comments (written in the dashboard's code viewer) ────────

const commentsCmd = new Command('comments')
  .description("The auditor's code comments from the dashboard, at their current lines")
  .argument('[file]', 'Only this file (e.g. src/Vault.sol)')
  .option('--json', 'JSON output')
  .option('--project <dir>', 'Project directory')
  .action((file: string | undefined, opts: { json?: boolean; project?: string }) => {
    try {
      const outputDir = resolveOutputDir(opts);
      if (opts.json) {
        const files = file
          ? [file]
          : [...new Set(readComments(outputDir).map((c) => c.file))].sort();
        const all = files.flatMap((f) => commentsForFile(outputDir, f));
        console.log(JSON.stringify(all, null, 2));
        return;
      }
      const md = commentsMarkdown(outputDir, file ? [file] : undefined);
      console.log(md || 'No code comments yet.');
    } catch (err) {
      reportError(err);
      process.exit(1);
    }
  });

export const noteCommand = new Command('note')
  .description('Read and write audit notes (show / set / done / lead / list / active / session)')
  .addCommand(showCmd)
  .addCommand(commentsCmd)
  .addCommand(leadCmd)
  .addCommand(setCmd)
  .addCommand(doneCmd)
  .addCommand(readCmd)
  .addCommand(writeCmd)
  .addCommand(appendCmd)
  .addCommand(listCmd)
  .addCommand(activeCmd)
  .addCommand(sessionCmd);
