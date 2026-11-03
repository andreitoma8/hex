/**
 * Code comments: the auditor's notes pinned to lines of source, written from
 * the dashboard's code viewer the way one comments on a pull request. Stored in
 * `.hex/notes/comments.json` and anchored by the code they were written on, so
 * they follow that code when lines move. A comment can also be written into the
 * file itself as `// @audit` lines (and taken out again).
 *
 * Node builtins only: the dashboard imports this module.
 */
import fs from 'node:fs';
import path from 'node:path';

export interface CodeComment {
  /** `C-001`, `C-002`, … */
  id: string;
  file: string;
  line_start: number;
  line_end: number;
  /** The code the comment was written on; the anchor that finds it again. */
  snippet: string;
  text: string;
  by: 'auditor' | 'diane' | 'agent';
  created_at: string;
  updated_at?: string;
  /** Present while the comment also sits in the file as `// @audit` lines. */
  in_source?: { line: number; inserted: string[]; at: string };
}

/** A comment as the viewer shows it: `stale` when its code is no longer in the file. */
export interface CodeCommentView extends CodeComment {
  stale?: boolean;
}

const commentsPath = (outputDir: string) => path.join(outputDir, 'notes', 'comments.json');

export function readComments(outputDir: string): CodeComment[] {
  try {
    const data = JSON.parse(fs.readFileSync(commentsPath(outputDir), 'utf-8')) as {
      comments?: CodeComment[];
    };
    return data.comments ?? [];
  } catch {
    return [];
  }
}

