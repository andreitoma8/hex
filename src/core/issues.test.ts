import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createIssue, ensureFindingExists } from './issues.js';

let dir: string;
const write = (rel: string, data: unknown) => {
  const p = path.join(dir, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(data));
};
const read = (rel: string) => JSON.parse(fs.readFileSync(path.join(dir, rel), 'utf-8'));

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hex-issues-'));
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('ai-audit source', () => {
  beforeEach(() => {
    write('ai-results/ai-audit/findings.json', {
      tool: 'ai-audit',
      findings: [
        {
          id: 'AI-001',
          title: 'Raw title',
          severity: 'High',
          category: 'Reentrancy',
          description: 'Expected.\n\nFlaw.\n\nImpact.',
          recommendation: 'Consider a guard.',
          affected_code: [{ file: 'src/Vault.sol', snippet: 'call();' }],
          scan_key: 'vault|withdraw|reentrancy',
        },
      ],
    });
  });

  it('materializes the record and starts unverified', () => {
    const id = createIssue(dir, { source: 'ai-audit', source_ref: 'AI-001', title: 'Card title' });
    expect(id).toBe('H-001');
    const t = read('tracking.json').findings[0];
    expect(t).toMatchObject({ source: 'ai-audit', status: 'unverified', source_ref: 'AI-001' });
    const f = read('findings.json').findings[0];
    expect(f).toMatchObject({
      title: 'Card title',
      severity: 'High',
      category: 'Reentrancy',
      description: 'Expected.\n\nFlaw.\n\nImpact.',
      recommendation: 'Consider a guard.',
    });
    expect(f.root_cause.locations).toEqual([{ file: 'src/Vault.sol', snippet: 'call();' }]);
  });
});

describe('prior-audit source', () => {
  it('materializes a regression from previous-audit/findings.json', () => {
    write('previous-audit/findings.json', {
      imported_at: 'x',
      source_path: '/old',
      findings: [
        {
          id: 'M-02',
          title: 'Fee can exceed 100%',
          severity: 'Medium',
          description: 'Old text.',
          locations: [{ file: 'src/Vault.sol', snippet: 'feeBps = _feeBps;' }],
          source: 'report',
        },
      ],
    });
    const id = createIssue(dir, {
      source: 'prior-audit',
      source_ref: 'M-02',
      title: 'Regression: fee can exceed 100%',
    });
    const t = read('tracking.json').findings[0];
    expect(t).toMatchObject({ source: 'prior-audit', status: 'pending_validation' });
    const f = ensureFindingExists(dir, id);
    expect(f).toMatchObject({
      category: 'Regression',
      severity: 'Medium',
      description: 'Old text.',
    });
  });
});
