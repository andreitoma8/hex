import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { extractFacts, normType, type BuildInfo } from './extract.js';

// Built with forge 1.7.1 / solc 0.8.24 from a fixture covering inheritance, a
// library used via `using for`, overloads, virtual dispatch, `super`, `this`,
// a storage struct, an interface-typed call and a low-level call.
const fixture = JSON.parse(
  fs.readFileSync(path.join(__dirname, '__fixtures__', 'rich.build-info.json'), 'utf-8'),
) as BuildInfo;

const facts = extractFacts([fixture], {
  inScope: (f) => f.startsWith('src/'),
  toolchain: 'foundry',
});
const fn = (id: string) => {
  const f = facts.functions.find((x) => x.id === id);
  if (!f) throw new Error(`missing ${id}; have ${facts.functions.map((x) => x.id).join(', ')}`);
  return f;
};
const callsOf = (id: string) =>
  fn(id)
    .calls.map((c) => `${c.kind}:${c.to}`)
    .sort();

describe('normType', () => {
  it('strips locations, payable and qualifiers', () => {
    expect(normType('struct BaseVault.Position memory')).toBe('Position');
    expect(normType('contract IOracle')).toBe('IOracle');
    expect(normType('address payable')).toBe('address');
    expect(normType('uint256[] calldata')).toBe('uint256[]');
  });
});

describe('extractFacts', () => {
  it('reads contracts with compiler linearization', () => {
    const vault = facts.contracts.find((c) => c.name === 'Vault')!;
    expect(vault).toMatchObject({ kind: 'contract', bases: ['BaseVault'], in_scope: true });
    expect(vault.linearization).toEqual(['Vault', 'BaseVault', 'Owned']);
    expect(facts.contracts.find((c) => c.name === 'MathLib')?.kind).toBe('library');
    expect(facts.contracts.find((c) => c.name === 'BaseVault')?.kind).toBe('abstract');
  });

  it('keeps overloads apart by signature', () => {
    expect(fn('BaseVault.deposit(uint256)').is_entry_point).toBe(true);
    expect(fn('BaseVault.deposit(uint256,address)').writes).toEqual(['BaseVault.positions']);
  });

  it('resolves internal, library, super, this, typed and virtual calls exactly', () => {
    expect(callsOf('BaseVault.deposit(uint256)')).toEqual(
      expect.arrayContaining([
        'internal:BaseVault.fee(uint256)',
        'virtual:Vault.fee(uint256)',
        'library:MathLib.mulDiv(uint256,uint256,uint256)',
        'internal:BaseVault._price()',
      ]),
    );
    expect(callsOf('Vault.fee(uint256)')).toEqual(['super:BaseVault.fee(uint256)']);
    expect(callsOf('Vault.preview(uint256)')).toEqual(['this:Vault.quote(uint256)']);
    expect(callsOf('BaseVault._price()')).toEqual(
      expect.arrayContaining(['external:IOracle.price()', 'virtual:Oracle.price()']),
    );
    expect(fn('BaseVault._price()').external_calls).toEqual([
      expect.objectContaining({ target_type: 'IOracle', member: 'price', kind: 'typed' }),
    ]);
  });

  it('records modifiers and low-level calls', () => {
    const sweep = fn('Vault.sweep(address)');
    expect(sweep.modifiers).toEqual(['Owned.onlyOwner()']);
    expect(sweep.external_calls).toEqual([
      expect.objectContaining({ target_type: 'address', member: 'call', kind: 'low_level' }),
    ]);
    expect(sweep.writes).toEqual(['BaseVault.totalAssets']);
  });

  it('separates reads from writes, including compound and push writes', () => {
    const dep = fn('BaseVault.deposit(uint256)');
    expect(dep.writes).toEqual([
      'BaseVault.history',
      'BaseVault.positions',
      'BaseVault.totalAssets',
    ]);
    expect(dep.reads).toEqual(
      expect.arrayContaining(['BaseVault.positions', 'BaseVault.totalAssets']),
    );
    // `oracle = o` is a pure write; setOracle reads nothing.
    expect(fn('BaseVault.setOracle(IOracle)').writes).toEqual(['BaseVault.oracle']);
    expect(fn('BaseVault.setOracle(IOracle)').reads).toEqual([]);
    expect(fn('BaseVault._price()').reads).toEqual(['BaseVault.oracle']);
  });

  it('fills called_by and entry points with the most-derived implementation', () => {
    expect(fn('Vault.quote(uint256)').called_by).toEqual([
      { from: 'Vault.preview(uint256)', kind: 'this', at: [21] },
    ]);
    // Every edge carries the caller's lines that make the call.
    expect(fn('Owned.onlyOwner()').called_by).toEqual([
      { from: 'BaseVault.setOracle(IOracle)', kind: 'modifier', at: [49] },
      { from: 'Vault.sweep(address)', kind: 'modifier', at: [14] },
    ]);
    expect(fn('BaseVault.deposit(uint256)').calls.find((c) => c.kind === 'library')?.at).toEqual([
      33,
    ]);
    const eps = facts.entry_points.Vault;
    expect(eps).toEqual(
      expect.arrayContaining([
        'BaseVault.deposit(uint256)',
        'Vault.sweep(address)',
        'Vault.preview(uint256)',
      ]),
    );
    expect(eps).not.toContain('BaseVault.fee(uint256)');
  });

  it('takes the storage layout from the compiler, with declaring contracts', () => {
    expect(facts.layout_source).toBe('compiler');
    const layout = facts.storage_layouts.Vault;
    expect(layout.map((s) => `${s.slot}:${s.label}@${s.declared_in}`)).toEqual([
      '0:owner@Owned',
      '1:totalAssets@BaseVault',
      '2:positions@BaseVault',
      '3:oracle@BaseVault',
      '4:history@BaseVault',
      '5:feeBps@Vault',
    ]);
  });

  it('reports line ranges and nSLOC', () => {
    const q = fn('Vault.quote(uint256)');
    expect(q.file).toBe('src/Vault.sol');
    expect(q.line_end).toBeGreaterThanOrEqual(q.line_start);
    expect(q.nsloc).toBe(3);
  });
});

