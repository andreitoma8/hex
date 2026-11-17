import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DiagramSpecSchema } from '../core/schema.js';
import { layoutDiagram, plainText, wrap, type Shape } from './layout.js';
import { toExcalidraw } from './excalidraw.js';
import { buildDiagrams } from './build.js';
import type { DiagramSpec } from '../types/index.js';

export const SPECS: unknown[] = [
  {
    name: 'custody',
    type: 'custody',
    title: 'Where the money sits',
    takeaway:
      'All deposits sit in Vault; only withdraw and the owner-only sweep can move them out.',
    actors: [
      { id: 'user', label: 'Depositor' },
      { id: 'owner', label: 'Owner' },
    ],
    holdings: [
      { id: 'vault', label: 'Vault', assets: ['USDC', 'shares'], ref: 'Vault' },
      { id: 'wallet', label: 'User wallet', assets: ['USDC'] },
    ],
    moves: [
      { from: 'wallet', to: 'vault', via: 'deposit', ref: 'Vault.deposit(uint256)', asset: 'USDC' },
      {
        from: 'vault',
        to: 'wallet',
        via: 'withdraw',
        ref: 'Vault.withdraw(uint256)',
        asset: 'USDC',
      },
      { from: 'user', to: 'vault', via: 'deposit / withdraw' },
      { from: 'owner', to: 'vault', via: 'setFee (no cap)', ref: 'Vault.setFee(uint256)' },
    ],
    annotations: [
      {
        target: 'vault',
        text: 'Share price reads balanceOf(this): a donation inflates it.',
        kind: 'risk',
      },
    ],
  },
  {
    name: 'privileges',
    type: 'privilege',
    title: 'Who can do what',
    takeaway: 'One owner key controls the fee and ownership; nothing caps the fee.',
    actors: [
      { id: 'owner', label: 'Owner' },
      { id: 'anyone', label: 'Anyone' },
    ],
    powers: [
      {
        id: 'setFee',
        label: 'setFee(uint256)',
        ref: 'Vault.setFee(uint256)',
        worst_case: 'Sets feeBps to any value, taking every future deposit.',
      },
      {
        id: 'setOwner',
        label: 'setOwner(address)',
        ref: 'Vault.setOwner(address)',
        worst_case: 'Hands control to any address, or bricks admin with address(0).',
      },
      {
        id: 'deposit',
        label: 'deposit(uint256)',
        ref: 'Vault.deposit(uint256)',
        worst_case: 'First depositor can inflate the share price.',
      },
    ],
    grants: [
      { actor: 'owner', power: 'setFee' },
      { actor: 'owner', power: 'setOwner' },
      { actor: 'anyone', power: 'deposit' },
      { actor: 'owner', power: 'deposit' },
    ],
    annotations: [],
  },
  {
    name: 'share-accounting',
    type: 'accounting',
    title: 'Share accounting',
    takeaway:
      'totalShares changes only in deposit and withdraw, but the asset side moves with any transfer.',
    equation: 'price per share = balanceOf(Vault) / totalShares',
    terms: [
      { id: 'bal', label: 'balanceOf(Vault)' },
      { id: 'shares', label: 'totalShares' },
    ],
    updates: [
      { term: 'bal', function: 'deposit', ref: 'Vault.deposit(uint256)', direction: 'increase' },
      { term: 'shares', function: 'deposit', ref: 'Vault.deposit(uint256)', direction: 'increase' },
      { term: 'bal', function: 'withdraw', ref: 'Vault.withdraw(uint256)', direction: 'decrease' },
      {
        term: 'shares',
        function: 'withdraw',
        ref: 'Vault.withdraw(uint256)',
        direction: 'decrease',
      },
      { term: 'bal', function: 'direct token transfer', direction: 'increase' },
    ],
    annotations: [
      { target: 'bal', text: 'Anyone can raise this term without minting shares.', kind: 'risk' },
    ],
  },
  {
    name: 'withdraw-flow',
    type: 'sequence',
    title: 'Withdraw',
    takeaway: 'withdraw prices shares from the live balance, then burns them before paying out.',
    participants: [
      { id: 'user', label: 'User', kind: 'actor' },
      { id: 'vault', label: 'Vault' },
      { id: 'token', label: 'Token', kind: 'external' },
    ],
    messages: [
      { from: 'user', to: 'vault', label: 'withdraw(shares)', ref: 'Vault.withdraw(uint256)' },
      {
        from: 'vault',
        to: 'token',
        label: 'balanceOf(this)',
        kind: 'oracle',
        note: 'Live balance: donations move the price.',
      },
      { from: 'vault', to: 'vault', label: 'burn shares', kind: 'state' },
      { from: 'vault', to: 'token', label: 'transfer(user, amount)', kind: 'transfer' },
    ],
    annotations: [
      { target: 'user', text: 'Any holder can front-run a donation.', kind: 'risk' },
      { target: 'token', text: 'A fee-on-transfer token pays out less.', kind: 'risk' },
    ],
  },
  {
    name: 'request-lifecycle',
    type: 'state-machine',
    title: 'Withdrawal request',
    takeaway: 'A request can be cancelled after it is claimable, which nothing prevents.',
    entity: 'WithdrawalRequest',
    states: [
      { id: 'none', label: 'None' },
      { id: 'pending', label: 'Pending' },
      { id: 'claimable', label: 'Claimable' },
      { id: 'claimed', label: 'Claimed', terminal: true },
    ],
    transitions: [
      { from: 'none', to: 'pending', label: 'requestWithdraw' },
      { from: 'pending', to: 'claimable', label: 'processQueue', guard: 'keeper only' },
      { from: 'claimable', to: 'claimed', label: 'claim' },
      { from: 'claimable', to: 'none', label: 'cancel' },
      { from: 'pending', to: 'pending', label: 'topUp', guard: 'owner only' },
    ],
    annotations: [
      {
        target: 'claimable',
        text: 'cancel() here returns shares that were already priced out.',
        kind: 'risk',
      },
    ],
  },
];

