import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import { getOutputDirPath } from '@/lib/data';
import { createSession } from '../../../../../src/core/notes';
import {
  transcribe,
  transcribeViaServer,
  whisperServerUrl,
  WhisperMissingError,
} from '../../../../../src/core/whisper';

export const dynamic = 'force-dynamic';

// Recording stays on the machine: the browser MediaRecorder posts the audio
// blob here (localhost), we save it under .hex/notes/audio/, transcribe it with
// a LOCAL Whisper engine, and register a session for /diane to ingest. If no
// engine is installed we keep the audio and return a setup hint — no narration
// is ever lost.
export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();
    const audio = form.get('audio');
    const contract = (String(form.get('contract') ?? '').trim() || 'general');
    if (!(audio instanceof Blob)) {
      return NextResponse.json({ error: 'audio file is required' }, { status: 400 });
    }

    const outputDir = getOutputDirPath();
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const audioRel = path.join('audio', `${ts}.webm`);
    const audioPath = path.join(outputDir, 'notes', audioRel);
    fs.mkdirSync(path.dirname(audioPath), { recursive: true });
    fs.writeFileSync(audioPath, Buffer.from(await audio.arrayBuffer()));

    let transcript: string;
    try {
      // Prefer the warm server `hex dashboard` started (model stays loaded);
      // fall back to a one-shot spawn if it isn't running.
      const url = whisperServerUrl();
      transcript = url ? await transcribeViaServer(audioPath, url) : transcribe(audioPath);
    } catch (err) {
      if (err instanceof WhisperMissingError) {
        return NextResponse.json(
          { error: err.message, audioSaved: audioRel, whisperMissing: true },
          { status: 422 },
        );
      }
      throw err;
    }

    const session = createSession(outputDir, { ts, contract, transcript, audio: audioRel });
    return NextResponse.json({ ok: true, session: session.file, contract });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
