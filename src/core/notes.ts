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

// ─── Structured per-contract note (Diane v2) ────────────────────────
//
// A contract's profile is a structured record at `contracts/<Name>.json`
// (the freeform `general` note stays markdown via readNote/writeNote). This is
// what powers the dashboard's section nav, collapsible functions/questions,
// open-only leads, and the /progress auto-review. Diane reads the whole record
// (`hex note show`), merges a session into it, and writes it back
// (`hex note set`); the dashboard mutates individual leads/questions/flags.

export interface FnEntry {
  /** Stable id derived from the function name. */
  id: string;
  /** Display signature, e.g. `deposit(assets, receiver) — external`. */
  sig: string;
  purpose?: string;
  access?: string;
  effects?: string;
  notes: string[];
  /** Pair-audit corrections, ideally `text (file:line)`. */
  warnings: string[];
}

export interface Question {
  id: string;
  q: string;
  /** Open when absent/empty. */
  answer?: string;
}

export type LeadStatus = 'open' | 'logged' | 'dismissed';

export interface Lead {
  id: string;
  text: string;
  status: LeadStatus;
  /** Issue id (e.g. H-007) when promoted to a finding. */
  ref?: string;
}

export interface ContractDescription {
  purpose: string[];
  inheritance: string[];
  storage: string[];
  roles: string[];
  functions: FnEntry[];
}

export interface ContractNote {
  contract: string;
  /** Source file (e.g. `src/Vault.sol`) — used to map to the progress key. */
  file?: string;
  /** Explicit "done reading" signal; part of the auto-review rule. */
  marked_done: boolean;
  description: ContractDescription;
  questions: Question[];
  leads: Lead[];
  updated_at: string;
}

function contractNotePath(outputDir: string, contract: string): string {
  return path.join(notesDir(outputDir), 'contracts', safeName(contract) + '.json');
}

function emptyContractNote(contract: string): ContractNote {
  return {
    contract,
    marked_done: false,
    description: { purpose: [], inheritance: [], storage: [], roles: [], functions: [] },
    questions: [],
    leads: [],
    updated_at: new Date().toISOString(),
  };
}

function asArray<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

/** Read a contract's structured note, returning an empty skeleton if absent. */
export function readContractNote(outputDir: string, contract: string): ContractNote {
  const raw = readText(contractNotePath(outputDir, contract));
  if (!raw) return emptyContractNote(contract);
  try {
    const p = JSON.parse(raw) as Partial<ContractNote>;
    const d = (p.description ?? {}) as Partial<ContractDescription>;
    return {
      contract: p.contract ?? contract,
      file: p.file,
      marked_done: Boolean(p.marked_done),
      description: {
        purpose: asArray<string>(d.purpose),
        inheritance: asArray<string>(d.inheritance),
        storage: asArray<string>(d.storage),
        roles: asArray<string>(d.roles),
        functions: asArray<FnEntry>(d.functions).map((f) => ({
          id: f.id ?? fnId(f.sig ?? ''),
          sig: f.sig ?? '',
          purpose: f.purpose,
          access: f.access,
          effects: f.effects,
          notes: asArray<string>(f.notes),
          warnings: asArray<string>(f.warnings),
        })),
      },
      questions: asArray<Question>(p.questions),
      leads: asArray<Lead>(p.leads),
      updated_at: p.updated_at ?? new Date().toISOString(),
    };
  } catch {
    return emptyContractNote(contract);
  }
}

/** Write a contract's structured note (stamps updated_at; tracks it in the index). */
export function writeContractNote(outputDir: string, contract: string, note: ContractNote): void {
  const next = { ...note, contract, updated_at: new Date().toISOString() };
  writeTextAtomic(contractNotePath(outputDir, contract), JSON.stringify(next, null, 2) + '\n');
  const index = readNotesIndex(outputDir);
  trackContract(index, contract);
  writeNotesIndex(outputDir, index);
}

// ─── ID helpers ─────────────────────────────────────────────────────

