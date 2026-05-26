import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { detectTools } from '../core/external-tools.js';
import { ERROR_HINTS, type ErrorCode } from '../core/errors.js';
import { getOutputDir } from '../core/paths.js';

interface CheckResult {
  name: string;
  category: 'required' | 'recommended' | 'optional';
  ok: boolean;
  detail: string;
  errorCode?: ErrorCode;
}

const SYMBOL = {
  ok: chalk.green('✔'),
  warn: chalk.yellow('⚠'),
  fail: chalk.red('✖'),
};

function symbolFor(check: CheckResult): string {
  if (check.ok) return SYMBOL.ok;
  if (check.category === 'required') return SYMBOL.fail;
  return SYMBOL.warn;
}

function checkNodeVersion(): CheckResult {
  const major = Number(process.versions.node.split('.')[0]);
  const ok = major >= 18;
  return {
    name: 'node',
    category: 'required',
    ok,
    detail: ok ? `v${process.versions.node}` : `v${process.versions.node} — Hex requires Node.js 18 or later`,
    errorCode: ok ? undefined : 'tool.node.outdated',
  };
}

function checkClaudeCode(): CheckResult {
  const result = spawnSync('claude', ['--version'], { shell: true, encoding: 'utf-8' });
  const ok = result.status === 0;
  return {
    name: 'claude',
    category: 'recommended',
    ok,
    detail: ok ? (result.stdout.trim().split('\n')[0] ?? 'available') : 'not on PATH (skills cannot be invoked)',
    errorCode: ok ? undefined : 'tool.claude.missing',
  };
}

function checkOutputDir(projectDir: string): CheckResult {
  const dir = getOutputDir(projectDir);
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.accessSync(dir, fs.constants.W_OK);
    return {
      name: '.hex/ writable',
      category: 'required',
      ok: true,
      detail: dir,
    };
  } catch {
    return {
      name: '.hex/ writable',
      category: 'required',
      ok: false,
      detail: `cannot write to ${dir}`,
      errorCode: 'output.dir.unwritable',
    };
  }
}

function checkProjectConfig(projectDir: string): CheckResult {
  const configPath = path.join(getOutputDir(projectDir), 'config.json');
  const ok = fs.existsSync(configPath);
  return {
    name: '.hex/config.json',
    category: 'optional',
    ok,
    detail: ok ? configPath : 'run `hex init --scope "<globs>"` to create',
    errorCode: ok ? undefined : 'project.missing-config',
  };
}

export async function runDoctor(projectDir: string): Promise<{ checks: CheckResult[]; hasBlocker: boolean }> {
  const tools = await detectTools();
  const slither = tools.find((t) => t.name === 'slither');
  const forge = tools.find((t) => t.name === 'forge');
  const solc = tools.find((t) => t.name === 'solc');

  const isFoundry = fs.existsSync(path.join(projectDir, 'foundry.toml'));

  const checks: CheckResult[] = [
    checkNodeVersion(),
    {
      name: 'forge',
      category: isFoundry ? 'required' : 'recommended',
      ok: forge?.available ?? false,
      detail: forge?.available ? (forge.version ?? 'available') : 'not on PATH',
      errorCode: forge?.available ? undefined : 'tool.forge.missing',
    },
    {
      name: 'slither',
      category: 'recommended',
      ok: slither?.available ?? false,
      detail: slither?.available ? (slither.version ?? 'available') : 'not on PATH',
      errorCode: slither?.available ? undefined : 'tool.slither.missing',
    },
    {
      name: 'solc',
      category: 'optional',
      ok: solc?.available ?? false,
      detail: solc?.available ? (solc.version ?? 'available') : 'not on PATH (Foundry can supply solc)',
      errorCode: solc?.available ? undefined : 'tool.solc.missing',
    },
    checkClaudeCode(),
    checkOutputDir(projectDir),
    checkProjectConfig(projectDir),
  ];

  const hasBlocker = checks.some((c) => c.category === 'required' && !c.ok);
  return { checks, hasBlocker };
}

function pad(text: string, width: number): string {
  if (text.length >= width) return text.slice(0, width);
  return text + ' '.repeat(width - text.length);
}

export function printDoctor(checks: CheckResult[]): void {
  const nameWidth = Math.max(...checks.map((c) => c.name.length), 8);
  const detailWidth = Math.min(80, Math.max(...checks.map((c) => c.detail.length), 8));

  console.log();
  console.log(`  ${chalk.bold('hex doctor')}`);
  console.log();
  for (const check of checks) {
    const tag =
      check.category === 'required'
        ? chalk.dim('[required]   ')
        : check.category === 'recommended'
          ? chalk.dim('[recommended]')
          : chalk.dim('[optional]   ');
    console.log(`  ${symbolFor(check)} ${tag} ${pad(check.name, nameWidth)}  ${pad(check.detail, detailWidth)}`);
  }
  console.log();

  const failed = checks.filter((c) => !c.ok && c.errorCode);
  if (failed.length > 0) {
    console.log(chalk.bold('  Suggested fixes:'));
    for (const check of failed) {
      const hint = ERROR_HINTS[check.errorCode!];
      console.log(`  ${chalk.cyan('→')} ${chalk.bold(check.name)}: ${hint.fix}`);
      if (hint.docs) console.log(`      ${chalk.dim('docs:')} ${chalk.dim(hint.docs)}`);
    }
    console.log();
  }
}

export const doctorCommand = new Command('doctor')
  .description('Run preflight checks: node, forge, slither, solc, claude code, output dir, project config')
  .option('--project <dir>', 'Project directory (default: cwd)')
  .action(async (opts) => {
    const projectDir = path.resolve(opts.project ?? process.cwd());
    const { checks, hasBlocker } = await runDoctor(projectDir);
    printDoctor(checks);
    if (hasBlocker) process.exit(1);
  });
