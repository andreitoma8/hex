import { describe, it, expect } from 'vitest';
import { parseLcov, coveragePct } from './lcov.js';

const SAMPLE_LCOV = `SF:src/Vault.sol
DA:1,5
DA:2,5
DA:3,0
DA:4,5
DA:5,0
LF:5
LH:3
BRF:4
BRH:2
end_of_record
SF:src/Strategy.sol
DA:1,10
DA:2,0
DA:3,10
LF:3
LH:2
BRF:2
BRH:1
end_of_record`;

describe('parseLcov', () => {
  it('parses lcov records correctly', () => {
    const report = parseLcov(SAMPLE_LCOV);

    expect(report.records).toHaveLength(2);
    expect(report.records[0].sourceFile).toBe('src/Vault.sol');
    expect(report.records[0].linesFound).toBe(5);
    expect(report.records[0].linesHit).toBe(3);
    expect(report.records[0].branchesFound).toBe(4);
    expect(report.records[0].branchesHit).toBe(2);
    expect(report.records[0].uncoveredLines).toEqual([3, 5]);

    expect(report.records[1].sourceFile).toBe('src/Strategy.sol');
    expect(report.records[1].uncoveredLines).toEqual([2]);
  });

  it('computes totals correctly', () => {
    const report = parseLcov(SAMPLE_LCOV);

    expect(report.totalLinesFound).toBe(8);
    expect(report.totalLinesHit).toBe(5);
    expect(report.totalBranchesFound).toBe(6);
    expect(report.totalBranchesHit).toBe(3);
  });

  it('handles empty input', () => {
    const report = parseLcov('');
    expect(report.records).toHaveLength(0);
    expect(report.totalLinesFound).toBe(0);
  });
});

describe('coveragePct', () => {
  it('calculates percentage correctly', () => {
    expect(coveragePct(3, 5)).toBe(60);
    expect(coveragePct(0, 10)).toBe(0);
    expect(coveragePct(10, 10)).toBe(100);
  });

  it('returns 100 when found is 0', () => {
    expect(coveragePct(0, 0)).toBe(100);
  });
});
