import chalk from 'chalk';

export interface ErrorHint {
  cause: string;
  fix: string;
  docs?: string;
}

export type ErrorCode =
  | 'tool.slither.missing'
  | 'tool.slither.failed'
  | 'tool.forge.missing'
  | 'tool.forge.failed'
  | 'tool.solc.missing'
  | 'tool.claude.missing'
  | 'tool.node.outdated'
  | 'project.scope.empty'
  | 'project.scope.unmatched'
  | 'project.scope.missing-file'
  | 'project.missing-config'
  | 'project.foundry-missing'
  | 'output.dir.unwritable'
  | 'output.file.unparseable'
  | 'ai-tool.missing-scan-id'
  | 'ai-tool.scan-failed'
  | 'analysis.no-data';

export const ERROR_HINTS: Record<ErrorCode, ErrorHint> = {
  'tool.slither.missing': {
    cause: "Slither isn't installed or isn't on PATH.",
    fix: 'Install with: pip install slither-analyzer',
    docs: 'https://github.com/crytic/slither#how-to-install',
  },
  'tool.slither.failed': {
    cause: 'Slither ran but exited with a non-zero code.',
    fix: 'Re-run `slither <project>` manually to see the underlying compilation error.',
    docs: 'https://github.com/crytic/slither/wiki/Usage',
  },
  'tool.forge.missing': {
    cause: 'Foundry (forge/cast) is not installed or not on PATH.',
    fix: 'Install with: curl -L https://foundry.paradigm.xyz | bash && foundryup',
    docs: 'https://book.getfoundry.sh/getting-started/installation',
  },
  'tool.forge.failed': {
    cause: 'forge build failed before analysis could finish.',
    fix: 'Run `forge build` directly and fix the compilation errors first.',
  },
  'tool.solc.missing': {
    cause: 'solc was not found on PATH.',
    fix: 'Install with `solc-select install <version> && solc-select use <version>`, or rely on Foundry.',
    docs: 'https://github.com/crytic/solc-select#quickstart',
  },
  'tool.claude.missing': {
    cause: 'Claude Code CLI is not installed (hex skills run via Claude Code).',
    fix: 'Install Claude Code, then re-run `hex claude` to copy skills into the project.',
    docs: 'https://docs.claude.com/claude-code',
  },
  'tool.node.outdated': {
    cause: 'Your Node.js version is older than Hex requires.',
    fix: 'Upgrade to Node.js 18 or later (https://nodejs.org).',
  },
  'project.scope.empty': {
    cause: '--scope was not provided.',
    fix: 'Pass --scope with comma-separated globs, e.g. --scope "src/**/*.sol".',
  },
  'project.scope.unmatched': {
    cause: 'No files matched any of the scope globs.',
    fix: 'Check the glob syntax. Examples: "src/**/*.sol", "src/Vault.sol,src/lib/Math.sol". Globs are POSIX-style.',
  },
  'project.scope.missing-file': {
    cause: 'A scope entry expanded to a path that does not exist on disk.',
    fix: 'Either remove the entry or correct the path. Globs are resolved relative to --project (defaults to cwd).',
  },
  'project.missing-config': {
    cause: 'No .hex/config.json was found in the project directory.',
    fix: 'Run `hex init --scope "<globs>" --commit <hash>` first.',
  },
  'project.foundry-missing': {
    cause: 'foundry.toml is missing — Hex can analyse Hardhat too but coverage/build verification rely on Foundry.',
    fix: 'Add a foundry.toml or run with --no-verify to skip the build check.',
  },
  'output.dir.unwritable': {
    cause: 'Hex cannot write to the output directory.',
    fix: 'Check filesystem permissions or pass --output-dir to a writable location.',
  },
  'output.file.unparseable': {
    cause: 'A .hex/*.json file exists but is malformed.',
    fix: 'Re-run the producing command (e.g. `hex stats`) to regenerate it, or delete the file.',
  },
  'ai-tool.missing-scan-id': {
    cause: 'auditagent expects a scan_id in ai-status.json but none was found.',
    fix: 'Re-run `/run-ai-analysis` so the orchestrator kicks off a new scan.',
  },
  'ai-tool.scan-failed': {
    cause: 'The remote AI scan reported failure.',
    fix: 'Check the tool dashboard or logs, then re-trigger `/run-ai-analysis`.',
  },
  'analysis.no-data': {
    cause: 'An analysis command was invoked but a required upstream output is missing.',
    fix: 'Run `hex analyze` first, or generate the missing file explicitly (e.g. `hex stats`).',
  },
};

export class HexError extends Error {
  code: ErrorCode;
  hint: ErrorHint;
  detail?: string;

  constructor(code: ErrorCode, detail?: string) {
    const hint = ERROR_HINTS[code];
    super(detail ? `${hint.cause} ${detail}` : hint.cause);
    this.code = code;
    this.hint = hint;
    this.detail = detail;
  }
}

export function isHexError(err: unknown): err is HexError {
  return err instanceof HexError;
}

export function formatHexError(err: HexError): string {
  const lines = [
    `${chalk.red('✖')} ${chalk.bold(err.hint.cause)}`,
  ];
  if (err.detail) {
    lines.push(`  ${chalk.dim(err.detail)}`);
  }
  lines.push(`  ${chalk.cyan('→')} ${err.hint.fix}`);
  if (err.hint.docs) {
    lines.push(`  ${chalk.dim('docs:')} ${chalk.dim(err.hint.docs)}`);
  }
  return lines.join('\n');
}

export function reportError(err: unknown): void {
  if (isHexError(err)) {
    process.stderr.write(formatHexError(err) + '\n');
    return;
  }
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`${chalk.red('✖')} ${message}\n`);
}