function writeComments(outputDir: string, comments: CodeComment[]): void {
  const p = commentsPath(outputDir);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = `${p}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ comments }, null, 2) + '\n', 'utf-8');
  fs.renameSync(tmp, p);
}

/**
 * The project root is the folder that holds `.hex/`, the same root the
 * dashboard's code viewer reads from (config's `project_dir` goes stale when a
 * project is copied or moved, and comments must land in the file on screen).
 */
function projectDir(outputDir: string): string {
  return path.dirname(path.resolve(outputDir));
}

interface SourceFile {
  abs: string;
  lines: string[];
  eol: string;
}

function readSource(outputDir: string, file: string): SourceFile {
  const abs = path.resolve(projectDir(outputDir), file);
  const raw = fs.readFileSync(abs, 'utf-8');
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  return { abs, lines: raw.split(/\r?\n/), eol };
}

function writeSource(src: SourceFile): void {
  const tmp = `${src.abs}.hex-tmp`;
  const mode = fs.statSync(src.abs).mode;
  fs.writeFileSync(tmp, src.lines.join(src.eol), { encoding: 'utf-8', mode });
  fs.renameSync(tmp, src.abs);
}

const norm = (s: string) =>
  s
    .split(/\r?\n/)
    .map((l) => l.trim())
    .join('\n');

/**
 * Where the comment's code is now: where it was, else the nearest exact match
 * of the same lines; null when the code is gone.
 */
export function locate(
  lines: string[],
  c: Pick<CodeComment, 'line_start' | 'line_end' | 'snippet'>,
): { start: number; end: number } | null {
  const n = c.line_end - c.line_start + 1;
  const want = norm(c.snippet);
  const matchesAt = (s: number) => norm(lines.slice(s - 1, s - 1 + n).join('\n')) === want;
  if (matchesAt(c.line_start)) return { start: c.line_start, end: c.line_end };
  let best: number | null = null;
  for (let s = 1; s + n - 1 <= lines.length; s++) {
    if (
      matchesAt(s) &&
      (best === null || Math.abs(s - c.line_start) < Math.abs(best - c.line_start))
    )
      best = s;
  }
  return best === null ? null : { start: best, end: best + n - 1 };
}

/**
 * The comments on one file, at the lines their code sits on now. Comments whose
 * code moved are re-anchored on disk; comments whose code is gone come back
 * `stale` at their last known lines.
 */
export function commentsForFile(outputDir: string, file: string): CodeCommentView[] {
  const all = readComments(outputDir);
  const mine = all.filter((c) => c.file === file);
  if (mine.length === 0) return [];
  let lines: string[];
  try {
    lines = readSource(outputDir, file).lines;
  } catch {
    return mine.map((c) => ({ ...c, stale: true }));
  }
  let moved = false;
  const out: CodeCommentView[] = [];
  for (const c of mine) {
    const at = locate(lines, c);
    if (!at) {
      out.push({ ...c, stale: true });
      continue;
    }
    if (at.start !== c.line_start) {
      const shift = at.start - c.line_start;
      c.line_start = at.start;
      c.line_end = at.end;
      if (c.in_source) c.in_source.line += shift;
      moved = true;
    }
    out.push({ ...c });
  }
  if (moved) writeComments(outputDir, all);
  return out.sort((a, b) => a.line_end - b.line_end || a.created_at.localeCompare(b.created_at));
}

export function addComment(
  outputDir: string,
  input: {
    file: string;
    line_start: number;
    line_end: number;
    text: string;
    by?: CodeComment['by'];
  },
): CodeComment {
  const text = input.text.trim();
  if (!text) throw new Error('A comment needs text');
  const { lines } = readSource(outputDir, input.file);
  const start = Math.max(1, Math.min(input.line_start, input.line_end));
  const end = Math.min(lines.length, Math.max(input.line_start, input.line_end));
  if (start > lines.length) throw new Error(`${input.file} has only ${lines.length} lines`);
  const all = readComments(outputDir);
  const max = all.reduce((m, c) => Math.max(m, parseInt(c.id.replace(/^C-/, ''), 10) || 0), 0);
  const comment: CodeComment = {
    id: `C-${String(max + 1).padStart(3, '0')}`,
    file: input.file,
    line_start: start,
    line_end: end,
    snippet: lines.slice(start - 1, end).join('\n'),
    text,
    by: input.by ?? 'auditor',
    created_at: new Date().toISOString(),
  };
  all.push(comment);
  writeComments(outputDir, all);
  return comment;
}

/** Put back a deleted comment exactly as it was (undo). */
export function restoreComment(outputDir: string, comment: CodeComment): CodeComment {
  const all = readComments(outputDir).filter((c) => c.id !== comment.id);
  all.push(comment);
  writeComments(outputDir, all);
  return comment;
}

export function deleteComment(outputDir: string, id: string): CodeComment {
  const found = readComments(outputDir).find((x) => x.id === id);
  if (!found) throw new Error(`No comment ${id}`);
  // A comment that sits in the file leaves the file with it.
  const c = found.in_source ? removeCommentFromSource(outputDir, id) : found;
  writeComments(
    outputDir,
    readComments(outputDir).filter((x) => x.id !== id),
  );
  return c;
}

/** Edit the text; a comment that sits in the file is rewritten there too. */
export function editComment(outputDir: string, id: string, text: string): CodeComment {
  const t = text.trim();
  if (!t) throw new Error('A comment needs text');
  const before = readComments(outputDir).find((x) => x.id === id);
  if (!before) throw new Error(`No comment ${id}`);
  const inSource = Boolean(before.in_source);
  if (inSource) removeCommentFromSource(outputDir, id);
  const all = readComments(outputDir);
  const c = all.find((x) => x.id === id)!;
  c.text = t;
  c.updated_at = new Date().toISOString();
  writeComments(outputDir, all);
  return inSource ? writeCommentToSource(outputDir, id) : c;
}

/** The `// @audit` lines for a comment, indented like the code under them. */
export function auditLines(text: string, indent: string): string[] {
  return text
    .trim()
    .split(/\r?\n/)
    .map((l, i) => `${indent}// ${i === 0 ? '@audit ' : ''}${l.trimEnd()}`.trimEnd());
}

/** Shift the stored lines of every other comment in `file` at or below `from`. */
function shiftOthers(all: CodeComment[], file: string, id: string, from: number, by: number): void {
  for (const o of all) {
    if (o.id === id || o.file !== file || o.line_start < from) continue;
    o.line_start += by;
    o.line_end += by;
    if (o.in_source) o.in_source.line += by;
  }
}

/** Insert the comment above its code as `// @audit` lines. */
export function writeCommentToSource(outputDir: string, id: string): CodeComment {
  const all = readComments(outputDir);
  const c = all.find((x) => x.id === id);
  if (!c) throw new Error(`No comment ${id}`);
  if (c.in_source) return c;
  if (!c.file.endsWith('.sol')) throw new Error('Only Solidity files take @audit comments');
  const src = readSource(outputDir, c.file);
  const at = locate(src.lines, c);
  if (!at) throw new Error('The code this comment was written on is no longer in the file');
  const indent = /^\s*/.exec(src.lines[at.start - 1] ?? '')?.[0] ?? '';
  const inserted = auditLines(c.text, indent);
  src.lines.splice(at.start - 1, 0, ...inserted);
  writeSource(src);
  shiftOthers(all, c.file, c.id, at.start, inserted.length);
  c.in_source = { line: at.start, inserted, at: new Date().toISOString() };
  c.line_start = at.start + inserted.length;
  c.line_end = at.end + inserted.length;
  writeComments(outputDir, all);
  return c;
}

/** Take the comment's `// @audit` lines out of the file again. */
export function removeCommentFromSource(outputDir: string, id: string): CodeComment {
  const all = readComments(outputDir);
  const c = all.find((x) => x.id === id);
  if (!c) throw new Error(`No comment ${id}`);
  if (!c.in_source) return c;
  const src = readSource(outputDir, c.file);
  const { inserted } = c.in_source;
  const want = norm(inserted.join('\n'));
  // The lines sit right above the comment's code; look there first, then nearby.
  const at = locate(src.lines, {
    line_start: c.in_source.line,
    line_end: c.in_source.line + inserted.length - 1,
    snippet: inserted.join('\n'),
  });
  if (!at || norm(src.lines.slice(at.start - 1, at.end).join('\n')) !== want) {
    throw new Error(
      'The @audit lines were changed in the file, so Hex will not remove them; edit the file directly.',
    );
  }
  src.lines.splice(at.start - 1, inserted.length);
  writeSource(src);
  shiftOthers(all, c.file, c.id, at.start, -inserted.length);
  c.line_start -= inserted.length;
  c.line_end -= inserted.length;
  delete c.in_source;
  writeComments(outputDir, all);
  return c;
}

/** Markdown for agents (Diane, /ai-audit bundles): the auditor's comments by file. */
export function commentsMarkdown(outputDir: string, files?: string[]): string {
  const all = readComments(outputDir);
  const byFile = new Map<string, CodeCommentView[]>();
  for (const f of [...new Set(all.map((c) => c.file))].sort()) {
    if (files && !files.includes(f)) continue;
    byFile.set(f, commentsForFile(outputDir, f));
  }
  if (byFile.size === 0) return '';
  const out = ["# The auditor's code comments", ''];
  for (const [f, cs] of byFile) {
    out.push(`## ${f}`, '');
    for (const c of cs) {
      const where =
        c.line_start === c.line_end ? `${c.line_start}` : `${c.line_start}-${c.line_end}`;
      out.push(`- **${c.id}** (lines ${where}${c.stale ? ', code since changed' : ''}): ${c.text}`);
    }
    out.push('');
  }
  return out.join('\n');
}
