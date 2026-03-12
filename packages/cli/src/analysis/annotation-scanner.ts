import fs from 'node:fs';
import { splitLines, normalizePath } from '../core/paths.js';
import type { Annotation } from '../types/index.js';

const ANNOTATION_REGEX = /\/\/\s*@audit-(issue-verified|issue|question|note)\s+(.+)/;

/**
 * Scan a file for @audit annotations.
 */
export function scanFileAnnotations(filePath: string, source: string): Annotation[] {
  const annotations: Annotation[] = [];
  const lines = splitLines(source);
  const normalizedPath = normalizePath(filePath);

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(ANNOTATION_REGEX);
    if (!match) continue;

    const type = match[1] as Annotation['type'];
    const text = match[2].trim();
    const lineNum = i + 1;

    // Extract context: ±3 lines
    const contextStart = Math.max(0, i - 3);
    const contextEnd = Math.min(lines.length - 1, i + 3);
    const contextSnippet = lines.slice(contextStart, contextEnd + 1).join('\n');

    // Parse finding reference from verified issues
    let findingRef: string | undefined;
    if (type === 'issue-verified') {
      const refMatch = text.match(/\bF\d{3}\b/);
      if (refMatch) findingRef = refMatch[0];
    }

    annotations.push({
      id: '', // Assigned later
      type,
      status: type === 'issue-verified' ? 'verified' : type === 'issue' ? 'unverified' : 'open',
      file: normalizedPath,
      line: lineNum,
      text,
      context_snippet: contextSnippet,
      finding_ref: findingRef,
    });
  }

  return annotations;
}

/**
 * Scan multiple files and assign sequential IDs.
 */
export function scanAnnotations(
  files: Array<{ path: string; source: string }>,
): Annotation[] {
  const allAnnotations: Annotation[] = [];

  for (const file of files) {
    const fileAnnotations = scanFileAnnotations(file.path, file.source);
    allAnnotations.push(...fileAnnotations);
  }

  // Sort by file then line
  allAnnotations.sort((a, b) => {
    if (a.file !== b.file) return a.file.localeCompare(b.file);
    return a.line - b.line;
  });

  // Assign sequential IDs
  for (let i = 0; i < allAnnotations.length; i++) {
    allAnnotations[i].id = `A${String(i + 1).padStart(3, '0')}`;
  }

  return allAnnotations;
}

/**
 * Compare current annotations with previous ones to find new/changed.
 */
export function diffAnnotations(
  current: Annotation[],
  previous: Annotation[],
): { added: Annotation[]; removed: Annotation[]; changed: Annotation[] } {
  const prevMap = new Map<string, Annotation>();
  for (const a of previous) {
    prevMap.set(`${a.file}:${a.line}`, a);
  }

  const currMap = new Map<string, Annotation>();
  for (const a of current) {
    currMap.set(`${a.file}:${a.line}`, a);
  }

  const added: Annotation[] = [];
  const removed: Annotation[] = [];
  const changed: Annotation[] = [];

  for (const a of current) {
    const key = `${a.file}:${a.line}`;
    const prev = prevMap.get(key);
    if (!prev) {
      added.push(a);
    } else if (prev.text !== a.text || prev.type !== a.type) {
      changed.push(a);
    }
  }

  for (const a of previous) {
    const key = `${a.file}:${a.line}`;
    if (!currMap.has(key)) {
      removed.push(a);
    }
  }

  return { added, removed, changed };
}
