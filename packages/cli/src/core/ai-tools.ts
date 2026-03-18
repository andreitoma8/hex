import { z } from 'zod';
import { AiToolSchema } from './schema.js';

export type AiTool = z.infer<typeof AiToolSchema>;

export const DEFAULT_AI_TOOLS: AiTool[] = [
  {
    name: 'auditagent',
    type: 'cli',
    invocation: 'aa findings',
    install_type: 'manual',
    output_format: 'stdout',
    enabled: true,
    requires_env: ['AUDIT_AGENT_API_KEY'],
    dependencies: [
      { binary: 'aa', install_cmd: 'pip install git+ssh://git@github.com/NethermindEth/auditagent-cli.git', required: true },
    ],
    long_running: false,
    description: 'Nethermind auditagent SaaS — links to an existing scan and pulls findings',
  },
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
];
