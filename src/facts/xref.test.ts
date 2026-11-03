import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import type { BuildInfo } from './extract.js';
import { docSentence, extractXref } from './xref.js';
import { findImplementations, type ImplCandidate } from './implementations.js';

const bi = JSON.parse(
  fs.readFileSync(path.join(__dirname, '__fixtures__', 'rich.build-info.json'), 'utf-8'),
) as BuildInfo;
const xref = extractXref([bi], { inScope: (f) => f.startsWith('src/') });
const text = (file: string, line: number, col: number, len: number) =>
  bi.input!.sources![file].content!.split('\n')[line - 1].slice(col, col + len);
const refsTo = (file: string, key: string) => xref.refs[file].filter((r) => r[3] === key);

describe('navigation index (xref)', () => {
  it('points every reference at the exact identifier in the source', () => {
    for (const [file, list] of Object.entries(xref.refs)) {
      for (const [line, col, len, key] of list) {
        const name = xref.decls[key].name;
        expect(text(file, line, col, len), `${file}:${line}:${col} → ${key}`).toBe(name);
      }
    }
  });

  it('covers calls, members, modifiers, types, events, inheritance and libraries', () => {
    const base = 'src/Base.sol';
    // internal call, library member call (`.mulDiv`), interface member call (`oracle.price()`)
    expect(refsTo(base, 'BaseVault.fee(uint256)').some((r) => r[0] === 32 && r[4] === 0)).toBe(
      true,
    );
    expect(refsTo(base, 'MathLib.mulDiv(uint256,uint256,uint256)').map((r) => r[0])).toContain(33);
    expect(refsTo(base, 'IOracle.price()').map((r) => r[0])).toContain(46);
    // modifier invocation, struct type, emitted event, inheritance specifier
    expect(refsTo(base, 'Owned.onlyOwner()').map((r) => [r[0], r[4]])).toEqual([
      [8, 1],
      [49, 0],
    ]);
    expect(refsTo(base, 'BaseVault.Position').map((r) => r[0])).toEqual([18, 21]);
    expect(refsTo(base, 'BaseVault.Deposited').map((r) => r[0])).toEqual([25, 37]);
    expect(refsTo(base, 'Owned').map((r) => r[0])).toEqual([6, 15]);
    // `super.fee` in Vault resolves to the base implementation
    expect(refsTo('src/Vault.sol', 'BaseVault.fee(uint256)').map((r) => r[0])).toEqual([11]);
  });

  it('records declarations with kinds, name positions, ranges and signatures', () => {
    expect(xref.decls['BaseVault.deposit(uint256)']).toMatchObject({
      kind: 'function',
      contract: 'BaseVault',
      file: 'src/Base.sol',
      line: 31,
      line_start: 31,
      line_end: 38,
      signature: 'deposit(uint256)',
      in_scope: true,
    });
    expect(xref.decls['BaseVault.totalAssets']).toMatchObject({
      kind: 'state_var',
      signature: 'uint256 totalAssets',
    });
    expect(xref.decls['IOracle']).toMatchObject({ kind: 'interface' });
    expect(xref.decls['BaseVault.Deposited']).toMatchObject({
      kind: 'event',
      signature: 'Deposited(address,uint256)',
    });
  });

  it('resolves interface and virtual functions to implementations', () => {
    expect(xref.impls['IOracle.price()']).toEqual([{ id: 'Oracle.price()', by: 'override' }]);
    expect(xref.impls['BaseVault.fee(uint256)']).toEqual([
      { id: 'Vault.fee(uint256)', by: 'override' },
    ]);
  });

  it('counts a public mapping getter as the implementation of an interface function', () => {
    const content =
      'interface I { function bal(address a) external view returns (uint256); }\ncontract T { mapping(address => uint256) public bal; }\n';
    const buf = Buffer.from(content, 'utf-8');
    const at = (n: string) => buf.indexOf(n);
    const ast = {
      nodeType: 'SourceUnit',
      nodes: [
        {
          id: 1,
          nodeType: 'ContractDefinition',
          name: 'I',
          contractKind: 'interface',
          src: `0:${buf.indexOf('\n')}:0`,
          nodes: [
            {
              id: 2,
              nodeType: 'FunctionDefinition',
              name: 'bal',
              kind: 'function',
              parameters: { parameters: [{ typeDescriptions: { typeString: 'address' } }] },
              src: `${at('function')}:20:0`,
            },
          ],
        },
        {
          id: 3,
          nodeType: 'ContractDefinition',
          name: 'T',
          contractKind: 'contract',
          abstract: false,
          src: `${at('contract')}:50:0`,
          nodes: [
            {
              id: 4,
              nodeType: 'VariableDeclaration',
              name: 'bal',
              stateVariable: true,
              visibility: 'public',
              typeDescriptions: { typeString: 'mapping(address => uint256)' },
              typeName: {
                nodeType: 'Mapping',
                keyType: { typeDescriptions: { typeString: 'address' } },
                valueType: { typeDescriptions: { typeString: 'uint256' } },
              },
              src: `${at('mapping')}:38:0`,
            },
          ],
        },
      ],
    };
    const x = extractXref(
      [
        {
          input: { sources: { 'A.sol': { content } } },
          output: { sources: { 'A.sol': { id: 0, ast } } },
        },
      ],
      { inScope: () => true },
    );
    expect(x.impls['I.bal(address)']).toEqual([{ id: 'T.bal', by: 'signature' }]);
  });

  it('converts UTF-8 byte offsets to UTF-16 columns', () => {
    const content =
      'contract A {\n  function f() internal {}\n  function g() internal { /* é → */ f(); }\n}\n';
    const buf = Buffer.from(content, 'utf-8');
    const at = (needle: string, from = 0) => buf.indexOf(needle, from);
    const fStart = at('function f');
    const gStart = at('function g');
    const call = at('f();', gStart);
    const ast = {
      nodeType: 'SourceUnit',
      nodes: [
        {
          id: 1,
          nodeType: 'ContractDefinition',
          name: 'A',
          contractKind: 'contract',
          abstract: false,
          src: `0:${buf.length}:0`,
          nameLocation: `${at('A')}:1:0`,
          nodes: [
            {
              id: 2,
              nodeType: 'FunctionDefinition',
              name: 'f',
              kind: 'function',
              parameters: { parameters: [] },
              src: `${fStart}:24:0`,
              nameLocation: `${fStart + 9}:1:0`,
            },
            {
              id: 3,
              nodeType: 'FunctionDefinition',
              name: 'g',
              kind: 'function',
              parameters: { parameters: [] },
              src: `${gStart}:${buf.indexOf('}', call) + 1 - gStart}:0`,
              nameLocation: `${gStart + 9}:1:0`,
              body: {
                nodeType: 'Block',
                statements: [
                  {
                    nodeType: 'ExpressionStatement',
                    expression: {
                      nodeType: 'Identifier',
                      id: 4,
                      name: 'f',
                      referencedDeclaration: 2,
                      src: `${call}:1:0`,
                    },
                  },
                ],
              },
            },
          ],
        },
      ],
    };
    const x = extractXref(
      [
        {
          input: { sources: { 'A.sol': { content } } },
          output: { sources: { 'A.sol': { id: 0, ast } } },
        },
      ],
      { inScope: () => true },
    );
    const lines = content.split('\n');
    const use = x.refs['A.sol'].find((r) => r[3] === 'A.f()' && r[4] === 0)!;
    expect(use[0]).toBe(3);
    expect(use[1]).toBe(lines[2].indexOf('f();'));
    expect(lines[2].slice(use[1], use[1] + use[2])).toBe('f');
  });

  it('reads the first NatSpec sentence', () => {
    expect(docSentence({ text: ' @notice Deposit assets. Mints shares.\n @param a x' })).toBe(
      'Deposit assets.',
    );
    expect(docSentence({ text: '@dev Internal helper\n that rounds down' })).toBe(
      'Internal helper that rounds down',
    );
    expect(docSentence(undefined)).toBeUndefined();
  });
});