const parsed = SPECS.map((s) => DiagramSpecSchema.parse(s)) as DiagramSpec[];

function overlaps(a: Shape, b: Shape): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

describe('diagram layout', () => {
  it.each(parsed.map((s) => [s.name, s] as const))('%s: boxes never overlap', (_name, spec) => {
    const scene = layoutDiagram(spec);
    // Callouts sit on their target's corner by design.
    const boxes = scene.shapes.filter(
      (s) => s.kind !== 'text' && s.style !== 'dot' && !s.style.startsWith('callout'),
    );
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        expect(overlaps(boxes[i], boxes[j]), `${boxes[i].id} overlaps ${boxes[j].id}`).toBe(false);
      }
    }
    expect(scene.width).toBeGreaterThan(0);
    // The takeaway is always rendered under the title.
    expect(scene.shapes.find((s) => s.id === 'takeaway')!.label).toContain(
      spec.takeaway.split(' ')[0],
    );
  });

  it('draws a self-loop over its own box, below the header', () => {
    const scene = layoutDiagram(parsed.find((s) => s.name === 'request-lifecycle')!);
    const box = scene.shapes.find((s) => s.id === 'pending')!;
    const loop = scene.arrows.find((a) => a.id.startsWith('pending->pending'))!;
    const [start, , , end] = loop.points;
    expect(start[1]).toBe(box.y);
    expect(end[1]).toBe(box.y);
    for (const [x] of loop.points) expect(x > box.x && x < box.x + box.w).toBe(true);
    const takeaway = scene.shapes.find((s) => s.id === 'takeaway')!;
    for (const [, y] of loop.points) expect(y).toBeGreaterThan(takeaway.y + takeaway.h);
    // The label sits above the loop, clear of the line.
    expect(loop.labelCenter![1]).toBeLessThan(loop.points[1][1]);
    expect(loop.labelCenter![1] - 10).toBeGreaterThan(takeaway.y + takeaway.h);
  });

  it('ties side annotations to their targets with numbered callouts, no leaders', () => {
    const scene = layoutDiagram(parsed.find((s) => s.type === 'sequence')!);
    expect(scene.arrows.filter((a) => a.style === 'annotation')).toHaveLength(0);
    const at = scene.shapes.filter((s) => s.id.endsWith('-at'));
    const num = scene.shapes.filter((s) => s.id.endsWith('-num'));
    expect(at.map((s) => s.label).sort()).toEqual(['1', '2']);
    expect(num.map((s) => s.label).sort()).toEqual(['1', '2']);
    // Numbered in reading order: the left-most target is 1.
    const user = scene.shapes.find((s) => s.id === 'user')!;
    const one = at.find((s) => s.label === '1')!;
    expect(Math.abs(one.x - (user.x + user.w - 11))).toBeLessThanOrEqual(1);
  });

  it('is deterministic', () => {
    for (const spec of parsed) {
      const a = toExcalidraw(layoutDiagram(spec), {
        name: spec.name,
        type: spec.type,
        spec_hash: 'x',
      });
      const b = toExcalidraw(layoutDiagram(spec), {
        name: spec.name,
        type: spec.type,
        spec_hash: 'x',
      });
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    }
  });

  it('binds labels and arrows, and tags protocol refs', () => {
    const spec = parsed[0];
    const file = toExcalidraw(layoutDiagram(spec), {
      name: spec.name,
      type: spec.type,
      spec_hash: 'x',
    });
    const byId = new Map(file.elements.map((e) => [e.id, e]));
    const vault = file.elements.find((e) => e.customData?.hexNode === 'vault')!;
    expect(vault.customData.hexRef).toBe('Vault');
    const label = byId.get(
      vault.boundElements.find((b: { type: string }) => b.type === 'text').id,
    )!;
    expect(label.containerId).toBe(vault.id);
    const arrows = file.elements.filter((e) => e.type === 'arrow');
    expect(arrows.length).toBeGreaterThan(0);
    for (const a of arrows) {
      if (a.startBinding) expect(byId.has(a.startBinding.elementId)).toBe(true);
      if (a.endBinding) expect(byId.has(a.endBinding.elementId)).toBe(true);
    }
    expect(arrows.some((a) => a.customData?.hexRef === 'Vault.deposit(uint256)')).toBe(true);
  });
});

