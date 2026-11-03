import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createHexServer } from './server.js';
import { extractFacts, type BuildInfo } from '../facts/extract.js';

const bi = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, '..', 'facts', '__fixtures__', 'rich.build-info.json'),
    'utf-8',
  ),
) as BuildInfo;

let project: string;
let client: Client;

async function call(name: string, args: Record<string, unknown> = {}) {
  const r = (await client.callTool({ name, arguments: args })) as {
    content: Array<{ text: string }>;
    isError?: boolean;
  };
  const text = r.content[0].text;
  let data: unknown = text;
  try {
    data = JSON.parse(text);
  } catch {
    /* plain text */
  }
  return { data: data as any, isError: Boolean(r.isError) }; // eslint-disable-line @typescript-eslint/no-explicit-any
}

beforeAll(async () => {
  project = fs.mkdtempSync(path.join(os.tmpdir(), 'hex-mcp-'));
  const out = path.join(project, '.hex');
  fs.mkdirSync(out);
  for (const [p, src] of Object.entries(bi.input!.sources!)) {
    fs.mkdirSync(path.join(project, path.dirname(p)), { recursive: true });
    fs.writeFileSync(path.join(project, p), src.content!);
  }
  fs.writeFileSync(
    path.join(out, 'config.json'),
    JSON.stringify({ project: { project_dir: project, scope: [] }, settings: {} }),
  );
  fs.writeFileSync(
    path.join(out, 'facts.json'),
    JSON.stringify(
      extractFacts([bi], { inScope: (f) => f.startsWith('src/'), toolchain: 'foundry' }),
    ),
  );

  const server = createHexServer(project);
  const [a, b] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: 'test', version: '0' });
  await Promise.all([server.connect(a), client.connect(b)]);
});
afterAll(() => fs.rmSync(project, { recursive: true, force: true }));

describe('hex mcp', () => {
  it('lists the tools and serves instructions', async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'hex_focus',
        'hex_facts_query',
        'hex_issue_new',
        'hex_issue_validation',
        'hex_review_mark',
        'hex_rules_add',
        'hex_code_comments',
      ]),
    );
    expect(client.getInstructions()).toContain('hex_focus');
  });

  it('returns the dashboard focus enriched with facts', async () => {
    expect((await call('hex_focus')).data.focus).toBeNull();
    fs.writeFileSync(
      path.join(project, '.hex', 'focus.json'),
      JSON.stringify({
        ref: 'Vault.sweep',
        kind: 'function',
        label: 'Vault.sweep',
        updated_at: new Date().toISOString(),
      }),
    );
    const { data } = await call('hex_focus');
    expect(data.focus.ref).toBe('Vault.sweep');
    expect(data.functions[0]).toMatchObject({
      id: 'Vault.sweep(address)',
      modifiers: ['Owned.onlyOwner()'],
    });
    expect(data.functions[0].review.state).toBe('unread');
  });

  it('answers exact fact queries', async () => {
    const { data } = await call('hex_facts_query', { query: 'reach', ref: 'MathLib.mulDiv' });
    expect(data.source).toBe('solc-ast');
    expect(data.result).toContain('BaseVault.deposit(uint256)');
  });

  it('creates, validates and lists cards; marks review state', async () => {
    const { data: created } = await call('hex_issue_new', {
      source: 'manual',
      title: 'Sweep drains deposits',
      severity: 'High',
      files: ['src/Vault.sol'],
    });
    expect(created.id).toBe('H-001');
    await call('hex_issue_validation', { id: 'H-001', verdict: 'uncertain', by: 'agent' });
    const { data: board } = await call('hex_board_list');
    expect(board[0]).toMatchObject({
      id: 'H-001',
      verdict: 'uncertain',
      status: 'pending_validation',
    });

    const { data: marked } = await call('hex_review_mark', {
      refs: ['Vault.sweep'],
      state: 'cleared',
    });
    expect(marked.marked).toEqual(['Vault.sweep(address)']);
    const { data: status } = await call('hex_review_status');
    expect(status.counts.cleared).toBe(1);
  });

  it('reports errors as tool errors, not crashes', async () => {
    const r = await call('hex_issue_show', { id: 'H-999' });
    expect(r.isError).toBe(true);
    expect(r.data).toContain('No card H-999');
  });
});
