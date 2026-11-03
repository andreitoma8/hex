import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { extractFacts, type BuildInfo } from '../facts/extract.js';
import {
  autoMoveTarget,
  createIssue,
  markSynced,
  patchIssue,
  recordValidation,
  revertAutoMove,
} from './issues.js';
import { dedupCandidates, functionsForFinding, markDuplicate } from './dedup.js';
import { markFunctions, reviewSummary } from './review.js';
import { addRule, readRules, rulesMarkdown } from './rules.js';
import {
  invariantsMarkdown,
  readInvariants,
  setInvariantStatus,
  writeInvariants,
} from './model.js';

const bi = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, '..', 'facts', '__fixtures__', 'rich.build-info.json'),
    'utf-8',
  ),
) as BuildInfo;

let project: string;
let out: string;
const read = (rel: string) => JSON.parse(fs.readFileSync(path.join(out, rel), 'utf-8'));
const tracking = (id: string) =>
  read('tracking.json').findings.find((t: { id: string }) => t.id === id);

beforeEach(() => {
  project = fs.mkdtempSync(path.join(os.tmpdir(), 'hex-wf-'));
  out = path.join(project, '.hex');
  fs.mkdirSync(out);
  for (const [p, src] of Object.entries(bi.input!.sources!)) {
    fs.mkdirSync(path.join(project, path.dirname(p)), { recursive: true });
    fs.writeFileSync(path.join(project, p), src.content!);
  }
  fs.writeFileSync(
    path.join(out, 'config.json'),
    JSON.stringify({ project: { project_dir: project } }),
  );
  const facts = extractFacts([bi], { inScope: (f) => f.startsWith('src/'), toolchain: 'foundry' });
  fs.writeFileSync(path.join(out, 'facts.json'), JSON.stringify(facts));
});
afterEach(() => fs.rmSync(project, { recursive: true, force: true }));

describe('validation and auto-move', () => {
  it('only auto-moves on conclusive agent verdicts', () => {
    expect(
      autoMoveTarget({
        verdict: 'reproduced',
        validated_by: 'agent',
        poc_status: 'passing',
        reality_gate: true,
      }),
    ).toBe('verified');
    expect(
      autoMoveTarget({ verdict: 'reproduced', validated_by: 'agent', poc_status: 'passing' }),
    ).toBeNull();
    expect(
      autoMoveTarget({
        verdict: 'reproduced',
        validated_by: 'agent',
        poc_status: 'failing',
        reality_gate: true,
      }),
    ).toBeNull();
    expect(autoMoveTarget({ verdict: 'refuted', validated_by: 'agent', refuters: 1 })).toBeNull();
    expect(autoMoveTarget({ verdict: 'refuted', validated_by: 'agent', refuters: 2 })).toBe(
      'rejected',
    );
    expect(
      autoMoveTarget({
        verdict: 'reproduced',
        validated_by: 'auditor',
        poc_status: 'passing',
        reality_gate: true,
      }),
    ).toBeNull();
  });

  it('records the PoC on the card, auto-moves, and reverts', () => {
    const id = createIssue(out, { source: 'manual', title: 'Fee rounds down', severity: 'Low' });
    const { movedTo } = recordValidation(
      out,
      id,
      {
        verdict: 'reproduced',
        validated_by: 'agent',
        poc_file: 'test/hex-pocs/H-001.t.sol',
        poc_status: 'passing',
        reality_gate: true,
      },
      { autoMove: true },
    );
    expect(movedTo).toBe('verified');
    expect(tracking(id)).toMatchObject({
      status: 'verified',
      poc_status: 'passing',
      poc_file: 'test/hex-pocs/H-001.t.sol',
    });
    expect(tracking(id).validation.auto_moved_to).toBe('verified');
    revertAutoMove(out, id);
    expect(tracking(id).status).toBe('pending_validation');
    expect(tracking(id).validation.auto_moved_to).toBeUndefined();
  });

  it('records a PoC on a synced card without moving it', () => {
    const id = createIssue(out, { source: 'manual', title: 'Unbounded fee', severity: 'Low' });
    markSynced(out, id, {
      issue_number: 7,
      issue_url: 'https://github.com/o/r/issues/7',
      state: 'open',
      last_synced_at: new Date().toISOString(),
      sync_status: 'in_sync',
      comments: [],
    });
    const { movedTo } = recordValidation(
      out,
      id,
      {
        verdict: 'reproduced',
        validated_by: 'agent',
        poc_file: 'test/hex-pocs/H-001.t.sol',
        poc_status: 'passing',
        reality_gate: true,
      },
      { autoMove: true },
    );
    expect(movedTo).toBeNull();
    expect(tracking(id)).toMatchObject({
      status: 'synced',
      poc_status: 'passing',
      poc_file: 'test/hex-pocs/H-001.t.sol',
    });
  });
});

