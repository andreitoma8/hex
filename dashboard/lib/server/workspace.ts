/**
 * Server-side reads shared by pages and API routes. Everything here goes
 * through the canonical node-builtins-only modules in src/ (review, facts,
 * notes, model, rules) so the dashboard and the CLI agree on every file.
 */
import fs from 'node:fs';
import path from 'node:path';
import { getOutputDirPath, readJsonFile } from '@/lib/data';
import { reviewSummary } from '../../../src/core/review';
import { loadFacts } from '../../../src/facts/query';
import { readContractNote, readNotesIndex, resolveNoteTarget } from '../../../src/core/notes';
import type { Facts } from '../../../src/types/index';
import type { ContractNoteView, ReviewRow, ReviewTotals } from '@/lib/types';

export function outDir(): string {
  return getOutputDirPath();
}

/** The audited project root: the directory that holds `.hex/`. */
export function projectRoot(): string {
  return path.dirname(outDir());
}

export interface ProjectConfig {
  project?: {
    name?: string;
    commit?: string;
    chain?: string;
    solidity_version?: string;
    scope?: string[];
    mode?: 'full' | 'diff';
    diff?: { base_commit?: string };
  };
  settings?: { report?: { repository_url?: string; initial_commit?: string } };
}

export function readConfig(): ProjectConfig | null {
  return readJsonFile<ProjectConfig>('config.json');
}

export function isDiffMode(): boolean {
  return readConfig()?.project?.mode === 'diff';
}

export function readFacts(): Facts | null {
  return loadFacts(outDir());
}

export function readReview(
  blindSpots = 10,
): ReviewTotals & { rows: ReviewRow[]; blind_spots: ReviewRow[] } {
  return reviewSummary(outDir(), { blindSpots }) as ReviewTotals & {
    rows: ReviewRow[];
    blind_spots: ReviewRow[];
  };
}

/** Diane's structured note for a contract, trimmed to what the inspector shows. */
export function contractNoteView(contract: string): ContractNoteView {
  const dir = outDir();
  const target = resolveNoteTarget(dir, contract);
  const note = readContractNote(dir, target);
  return {
    target,
    contract,
    marked_done: note.marked_done,
    purpose: note.description.purpose,
    functions: note.description.functions.map((f) => ({
      id: f.id,
      sig: f.sig,
      fn_ref: (f as unknown as { fn_ref?: string }).fn_ref,
      purpose: f.purpose,
      access: f.access,
      effects: f.effects,
      notes: f.notes,
      warnings: f.warnings,
    })),
    questions: note.questions,
    leads: note.leads,
  };
}

export function unprocessedSessions(): number {
  return readNotesIndex(outDir()).sessions.filter((s) => !s.processed).length;
}

export function readGeneralNote(): string {
  try {
    return fs.readFileSync(path.join(outDir(), 'notes', 'general.md'), 'utf-8');
  } catch {
    return '';
  }
}

/** Newest `.hex/fix-review/*.json` by `generated_at`. */
export function latestFixReview<T extends { generated_at: string }>(): T | null {
  const dir = path.join(outDir(), 'fix-review');
  let best: T | null = null;
  try {
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.json')) continue;
      try {
        const data = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8')) as T;
        if (!best || Date.parse(data.generated_at) > Date.parse(best.generated_at)) best = data;
      } catch {
        /* skip unreadable */
      }
    }
  } catch {
    return null;
  }
  return best;
}
