'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from './ui/Button';
import { IconMic } from './ui/Icons';
import { useToast } from './ui/Toast';

type RecState = 'idle' | 'recording' | 'transcribing';

function fmt(sec: number): string {
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

/**
 * Talk to Diane: the browser records locally (MediaRecorder), posts the audio
 * to `/api/notes/record`, which transcribes it with a local Whisper engine and
 * registers a session for the `/diane` skill to process.
 */
export function RecordButton({ contract, pending }: { contract: string; pending: number }) {
  const router = useRouter();
  const toast = useToast();
  const [state, setState] = useState<RecState>('idle');
  const [elapsed, setElapsed] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const target = useRef(contract);
  target.current = contract;

  useEffect(
    () => () => {
      if (timer.current) clearInterval(timer.current);
      stream.current?.getTracks().forEach((t) => t.stop());
    },
    [],
  );

  const upload = useCallback(
    async (forContract: string) => {
      setState('transcribing');
      try {
        const fd = new FormData();
        fd.append('audio', new Blob(chunks.current, { type: 'audio/webm' }), 'narration.webm');
        fd.append('contract', forContract || 'general');
        const res = await fetch('/api/notes/record', { method: 'POST', body: fd });
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          whisperMissing?: boolean;
          audioSaved?: string;
          contract?: string;
        };
        if (res.status === 422 && data.whisperMissing) {
          toast({
            message: `Audio saved, but no local Whisper engine is installed. ${data.error ?? ''}`,
            tone: 'error',
          });
        } else if (!res.ok) {
          toast({ message: data.error ?? 'Recording failed', tone: 'error' });
        } else {
          toast({
            message: `Narration saved for ${data.contract}. Run /diane in Claude Code to process it.`,
          });
          router.refresh();
        }
      } catch (err) {
        toast({ message: err instanceof Error ? err.message : 'Recording failed', tone: 'error' });
      } finally {
        setState('idle');
      }
    },
    [router, toast],
  );

  const start = useCallback(async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.current = s;
      chunks.current = [];
      const mr = new MediaRecorder(s);
      const forContract = target.current;
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.current.push(e.data);
      };
      mr.onstop = () => {
        s.getTracks().forEach((t) => t.stop());
        if (timer.current) clearInterval(timer.current);
        void upload(forContract);
      };
      recorder.current = mr;
      mr.start();
      setElapsed(0);
      timer.current = setInterval(() => setElapsed((e) => e + 1), 1000);
      setState('recording');
    } catch {
      toast({ message: 'Could not access the microphone. Allow it and try again.', tone: 'error' });
    }
  }, [toast, upload]);

  if (state === 'recording') {
    return (
      <Button
        variant="secondary"
        onClick={() => recorder.current?.stop()}
        title="Stop and transcribe"
      >
        <span className="h-2 w-2 rounded-full" style={{ background: 'var(--critical)' }} />
        Stop · <span className="tabular-nums">{fmt(elapsed)}</span>
      </Button>
    );
  }
  return (
    <Button
      variant="secondary"
      onClick={start}
      disabled={state === 'transcribing'}
      title={`Narrate your reading of ${contract || 'the protocol'} for Diane`}
    >
      <IconMic className="h-4 w-4 text-text-secondary" />
      {state === 'transcribing' ? 'Transcribing…' : 'Record narration'}
      {pending > 0 && state === 'idle' && (
        <span
          className="text-caption text-text-tertiary"
          title={`${pending} narration session(s) waiting for /diane`}
        >
          {pending} waiting
        </span>
      )}
    </Button>
  );
}