describe('dedup', () => {
  it('maps a conformance card to its function through the code snippet', () => {
    const facts = JSON.parse(fs.readFileSync(path.join(out, 'facts.json'), 'utf-8'));
    const fn = facts.functions.find(
      (f: { in_scope: boolean; kind: string; line_end: number; line_start: number }) =>
        f.in_scope && f.kind === 'function' && f.line_end > f.line_start,
    );
    fs.writeFileSync(
      path.join(out, 'spec-conformance.json'),
      JSON.stringify({
        items: [
          {
            id: 'SC-001',
            status: 'DEVIATES',
            finding: 'The setter accepts any value.',
            code_location: { file: fn.file, line_start: fn.line_start, line_end: fn.line_end },
          },
        ],
      }),
    );
    const id = createIssue(out, { source: 'conformance', source_ref: 'SC-001', title: 'x' });
    const finding = read('findings.json').findings.find((f: { id: string }) => f.id === id);
    expect(finding.root_cause.locations[0].snippet).toContain(fn.name);
    expect(functionsForFinding(facts, finding, project)).toContain(fn.id);
  });

  it('ranks cards on the same exact function first and records duplicates once', () => {
    const a = createIssue(out, {
      source: 'manual',
      title: 'Deposit fee can be bypassed',
      files: ['src/Base.sol'],
    });
    patchIssue(out, a, { description: 'In `deposit(...)` the fee is computed before shares.' });
    const b = createIssue(out, {
      source: 'ai-audit',
      title: 'Fee bypass on deposit',
      files: ['src/Base.sol'],
    });
    patchIssue(out, b, { description: 'The `deposit(...)` path skips the fee.' });
    const c = createIssue(out, {
      source: 'manual',
      title: 'Owner can sweep all ETH',
      files: ['src/Vault.sol'],
    });
    patchIssue(out, c, { description: '`sweep(...)` sends the whole balance.' });

    const report = dedupCandidates(out, b);
    expect(report.functions).toEqual(
      expect.arrayContaining(['BaseVault.deposit(uint256)', 'BaseVault.deposit(uint256,address)']),
    );
    expect(report.candidates[0]).toMatchObject({ id: a, same_function: true, strength: 'strong' });
    expect(report.candidates.find((x) => x.id === c)?.same_function ?? false).toBe(false);
    expect(report.rules).toContain('root_cause = same AND function = true');

    markDuplicate(out, b, a, {
      signals: { contract: true, function: true, root_cause: 'same', attack_vector: 'same' },
      reasoning: 'same function, same mechanism',
      confidence: 'high',
    });
    markDuplicate(out, b, a, {
      signals: { contract: true, function: true, root_cause: 'same', attack_vector: 'same' },
      reasoning: 'again',
      confidence: 'high',
    });
    expect(tracking(b)).toMatchObject({ status: 'duplicate', duplicate_of: a });
    expect(read('comparison.json').duplicates).toHaveLength(1);
  });
});

describe('review map', () => {
  it('tracks per-function state, cleared nSLOC and blind spots', () => {
    let s = reviewSummary(out);
    expect(s.facts_source).toBe('solc-ast');
    expect(s.rows.some((r) => r.id === 'Vault.sweep(address)')).toBe(true);
    expect(s.rows.some((r) => r.contract === 'IOracle')).toBe(false);
    const sweep = s.rows.find((r) => r.id === 'Vault.sweep(address)')!;
    expect(sweep.risk_reasons).toContain('moves value');

    markFunctions(out, ['Vault.sweep(address)'], 'cleared', 'diane');
    markFunctions(
      out,
      ['BaseVault.deposit(uint256)'],
      'questioned',
      'auditor',
      'is the fee rounded?',
    );
    s = reviewSummary(out);
    expect(s.counts.cleared).toBe(1);
    expect(s.counts.questioned).toBe(1);
    expect(s.cleared_nsloc).toBe(sweep.nsloc);
    expect(s.blind_spots.map((r) => r.id)).not.toContain('Vault.sweep(address)');
    expect(s.blind_spots.map((r) => r.id)).not.toContain('BaseVault.deposit(uint256)');
    expect(s.rows.find((r) => r.id === 'BaseVault.deposit(uint256)')).toMatchObject({
      by: 'auditor',
      note: 'is the fee rounded?',
    });
  });
});

