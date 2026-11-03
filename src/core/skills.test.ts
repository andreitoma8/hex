import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { copySkillsToClaudeFormat, MANIFEST_FILE } from './skills.js';

let tmp: string;
let bundled: string;
let target: string;

function write(p: string, content = 'x') {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
}

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hex-skills-'));
  bundled = path.join(tmp, 'bundled');
  target = path.join(tmp, 'project', '.claude', 'skills');
  write(path.join(bundled, 'write-finding.md'), '# write');
  write(path.join(bundled, 'ai-audit', 'SKILL.md'), '# ai');
  write(path.join(bundled, 'ai-audit', 'references', 'assemble.sh'), 'echo hi');
  write(path.join(bundled, 'ai-audit', 'references', 'hacking-agents', 'shared-rules.md'), 'rules');
  // A directory without SKILL.md is not a skill.
  write(path.join(bundled, 'not-a-skill', 'notes.txt'));
});

afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe('copySkillsToClaudeFormat', () => {
  it('copies single-file and directory skills', () => {
    const r = copySkillsToClaudeFormat({ targetDir: target, bundledDir: bundled });
    expect(r).toMatchObject({ added: 2, updated: 0 });
    expect(fs.readFileSync(path.join(target, 'write-finding', 'SKILL.md'), 'utf-8')).toBe(
      '# write',
    );
    expect(
      fs.existsSync(
        path.join(target, 'ai-audit', 'references', 'hacking-agents', 'shared-rules.md'),
      ),
    ).toBe(true);
    expect(fs.existsSync(path.join(target, 'not-a-skill'))).toBe(false);
    const manifest = JSON.parse(fs.readFileSync(path.join(target, MANIFEST_FILE), 'utf-8'));
    expect(manifest.skills.sort()).toEqual(['ai-audit', 'write-finding']);
  });

  it('replaces a directory skill wholesale on update', () => {
    copySkillsToClaudeFormat({ targetDir: target, bundledDir: bundled });
    write(path.join(target, 'ai-audit', 'references', 'stale.md'));
    const r = copySkillsToClaudeFormat({ targetDir: target, bundledDir: bundled });
    expect(r.updated).toBe(2);
    expect(fs.existsSync(path.join(target, 'ai-audit', 'references', 'stale.md'))).toBe(false);
  });

  it('skips existing skills with keepCustom', () => {
    copySkillsToClaudeFormat({ targetDir: target, bundledDir: bundled });
    write(path.join(target, 'ai-audit', 'SKILL.md'), '# customized');
    const r = copySkillsToClaudeFormat({
      targetDir: target,
      bundledDir: bundled,
      keepCustom: true,
    });
    expect(r.skipped).toBe(2);
    expect(fs.readFileSync(path.join(target, 'ai-audit', 'SKILL.md'), 'utf-8')).toBe(
      '# customized',
    );
  });

  it('removes only skills Hex installed, never foreign ones', () => {
    // A user's own project skill and a skill Hex shipped before.
    write(path.join(target, 'solidity-auditor', 'SKILL.md'), '# pashov');
    write(path.join(target, 'generate-overleaf', 'SKILL.md'), '# old hex skill');
    const first = copySkillsToClaudeFormat({ targetDir: target, bundledDir: bundled });
    expect(first.removed).toBe(1);
    expect(fs.existsSync(path.join(target, 'generate-overleaf'))).toBe(false);
    expect(fs.existsSync(path.join(target, 'solidity-auditor', 'SKILL.md'))).toBe(true);

    // Drop a bundled skill: the manifest says Hex owns it, so it is removed.
    fs.rmSync(path.join(bundled, 'ai-audit'), { recursive: true });
    const second = copySkillsToClaudeFormat({ targetDir: target, bundledDir: bundled });
    expect(second.removed).toBe(1);
    expect(fs.existsSync(path.join(target, 'ai-audit'))).toBe(false);
    expect(fs.existsSync(path.join(target, 'solidity-auditor', 'SKILL.md'))).toBe(true);
  });
});
