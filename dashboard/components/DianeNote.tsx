'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { InlineMarkdown } from './MarkdownRenderer';
import { Button } from './ui/Button';
import { InspectorSection } from './ui/Inspector';
import { useToast } from './ui/Toast';
import { sendJson } from '@/lib/api';
import { cn } from '@/lib/cn';
import type { ContractNoteView, NoteFn, NoteLead } from '@/lib/types';

function matchFn(note: ContractNoteView, id: string, name: string): NoteFn | undefined {
  return (
    note.functions.find(
      (f) => f.fn_ref && (f.fn_ref === id || f.fn_ref === `${note.contract}.${name}`),
    ) ?? note.functions.find((f) => (f.sig.split('(')[0] ?? '').trim() === name)
  );
}

/**
 * Diane's note for the selected function's contract: what she wrote about
 * this function, the open questions (answer inline) and the open leads
 * (dismiss inline). Mutations go through the existing /api/notes routes.
 */
export function DianeNote({
  note,
  fnId,
  fnName,
}: {
  note: ContractNoteView;
  fnId: string;
  fnName: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const fn = matchFn(note, fnId, fnName);
  const questions = note.questions.filter((q) => !q.answer?.trim());
  const leads = note.leads
    .filter((l) => l.status === 'open')
    .sort((a, b) => Number(b.text.includes(fnName)) - Number(a.text.includes(fnName)));

  const dismissLead = async (id: string) => {
    try {
      await sendJson('/api/notes/lead', {
        contract: note.target,
        id,
        action: 'close',
        status: 'dismissed',
      });
      router.refresh();
      toast({
        message: 'Lead dismissed',
        action: {
          label: 'Undo',
          onClick: () =>
            void sendJson('/api/notes/lead', { contract: note.target, id, action: 'reopen' }).then(
              () => router.refresh(),
            ),
        },
      });
    } catch (err) {
      toast({ message: (err as Error).message, tone: 'error' });
    }
  };

  const empty = !fn && questions.length === 0 && leads.length === 0;

  return (
    <InspectorSection label={`Diane's notes on ${note.contract}`}>
      {empty && (
        <p className="text-body text-text-tertiary">
          Nothing yet. Record a narration, then run{' '}
          <code className="font-mono text-caption">/diane</code>.
        </p>
      )}

      {fn && (
        <div className="space-y-1.5 text-body text-text-secondary">
          {fn.purpose && (
            <p>
              <InlineMarkdown>{fn.purpose}</InlineMarkdown>
            </p>
          )}
          {fn.access && (
            <p>
              <span className="text-text-tertiary">Access </span>
              <InlineMarkdown>{fn.access}</InlineMarkdown>
            </p>
          )}
          {fn.effects && (
            <p>
              <span className="text-text-tertiary">Effects </span>
              <InlineMarkdown>{fn.effects}</InlineMarkdown>
            </p>
          )}
          {fn.notes.map((n, i) => (
            <p key={i}>
              <InlineMarkdown>{n}</InlineMarkdown>
            </p>
          ))}
          {fn.warnings.map((w, i) => (
            <p key={`w${i}`} className="flex gap-2 text-text-primary">
              <span
                className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ background: 'var(--high)' }}
              />
              <span>
                <InlineMarkdown>{w}</InlineMarkdown>
              </span>
            </p>
          ))}
        </div>
      )}

      {questions.length > 0 && (
        <div className="mt-5">
          <div className="flex items-baseline justify-between text-caption text-text-tertiary">
            <span>Open questions</span>
            <span className="tabular-nums">{questions.length}</span>
          </div>
          <ul className="mt-1.5 divide-y divide-border-subtle border-y border-border-subtle">
            {questions.map((q) => (
              <li key={q.id} className="py-2.5">
                <QuestionItem contract={note.target} id={q.id} text={q.q} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {leads.length > 0 && (
        <div className="mt-5">
          <div className="flex items-baseline justify-between text-caption text-text-tertiary">
            <span>Open leads</span>
            <span className="tabular-nums">{leads.length}</span>
          </div>
          <ul className="mt-1.5 divide-y divide-border-subtle border-y border-border-subtle">
            {leads.map((l) => (
              <LeadItem key={l.id} lead={l} onDismiss={() => dismissLead(l.id)} />
            ))}
          </ul>
        </div>
      )}
    </InspectorSection>
  );
}

const SOURCE_LABEL: Record<string, string> = {
  'ai-audit': 'AI audit',
  'init-audit': 'Pre-review',
  diane: 'Diane',
  auditagent: 'AuditAgent',
};

/** One lead: a dot, the text (long ones clamp to three lines), where it came from, Dismiss. */
function LeadItem({ lead, onDismiss }: { lead: NoteLead; onDismiss: () => void }) {
  const [open, setOpen] = useState(false);
  const long = lead.text.length > 220;
  // Leads without a source were written by Diane from a narration.
  const source = SOURCE_LABEL[lead.source ?? 'diane'] ?? lead.source;
  return (
    <li className="group flex gap-2.5 py-2.5">
      <span
        className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ background: 'var(--medium)' }}
      />
      <div className="min-w-0 flex-1">
        <p
          className={cn('text-body text-text-primary', long && !open && 'line-clamp-3')}
          onClick={() => long && setOpen((v) => !v)}
        >
          <InlineMarkdown>{lead.text}</InlineMarkdown>
        </p>
        <div className="mt-1 flex items-center gap-2 text-caption text-text-tertiary">
          {source && <span>{source}</span>}
          {long && (
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="hover:text-text-primary"
            >
              {open ? 'Show less' : 'Show more'}
            </button>
          )}
          <button
            type="button"
            onClick={onDismiss}
            className="ml-auto rounded-md px-1.5 py-0.5 opacity-0 hover:bg-surface-2 hover:text-text-primary focus-visible:opacity-100 group-hover:opacity-100"
          >
            Dismiss
          </button>
        </div>
      </div>
    </li>
  );
}

function QuestionItem({ contract, id, text }: { contract: string; id: string; text: string }) {
  const router = useRouter();
  const toast = useToast();
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => setAnswer(''), [id]);

  const save = async () => {
    if (!answer.trim()) return;
    setBusy(true);
    try {
      await sendJson('/api/notes/question', { contract, id, answer: answer.trim() });
      toast({ message: 'Answer saved' });
      router.refresh();
    } catch (err) {
      toast({ message: (err as Error).message, tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <p className="text-body text-text-primary">
        <InlineMarkdown>{text}</InlineMarkdown>
      </p>
      <div className="mt-1.5 flex items-start gap-2">
        <textarea
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void save();
          }}
          rows={1}
          placeholder="Answer…"
          className="min-h-[32px] flex-1 resize-y rounded-md border border-border-subtle bg-surface-0 px-2.5 py-1.5 text-body text-text-primary placeholder:text-text-tertiary focus:border-border-emphasis focus:outline-none"
        />
        {answer.trim() && (
          <Button size="sm" variant="secondary" onClick={save} disabled={busy} className="mt-0.5">
            Save
          </Button>
        )}
      </div>
    </div>
  );
}
