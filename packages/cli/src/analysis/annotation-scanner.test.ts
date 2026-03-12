import { describe, it, expect } from 'vitest';
import { scanAnnotations, diffAnnotations } from './annotation-scanner.js';

describe('scanAnnotations', () => {
  it('extracts @audit-issue annotations', () => {
    const source = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract Vault {
    // @audit-issue Possible rounding error in share calculation
    uint256 shares = assets.mulDiv(totalSupply, totalAssets);
}`;

    const result = scanAnnotations([{ path: 'src/Vault.sol', source }]);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('issue');
    expect(result[0].status).toBe('unverified');
    expect(result[0].text).toBe('Possible rounding error in share calculation');
    expect(result[0].line).toBe(5);
    expect(result[0].id).toBe('A001');
  });

  it('extracts multiple annotation types', () => {
    const source = `contract Vault {
    // @audit-issue Bug here
    uint256 x;
    // @audit-question What if zero?
    uint256 y;
    // @audit-note Consider refactoring
    uint256 z;
    // @audit-issue-verified F001 confirmed
    uint256 w;
}`;

    const result = scanAnnotations([{ path: 'src/Vault.sol', source }]);
    expect(result).toHaveLength(4);
    expect(result[0].type).toBe('issue');
    expect(result[1].type).toBe('question');
    expect(result[2].type).toBe('note');
    expect(result[3].type).toBe('issue-verified');
    expect(result[3].finding_ref).toBe('F001');
  });

  it('assigns sequential IDs', () => {
    const source = `contract A {
    // @audit-issue First
    uint a;
    // @audit-issue Second
    uint b;
}`;

    const result = scanAnnotations([{ path: 'src/A.sol', source }]);
    expect(result[0].id).toBe('A001');
    expect(result[1].id).toBe('A002');
  });
});

describe('diffAnnotations', () => {
  it('detects added annotations', () => {
    const current = [
      { id: 'A001', type: 'issue' as const, status: 'unverified' as const, file: 'a.sol', line: 1, text: 'Bug' },
      { id: 'A002', type: 'issue' as const, status: 'unverified' as const, file: 'a.sol', line: 5, text: 'New bug' },
    ];
    const previous = [
      { id: 'A001', type: 'issue' as const, status: 'unverified' as const, file: 'a.sol', line: 1, text: 'Bug' },
    ];

    const diff = diffAnnotations(current, previous);
    expect(diff.added).toHaveLength(1);
    expect(diff.added[0].line).toBe(5);
    expect(diff.removed).toHaveLength(0);
  });

  it('detects removed annotations', () => {
    const current = [
      { id: 'A001', type: 'issue' as const, status: 'unverified' as const, file: 'a.sol', line: 1, text: 'Bug' },
    ];
    const previous = [
      { id: 'A001', type: 'issue' as const, status: 'unverified' as const, file: 'a.sol', line: 1, text: 'Bug' },
      { id: 'A002', type: 'issue' as const, status: 'unverified' as const, file: 'a.sol', line: 5, text: 'Old bug' },
    ];

    const diff = diffAnnotations(current, previous);
    expect(diff.removed).toHaveLength(1);
  });
});
