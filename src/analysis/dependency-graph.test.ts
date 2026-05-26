import { describe, it, expect } from 'vitest';
import { buildDependencyGraph } from './dependency-graph.js';
import type { ParsedContract, ParsedImport } from '../parsers/solidity-parser.js';

function makeContract(name: string, baseContracts: string[] = []): ParsedContract {
  return {
    name,
    type: 'contract',
    baseContracts,
    functions: [],
    modifiers: [],
    events: [],
    errors: [],
    stateVariables: [],
    structs: [],
    enums: [],
  };
}

function makeImport(filePath: string): ParsedImport {
  return { path: filePath, symbols: [], lineStart: 1 };
}

describe('buildDependencyGraph', () => {
  it('builds inheritance edges', () => {
    const fileData = new Map<string, { contracts: ParsedContract[]; imports: ParsedImport[] }>();
    fileData.set('src/Vault.sol', {
      contracts: [makeContract('Vault', ['ERC4626', 'Ownable'])],
      imports: [],
    });
    fileData.set('src/ERC4626.sol', {
      contracts: [makeContract('ERC4626')],
      imports: [],
    });
    fileData.set('src/Ownable.sol', {
      contracts: [makeContract('Ownable')],
      imports: [],
    });

    const result = buildDependencyGraph(fileData, new Map());

    expect(result.graph['Vault'].inherits).toContain('ERC4626');
    expect(result.graph['Vault'].inherits).toContain('Ownable');
  });

  it('produces topological order', () => {
    const fileData = new Map<string, { contracts: ParsedContract[]; imports: ParsedImport[] }>();
    fileData.set('a.sol', {
      contracts: [makeContract('A', ['B'])],
      imports: [],
    });
    fileData.set('b.sol', {
      contracts: [makeContract('B', ['C'])],
      imports: [],
    });
    fileData.set('c.sol', {
      contracts: [makeContract('C')],
      imports: [],
    });

    const result = buildDependencyGraph(fileData, new Map());

    const order = result.topologicalOrder;
    expect(order.indexOf('C')).toBeLessThan(order.indexOf('B'));
    expect(order.indexOf('B')).toBeLessThan(order.indexOf('A'));
  });

  it('detects clusters', () => {
    const fileData = new Map<string, { contracts: ParsedContract[]; imports: ParsedImport[] }>();
    // Cluster 1: A->B
    fileData.set('a.sol', {
      contracts: [makeContract('A', ['B'])],
      imports: [],
    });
    fileData.set('b.sol', {
      contracts: [makeContract('B')],
      imports: [],
    });
    // Cluster 2: C (isolated)
    fileData.set('c.sol', {
      contracts: [makeContract('C')],
      imports: [],
    });

    const result = buildDependencyGraph(fileData, new Map());

    expect(result.clusters).toHaveLength(2);
    const clusterContracts = result.clusters.map((c) => c.contracts.sort());
    expect(clusterContracts).toContainEqual(['A', 'B']);
    expect(clusterContracts).toContainEqual(['C']);
  });
});
