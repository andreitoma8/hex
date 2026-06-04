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
} from '../core/notes.js';

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

// ─── session subcommands ────────────────────────────────────────────

const sessionLatestCmd = new Command('latest')
  .description('Print the latest unprocessed narration session (with transcript) as JSON, for /diane')
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
  .description('Register a session from an existing transcript file (no audio/whisper — useful for testing)')
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

export const noteCommand = new Command('note')
  .description('Read and write Diane audit notes (read / write / append / list / active / session)')
  .addCommand(readCmd)
  .addCommand(writeCmd)
  .addCommand(appendCmd)
  .addCommand(listCmd)
  .addCommand(activeCmd)
  .addCommand(sessionCmd);
