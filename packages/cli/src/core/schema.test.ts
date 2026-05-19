import { describe, it, expect } from 'vitest';
import {
  ConfigSchema,
  AccessControlSchema,
  FindingsSchema,
  EvidenceSchema,
  ComparisonSchema,
  RoleSchema,
  StateVarsSchema,
  GithubLinkSchema,
  GithubSyncStatusSchema,
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

  it('accepts optional severity_reasoning with likelihood × impact mapping', () => {
    const finding = {
      id: 'F002',
      title: 'With reasoning',
      severity: 'Critical',
      severity_reasoning: {
        likelihood: 'High' as const,
        impact: 'Critical' as const,
        justification: 'Anyone can trigger; direct loss of all vault funds.',
      },
      category: 'Math',
      description: 'd',
      root_cause: { locations: [{ file: 'src/A.sol' }] },
      poc: { status: 'passing' as const, file: 'test/A.t.sol', validation_memo: null },
      recommendation: 'r',
      references: { external_links: [] },
      created_at: '2025-04-01T00:00:00Z',
    };
    const result = FindingsSchema.safeParse({ findings: [finding] });
    expect(result.success).toBe(true);
  });
});

describe('ComparisonSchema', () => {
  it('accepts a duplicate with match_signals + reasoning', () => {
    const dup = {
      duplicates: [
        {
          ai_finding: 'solidity-auditor-001',
          matches: 'F001',
          confidence: 'high' as const,
          match_signals: {
            contract: true,
            function: true,
            root_cause: 'same' as const,
            attack_vector: 'same' as const,
          },
          reasoning: 'Same share-inflation attack in Vault.deposit',
        },
      ],
      novel: [],
      rejected: [],
    };
    const result = ComparisonSchema.safeParse(dup);
    expect(result.success).toBe(true);
  });

  it('still accepts old-format duplicates without match_signals', () => {
    const result = ComparisonSchema.safeParse({
      duplicates: [{ ai_finding: 'x-1', matches: 'F001', confidence: 'medium' }],
      novel: [],
      rejected: [],
    });
    expect(result.success).toBe(true);
  });
});

describe('RoleSchema', () => {
  it('defaults kind to access_control and is_likely_access_control to true', () => {
    const result = RoleSchema.safeParse({
      role: 'owner',
      description: 'Ownable',
      confidence: 'high' as const,
      derived_from: 'solc-ast' as const,
      reasoning: 'Detected from OZ Ownable',
      modifier: 'onlyOwner',
      functions: [],
      warnings: [],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.kind).toBe('access_control');
      expect(result.data.is_likely_access_control).toBe(true);
    }
  });

  it('accepts explicit unknown kind for inferred modifiers', () => {
    const result = RoleSchema.safeParse({
      role: 'duringPause',
      description: 'inferred',
      confidence: 'low' as const,
      derived_from: 'heuristic' as const,
      reasoning: 'r',
      modifier: 'onlyDuringPause',
      functions: [],
      warnings: ['inferred from name only'],
      kind: 'unknown' as const,
      is_likely_access_control: false,
    });
    expect(result.success).toBe(true);
  });
});

describe('StateVarsSchema', () => {
  it('defaults storage_collisions to an empty array', () => {
    const result = StateVarsSchema.safeParse({
      variables: [],
      storage_layout_source: null,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.storage_collisions).toEqual([]);
    }
  });

  it('accepts a recorded collision', () => {
    const result = StateVarsSchema.safeParse({
      variables: [],
      storage_layout_source: 'compiler-artifact' as const,
      storage_collisions: [
        {
          slot: 0,
          offset: 0,
          variables: [
            { contract: 'Proxy', name: '_owner', type: 'address' },
            { contract: 'Impl', name: 'totalSupply', type: 'uint256' },
          ],
          severity: 'Critical' as const,
          description: 'Proxy slot 0 vs implementation totalSupply',
        },
      ],
    });
    expect(result.success).toBe(true);
  });
});

// `AccessControlSchema` is re-exported; touch it so the import is exercised
describe('AccessControlSchema', () => {
  it('parses an empty access-control payload', () => {
    const result = AccessControlSchema.safeParse({ functions: [], roles: [] });
    expect(result.success).toBe(true);
  });
});

describe('GithubLinkSchema', () => {
  it('accepts a populated finding link with comments', () => {
    const result = GithubLinkSchema.safeParse({
      issue_number: 42,
      issue_url: 'https://github.com/nethermind/audit-vaultx/issues/42',
      state: 'open' as const,
      last_synced_at: '2026-05-19T12:00:00Z',
      sync_status: 'in_sync' as const,
      comments: [
        {
          author: 'alice',
          body: 'lgtm — verified locally',
          created_at: '2026-05-19T11:55:00Z',
          url: 'https://github.com/nethermind/audit-vaultx/issues/42#issuecomment-1',
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('defaults state to open and comments to []', () => {
    const result = GithubLinkSchema.safeParse({
      issue_number: 7,
      issue_url: 'https://github.com/x/y/issues/7',
      last_synced_at: '2026-05-19T12:00:00Z',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.state).toBe('open');
      expect(result.data.comments).toEqual([]);
    }
  });
});

describe('ConfigSchema.settings.github', () => {
  it('defaults default_labels and publish_status when only repo is set', () => {
    const result = ConfigSchema.safeParse({
      project: {
        name: 'Test',
        project_dir: '/test',
        commit: 'abc',
        solidity_version: '0.8.20',
        scope: ['src/A.sol'],
      },
      settings: { github: { repo: 'nethermind/audit-vaultx' } },
    });
    expect(result.success).toBe(true);
    if (result.success && result.data.settings.github) {
      expect(result.data.settings.github.default_labels).toEqual(['hex', 'audit']);
      expect(result.data.settings.github.publish_status).toEqual(['verified']);
    }
  });

  it('is optional — configs without github still validate', () => {
    const result = ConfigSchema.safeParse({
      project: {
        name: 'Test',
        project_dir: '/test',
        commit: 'abc',
        solidity_version: '0.8.20',
        scope: ['src/A.sol'],
      },
      settings: {},
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.settings.github).toBeUndefined();
  });
});

describe('FindingSchema.github round-trip', () => {
  it('accepts a finding carrying a github link', () => {
    const result = FindingsSchema.safeParse({
      findings: [
        {
          id: 'F010',
          title: 'Linked to GitHub',
          severity: 'High' as const,
          category: 'Access Control',
          description: 'd',
          root_cause: { locations: [{ file: 'src/A.sol' }] },
          poc: { status: 'not_started' as const, file: null, validation_memo: null },
          recommendation: 'r',
          references: { external_links: [] },
          created_at: '2026-05-19T00:00:00Z',
          github: {
            issue_number: 99,
            issue_url: 'https://github.com/x/y/issues/99',
            state: 'open' as const,
            last_synced_at: '2026-05-19T01:00:00Z',
          },
        },
      ],
    });
    expect(result.success).toBe(true);
  });
});

describe('GithubSyncStatusSchema', () => {
  it('applies defaults for counters', () => {
    const result = GithubSyncStatusSchema.safeParse({
      repo: 'nethermind/audit-vaultx',
      last_synced_at: '2026-05-19T12:00:00Z',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.pushed).toBe(0);
      expect(result.data.errors).toEqual([]);
    }
  });
});

