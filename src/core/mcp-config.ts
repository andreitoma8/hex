import fs from 'node:fs';
import path from 'node:path';

/**
 * Register the Hex MCP server in the project's `.mcp.json` (project scope; Claude
 * Code asks for approval once). Other servers in the file are left untouched.
 * `npx --no-install` resolves a local or global hex-audit and never downloads:
 * the unrelated npm package named `hex` must never run here.
 */
export const HEX_MCP_ENTRY = { command: 'npx', args: ['--no-install', 'hex', 'mcp'] } as const;

export function ensureMcpConfig(projectDir: string): 'added' | 'updated' | 'unchanged' {
  const file = path.join(projectDir, '.mcp.json');
  let cfg: { mcpServers?: Record<string, unknown> } = {};
  if (fs.existsSync(file)) {
    try {
      cfg = JSON.parse(fs.readFileSync(file, 'utf-8'));
    } catch {
      throw new Error(`${file} is not valid JSON; fix it and re-run.`);
    }
  }
  const servers = { ...(cfg.mcpServers ?? {}) };
  const prev = servers.hex;
  if (JSON.stringify(prev) === JSON.stringify(HEX_MCP_ENTRY)) return 'unchanged';
  servers.hex = { ...HEX_MCP_ENTRY, args: [...HEX_MCP_ENTRY.args] };
  fs.writeFileSync(file, JSON.stringify({ ...cfg, mcpServers: servers }, null, 2) + '\n', 'utf-8');
  return prev ? 'updated' : 'added';
}
