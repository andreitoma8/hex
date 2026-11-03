import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { getOutputDirPath } from '@/lib/data';
import { projectRoot } from '@/lib/server/workspace';
import { resolveSafe } from '@/lib/server/safe-path';
import {
  addComment,
  commentsForFile,
  deleteComment,
  editComment,
  readComments,
  removeCommentFromSource,
  restoreComment,
  writeCommentToSource,
  type CodeComment,
} from '../../../../src/core/comments';

export const dynamic = 'force-dynamic';

// Writing `// @audit` lines into a file shifts its line numbers, so facts.json
// (which the Review page highlights by) is rebuilt in the background. Debounced
// and single-flight: a burst of edits costs one build.
let timer: ReturnType<typeof setTimeout> | null = null;
let running = false;
let again = false;

function rebuildFacts(): 'rebuilding' | 'skipped' {
  const cli = process.env.HEX_CLI;
  if (!cli || !fs.existsSync(cli)) return 'skipped';
  const run = () => {
    if (running) {
      again = true;
      return;
    }
    running = true;
    const child = spawn(process.execPath, [cli, 'facts', '--project', projectRoot()], {
      stdio: 'ignore',
    });
    child.on('exit', () => {
      running = false;
      if (again) {
        again = false;
        run();
      }
    });
    child.on('error', () => {
      running = false;
    });
  };
  if (timer) clearTimeout(timer);
  timer = setTimeout(run, 800);
  return 'rebuilding';
}

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });
const fail = (err: unknown) => bad(err instanceof Error ? err.message : String(err), 500);

/** GET ?file=src/Vault.sol → the comments on that file at their current lines. */
export async function GET(request: NextRequest) {
  const file = request.nextUrl.searchParams.get('file');
  if (!file) return bad('Missing file');
  if (!resolveSafe(file)) return bad('File not available', 403);
  try {
    return NextResponse.json({ comments: commentsForFile(getOutputDirPath(), file) });
  } catch (err) {
    return fail(err);
  }
}

/**
 * POST { action: 'add', file, line_start, line_end, text }
 *      { action: 'restore', comment }          (undo a delete)
 *      { action: 'write' | 'unwrite', id }     (put into / take out of the file)
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      action?: string;
      file?: string;
      line_start?: number;
      line_end?: number;
      text?: string;
      id?: string;
      comment?: CodeComment;
    };
    const dir = getOutputDirPath();
    switch (body.action ?? 'add') {
      case 'add': {
        if (!body.file || !resolveSafe(body.file)) return bad('File not available', 403);
        if (!body.line_start || !body.text?.trim()) return bad('line_start and text are required');
        const comment = addComment(dir, {
          file: body.file,
          line_start: body.line_start,
          line_end: body.line_end ?? body.line_start,
          text: body.text,
        });
        return NextResponse.json({ comment });
      }
      case 'restore': {
        const c = body.comment;
        if (!c?.id || !c.file || !resolveSafe(c.file)) return bad('Invalid comment');
        return NextResponse.json({ comment: restoreComment(dir, c) });
      }
      case 'write':
      case 'unwrite': {
        if (!body.id) return bad('id is required');
        const c = readComments(dir).find((x) => x.id === body.id);
        if (!c || !resolveSafe(c.file)) return bad('Comment not available', 404);
        const comment =
          body.action === 'write'
            ? writeCommentToSource(dir, body.id)
            : removeCommentFromSource(dir, body.id);
        return NextResponse.json({ comment, facts: rebuildFacts() });
      }
      default:
        return bad(`Unknown action ${body.action}`);
    }
  } catch (err) {
    return fail(err);
  }
}

/** PATCH { id, text } → edit (rewrites the file's @audit lines when it sits there). */
export async function PATCH(request: NextRequest) {
  try {
    const { id, text } = (await request.json()) as { id?: string; text?: string };
    if (!id || !text?.trim()) return bad('id and text are required');
    const dir = getOutputDirPath();
    const before = readComments(dir).find((x) => x.id === id);
    if (!before || !resolveSafe(before.file)) return bad('Comment not available', 404);
    const comment = editComment(dir, id, text);
    return NextResponse.json({
      comment,
      ...(before.in_source ? { facts: rebuildFacts() } : {}),
    });
  } catch (err) {
    return fail(err);
  }
}

/** DELETE ?id=C-001 → removes it (and its @audit lines); returns it for Undo. */
export async function DELETE(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get('id');
    if (!id) return bad('Missing id');
    const dir = getOutputDirPath();
    const before = readComments(dir).find((x) => x.id === id);
    if (!before || !resolveSafe(before.file)) return bad('Comment not available', 404);
    const comment = deleteComment(dir, id);
    return NextResponse.json({
      comment,
      ...(before.in_source ? { facts: rebuildFacts() } : {}),
    });
  } catch (err) {
    return fail(err);
  }
}
