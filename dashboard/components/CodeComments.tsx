'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from './ui/Button';
import { Dot } from './ui/SeverityDot';
import { useToast } from './ui/Toast';
import { InlineMarkdown } from './MarkdownRenderer';
import { sendJson } from '@/lib/api';
import { setFocus } from '@/lib/focus';
import type { CodeCommentView } from '../../src/core/comments';

export type { CodeCommentView };

export interface CommentsApi {
  comments: CodeCommentView[];
  /** Bumps whenever Hex changed the file itself (an @audit line went in or out). */
  sourceVersion: number;
  add: (start: number, end: number, text: string) => Promise<boolean>;
  edit: (c: CodeCommentView, text: string) => Promise<boolean>;
  remove: (c: CodeCommentView) => Promise<void>;
  toggleSource: (c: CodeCommentView) => Promise<void>;
}

/** The comments on one file, and the mutations, each with a toast (and Undo where it makes sense). */
export function useCodeComments(file: string): CommentsApi {
  const toast = useToast();
  const [comments, setComments] = useState<CodeCommentView[]>([]);
  const [sourceVersion, setSourceVersion] = useState(0);

  const reload = useCallback(async () => {
    try {
      const r = await fetch(`/api/comments?file=${encodeURIComponent(file)}`);
      const data = (await r.json()) as { comments?: CodeCommentView[] };
      setComments(data.comments ?? []);
    } catch {
      setComments([]);
    }
  }, [file]);

  useEffect(() => {
    setComments([]);
    void reload();
  }, [reload]);

  const report = (err: unknown) => toast({ message: (err as Error).message, tone: 'error' });
  const factsNote = (facts?: string) =>
    facts === 'rebuilding' ? ' Line numbers shifted; facts are rebuilding.' : '';

  const add = async (start: number, end: number, text: string) => {
    try {
      await sendJson('/api/comments', {
        action: 'add',
        file,
        line_start: start,
        line_end: end,
        text,
      });
      await reload();
      return true;
    } catch (err) {
      report(err);
      return false;
    }
  };

  const edit = async (c: CodeCommentView, text: string) => {
    try {
      const r = await sendJson<{ facts?: string }>('/api/comments', { id: c.id, text }, 'PATCH');
      if (c.in_source) setSourceVersion((v) => v + 1);
      await reload();
      if (c.in_source) toast({ message: `Comment updated in the file.${factsNote(r.facts)}` });
      return true;
    } catch (err) {
      report(err);
      return false;
    }
  };

  const remove = async (c: CodeCommentView) => {
    try {
      const r = await fetch(`/api/comments?id=${encodeURIComponent(c.id)}`, { method: 'DELETE' });
      const data = (await r.json()) as {
        comment?: CodeCommentView;
        facts?: string;
        error?: string;
      };
      if (!r.ok || !data.comment) throw new Error(data.error ?? 'Could not delete the comment');
      if (c.in_source) setSourceVersion((v) => v + 1);
      await reload();
      const removed = data.comment;
      toast({
        message: `Comment deleted${c.in_source ? ' and taken out of the file' : ''}.`,
        action: {
          label: 'Undo',
          onClick: () =>
            void sendJson('/api/comments', { action: 'restore', comment: removed })
              .then(reload)
              .catch(report),
        },
      });
    } catch (err) {
      report(err);
    }
  };

  const toggleSource = async (c: CodeCommentView) => {
    const action = c.in_source ? 'unwrite' : 'write';
    try {
      const r = await sendJson<{ facts?: string }>('/api/comments', { action, id: c.id });
      setSourceVersion((v) => v + 1);
      await reload();
      toast({
        message:
          action === 'write'
            ? `Wrote it into ${file} as // @audit.${factsNote(r.facts)}`
            : `Took it out of ${file}.${factsNote(r.facts)}`,
        action: {
          label: 'Undo',
          onClick: () =>
            void sendJson('/api/comments', {
              action: action === 'write' ? 'unwrite' : 'write',
              id: c.id,
            })
              .then(() => {
                setSourceVersion((v) => v + 1);
                return reload();
              })
              .catch(report),
        },
      });
    } catch (err) {
      report(err);
    }
  };

  return { comments, sourceVersion, add, edit, remove, toggleSource };
}