describe('rules and invariants', () => {
  it('allocates ids and renders markdown for agents', () => {
    const r1 = addRule(out, { kind: 'trusted_role', text: 'The owner is trusted.' });
    const r2 = addRule(out, {
      kind: 'out_of_scope',
      text: 'Fee-on-transfer tokens are not supported.',
      scope: ['Vault'],
    });
    expect([r1.id, r2.id]).toEqual(['R-001', 'R-002']);
    expect(rulesMarkdown(readRules(out))).toContain('**R-002** (Out of scope; Vault)');

    writeInvariants(out, {
      updated_at: '',
      invariants: [
        {
          id: 'INV-001',
          statement: 'totalAssets equals the sum of deposits',
          kind: 'accounting',
          scope: { contracts: ['BaseVault'], functions: [] },
          evidence: [],
          on_chain_enforced: false,
          status: 'proposed',
        },
      ],
    });
    expect(invariantsMarkdown(readInvariants(out))).toBe('');
    setInvariantStatus(out, 'INV-001', 'accepted');
    expect(invariantsMarkdown(readInvariants(out))).toContain(
      '**INV-001** (accounting, NOT enforced on-chain; BaseVault)',
    );
  });
});

describe('applyVerdicts', async () => {
  const { applyVerdicts } = await import('./model.js');
  it('marks claims verified or contested; any contest wins', () => {
    fs.mkdirSync(path.join(out, 'model', 'verdicts'), { recursive: true });
    fs.writeFileSync(
      path.join(out, 'model', 'protocol.json'),
      JSON.stringify({
        generated_at: 'x',
        actors: [
          {
            claim_id: 'A1',
            id: 'owner',
            name: 'Owner',
            kind: 'admin',
            trust: 'trusted',
            powers: [],
          },
        ],
        privileges: [
          {
            claim_id: 'P1',
            actor: 'owner',
            function: 'Vault.sweep(address)',
            effect: 'e',
            worst_case: 'w',
          },
        ],
      }),
    );
    fs.writeFileSync(
      path.join(out, 'model', 'verdicts', 'a.json'),
      JSON.stringify({
        verdicts: [
          { claim_id: 'A1', status: 'verified', by: 's1' },
          { claim_id: 'P1', status: 'verified', by: 's1' },
        ],
      }),
    );
    fs.writeFileSync(
      path.join(out, 'model', 'verdicts', 'b.json'),
      JSON.stringify({
        verdicts: [
          { claim_id: 'P1', status: 'contested', note: 'also callable by keeper', by: 's2' },
          { claim_id: 'ZZ', status: 'verified', by: 's2' },
        ],
      }),
    );
    fs.writeFileSync(
      path.join(out, 'model', 'invariants.json'),
      JSON.stringify({
        updated_at: 'x',
        invariants: [
          { id: 'INV-001', statement: 's', kind: 'bound', status: 'proposed' },
          { id: 'INV-002', statement: 't', kind: 'bound', status: 'proposed' },
        ],
      }),
    );
    fs.writeFileSync(
      path.join(out, 'model', 'verdicts', 'invariants.json'),
      JSON.stringify({
        verdicts: [{ claim_id: 'INV-001', status: 'contested', note: 'mint breaks it', by: 'si' }],
      }),
    );
    const r = applyVerdicts(out);
    expect(r).toEqual({
      verified: 1,
      contested: 1,
      invariants: { verified: 0, contested: 1 },
      unknown: ['ZZ'],
    });
    const invs = read('model/invariants.json').invariants;
    expect(invs[0].verification).toEqual({ status: 'contested', note: 'mint breaks it', by: 'si' });
    expect(invs[0].status).toBe('proposed');
    expect(invs[1].verification).toBeUndefined();
    const m = read('model/protocol.json');
    expect(m.actors[0]).toMatchObject({ status: 'verified', verified_by: 's1' });
    expect(m.privileges[0]).toMatchObject({
      status: 'contested',
      note: 'also callable by keeper',
      verified_by: 's2',
    });
  });
});