describe('compiler-facts adapters for diff', async () => {
  const { diffCompilerLayouts, impactIndexFromFacts, computeImpact } =
    await import('../analysis/diff.js');

  it('diffs compiler layouts slot by slot', () => {
    const head = structuredClone(facts);
    // Insert a variable before totalAssets: everything after it shifts by one slot.
    const v = head.storage_layouts.Vault;
    v.splice(1, 0, {
      label: 'paused',
      slot: '1',
      offset: 0,
      type: 'bool',
      declared_in: 'BaseVault',
    });
    for (const s of v.slice(2)) s.slot = String(Number(s.slot) + 1);
    const changes = diffCompilerLayouts(facts, head);
    expect(changes.map((c) => c.kind)).toEqual(
      expect.arrayContaining(['variable_added', 'variable_reordered']),
    );
    expect(changes.find((c) => c.kind === 'variable_added')!.detail).toContain(
      'inside the old layout',
    );
  });

  it('propagates impact over compiler edges, including virtual dispatch', () => {
    const index = impactIndexFromFacts(facts);
    const impacted = computeImpact(index, [
      {
        contract: 'Vault',
        entity: 'fee(uint256)',
        kind: 'function',
        file: 'src/Vault.sol',
        change: 'modified',
      },
    ]);
    const deposit = impacted.find(
      (i) => i.contract === 'BaseVault' && i.function === 'deposit(uint256)',
    );
    expect(deposit).toMatchObject({ is_entry_point: true, confidence: 'high' });
    expect(deposit!.reasons[0]).toMatchObject({ kind: 'override', via: 'Vault.fee(uint256)' });
  });
});
