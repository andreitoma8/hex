import { z } from 'zod';
import { AiToolSchema } from './schema.js';

export type AiTool = z.infer<typeof AiToolSchema>;

export const DEFAULT_AI_TOOLS: AiTool[] = [
  {
    name: 'solidity-auditor',
    type: 'skill',
    invocation: '/solidity-auditor deep',
    install_url: 'https://github.com/pashov/skills',
    install_type: 'skill-file',
    skill_path: 'solidity-auditor',
    output_format: 'markdown',
    enabled: true,
    long_running: false,
    description: 'Pashov solidity-auditor Claude Code skill',
  },
  {
    name: 'sc-auditor',
    type: 'skill',
    invocation: '/security-auditor src/',
    install_url: 'https://github.com/Archethect/sc-auditor',
    install_type: 'mcp-server',
    output_format: 'markdown',
    enabled: true,
    long_running: false,
    requires_env: ['SOLODIT_API_KEY'],
    dependencies: [
      { binary: 'slither', install_cmd: 'pip install slither-analyzer', required: false },
      { binary: 'aderyn', install_cmd: 'cargo install aderyn', required: false },
      { binary: 'forge', install_cmd: 'curl -L https://foundry.paradigm.xyz | bash && foundryup', required: false },
    ],
    description: 'Archethect sc-auditor MCP server with Solodit integration',
  },
  {
    name: 'plamen',
    type: 'skill',
    invocation: '/plamen core',
    install_type: 'manual',
    output_format: 'markdown',
    enabled: true,
    long_running: true,
    requires_env: [],
    dependencies: [
      { binary: 'python3', install_cmd: 'Install Python 3.11-3.12 from https://python.org', required: true },
    ],
    description: 'Plamen autonomous security auditor — multi-agent analysis across 8 audit phases',
  },
];
