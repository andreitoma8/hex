import { describe, it, expect } from 'vitest';
import { countNsloc, getCommentRanges, getAssemblyRanges } from './nsloc.js';

describe('countNsloc', () => {
  it('counts lines correctly for simple source', () => {
    const source = `pragma solidity ^0.8.20;

// A simple contract
contract Vault {
    uint256 public x;

    function set(uint256 _x) external {
        x = _x;
    }
}`;

    const commentRanges = [{ start: 3, end: 3 }];
    const assemblyRanges: Array<{ start: number; end: number }> = [];

    const result = countNsloc(source, commentRanges, assemblyRanges);
    expect(result.totalLines).toBe(10);
    expect(result.blankLines).toBe(2);
    expect(result.commentLines).toBe(1);
    expect(result.nsloc).toBe(7);
    expect(result.assemblyLines).toBe(0);
  });

  it('counts assembly lines', () => {
    const source = `contract A {
    function foo() external {
        assembly {
            mstore(0, 1)
            mstore(32, 2)
        }
    }
}`;

    const assemblyRanges = [{ start: 3, end: 6 }];
    const result = countNsloc(source, [], assemblyRanges);
    expect(result.assemblyLines).toBe(4);
  });
});

describe('getAssemblyRanges', () => {
  it('detects assembly blocks', () => {
    const source = `contract A {
    function foo() external {
        assembly {
            mstore(0, 1)
        }
    }
}`;
    const ranges = getAssemblyRanges(source);
    expect(ranges).toHaveLength(1);
    expect(ranges[0].start).toBe(3);
    expect(ranges[0].end).toBe(5);
  });

  it('handles no assembly', () => {
    const source = `contract A { function foo() external {} }`;
    const ranges = getAssemblyRanges(source);
    expect(ranges).toHaveLength(0);
  });
});
