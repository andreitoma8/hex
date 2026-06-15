/**
 * Audit-review state in `<output_dir>/progress.json`, shared by the dashboard
 * `/progress` page + `/api/progress` route, the dashboard's notes mutators, and
 * the `hex note` CLI. Like src/core/notes.ts / issues.ts this depends ONLY on
 * node:fs / node:path so the dashboard can import it via `externalDir`.
 * (Named `review` to avoid colliding with src/core/progress.ts, which is the
 * unrelated CLI ProgressTracker.)
 *
 * Two parallel maps keyed by `"<file>::<ContractName>"` (the same key the
 * Contract Checklist uses):
 *   - reviewed_contracts: manual checkbox state (auditor toggles on /progress)
 *   - diane_reviewed:     derived from Diane notes (marked_done + no open leads
 *                         + no unanswered questions). Kept separate so it never
 *                         clobbers a manual check; the checklist shows a row as
 *                         reviewed when either is true.
 */
import fs from 'node:fs';
import path from 'node:path';
import { readContractNote, reviewState } from './notes.js';

export interface ProgressData {
  updated_at: string;
  reviewed_contracts: Record<string, boolean>;
  diane_reviewed?: Record<string, boolean>;
}

function progressPath(outputDir: string): string {
  return path.join(outputDir, 'progress.json');
}

export function readProgress(outputDir: string): ProgressData {
  try {
    const raw = JSON.parse(fs.readFileSync(progressPath(outputDir), 'utf-8')) as Partial<ProgressData>;
    return {
      updated_at: raw.updated_at ?? new Date().toISOString(),
      reviewed_contracts: raw.reviewed_contracts ?? {},
      diane_reviewed: raw.diane_reviewed ?? {},
    };
  } catch {
    return { updated_at: new Date().toISOString(), reviewed_contracts: {}, diane_reviewed: {} };
  }
}

export function writeProgress(outputDir: string, data: ProgressData): void {
  const next = { ...data, updated_at: new Date().toISOString() };
  const file = progressPath(outputDir);
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(next, null, 2) + '\n', 'utf-8');
  fs.renameSync(tmp, file);
}

/**
 * Resolve a Diane note's contract name to the `"<file>::<ContractName>"` key
 * the Contract Checklist uses, by matching against stats.json's per_contract.
 * Falls back to the note's own contract string if no stats match is found.
 */
function resolveContractKey(outputDir: string, contract: string, file?: string): string {
  const bare = contract.replace(/\.sol$/i, '');
  try {
    const stats = JSON.parse(fs.readFileSync(path.join(outputDir, 'stats.json'), 'utf-8')) as {
      per_contract?: Array<{ file: string; contract: string }>;
    };
    const per = stats.per_contract ?? [];
    // Prefer an exact contract-name match; only then fall back to filename
    // (a file like Vault.sol can hold several contracts, e.g. an interface).
    const byName = per.find((c) => c.contract === contract || c.contract === bare);
    const byFile = per.find((c) => path.basename(c.file).replace(/\.sol$/i, '') === bare);
    const match = byName ?? byFile;
    if (match) return `${match.file}::${match.contract}`;
  } catch {
    /* no stats.json — fall through */
  }
  return file ? `${file}::${bare}` : `${contract}::${bare}`;
}

/**
 * Recompute a contract's derived "reviewed" flag from its Diane note and store
 * it in progress.json. Call after any note mutation (lead close, answer,
 * mark-done, or a whole-doc `hex note set`).
 */
export function recomputeReview(outputDir: string, contract: string): boolean {
  const note = readContractNote(outputDir, contract);
  const reviewed = reviewState(note).reviewed;
  const key = resolveContractKey(outputDir, contract, note.file);
  const data = readProgress(outputDir);
  data.diane_reviewed = { ...(data.diane_reviewed ?? {}), [key]: reviewed };
  writeProgress(outputDir, data);
  return reviewed;
}
