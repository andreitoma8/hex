/**
 * Fix review: pure helpers (classification, commit mapping, GitHub body
 * rewriting). Orchestration with git/forge lives in src/commands/fix-review.ts.
 */
import type { FixReviewCard } from '../types/index.js';

export type PocResult = 'passing' | 'failing' | 'error' | 'missing';

/**
 * Status from the evidence, most decisive first:
 *  - the PoC fails at the fix commit → fixed (it reproduced at audit time)
 *  - the PoC still passes → not_fixed
 *  - every function the card is about was removed → fixed (code path gone)
 *  - code or commits touch the card but no PoC verdict → unknown (agent judges)
 *  - nothing touches it → unaddressed
 */
export function classifyCard(input: {
  pocBefore?: PocResult;
  pocAfter?: PocResult;
  cardFunctions: string[];
  changedFunctions: string[];
  removedFunctions: string[];
  commits: string[];
}): { status: FixReviewCard['status']; evidence: string } {
  const { pocBefore, pocAfter, cardFunctions, changedFunctions, removedFunctions, commits } = input;
  if (pocAfter === 'failing' && pocBefore !== 'failing') {
    return {
      status: 'fixed',
      evidence: 'The PoC reproduced the issue at the audited commit and fails at the fix commit.',
    };
  }
  if (pocAfter === 'passing') {
    return {
      status: 'not_fixed',
      evidence: changedFunctions.length
        ? `The code changed (${changedFunctions.join(', ')}) but the PoC still reproduces the issue.`
        : 'The PoC still reproduces the issue at the fix commit.',
    };
  }
  if (cardFunctions.length && cardFunctions.every((f) => removedFunctions.includes(f))) {
    return {
      status: 'fixed',
      evidence: `The affected code was removed (${cardFunctions.join(', ')}).`,
    };
  }
  if (changedFunctions.length || commits.length) {
    const why = pocAfter === 'error' ? ' The PoC no longer compiles against the new code.' : '';
    return {
      status: 'unknown',
      evidence: `Touched by ${[changedFunctions.length ? changedFunctions.join(', ') : '', commits.length ? `commit${commits.length > 1 ? 's' : ''} ${commits.map((c) => c.slice(0, 7)).join(', ')}` : ''].filter(Boolean).join(' and ')}; needs a judgement.${why}`,
    };
  }
  return {
    status: 'unaddressed',
    evidence: 'No change between the audited and fix commits touches this issue.',
  };
}

/** Commits whose message cites the card id (`H-012`) or its GitHub issue (`#12`, `fixes #12`). */
export function commitsForCard(
  commits: Array<{ sha: string; subject: string; body?: string }>,
  card: { id: string; github_issue?: number },
): string[] {
  const idRe = new RegExp(`\\b${card.id}\\b`);
  const ghRe = card.github_issue ? new RegExp(`#${card.github_issue}\\b`) : null;
  return commits
    .filter((c) => {
      const text = `${c.subject}\n${c.body ?? ''}`;
      return idRe.test(text) || (ghRe ? ghRe.test(text) : false);
    })
    .map((c) => c.sha);
}

const STATUS_RE = /(\*\*Status\*\*:)[^\n]*(\n|$)/;
const UPDATE_RE = /(\*\*Update from the client\*\*:)[\s\S]*$/;

/**
 * Rewrite only the Status and "Update from the client" fields of a Hex-format
 * issue body; every other byte is preserved. Missing fields are appended in
 * template order.
 */
export function rewriteIssueBody(
  body: string,
  fields: { status?: string; update?: string },
): string {
  let out = body;
  if (fields.status !== undefined) {
    if (STATUS_RE.test(out))
      out = out.replace(
        STATUS_RE,
        (_m, label: string, nl: string) => `${label} ${fields.status}${nl}`,
      );
    else out = `${out.replace(/\s*$/, '')}\n\n**Status**: ${fields.status}\n`;
  }
  if (fields.update !== undefined) {
    if (UPDATE_RE.test(out))
      out = out.replace(UPDATE_RE, (_m, label: string) => `${label} ${fields.update}\n`);
    else out = `${out.replace(/\s*$/, '')}\n\n**Update from the client**: ${fields.update}\n`;
  }
  return out;
}

/**
 * Index of the unmapped change a reference names: `Contract.entity` with or
 * without the signature (`Vault.sweep`, `Vault.sweep(address,address,uint256)`),
 * or the bare entity name when it is unique. Throws when nothing or more than
 * one change matches.
 */
export function findUnmappedChange(
  changes: ReadonlyArray<{ contract: string; entity: string }>,
  ref: string,
): number {
  const name = (e: string) => e.split('(')[0];
  const hits = changes
    .map((c, i) => ({ c, i }))
    .filter(({ c }) =>
      ref.includes('.')
        ? `${c.contract}.${c.entity}` === ref || `${c.contract}.${name(c.entity)}` === ref
        : c.entity === ref || name(c.entity) === ref,
    );
  if (hits.length === 0) throw new Error(`No unmapped change matches ${ref}`);
  if (hits.length > 1)
    throw new Error(
      `${ref} matches ${hits.length} unmapped changes; use Contract.entity(signature): ${hits
        .map(({ c }) => `${c.contract}.${c.entity}`)
        .join(', ')}`,
    );
  return hits[0].i;
}
