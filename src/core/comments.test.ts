import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  addComment,
  auditLines,
  commentsForFile,
  commentsMarkdown,
  deleteComment,
  editComment,
  readComments,
  removeCommentFromSource,
  restoreComment,
  writeCommentToSource,
} from './comments.js';

const SOURCE = [
  '// SPDX-License-Identifier: MIT',
  'pragma solidity ^0.8.20;',
  '',
  'contract Vault {',
  '    uint256 public feeBps;',
  '',
  '    function setFee(uint256 _feeBps) external {',
  '        feeBps = _feeBps;',
  '    }',
  '}',
  '',
].join('\n');

let project: string;
let out: string;
const file = 'src/Vault.sol';
const abs = () => path.join(project, file);
const lines = () => fs.readFileSync(abs(), 'utf-8').split('\n');

beforeEach(() => {
  project = fs.mkdtempSync(path.join(os.tmpdir(), 'hex-comments-'));
  out = path.join(project, '.hex');
  fs.mkdirSync(path.join(project, 'src'), { recursive: true });
  fs.mkdirSync(out);
  fs.writeFileSync(abs(), SOURCE);
  fs.writeFileSync(
    path.join(out, 'config.json'),
    JSON.stringify({ project: { project_dir: project } }),
  );
});
afterEach(() => fs.rmSync(project, { recursive: true, force: true }));

describe('code comments', () => {
  it('pins a comment to its code and follows the code when lines move', () => {
    const c = addComment(out, { file, line_start: 8, line_end: 8, text: 'No upper bound.' });
    expect(c).toMatchObject({ id: 'C-001', snippet: '        feeBps = _feeBps;' });
    // Two lines appear above the function: the comment moves with its code.
    fs.writeFileSync(abs(), SOURCE.replace('contract Vault {', 'contract Vault {\n    // a\n'));
    const [view] = commentsForFile(out, file);
    expect(view).toMatchObject({ line_start: 10, line_end: 10 });
    expect(view.stale).toBeUndefined();
    expect(readComments(out)[0].line_start).toBe(10);
    // The code is gone: the comment stays, marked stale.
    fs.writeFileSync(abs(), SOURCE.replace('feeBps = _feeBps;', 'feeBps = 1;'));
    expect(commentsForFile(out, file)[0].stale).toBe(true);
  });

  it('writes @audit lines above the code, indented, and takes them out again', () => {
    const a = addComment(out, { file, line_start: 8, line_end: 8, text: 'No cap.\nOwner only.' });
    const b = addComment(out, { file, line_start: 9, line_end: 9, text: 'Closing brace.' });
    const w = writeCommentToSource(out, a.id);
    expect(lines().slice(7, 9)).toEqual(['        // @audit No cap.', '        // Owner only.']);
    expect(w).toMatchObject({ line_start: 10, line_end: 10 });
    // The other comment on the same file moved down with its code.
    expect(readComments(out).find((c) => c.id === b.id)).toMatchObject({ line_start: 11 });
    expect(commentsForFile(out, file).every((c) => !c.stale)).toBe(true);

    // Editing a comment that sits in the file rewrites the file too.
    editComment(out, a.id, 'Cap it at 10%.');
    expect(lines()[7]).toBe('        // @audit Cap it at 10%.');
    expect(lines()[8]).toBe('        feeBps = _feeBps;');

    removeCommentFromSource(out, a.id);
    expect(fs.readFileSync(abs(), 'utf-8')).toBe(SOURCE);
    expect(readComments(out).find((c) => c.id === b.id)).toMatchObject({ line_start: 9 });
  });

  it('refuses to remove @audit lines someone edited in the file', () => {
    const a = addComment(out, { file, line_start: 8, line_end: 8, text: 'No cap.' });
    writeCommentToSource(out, a.id);
    fs.writeFileSync(abs(), fs.readFileSync(abs(), 'utf-8').replace('No cap.', 'No cap!'));
    expect(() => removeCommentFromSource(out, a.id)).toThrow(/changed in the file/);
  });

  it('deletes (out of the file too) and restores for undo', () => {
    const a = addComment(out, { file, line_start: 8, line_end: 8, text: 'No cap.' });
    writeCommentToSource(out, a.id);
    const gone = deleteComment(out, a.id);
    expect(fs.readFileSync(abs(), 'utf-8')).toBe(SOURCE);
    expect(readComments(out)).toHaveLength(0);
    restoreComment(out, gone);
    expect(commentsForFile(out, file)[0]).toMatchObject({ id: 'C-001', line_start: 8 });
  });

  it('renders markdown for agents and formats @audit lines', () => {
    addComment(out, { file, line_start: 7, line_end: 9, text: 'Owner can set any fee.' });
    expect(commentsMarkdown(out)).toContain('**C-001** (lines 7-9): Owner can set any fee.');
    expect(auditLines('a\n\nb', '  ')).toEqual(['  // @audit a', '  //', '  // b']);
  });
});
