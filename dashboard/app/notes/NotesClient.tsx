'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MarkdownRenderer } from '@/components/MarkdownRenderer';

interface ContractNote {
  name: string;
  body: string;
}

interface NotesClientProps {
  general: string;
  contractNotes: ContractNote[];
  contractOptions: string[];
  activeContract: string | null;
  unprocessedCount: number;
}

type RecState = 'idle' | 'recording' | 'transcribing';
const OTHER = '__other__';

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

  // ── Docs (left rail) ──
  const docs = useMemo(
    () => [{ key: 'general', label: 'General', body: general }, ...contractNotes.map((c) => ({ key: c.name, label: c.name, body: c.body }))],
    [general, contractNotes],
  );
  const initialKey =
    activeContract && docs.some((d) => d.key === activeContract) ? activeContract : 'general';
  const [selectedKey, setSelectedKey] = useState<string>(initialKey);
  const current = docs.find((d) => d.key === selectedKey) ?? docs[0];

  // ── Editing ──
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  const startEdit = () => {
    setDraft(current.body);
    setEditing(true);
  };
  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/notes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: current.key, body: draft }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'save failed');
      setEditing(false);
      router.refresh();
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

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

      {/* ── Notes (rail + doc) ── */}
      <div className="flex gap-sp-5">
        <nav className="w-44 shrink-0 space-y-0.5">
          {docs.map((d) => (
            <button
              key={d.key}
              type="button"
              onClick={() => {
                setSelectedKey(d.key);
                setEditing(false);
              }}
              className={`block w-full truncate rounded-md px-3 py-1.5 text-left text-body ${
                d.key === selectedKey
                  ? 'bg-accent-subtle font-medium text-accent'
                  : 'text-text-secondary hover:bg-surface-2 hover:text-text-primary'
              }`}
            >
              {d.label}
            </button>
          ))}
        </nav>

        <div className="min-w-0 flex-1 rounded-lg border border-border-subtle bg-surface-1 p-5">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-heading font-medium text-text-primary">{current.label}</span>
            {editing ? (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="rounded-md px-3 py-1 text-caption text-text-secondary hover:text-text-primary"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={save}
                  disabled={saving}
                  className="rounded-md bg-accent px-3 py-1 text-caption font-medium text-surface-0 disabled:opacity-50"
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={startEdit}
                className="rounded-md border border-border-default px-3 py-1 text-caption text-text-secondary hover:bg-surface-2 hover:text-text-primary"
              >
                Edit
              </button>
            )}
          </div>

          {editing ? (
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="h-[60vh] w-full resize-y rounded-md border border-border-default bg-surface-0 p-3 font-mono text-body text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
            />
          ) : current.body.trim() ? (
            <MarkdownRenderer content={current.body} />
          ) : (
            <p className="text-body text-text-tertiary">
              No notes yet for {current.label}. Record a narration above and run{' '}
              <code className="font-mono">/diane</code>, or click Edit to write notes by hand.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
