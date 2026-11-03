import { Command } from 'commander';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createHexServer } from '../mcp/server.js';

export const mcpCommand = new Command('mcp')
  .description('Run the Hex MCP server over stdio (Claude Code starts it from .mcp.json)')
  .action(async () => {
    // stdout is the MCP transport: nothing else may print to it.
    const server = createHexServer(process.cwd());
    await server.connect(new StdioServerTransport());
  });
