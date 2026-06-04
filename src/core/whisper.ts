/**
 * Local speech-to-text for Diane. Records stay on the machine: we shell out to
 * a locally-installed Whisper engine, never a cloud API. Audit confidentiality
 * is the whole point of keeping this on-device.
 *
 * Engines, in detection order (all auto-download their model on first run):
 *   1. openai-whisper  (`whisper` CLI, `pip install openai-whisper`)
 *   2. faster-whisper  (python module, `pip install faster-whisper`)
 *   3. whisper.cpp     (`whisper-cli`/`whisper-cpp`, needs HEX_WHISPER_MODEL=<model.bin>)
 *
 * Like src/core/notes.ts this stays node-builtins-only (child_process / fs /
 * path / os) so the dashboard's record route can import it across the
 * src/ <-> dashboard/ boundary without bundling CLI-only deps.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** Thrown when no local Whisper engine is installed. The caller turns this into
 *  a setup hint and preserves the raw audio so no narration is lost. */
export class WhisperMissingError extends Error {
  constructor() {
    super(
      'No local Whisper engine found. Install one (audio stays on your machine):\n' +
        '  • pip install openai-whisper       (provides the `whisper` command)\n' +
        '  • pip install faster-whisper       (lighter, faster on CPU)\n' +
        '  • whisper.cpp + HEX_WHISPER_MODEL=/path/to/ggml-base.en.bin',
    );
    this.name = 'WhisperMissingError';
  }
}

export type WhisperEngine =
  | { kind: 'openai'; bin: string }
  | { kind: 'faster'; bin: string }
  | { kind: 'cpp'; bin: string; model: string };

const MODEL = process.env.HEX_WHISPER_MODEL_NAME || 'base.en';

function commandExists(bin: string): boolean {
  try {
    execFileSync('sh', ['-c', `command -v ${bin}`], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function pythonHasFasterWhisper(bin: string): boolean {
  try {
    execFileSync(bin, ['-c', 'import faster_whisper'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/** Find an installed engine, or null. */
export function detectWhisper(): WhisperEngine | null {
  if (commandExists('whisper')) return { kind: 'openai', bin: 'whisper' };
  for (const py of ['python3', 'python']) {
    if (commandExists(py) && pythonHasFasterWhisper(py)) return { kind: 'faster', bin: py };
  }
  const cppModel = process.env.HEX_WHISPER_MODEL;
  for (const bin of ['whisper-cli', 'whisper-cpp']) {
    if (cppModel && commandExists(bin)) return { kind: 'cpp', bin, model: cppModel };
  }
  return null;
}

function ensureFfmpeg(): void {
  if (!commandExists('ffmpeg')) {
    throw new Error('ffmpeg is required to convert recordings for transcription, but was not found.');
  }
}

/** Convert any recording to 16 kHz mono WAV (what every engine wants). */
function toWav(audioPath: string): string {
  ensureFfmpeg();
  const wav = path.join(os.tmpdir(), `hex-narration-${path.basename(audioPath)}.wav`);
  execFileSync('ffmpeg', ['-y', '-i', audioPath, '-ar', '16000', '-ac', '1', '-f', 'wav', wav], {
    stdio: 'ignore',
  });
  return wav;
}

const FASTER_SCRIPT = `
import sys
from faster_whisper import WhisperModel
model = WhisperModel(sys.argv[2], device="cpu", compute_type="int8")
segments, _ = model.transcribe(sys.argv[1], language="en")
sys.stdout.write(" ".join(s.text.strip() for s in segments).strip())
`;

/**
 * Transcribe `audioPath` to plain text. Throws WhisperMissingError when no
 * engine is installed; the caller keeps the raw audio and surfaces the hint.
 */
export function transcribe(audioPath: string): string {
  const engine = detectWhisper();
  if (!engine) throw new WhisperMissingError();

  const wav = toWav(audioPath);
  try {
    if (engine.kind === 'openai') {
      const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hex-whisper-'));
      execFileSync(
        engine.bin,
        [wav, '--model', MODEL, '--language', 'en', '--output_format', 'txt', '--output_dir', outDir, '--task', 'transcribe'],
        { stdio: 'ignore' },
      );
      const txt = path.join(outDir, path.basename(wav).replace(/\.wav$/, '') + '.txt');
      return (fs.readFileSync(txt, 'utf-8')).trim();
    }
    if (engine.kind === 'faster') {
      const fasterModel = process.env.HEX_WHISPER_MODEL_NAME || 'base';
      return execFileSync(engine.bin, ['-c', FASTER_SCRIPT, wav, fasterModel], {
        encoding: 'utf-8',
        maxBuffer: 64 * 1024 * 1024,
      }).trim();
    }
    // whisper.cpp
    const outBase = wav.replace(/\.wav$/, '');
    execFileSync(engine.bin, ['-m', engine.model, '-f', wav, '-otxt', '-of', outBase, '-l', 'en'], {
      stdio: 'ignore',
    });
    return fs.readFileSync(outBase + '.txt', 'utf-8').trim();
  } finally {
    try {
      fs.unlinkSync(wav);
    } catch {
      /* best-effort cleanup */
    }
  }
}