describe('findImplementations', () => {
  const c = (
    id: string,
    contractKind: ImplCandidate['contractKind'],
    overrides: string[] = [],
    in_scope = true,
  ): ImplCandidate => ({
    id,
    contract: id.split('.')[0],
    signature: id.slice(id.indexOf('.') + 1),
    contractKind,
    in_scope,
    overrides,
  });
  const fns = [
    c('IToken.transfer(address,uint256)', 'interface'),
    c('MockToken.transfer(address,uint256)', 'contract'),
    c('Base.transfer(address,uint256)', 'abstract', ['IToken.transfer(address,uint256)']),
    c('Impl.transfer(address,uint256)', 'contract', ['Base.transfer(address,uint256)']),
    c('Other.transfer(address,uint256)', 'contract', [], false),
    c('ILike.transfer(address,uint256)', 'interface'),
  ];

  it('lists overrides through chains first, then same-signature contracts in scope', () => {
    expect(findImplementations(fns, 'IToken.transfer(address,uint256)')).toEqual([
      { id: 'Base.transfer(address,uint256)', by: 'override' },
      { id: 'Impl.transfer(address,uint256)', by: 'override' },
      { id: 'MockToken.transfer(address,uint256)', by: 'signature' },
    ]);
  });

  it('matches by signature only for interfaces', () => {
    expect(findImplementations(fns, 'Base.transfer(address,uint256)')).toEqual([
      { id: 'Impl.transfer(address,uint256)', by: 'override' },
    ]);
    expect(findImplementations(fns, 'Nope.x()')).toEqual([]);
  });
});