describe('buildDiagrams', () => {
  let out: string;
  beforeEach(() => {
    out = fs.mkdtempSync(path.join(os.tmpdir(), 'hex-dia-'));
    fs.mkdirSync(path.join(out, 'model', 'diagrams'), { recursive: true });
    for (const s of SPECS) {
      fs.writeFileSync(
        path.join(out, 'model', 'diagrams', `${(s as { name: string }).name}.spec.json`),
        JSON.stringify(s),
      );
    }
  });
  afterEach(() => fs.rmSync(out, { recursive: true, force: true }));

  it('builds every spec and never overwrites an edited scene', () => {
    expect(buildDiagrams(out).map((o) => o.status)).toEqual(Array(SPECS.length).fill('built'));
    const scenePath = path.join(out, 'model', 'diagrams', 'custody.excalidraw');
    const scene = JSON.parse(fs.readFileSync(scenePath, 'utf-8'));
    scene.hex.edited = true;
    scene.elements[0].x += 40;
    fs.writeFileSync(scenePath, JSON.stringify(scene));

    expect(buildDiagrams(out, { names: ['custody'] })[0].status).toBe('unchanged-edited');
    const spec = JSON.parse(
      fs.readFileSync(path.join(out, 'model', 'diagrams', 'custody.spec.json'), 'utf-8'),
    );
    spec.takeaway = 'Changed takeaway that is long enough.';
    fs.writeFileSync(
      path.join(out, 'model', 'diagrams', 'custody.spec.json'),
      JSON.stringify(spec),
    );
    expect(buildDiagrams(out, { names: ['custody'] })[0].status).toBe('regenerated');
    expect(JSON.parse(fs.readFileSync(scenePath, 'utf-8')).elements[0].x).toBe(scene.elements[0].x);
    const index = JSON.parse(
      fs.readFileSync(path.join(out, 'model', 'diagrams', 'index.json'), 'utf-8'),
    );
    expect(index.find((e: { name: string }) => e.name === 'custody')).toMatchObject({
      edited: true,
      stale: true,
    });
  });

  it('reports invalid specs', () => {
    fs.writeFileSync(
      path.join(out, 'model', 'diagrams', 'bad.spec.json'),
      JSON.stringify({ name: 'bad', type: 'custody', title: 't', takeaway: 'short' }),
    );
    const o = buildDiagrams(out, { names: ['bad'] });
    expect(o[0].status).toBe('invalid');
  });
});

describe('diagram text', () => {
  it('drops inline markdown marks but keeps the words and a lone *', () => {
    expect(plainText('`depositUnderlying` and **sweep** move `balanceOf`')).toBe(
      'depositUnderlying and sweep move balanceOf',
    );
    expect(plainText('assets = shares * balance / totalShares')).toBe(
      'assets = shares * balance / totalShares',
    );
    expect(wrap('only `withdraw` and `sweep(...)` move it', 80)).toEqual([
      'only withdraw and sweep(...) move it',
    ]);
  });

  it('writes no backticks into the scene, from takeaways, labels or arrows', () => {
    const base = parsed.find((x) => x.type === 'custody')!;
    const spec = JSON.parse(
      JSON.stringify(base)
        .replace('All deposits sit in Vault', 'All deposits sit in `Vault`')
        .replace('"via":"withdraw"', '"via":"`withdraw(...)`"')
        .replace('"label":"Owner"', '"label":"`owner`"'),
    ) as DiagramSpec;
    const texts = toExcalidraw(layoutDiagram(spec), { name: 'x', type: spec.type, spec_hash: 'x' })
      .elements.filter((e) => e.type === 'text')
      .map((e) => (e as { text: string }).text);
    expect(texts.join('\n')).not.toContain('`');
    expect(texts.join(' ').replace(/\s+/g, ' ')).toContain('All deposits sit in Vault');
    expect(texts.some((t) => t.includes('withdraw(...)'))).toBe(true);
    expect(texts.some((t) => t.includes('owner'))).toBe(true);
  });
});
