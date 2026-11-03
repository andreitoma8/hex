import { describe, it, expect } from 'vitest';
import { buildScopeModel, normalizeSource } from './code-model.js';
import { buildImpactIndex, computeImpact, diffModels, propagateLayoutChanges } from './diff.js';

const models = (files: Record<string, string>) => buildScopeModel(new Map(Object.entries(files)));

function run(base: Record<string, string>, head: Record<string, string>) {
  const baseModels = models(base);
  const headModels = models(head);
  const { changes, layout } = diffModels(baseModels, headModels);
  const index = buildImpactIndex(headModels);
  const impacted = computeImpact(index, changes);
  const storage = propagateLayoutChanges(layout, index.contracts);
  return { changes, layout: storage, impacted };
}

const BASE_VAULT = `
pragma solidity ^0.8.20;
contract Vault {
  uint256 public totalAssets;
  mapping(address => uint256) public balances;
  address public owner;

  modifier onlyOwner() { require(msg.sender == owner, "no"); _; }

  function deposit(uint256 amount) external {
    _accrue();
    balances[msg.sender] += amount;
    totalAssets += amount;
  }

  function withdraw(uint256 amount) external {
    balances[msg.sender] -= amount;
    totalAssets -= amount;
  }

  function sharePrice() public view returns (uint256) {
    return totalAssets / 2;
  }

  function setOwner(address o) external onlyOwner { owner = o; }

  function _accrue() internal { totalAssets += 1; }

  function quote(uint256 a) external pure returns (uint256) { return a; }
  function quote(uint256 a, uint256 b) external pure returns (uint256) { return a + b; }
}
`;

describe('normalizeSource', () => {
  it('ignores comments and whitespace but not code', () => {
    const a = 'function f() { // hi\n  x = 1; /* block */ }';
    const b = 'function f(){x=1;}';
    expect(normalizeSource(a)).toBe(normalizeSource(b));
    expect(normalizeSource('x = 1;')).not.toBe(normalizeSource('x = 2;'));
  });
  it('keeps comment markers inside strings', () => {
    expect(normalizeSource('s = "a//b";')).toContain('a//b');
  });
});

describe('diffModels', () => {
  it('classifies added, removed, modified and comments-only functions', () => {
    const head = BASE_VAULT.replace(
      'function _accrue() internal { totalAssets += 1; }',
      'function _accrue() internal { totalAssets += 2; }',
    )
      .replace(
        'function withdraw(uint256 amount) external {',
        'function withdraw(uint256 amount) external {\n    // withdraws funds',
      )
      .replace(
        'function quote(uint256 a, uint256 b) external pure returns (uint256) { return a + b; }',
        'function preview(uint256 a) external view returns (uint256) { return a * totalAssets; }',
      );
    const { changes } = run({ 'src/Vault.sol': BASE_VAULT }, { 'src/Vault.sol': head });
    const by = (e: string) => changes.find((c) => c.entity === e)?.change;
    expect(by('_accrue()')).toBe('modified');
    expect(by('withdraw(uint256)')).toBe('comments_only');
    expect(by('preview(uint256)')).toBe('added');
    // Overloads are distinct: only the two-argument quote was removed.
    expect(by('quote(uint256,uint256)')).toBe('removed');
    expect(by('quote(uint256)')).toBeUndefined();
    expect(by('deposit(uint256)')).toBeUndefined();
  });

  it('reports added and removed contracts with their functions', () => {
    const { changes } = run(
      { 'src/A.sol': 'contract A { function a() external {} }' },
      { 'src/A.sol': 'contract B { function b() external {} }' },
    );
    expect(changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ contract: 'A', kind: 'contract', change: 'removed' }),
        expect.objectContaining({ contract: 'A', entity: 'a()', change: 'removed' }),
        expect.objectContaining({ contract: 'B', kind: 'contract', change: 'added' }),
        expect.objectContaining({ contract: 'B', entity: 'b()', change: 'added' }),
      ]),
    );
  });

  it('detects storage layout changes', () => {
    const base = 'contract S { uint256 a; uint256 b; uint256 c; }';
    const appended = run(
      { f: base },
      { f: 'contract S { uint256 a; uint256 b; uint256 c; uint256 d; }' },
    );
    expect(appended.layout).toEqual([
      expect.objectContaining({
        kind: 'variable_added',
        detail: expect.stringContaining('appended'),
      }),
    ]);

    const inserted = run(
      { f: base },
      { f: 'contract S { uint256 a; uint256 x; uint256 b; uint256 c; }' },
    );
    expect(inserted.layout).toEqual([
      expect.objectContaining({ kind: 'variable_added', detail: expect.stringContaining('shift') }),
    ]);

    const typed = run({ f: base }, { f: 'contract S { uint256 a; uint128 b; uint256 c; }' });
    expect(typed.layout.map((l) => l.kind)).toEqual(['variable_type_changed']);

    const reordered = run({ f: base }, { f: 'contract S { uint256 b; uint256 a; uint256 c; }' });
    expect(reordered.layout.map((l) => l.kind)).toEqual(['variable_reordered']);

    // Constants do not occupy storage.
    const constant = run(
      { f: base },
      { f: 'contract S { uint256 constant K = 1; uint256 a; uint256 b; uint256 c; }' },
    );
    expect(constant.layout).toEqual([]);
  });

  it('propagates base layout changes to derived contracts', () => {
    const { layout } = run(
      {
        'Base.sol': 'abstract contract Base { uint256 a; }',
        'Impl.sol': 'import "./Base.sol"; contract Impl is Base { uint256 z; }',
      },
      {
        'Base.sol': 'abstract contract Base { uint256 x; uint256 a; }',
        'Impl.sol': 'import "./Base.sol"; contract Impl is Base { uint256 z; }',
      },
    );
    expect(layout).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ contract: 'Base', kind: 'variable_added' }),
        expect.objectContaining({ contract: 'Impl', kind: 'inheritance_changed' }),
      ]),
    );
  });
});