function nextNumId(prefix: string, items: { id: string }[]): string {
  let max = 0;
  for (const it of items) {
    const m = new RegExp(`^${prefix}(\\d+)$`).exec(it.id);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `${prefix}${max + 1}`;
}

function fnId(sig: string): string {
  const name = (sig.split('(')[0] ?? sig).trim() || sig;
  return name.replace(/[^\w]+/g, '_') || 'fn';
}

// ─── Granular mutators (used by the dashboard API + CLI) ────────────

export function setMarkedDone(outputDir: string, contract: string, done: boolean): ContractNote {
  const note = readContractNote(outputDir, contract);
  note.marked_done = done;
  writeContractNote(outputDir, contract, note);
  return note;
}

export function addLead(outputDir: string, contract: string, text: string): Lead {
  const note = readContractNote(outputDir, contract);
  const lead: Lead = { id: nextNumId('L', note.leads), text, status: 'open' };
  note.leads.push(lead);
  writeContractNote(outputDir, contract, note);
  return lead;
}

/** Close a lead as promoted-to-finding (`logged`, with ref) or `dismissed`. */
export function closeLead(
  outputDir: string,
  contract: string,
  id: string,
  status: 'logged' | 'dismissed',
  ref?: string,
): ContractNote {
  const note = readContractNote(outputDir, contract);
  const lead = note.leads.find((l) => l.id === id);
  if (!lead) throw new Error(`No lead ${id} on ${contract}`);
  lead.status = status;
  if (ref) lead.ref = ref;
  writeContractNote(outputDir, contract, note);
  return note;
}

export function reopenLead(outputDir: string, contract: string, id: string): ContractNote {
  const note = readContractNote(outputDir, contract);
  const lead = note.leads.find((l) => l.id === id);
  if (!lead) throw new Error(`No lead ${id} on ${contract}`);
  lead.status = 'open';
  delete lead.ref;
  writeContractNote(outputDir, contract, note);
  return note;
}

export function addQuestion(
  outputDir: string,
  contract: string,
  q: string,
  answer?: string,
): Question {
  const note = readContractNote(outputDir, contract);
  const question: Question = { id: nextNumId('Q', note.questions), q, ...(answer ? { answer } : {}) };
  note.questions.push(question);
  writeContractNote(outputDir, contract, note);
  return question;
}

export function answerQuestion(
  outputDir: string,
  contract: string,
  id: string,
  answer: string,
): ContractNote {
  const note = readContractNote(outputDir, contract);
  const question = note.questions.find((x) => x.id === id);
  if (!question) throw new Error(`No question ${id} on ${contract}`);
  question.answer = answer;
  writeContractNote(outputDir, contract, note);
  return note;
}

/** Insert or refine a function entry, matched by signature. Preserves source order. */
export function upsertFunction(
  outputDir: string,
  contract: string,
  fn: Partial<FnEntry> & { sig: string },
): ContractNote {
  const note = readContractNote(outputDir, contract);
  const existing = note.description.functions.find((f) => f.sig === fn.sig);
  if (existing) {
    Object.assign(existing, {
      ...fn,
      notes: fn.notes ?? existing.notes,
      warnings: fn.warnings ?? existing.warnings,
    });
  } else {
    note.description.functions.push({
      id: fnId(fn.sig),
      sig: fn.sig,
      purpose: fn.purpose,
      access: fn.access,
      effects: fn.effects,
      notes: fn.notes ?? [],
      warnings: fn.warnings ?? [],
    });
  }
  writeContractNote(outputDir, contract, note);
  return note;
}

export type DescriptionField = 'purpose' | 'inheritance' | 'storage' | 'roles';

export function setDescriptionField(
  outputDir: string,
  contract: string,
  field: DescriptionField,
  values: string[],
): ContractNote {
  const note = readContractNote(outputDir, contract);
  note.description[field] = values;
  writeContractNote(outputDir, contract, note);
  return note;
}

// ─── Review state (drives the /progress auto-tick) ──────────────────

export interface ReviewState {
  openLeads: number;
  unansweredQuestions: number;
  reviewed: boolean;
}

/** reviewed = marked_done AND no open leads AND no unanswered questions. */
export function reviewState(note: ContractNote): ReviewState {
  const openLeads = note.leads.filter((l) => l.status === 'open').length;
  const unansweredQuestions = note.questions.filter((q) => !q.answer || !q.answer.trim()).length;
  return {
    openLeads,
    unansweredQuestions,
    reviewed: note.marked_done && openLeads === 0 && unansweredQuestions === 0,
  };
}
