'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MarkdownRenderer, InlineMarkdown } from '@/components/MarkdownRenderer';
import type { ContractNote, FnEntry, Question, Lead } from '../../../src/core/notes';

interface NotesClientProps {
  general: string;
  contractNotes: ContractNote[];
  contractOptions: string[];
  activeContract: string | null;
  unprocessedCount: number;
}

type RecState = 'idle' | 'recording' | 'transcribing';
const OTHER = '__other__';
const GENERAL = 'general';

function fmt(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function NotesClient({
  general,
  contractNotes,
  contractOptions,
  activeContract,
  unprocessedCount,
}: NotesClientProps) {
  const router = useRouter();

  // ── Left rail: General + each contract note ──
  const railItems = useMemo(
    () => [
      { key: GENERAL, label: 'General' },
      ...contractNotes.map((n) => ({ key: n.contract, label: n.contract })),
    ],
    [contractNotes],
  );
  const initialKey =
    activeContract && railItems.some((d) => d.key === activeContract) ? activeContract : GENERAL;
  const [selectedKey, setSelectedKey] = useState<string>(initialKey);
  const selectedNote = contractNotes.find((n) => n.contract === selectedKey) ?? null;

  // ── Recording ──
  const [recState, setRecState] = useState<RecState>('idle');
  const [recordContract, setRecordContract] = useState<string>(
    activeContract ?? contractOptions[0] ?? OTHER,
  );
  const [otherName, setOtherName] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const effectiveContract = (recordContract === OTHER ? otherName : recordContract).trim();

  const upload = useCallback(async () => {
    setRecState('transcribing');
    setStatusMsg('Transcribing locally…');
    try {
      const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
      const fd = new FormData();
      fd.append('audio', blob, 'narration.webm');
      fd.append('contract', effectiveContract || 'general');
      const res = await fetch('/api/notes/record', { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      if (res.status === 422 && data.whisperMissing) {
        setStatusMsg(
          `Audio saved (${data.audioSaved}) but no local Whisper engine is installed. ${data.error}`,
        );
      } else if (!res.ok) {
        setStatusMsg(data.error ?? 'Recording failed');
      } else {
        setStatusMsg(`Session saved for ${data.contract}. Run /diane in Claude Code to process it.`);
        router.refresh();
      }
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : 'Recording failed');
    } finally {
      setRecState('idle');
    }
  }, [effectiveContract, router]);

  const startRecording = useCallback(async () => {
    setStatusMsg(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const mr = new MediaRecorder(stream);
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      mr.onstop = () => {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        if (timerRef.current) clearInterval(timerRef.current);
        void upload();
      };
      recorderRef.current = mr;
      mr.start();
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
      setRecState('recording');
    } catch {
      setStatusMsg('Could not access the microphone. Grant permission and try again.');
    }
  }, [upload]);

  const stopRecording = useCallback(() => {
    recorderRef.current?.stop();
  }, []);

  const canRecord = recState === 'idle' && effectiveContract.length > 0;

  return (
    <div className="space-y-sp-5">
      {/* ── Recorder bar ── */}
      <div className="rounded-lg border border-border-subtle bg-surface-1 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-heading font-medium text-text-primary">Record narration</span>

          <select
            value={recordContract}
            onChange={(e) => setRecordContract(e.target.value)}
            disabled={recState !== 'idle'}
            className="rounded-md border border-border-default bg-surface-2 px-3 py-1.5 text-body text-text-primary focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50"
          >
            {contractOptions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
            <option value={OTHER}>Other…</option>
          </select>

          {recordContract === OTHER && (
            <input
              type="text"
              placeholder="Contract name"
              value={otherName}
              onChange={(e) => setOtherName(e.target.value)}
              disabled={recState !== 'idle'}
              className="rounded-md border border-border-default bg-surface-2 px-3 py-1.5 text-body text-text-primary focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50"
            />
          )}

          {recState === 'recording' ? (
            <button
              type="button"
              onClick={stopRecording}
              className="flex items-center gap-2 rounded-md bg-severity-critical px-3 py-1.5 text-body font-medium text-surface-0"
            >
              <span className="h-2.5 w-2.5 rounded-sm bg-surface-0" />
              Stop · {fmt(elapsed)}
            </button>
          ) : (
            <button
              type="button"
              onClick={startRecording}
              disabled={!canRecord}
              className="flex items-center gap-2 rounded-md bg-accent px-3 py-1.5 text-body font-medium text-surface-0 transition-opacity duration-200 hover:opacity-90 disabled:opacity-40"
            >
              <span className="h-2.5 w-2.5 rounded-full bg-surface-0" />
              {recState === 'transcribing' ? 'Transcribing…' : 'Record'}
            </button>
          )}
        </div>

        {statusMsg && <p className="mt-3 text-caption text-text-secondary">{statusMsg}</p>}
        {unprocessedCount > 0 && (
          <p className="mt-2 text-caption text-accent">
            {unprocessedCount} narration session{unprocessedCount > 1 ? 's' : ''} waiting — run{' '}
            <code className="font-mono">/diane</code> in Claude Code to process.
          </p>
        )}
      </div>

      {/* ── Notes (rail + structured view) ── */}
      <div className="flex gap-sp-5">
        <nav className="w-44 shrink-0 space-y-0.5">
          {railItems.map((d) => (
            <button
              key={d.key}
              type="button"
              onClick={() => setSelectedKey(d.key)}
              className={`block w-full truncate rounded-md px-3 py-1.5 text-left text-body transition-colors duration-200 ${
                d.key === selectedKey
                  ? 'bg-accent-subtle font-medium text-accent'
                  : 'text-text-secondary hover:bg-surface-2 hover:text-text-primary'
              }`}
            >
              {d.label}
            </button>
          ))}
        </nav>

        <div className="min-w-0 flex-1">
          {selectedKey === GENERAL ? (
            <GeneralDoc body={general} />
          ) : (
            <ContractView
              note={selectedNote}
              contract={selectedKey}
              onMutate={() => router.refresh()}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ─── General (freeform markdown) ────────────────────────────────────

function GeneralDoc({ body }: { body: string }) {
  return (
    <div className="rounded-lg border border-border-subtle bg-surface-1 p-5">
      <div className="mb-3 text-heading font-medium text-text-primary">General</div>
      {body.trim() ? (
        <MarkdownRenderer content={body} />
      ) : (
        <p className="text-body text-text-tertiary">
          No protocol-wide notes yet. Record a narration above against{' '}
          <span className="font-medium">Other…</span> as <code className="font-mono">general</code> and
          run <code className="font-mono">/diane</code>.
        </p>
      )}
    </div>
  );
}

// ─── Contract (structured view) ─────────────────────────────────────

const SECTIONS = [
  { id: 'leads', label: 'Leads' },
  { id: 'description', label: 'Description' },
  { id: 'questions', label: 'Questions' },
] as const;

function scrollToSection(id: string) {
  document.getElementById(`note-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function ContractView({
  note,
  contract,
  onMutate,
}: {
  note: ContractNote | null;
  contract: string;
  onMutate: () => void;
}) {
  const [busy, setBusy] = useState(false);

  const post = useCallback(
    async (url: string, body: unknown) => {
      setBusy(true);
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'request failed');
        onMutate();
      } catch {
        /* surface via refresh; keep UI resilient */
      } finally {
        setBusy(false);
      }
    },
    [onMutate],
  );

  const isEmpty =
    !note ||
    (note.leads.length === 0 &&
      note.questions.length === 0 &&
      note.description.purpose.length === 0 &&
      note.description.inheritance.length === 0 &&
      note.description.storage.length === 0 &&
      note.description.roles.length === 0 &&
      note.description.functions.length === 0);

  return (
    <div className="rounded-lg border border-border-subtle bg-surface-1 p-5">
      {/* Title + mark-done + section nav */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-heading font-medium text-text-primary">{contract}</span>
          {note?.file && (
            <span className="font-mono text-caption text-text-tertiary">{note.file}</span>
          )}
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-caption text-text-secondary">
          <input
            type="checkbox"
            checked={Boolean(note?.marked_done)}
            disabled={busy || !note}
            onChange={(e) => post('/api/notes/done', { contract, done: e.target.checked })}
            className="h-4 w-4 rounded border-border-emphasis bg-surface-1 accent-[var(--accent)]"
          />
          Mark done reading
        </label>
      </div>

      {isEmpty ? (
        <p className="text-body text-text-tertiary">
          No notes yet — record a narration above and run <code className="font-mono">/diane</code>.
        </p>
      ) : (
        <>
          <nav className="mb-5 flex flex-wrap items-center gap-1 border-b border-border-subtle pb-3 text-caption">
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => scrollToSection(s.id)}
                className="rounded-md px-2 py-1 text-text-secondary transition-colors duration-200 hover:bg-surface-2 hover:text-text-primary"
              >
                {s.label}
              </button>
            ))}
          </nav>

          <div className="space-y-6">
            <LeadsSection
              leads={note!.leads}
              contract={contract}
              busy={busy}
              post={post}
            />
            <DescriptionSection note={note!} />
            <QuestionsSection
              questions={note!.questions}
              contract={contract}
              busy={busy}
              post={post}
            />
          </div>
        </>
      )}
    </div>
  );
}

// ─── Leads ──────────────────────────────────────────────────────────

function LeadsSection({
  leads,
  contract,
  busy,
  post,
}: {
  leads: Lead[];
  contract: string;
  busy: boolean;
  post: (url: string, body: unknown) => Promise<void>;
}) {
  const open = leads.filter((l) => l.status === 'open');
  const closed = leads.filter((l) => l.status !== 'open');
  const [showClosed, setShowClosed] = useState(false);

  return (
    <section id="note-leads">
      <h3 className="mb-2 text-heading font-medium text-text-primary">Leads</h3>
      {open.length === 0 ? (
        <p className="text-body text-text-tertiary">No open leads.</p>
      ) : (
        <ul className="space-y-2">
          {open.map((lead) => (
            <li
              key={lead.id}
              className="flex items-start justify-between gap-3 rounded-md border border-border-subtle bg-surface-2 px-3 py-2"
            >
              <span className="min-w-0 flex-1 text-body text-text-primary">
                <InlineMarkdown>{lead.text}</InlineMarkdown>
              </span>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  post('/api/notes/lead', { contract, id: lead.id, action: 'close', status: 'dismissed' })
                }
                className="shrink-0 rounded-md border border-border-default px-2.5 py-1 text-caption text-text-secondary transition-colors duration-200 hover:bg-surface-3 hover:text-text-primary disabled:opacity-50"
              >
                Close
              </button>
            </li>
          ))}
        </ul>
      )}

      {closed.length > 0 && (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setShowClosed((v) => !v)}
            className="flex items-center gap-1.5 text-caption text-text-tertiary transition-colors duration-200 hover:text-text-secondary"
          >
            <svg
              className={`h-3.5 w-3.5 transition-transform duration-200 ${showClosed ? 'rotate-90' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="m9 5 7 7-7 7" />
            </svg>
            Closed ({closed.length})
          </button>
          {showClosed && (
            <ul className="mt-2 space-y-1.5">
              {closed.map((lead) => (
                <li
                  key={lead.id}
                  className="flex items-start justify-between gap-3 rounded-md px-3 py-1.5"
                >
                  <span className="min-w-0 flex-1 text-caption text-text-tertiary">
                    <span className="line-through"><InlineMarkdown>{lead.text}</InlineMarkdown></span>
                    {lead.status === 'logged' && lead.ref && (
                      <span className="ml-2 font-mono text-text-secondary">→ {lead.ref}</span>
                    )}
                    {lead.status === 'dismissed' && (
                      <span className="ml-2 text-text-tertiary">dismissed</span>
                    )}
                  </span>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => post('/api/notes/lead', { contract, id: lead.id, action: 'reopen' })}
                    className="shrink-0 rounded-md px-2 py-0.5 text-caption text-text-secondary transition-colors duration-200 hover:text-accent disabled:opacity-50"
                  >
                    Reopen
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

// ─── Description ────────────────────────────────────────────────────

function BulletList({ label, items }: { label: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <h4 className="mb-1 text-body font-medium text-text-secondary">{label}</h4>
      <ul className="list-disc space-y-0.5 pl-5 text-body text-text-primary">
        {items.map((it, i) => (
          <li key={i}>
            <InlineMarkdown>{it}</InlineMarkdown>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DescriptionSection({ note }: { note: ContractNote }) {
  const { purpose, inheritance, storage, roles, functions } = note.description;
  const hasAny =
    purpose.length > 0 ||
    inheritance.length > 0 ||
    storage.length > 0 ||
    roles.length > 0 ||
    functions.length > 0;

  return (
    <section id="note-description">
      <h3 className="mb-3 text-heading font-medium text-text-primary">Description</h3>
      {!hasAny ? (
        <p className="text-body text-text-tertiary">No description recorded yet.</p>
      ) : (
        <div className="space-y-4">
          <BulletList label="Purpose" items={purpose} />
          <BulletList label="Inheritance" items={inheritance} />
          <BulletList label="Storage" items={storage} />
          <BulletList label="Roles & modifiers" items={roles} />
          {functions.length > 0 && (
            <div>
              <h4 className="mb-1.5 text-body font-medium text-text-secondary">Functions</h4>
              <div className="space-y-1.5">
                {functions.map((fn) => (
                  <FunctionAccordion key={fn.id} fn={fn} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function FunctionAccordion({ fn }: { fn: FnEntry }) {
  const [open, setOpen] = useState(false);
  const meta: [string, string | undefined][] = [
    ['Purpose', fn.purpose],
    ['Access', fn.access],
    ['Effects', fn.effects],
  ];
  return (
    <div className="rounded-md border border-border-subtle">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 rounded-md bg-surface-2 px-3 py-2 text-left transition-colors duration-200 hover:bg-surface-3"
      >
        <svg
          className={`h-4 w-4 shrink-0 text-text-tertiary transition-transform duration-200 ${open ? 'rotate-90' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m9 5 7 7-7 7" />
        </svg>
        <span className="min-w-0 truncate font-mono text-body text-text-primary">{fn.sig}</span>
        {fn.warnings.length > 0 && (
          <span className="ml-auto shrink-0 text-caption text-[var(--high)]">
            ⚠ {fn.warnings.length}
          </span>
        )}
      </button>
      {open && (
        <div className="space-y-2 px-3 py-2.5">
          {meta
            .filter(([, v]) => v && v.trim())
            .map(([label, v]) => (
              <p key={label} className="text-body text-text-primary">
                <span className="text-text-secondary">{label}: </span>
                <InlineMarkdown>{v as string}</InlineMarkdown>
              </p>
            ))}
          {fn.notes.length > 0 && (
            <ul className="list-disc space-y-0.5 pl-5 text-body text-text-primary">
              {fn.notes.map((n, i) => (
                <li key={i}>
                  <InlineMarkdown>{n}</InlineMarkdown>
                </li>
              ))}
            </ul>
          )}
          {fn.warnings.length > 0 && (
            <ul className="space-y-1">
              {fn.warnings.map((w, i) => (
                <li
                  key={i}
                  className="flex items-start gap-1.5 rounded-md bg-[var(--high)]/10 px-2 py-1 text-body text-[var(--high)]"
                >
                  <span aria-hidden>⚠</span>
                  <span className="min-w-0 flex-1">
                    <InlineMarkdown>{w}</InlineMarkdown>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Questions ──────────────────────────────────────────────────────

function QuestionsSection({
  questions,
  contract,
  busy,
  post,
}: {
  questions: Question[];
  contract: string;
  busy: boolean;
  post: (url: string, body: unknown) => Promise<void>;
}) {
  return (
    <section id="note-questions">
      <h3 className="mb-2 text-heading font-medium text-text-primary">Questions</h3>
      {questions.length === 0 ? (
        <p className="text-body text-text-tertiary">No questions recorded yet.</p>
      ) : (
        <div className="space-y-1.5">
          {questions.map((q) => (
            <QuestionAccordion
              key={q.id}
              question={q}
              contract={contract}
              busy={busy}
              post={post}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function QuestionAccordion({
  question,
  contract,
  busy,
  post,
}: {
  question: Question;
  contract: string;
  busy: boolean;
  post: (url: string, body: unknown) => Promise<void>;
}) {
  const answered = Boolean(question.answer && question.answer.trim());
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(question.answer ?? '');

  return (
    <div className="rounded-md border border-border-subtle">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 rounded-md bg-surface-2 px-3 py-2 text-left transition-colors duration-200 hover:bg-surface-3"
      >
        <svg
          className={`h-4 w-4 shrink-0 text-text-tertiary transition-transform duration-200 ${open ? 'rotate-90' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m9 5 7 7-7 7" />
        </svg>
        <span className={`min-w-0 flex-1 text-body ${answered ? 'text-text-primary' : 'text-text-tertiary'}`}>
          <InlineMarkdown>{question.q}</InlineMarkdown>
        </span>
        {!answered && <span className="shrink-0 text-caption text-text-tertiary">open</span>}
      </button>
      {open && (
        <div className="space-y-2 px-3 py-2.5">
          {editing ? (
            <div className="space-y-2">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={3}
                className="w-full resize-y rounded-md border border-border-default bg-surface-0 p-2 text-body text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setEditing(false);
                    setDraft(question.answer ?? '');
                  }}
                  className="rounded-md px-2.5 py-1 text-caption text-text-secondary transition-colors duration-200 hover:text-text-primary"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={busy || !draft.trim()}
                  onClick={async () => {
                    await post('/api/notes/question', { contract, id: question.id, answer: draft.trim() });
                    setEditing(false);
                  }}
                  className="rounded-md bg-accent px-2.5 py-1 text-caption font-medium text-surface-0 transition-opacity duration-200 hover:opacity-90 disabled:opacity-50"
                >
                  Save answer
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-start justify-between gap-3">
              <p className={`min-w-0 flex-1 text-body ${answered ? 'text-text-primary' : 'text-text-tertiary'}`}>
                {answered ? <InlineMarkdown>{question.answer as string}</InlineMarkdown> : '—  open'}
              </p>
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="shrink-0 rounded-md border border-border-default px-2.5 py-1 text-caption text-text-secondary transition-colors duration-200 hover:bg-surface-3 hover:text-text-primary"
              >
                {answered ? 'Edit' : 'Answer'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