const accrueReasons = (impacted: Array<{ function: string; reasons: unknown[] }>) =>
  impacted.find((i) => i.function === '_accrue()')!.reasons;

describe('computeImpact', () => {
  it('walks internal calls up to entry points', () => {
    const head = BASE_VAULT.replace('totalAssets += 1;', 'totalAssets += 2;');
    const { impacted } = run({ 'src/Vault.sol': BASE_VAULT }, { 'src/Vault.sol': head });
    const accrue = impacted.find((i) => i.function === '_accrue()')!;
    expect(accrue).toMatchObject({ depth: 0, is_entry_point: false, confidence: 'high' });
    const deposit = impacted.find((i) => i.function === 'deposit(uint256)')!;
    expect(deposit).toMatchObject({ depth: 1, is_entry_point: true });
    expect(deposit.reasons[0]).toMatchObject({ kind: 'calls', via: 'Vault._accrue()' });
  });

  it('couples readers of state written by a changed function', () => {
    const head = BASE_VAULT.replace('totalAssets += 1;', 'totalAssets += 2;');
    const { impacted } = run({ 'src/Vault.sol': BASE_VAULT }, { 'src/Vault.sol': head });
    const price = impacted.find((i) => i.function === 'sharePrice()')!;
    expect(price).toMatchObject({ depth: 1, confidence: 'medium' });
    expect(price.reasons[0].kind).toBe('reads_state');
    expect(price.reasons[0].via).toContain('totalAssets');
    // setOwner touches neither the changed function nor totalAssets.
    expect(impacted.find((i) => i.function === 'setOwner(address)')).toBeUndefined();
    // A changed function is not "coupled" to the state it writes itself.
    expect(accrueReasons(impacted)).toEqual([{ kind: 'changed', via: 'modified' }]);
  });

  it('impacts every function that applies a changed modifier', () => {
    const head = BASE_VAULT.replace(
      'require(msg.sender == owner, "no");',
      'require(msg.sender == owner || owner == address(0), "no");',
    );
    const { impacted } = run({ 'src/Vault.sol': BASE_VAULT }, { 'src/Vault.sol': head });
    const setOwner = impacted.find((i) => i.function === 'setOwner(address)')!;
    expect(setOwner.reasons[0]).toMatchObject({ kind: 'modifier', via: 'Vault.onlyOwner()' });
  });

  it('follows virtual dispatch into overrides and surfaces inherited entry points', () => {
    const base = {
      'Base.sol': `abstract contract Base {
        function fee() internal virtual returns (uint256) { return 1; }
        function pay() external returns (uint256) { return fee(); }
      }`,
      'Impl.sol': `import "./Base.sol";
      contract Impl is Base {
        function fee() internal override returns (uint256) { return 2; }
      }`,
    };
    const head = { ...base, 'Impl.sol': base['Impl.sol'].replace('return 2;', 'return 3;') };
    const { impacted } = run(base, head);
    const pay = impacted.find((i) => i.contract === 'Base' && i.function === 'pay()')!;
    expect(pay.reasons[0]).toMatchObject({ kind: 'override', via: 'Impl.fee()' });
    // Impl is the deployable contract that exposes pay().
    const implPay = impacted.find((i) => i.contract === 'Impl' && i.function === 'pay()')!;
    expect(implPay).toMatchObject({
      is_entry_point: true,
      reasons: [{ kind: 'inherits', via: 'Base.pay()' }],
    });
  });

  it('resolves typed calls through interfaces to implementations', () => {
    const base = {
      'IOracle.sol': 'interface IOracle { function price() external view returns (uint256); }',
      'Oracle.sol':
        'import "./IOracle.sol"; contract Oracle is IOracle { function price() external view returns (uint256) { return 1; } }',
      'Pool.sol': `import "./IOracle.sol";
        contract Pool {
          IOracle public oracle;
          function value() external view returns (uint256) { return oracle.price() * 2; }
        }`,
    };
    const head = { ...base, 'Oracle.sol': base['Oracle.sol'].replace('return 1;', 'return 7;') };
    const { impacted } = run(base, head);
    const value = impacted.find((i) => i.function === 'value()')!;
    expect(value).toMatchObject({ contract: 'Pool', confidence: 'medium', is_entry_point: true });
    expect(value.reasons[0].via).toBe('Oracle.price()');
  });
});
