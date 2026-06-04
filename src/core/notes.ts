/**
 * Canonical notes-mutation logic for Diane — the voice-narration audit
 * companion. Shared by the `hex note` CLI command, the `/diane` skill (which
 * shells `hex note ...`), and the dashboard's Notes API routes.
 *
 * Notes live under `<output_dir>/notes/`:
 *   notes.json              index: active contract, contract list, sessions
 *   general.md              cross-cutting / protocol-wide notes
 *   contracts/<Name>.md     one Obsidian-style doc per contract
 *   sessions/<ts>.md        raw transcripts (audit trail; never auto-deleted)
 *   audio/<ts>.webm         raw recordings (kept until transcribed)
 *
 * Like src/core/issues.ts, this module depends ONLY on node:fs / node:path and
 * is parameterized by `outputDir`, so the dashboard can import it across the
 * src/ <-> dashboard/ boundary via `experimental.externalDir` without dragging
 * CLI deps (chalk/ora/zod) into the Next.js bundle. Keep it that way.
 */
import fs from 'node:fs';
import path from 'node:path';

export interface SessionEntry {
  /** Path relative to the notes dir, e.g. `sessions/2026-06-04T...md`. */
  file: string;
  /** Contract this session was recorded against (or `general`). */
  contract: string;
  /** ISO timestamp the session was created. */
  ts: string;
  /** Whether Diane has already ingested this transcript. */
  processed: boolean;
  /** Path (relative to notes dir) of the raw recording, if any. */
  audio?: string;
}

export interface NotesIndex {
  /** Contract currently being narrated (drives the dashboard default). */
  active_contract: string | null;
  /** Contracts that have a note doc. */
  contracts: string[];
  /** Recorded narration sessions, newest last. */
  sessions: SessionEntry[];
}

const EMPTY_INDEX: NotesIndex = { active_contract: null, contracts: [], sessions: [] };

// ─── Paths ──────────────────────────────────────────────────────────

function notesDir(outputDir: string): string {
  return path.join(outputDir, 'notes');
}

/** Filesystem-safe doc filename from a contract display name. */
function safeName(name: string): string {
  return name.replace(/[/\\:*?"<>|]/g, '_').trim();
}

/** Resolve a note target (`general` or a contract name) to its `.md` path. */
export function notePath(outputDir: string, target: string): string {
  if (target === 'general') return path.join(notesDir(outputDir), 'general.md');
  return path.join(notesDir(outputDir), 'contracts', safeName(target) + '.md');
}

// ─── Low-level IO (atomic) ──────────────────────────────────────────

function readText(file: string): string | null {
  try {
    return fs.readFileSync(file, 'utf-8');
  } catch {
    return null;
  }
}

function writeTextAtomic(file: string, content: string): void {
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, content, 'utf-8');
  fs.renameSync(tmp, file);
}

// ─── Index ──────────────────────────────────────────────────────────

export function readNotesIndex(outputDir: string): NotesIndex {
  const raw = readText(path.join(notesDir(outputDir), 'notes.json'));
  if (!raw) return { ...EMPTY_INDEX };
  try {
    const parsed = JSON.parse(raw) as Partial<NotesIndex>;
    return {
      active_contract: parsed.active_contract ?? null,
      contracts: Array.isArray(parsed.contracts) ? parsed.contracts : [],
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
    };
  } catch {
    return { ...EMPTY_INDEX };
  }
}

export function writeNotesIndex(outputDir: string, index: NotesIndex): void {
  writeTextAtomic(
    path.join(notesDir(outputDir), 'notes.json'),
    JSON.stringify(index, null, 2) + '\n',
  );
}

/** Ensure a contract is tracked in the index (no-op for `general`). */
function trackContract(index: NotesIndex, target: string): void {
  if (target === 'general') return;
  if (!index.contracts.includes(target)) index.contracts.push(target);
}

// ─── Notes ──────────────────────────────────────────────────────────

/** Read a note doc. Returns '' when it doesn't exist yet. */
export function readNote(outputDir: string, target: string): string {
  return readText(notePath(outputDir, target)) ?? '';
}

/** Replace a note doc wholesale (used by the dashboard editor's Save). */
export function writeNote(outputDir: string, target: string, body: string): void {
  writeTextAtomic(notePath(outputDir, target), body.endsWith('\n') ? body : body + '\n');
  const index = readNotesIndex(outputDir);
  trackContract(index, target);
  writeNotesIndex(outputDir, index);
}

/**
 * Append a block to a note doc, separated by a blank line. This is how `/diane`
 * accretes structured notes across narration sessions.
 */
export function appendNote(outputDir: string, target: string, body: string): void {
  const existing = readNote(outputDir, target);
  const sep = existing.trim() === '' ? '' : (existing.endsWith('\n') ? '\n' : '\n\n');
  writeNote(outputDir, target, existing + sep + body.trim() + '\n');
}

export function listContracts(outputDir: string): string[] {
  return readNotesIndex(outputDir).contracts;
}

export function setActiveContract(outputDir: string, name: string): void {
  const index = readNotesIndex(outputDir);
  index.active_contract = name;
  trackContract(index, name);
  writeNotesIndex(outputDir, index);
}

// ─── Sessions ───────────────────────────────────────────────────────

/**
 * Register a freshly recorded narration session and make its contract active.
 * `file` / `audio` are paths relative to the notes dir.
 */
export function addSession(
  outputDir: string,
  entry: { file: string; contract: string; ts: string; audio?: string },
): SessionEntry {
  const index = readNotesIndex(outputDir);
  const session: SessionEntry = {
    file: entry.file,
    contract: entry.contract,
    ts: entry.ts,
    processed: false,
    ...(entry.audio ? { audio: entry.audio } : {}),
  };
  index.sessions.push(session);
  index.active_contract = entry.contract;
  trackContract(index, entry.contract);
  writeNotesIndex(outputDir, index);
  return session;
}

/** The most recent session Diane hasn't ingested yet, with its transcript. */
export function latestUnprocessedSession(
  outputDir: string,
): (SessionEntry & { text: string }) | null {
  const index = readNotesIndex(outputDir);
  for (let i = index.sessions.length - 1; i >= 0; i--) {
    const s = index.sessions[i];
    if (!s.processed) {
      const text = readText(path.join(notesDir(outputDir), s.file)) ?? '';
      return { ...s, text };
    }
  }
  return null;
}

export function markSessionProcessed(outputDir: string, file: string): void {
  const index = readNotesIndex(outputDir);
  const session = index.sessions.find((s) => s.file === file);
  if (!session) throw new Error(`No session with file ${file}`);
  session.processed = true;
  writeNotesIndex(outputDir, index);
}

/**
 * Write a transcript into `sessions/<ts>.md` and register it. Returns the
 * session's relative file path. Used by the dashboard record route (after
 * transcription) and by `hex note session add` (for testing without audio).
 */
export function createSession(
  outputDir: string,
  opts: { ts: string; contract: string; transcript: string; audio?: string },
): SessionEntry {
  const rel = path.join('sessions', `${opts.ts}.md`);
  const header = `# Narration — ${opts.contract} — ${opts.ts}\n\n`;
  writeTextAtomic(path.join(notesDir(outputDir), rel), header + opts.transcript.trim() + '\n');
  return addSession(outputDir, { file: rel, contract: opts.contract, ts: opts.ts, audio: opts.audio });
}
