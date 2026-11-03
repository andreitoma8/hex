/**
 * Protocol model + invariants (`.hex/model/`). Written by the /init-audit
 * agents; read by the dashboard, diagrams, /ai-audit, /fuzz and the report.
 * Node builtins only (the dashboard imports this module).
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Invariant, InvariantsFile, ProtocolModel } from '../types/index.js';

export function modelDir(outputDir: string): string {
  return path.join(outputDir, 'model');
}

function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as T;
  } catch {
    return null;
  }
}

function writeJsonAtomic(file: string, data: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', 'utf-8');
  fs.renameSync(tmp, file);
}

export function readProtocolModel(outputDir: string): ProtocolModel | null {
  return readJson<ProtocolModel>(path.join(modelDir(outputDir), 'protocol.json'));
}

const invariantsPath = (outputDir: string) => path.join(modelDir(outputDir), 'invariants.json');

export function readInvariants(outputDir: string): InvariantsFile {
  return (
    readJson<InvariantsFile>(invariantsPath(outputDir)) ?? {
      updated_at: new Date(0).toISOString(),
      invariants: [],
    }
  );
}

export function writeInvariants(outputDir: string, file: InvariantsFile): void {
  writeJsonAtomic(invariantsPath(outputDir), { ...file, updated_at: new Date().toISOString() });
}

function updateInvariant(outputDir: string, id: string, fn: (inv: Invariant) => void): Invariant {
  const file = readInvariants(outputDir);
  const inv = file.invariants.find((i) => i.id === id);
  if (!inv) throw new Error(`No invariant ${id} in .hex/model/invariants.json`);
  fn(inv);
  writeInvariants(outputDir, file);
  return inv;
}

export function setInvariantStatus(
  outputDir: string,
  id: string,
  status: Invariant['status'],
  rationale?: string,
): Invariant {
  return updateInvariant(outputDir, id, (inv) => {
    inv.status = status;
    if (rationale) inv.rationale = rationale;
  });
}

export function setInvariantTest(
  outputDir: string,
  id: string,
  test: Partial<NonNullable<Invariant['test']>> & { tool?: 'fizz' | 'foundry' },
): Invariant {
  return updateInvariant(outputDir, id, (inv) => {
    inv.test = {
      tool: test.tool ?? inv.test?.tool ?? 'foundry',
      status: test.status ?? inv.test?.status ?? 'not_written',
      ...inv.test,
      ...test,
    } as NonNullable<Invariant['test']>;
  });
}

export function linkInvariantIssue(outputDir: string, id: string, issueId: string): Invariant {
  return updateInvariant(outputDir, id, (inv) => {
    inv.issue_id = issueId;
  });
}

/** Markdown for agent bundles and the report: accepted invariants by default. */
export function invariantsMarkdown(
  file: InvariantsFile,
  opts: { includeProposed?: boolean } = {},
): string {
  const list = file.invariants.filter(
    (i) => i.status === 'accepted' || (opts.includeProposed && i.status === 'proposed'),
  );
  if (list.length === 0) return '';
  const out = [
    '# Invariants — what must always hold',
    '',
    'The auditor accepted these properties of the protocol. A code path that can break one is a finding; say which invariant it breaks.',
    '',
  ];
  for (const i of list) {
    const enforced = i.on_chain_enforced ? 'enforced on-chain' : 'NOT enforced on-chain';
    const scope = [...i.scope.contracts, ...i.scope.functions].join(', ');
    out.push(`- **${i.id}** (${i.kind}, ${enforced}${scope ? `; ${scope}` : ''}): ${i.statement}`);
  }
  return out.join('\n') + '\n';
}

export interface ClaimVerdict {
  claim_id: string;
  status: 'verified' | 'contested';
  /** Why, for contested claims: what the code actually does. */
  note?: string;
  by: string;
}

/**
 * Merge skeptic verdicts (`.hex/model/verdicts/*.json`, each `{verdicts: ClaimVerdict[]}`)
 * into protocol.json, and verdicts on invariant ids (`INV-NNN`) into each
 * invariant's `verification`, so the auditor sees a contest before accepting.
 * A claim any skeptic contests stays contested; otherwise the last verified
 * verdict wins. Returns counts and unknown claim ids.
 */
export function applyVerdicts(outputDir: string): {
  verified: number;
  contested: number;
  invariants: { verified: number; contested: number };
  unknown: string[];
} {
  const protoPath = path.join(modelDir(outputDir), 'protocol.json');
  const model = readJson<Record<string, unknown>>(protoPath);
  if (!model) throw new Error('No .hex/model/protocol.json to apply verdicts to.');
  const dir = path.join(modelDir(outputDir), 'verdicts');
  const verdicts: ClaimVerdict[] = [];
  if (fs.existsSync(dir)) {
    for (const f of fs
      .readdirSync(dir)
      .filter((x) => x.endsWith('.json'))
      .sort()) {
      const v = readJson<{ verdicts?: ClaimVerdict[] }>(path.join(dir, f));
      verdicts.push(...(v?.verdicts ?? []));
    }
  }
  const byClaim = new Map<string, ClaimVerdict>();
  for (const v of verdicts) {
    const prev = byClaim.get(v.claim_id);
    if (!prev || prev.status !== 'contested') byClaim.set(v.claim_id, v);
  }
  const seen = new Set<string>();
  let verified = 0;
  let contested = 0;
  for (const value of Object.values(model)) {
    if (!Array.isArray(value)) continue;
    for (const item of value as Array<Record<string, unknown>>) {
      const id = item?.claim_id as string | undefined;
      if (!id || !byClaim.has(id)) continue;
      const v = byClaim.get(id)!;
      seen.add(id);
      item.status = v.status;
      item.verified_by = v.by;
      if (v.note) item.note = v.note;
      if (v.status === 'verified') verified++;
      else contested++;
    }
  }
  writeJsonAtomic(protoPath, model);

  const inv = { verified: 0, contested: 0 };
  const invFile = readInvariants(outputDir);
  let invChanged = false;
  for (const i of invFile.invariants) {
    const v = byClaim.get(i.id);
    if (!v) continue;
    seen.add(i.id);
    i.verification = { status: v.status, ...(v.note ? { note: v.note } : {}), by: v.by };
    inv[v.status === 'verified' ? 'verified' : 'contested']++;
    invChanged = true;
  }
  if (invChanged) writeInvariants(outputDir, invFile);

  return {
    verified,
    contested,
    invariants: inv,
    unknown: [...byClaim.keys()].filter((k) => !seen.has(k)),
  };
}
