import { describe, it, expect } from 'vitest';
import {
  ConfigSchema,
  StatsSchema,
  AccessControlSchema,
  FindingsSchema,
  EvidenceSchema,
} from './schema.js';

describe('ConfigSchema', () => {
  it('validates a correct config', () => {
    const config = {
      version: '1.0',
      project: {
        name: 'TestProtocol',
        project_dir: '/path/to/project',
        commit: 'abc123',
        chain: 'ethereum',
        solidity_version: '0.8.20',
        scope: ['src/Vault.sol'],
        exclude: [],
      },
      settings: {
        output_dir: '.solaudit',
        ai_model: 'claude-sonnet-4-20250514',
        finding_template: 'default',
      },
    };

    const result = ConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it('rejects config missing required fields', () => {
    const result = ConfigSchema.safeParse({ version: '1.0' });
    expect(result.success).toBe(false);
  });

  it('applies defaults', () => {
    const config = {
      project: {
        name: 'Test',
        project_dir: '/test',
        commit: 'abc',
        solidity_version: '0.8.20',
        scope: ['src/A.sol'],
      },
      settings: {},
    };

    const result = ConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.version).toBe('1.0');
      expect(result.data.project.chain).toBe('ethereum');
      expect(result.data.settings.output_dir).toBe('.hex');
    }
  });
});

describe('EvidenceSchema', () => {
  it('validates evidence with required fields', () => {
    const result = EvidenceSchema.safeParse({
      file: 'src/Vault.sol',
      line_start: 10,
      line_end: 15,
    });
    expect(result.success).toBe(true);
  });

  it('accepts optional snippet', () => {
    const result = EvidenceSchema.safeParse({
      file: 'src/Vault.sol',
      line_start: 10,
      line_end: 15,
      snippet: 'uint256 x = 1;',
    });
    expect(result.success).toBe(true);
  });
});

describe('FindingsSchema', () => {
  it('validates a finding', () => {
    const findings = {
      findings: [
        {
          id: 'F001',
          title: 'Test Finding',
          severity: 'High',
          likelihood: 'Medium',
          impact: 'High',
          category: 'Math / Rounding',
          description: 'Test description',
          impact_detail: 'Test impact',
          root_cause: {
            summary: 'Root cause',
            locations: [{ file: 'src/Vault.sol', line_start: 10, line_end: 12 }],
          },
          poc: { status: 'passing', file: 'test/poc/F001.t.sol', validation_memo: null },
          recommendation: 'Fix it',
          references: { external_links: [] },
          created_at: '2025-03-09T15:30:00Z',
        },
      ],
    };

    const result = FindingsSchema.safeParse(findings);
    expect(result.success).toBe(true);
  });
});