function ago(iso: string): string {
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString();
}

const linesLabel = (a: number, b: number) => (a === b ? `line ${a}` : `lines ${a}–${b}`);

/** The band under a commented line: text, then one quiet meta line with the actions. */
export function CommentBand({
  comment,
  api,
  indent,
}: {
  comment: CodeCommentView;
  api: CommentsApi;
  indent: string;
}) {
  const [editing, setEditing] = useState(false);
  if (editing) {
    return (
      <Composer
        indent={indent}
        label={`Edit ${comment.id}`}
        initial={comment.text}
        submitLabel="Save"
        onCancel={() => setEditing(false)}
        onSubmit={async (t) => {
          if (await api.edit(comment, t)) setEditing(false);
        }}
      />
    );
  }
  return (
    <div
      className="fade-in whitespace-normal border-y border-border-subtle bg-surface-1 py-2.5 pr-6"
      style={{ paddingLeft: indent }}
      onClick={() =>
        setFocus({
          ref: comment.id,
          kind: 'comment',
          label: comment.text.slice(0, 120),
          file: comment.file,
          line_start: comment.line_start,
          line_end: comment.line_end,
        })
      }
    >
      <div className="max-w-[680px] font-sans">
        <div className="whitespace-pre-wrap text-body text-text-primary">
          <InlineMarkdown>{comment.text}</InlineMarkdown>
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-text-tertiary">
          <span>
            {comment.id} · {ago(comment.updated_at ?? comment.created_at)} ·{' '}
            {linesLabel(comment.line_start, comment.line_end)}
          </span>
          {comment.stale && (
            <span className="inline-flex items-center gap-1.5">
              <Dot color="var(--medium)" /> The code changed since
            </span>
          )}
          {comment.in_source && (
            <span className="inline-flex items-center gap-1.5">
              <Dot color="var(--success)" /> In the file as // @audit
            </span>
          )}
          <span className="flex items-center gap-1">
            <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
              Edit
            </Button>
            {!comment.stale && comment.file.endsWith('.sol') && (
              <Button size="sm" variant="ghost" onClick={() => void api.toggleSource(comment)}>
                {comment.in_source ? 'Remove from file' : 'Write to source'}
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => void api.remove(comment)}>
              Delete
            </Button>
          </span>
        </div>
      </div>
    </div>
  );
}

/** Inline composer: ⌘↩ saves, Esc cancels. */
export function Composer({
  indent,
  label,
  initial = '',
  submitLabel = 'Comment',
  onSubmit,
  onCancel,
}: {
  indent: string;
  label: string;
  initial?: string;
  submitLabel?: string;
  onSubmit: (text: string) => Promise<void> | void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(initial);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.setSelectionRange(initial.length, initial.length);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    try {
      await onSubmit(text.trim());
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="rise-in whitespace-normal border-y border-border-subtle bg-surface-1 py-3 pr-6"
      style={{ paddingLeft: indent }}
    >
      <div className="max-w-[680px] font-sans">
        <div className="mb-1.5 text-caption text-text-tertiary">{label}</div>
        <textarea
          ref={ref}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void submit();
            }
            if (e.key === 'Escape') {
              e.preventDefault();
              onCancel();
            }
          }}
          rows={3}
          placeholder="What you noticed, a question, a lead…"
          className="w-full resize-y rounded-md border border-border-default bg-surface-0 px-3 py-2 text-body text-text-primary placeholder:text-text-tertiary focus:border-border-emphasis focus:outline-none"
        />
        <div className="mt-2 flex items-center gap-2">
          <Button size="sm" onClick={() => void submit()} disabled={!text.trim() || busy}>
            {submitLabel}
          </Button>
          <Button size="sm" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <span className="ml-auto text-caption text-text-tertiary">
            ⌘↩ to save · Esc to cancel
          </span>
        </div>
      </div>
    </div>
  );
}

export { linesLabel };
