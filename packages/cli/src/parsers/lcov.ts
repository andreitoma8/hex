/**
 * Parse lcov coverage data from `forge coverage --report lcov`.
 */

export interface LcovRecord {
  sourceFile: string;
  linesFound: number;
  linesHit: number;
  branchesFound: number;
  branchesHit: number;
  uncoveredLines: number[];
}

export interface LcovReport {
  records: LcovRecord[];
  totalLinesFound: number;
  totalLinesHit: number;
  totalBranchesFound: number;
  totalBranchesHit: number;
}

/**
 * Parse lcov format text into structured coverage data.
 */
export function parseLcov(lcovText: string): LcovReport {
  const records: LcovRecord[] = [];
  let current: Partial<LcovRecord> | null = null;

  const lines = lcovText.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith('SF:')) {
      current = {
        sourceFile: trimmed.slice(3),
        linesFound: 0,
        linesHit: 0,
        branchesFound: 0,
        branchesHit: 0,
        uncoveredLines: [],
      };
    } else if (trimmed.startsWith('DA:') && current) {
      const parts = trimmed.slice(3).split(',');
      const lineNum = parseInt(parts[0], 10);
      const hitCount = parseInt(parts[1], 10);
      if (hitCount === 0) {
        current.uncoveredLines!.push(lineNum);
      }
    } else if (trimmed.startsWith('LF:') && current) {
      current.linesFound = parseInt(trimmed.slice(3), 10);
    } else if (trimmed.startsWith('LH:') && current) {
      current.linesHit = parseInt(trimmed.slice(3), 10);
    } else if (trimmed.startsWith('BRF:') && current) {
      current.branchesFound = parseInt(trimmed.slice(4), 10);
    } else if (trimmed.startsWith('BRH:') && current) {
      current.branchesHit = parseInt(trimmed.slice(4), 10);
    } else if (trimmed === 'end_of_record' && current) {
      records.push(current as LcovRecord);
      current = null;
    }
  }

  const totalLinesFound = records.reduce((s, r) => s + r.linesFound, 0);
  const totalLinesHit = records.reduce((s, r) => s + r.linesHit, 0);
  const totalBranchesFound = records.reduce((s, r) => s + r.branchesFound, 0);
  const totalBranchesHit = records.reduce((s, r) => s + r.branchesHit, 0);

  return {
    records,
    totalLinesFound,
    totalLinesHit,
    totalBranchesFound,
    totalBranchesHit,
  };
}

/**
 * Calculate coverage percentage.
 */
export function coveragePct(hit: number, found: number): number {
  if (found === 0) return 100;
  return Math.round((hit / found) * 1000) / 10;
}
