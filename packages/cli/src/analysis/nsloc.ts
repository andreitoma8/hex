import { splitLines } from '../core/paths.js';

export interface NslocResult {
  totalLines: number;
  nsloc: number;
  commentLines: number;
  blankLines: number;
  assemblyLines: number;
}

/**
 * Count nSLOC, comments, blank lines, and assembly lines from source text.
 * Uses comment ranges from the parser and InlineAssembly detection.
 */
export function countNsloc(
  source: string,
  commentRanges: Array<{ start: number; end: number }>,
  assemblyRanges: Array<{ start: number; end: number }>,
): NslocResult {
  const lines = splitLines(source);
  const totalLines = lines.length;

  // Build sets of line numbers that are comments or assembly
  const commentLineSet = new Set<number>();
  const assemblyLineSet = new Set<number>();

  for (const range of commentRanges) {
    for (let i = range.start; i <= range.end; i++) {
      commentLineSet.add(i);
    }
  }

  for (const range of assemblyRanges) {
    for (let i = range.start; i <= range.end; i++) {
      assemblyLineSet.add(i);
    }
  }

  let blankLines = 0;
  let commentLines = 0;
  let assemblyLines = 0;
  let nsloc = 0;

  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    const trimmed = lines[i].trim();

    if (trimmed === '') {
      blankLines++;
    } else if (commentLineSet.has(lineNum)) {
      // Check if the line is purely a comment (no code on the same line)
      // For simplicity, if the line is in a comment range, count it as comment
      commentLines++;
    } else {
      nsloc++;
      if (assemblyLineSet.has(lineNum)) {
        assemblyLines++;
      }
    }
  }

  return { totalLines, nsloc, commentLines, blankLines, assemblyLines };
}

/**
 * Extract comment line ranges from parser tokens.
 */
export function getCommentRanges(
  comments: Array<{ loc?: { start: { line: number }; end: { line: number } } }>,
): Array<{ start: number; end: number }> {
  return comments
    .filter((c) => c.loc)
    .map((c) => ({
      start: c.loc!.start.line,
      end: c.loc!.end.line,
    }));
}

/**
 * Find assembly block ranges from source using regex.
 * Returns line ranges of `assembly { ... }` blocks.
 */
export function getAssemblyRanges(source: string): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = [];
  const lines = splitLines(source);

  let inAssembly = false;
  let braceCount = 0;
  let startLine = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (!inAssembly) {
      // Look for `assembly {` or `assembly "evmasm" {`
      if (/\bassembly\b/.test(line)) {
        inAssembly = true;
        startLine = i + 1;
        braceCount = 0;
        // Count braces on this line
        for (const ch of line) {
          if (ch === '{') braceCount++;
          if (ch === '}') braceCount--;
        }
        if (braceCount <= 0 && line.includes('{')) {
          // Single-line assembly block
          ranges.push({ start: startLine, end: i + 1 });
          inAssembly = false;
        }
      }
    } else {
      for (const ch of line) {
        if (ch === '{') braceCount++;
        if (ch === '}') braceCount--;
      }
      if (braceCount <= 0) {
        ranges.push({ start: startLine, end: i + 1 });
        inAssembly = false;
      }
    }
  }

  return ranges;
}
