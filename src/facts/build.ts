import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import type { BuildInfo } from './extract.js';

export type Toolchain = 'foundry' | 'hardhat';

export interface BuildResult {
  toolchain: Toolchain | null;
  buildInfos: BuildInfo[];
  /** Set when the build failed or produced nothing usable. */
  error?: string;
}

export function detectToolchain(projectDir: string): Toolchain | null {
  if (fs.existsSync(path.join(projectDir, 'foundry.toml'))) return 'foundry';
  for (const f of [
    'hardhat.config.ts',
    'hardhat.config.js',
    'hardhat.config.cjs',
    'hardhat.config.mjs',
  ]) {
    if (fs.existsSync(path.join(projectDir, f))) return 'hardhat';
  }
  return null;
}

function readBuildInfos(dir: string): BuildInfo[] {
  if (!fs.existsSync(dir)) return [];
  const out: BuildInfo[] = [];
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.json') || f.endsWith('.output.json')) continue;
    try {
      const bi = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8')) as BuildInfo & {
        output?: unknown;
      };
      // Hardhat 2.x splits large build-infos into <id>.json + <id>.output.json.
      if (!bi.output) {
        const outPath = path.join(dir, f.replace(/\.json$/, '.output.json'));
        if (fs.existsSync(outPath)) {
          (bi as { output?: unknown }).output = JSON.parse(
            fs.readFileSync(outPath, 'utf-8'),
          ).output;
        }
      }
      if (bi.output) out.push(bi);
    } catch {
      /* skip unreadable */
    }
  }
  return out;
}

/**
 * Compile the project into Hex's own cache (never the client's out/ or cache/)
 * and return the solc standard-JSON build-infos.
 *
 * Foundry: `forge build --ast --build-info --extra-output storageLayout` into
 * `<cacheDir>`; tests and scripts are skipped unless the scope includes them.
 * Hardhat: `npx hardhat compile`, then read `artifacts/build-info`.
 */
export function buildForFacts(
  projectDir: string,
  cacheDir: string,
  opts: { includeScripts?: boolean; includeTests?: boolean; timeoutMs?: number } = {},
): BuildResult {
  const toolchain = detectToolchain(projectDir);
  const timeout = opts.timeoutMs ?? 15 * 60_000;
  if (toolchain === 'foundry') {
    const biDir = path.join(cacheDir, 'build-info');
    fs.rmSync(biDir, { recursive: true, force: true });
    const args = [
      'build',
      '--ast',
      '--build-info',
      '--build-info-path',
      biDir,
      '--extra-output',
      'storageLayout',
      '--out',
      path.join(cacheDir, 'forge-out'),
      '--cache-path',
      path.join(cacheDir, 'forge-cache'),
    ];
    const skip: string[] = [];
    if (!opts.includeTests) skip.push('test');
    if (!opts.includeScripts) skip.push('script');
    if (skip.length) args.push('--skip', ...skip);
    const r = spawnSync('forge', args, {
      cwd: projectDir,
      encoding: 'utf-8',
      timeout,
      maxBuffer: 64 * 1024 * 1024,
    });
    const buildInfos = readBuildInfos(biDir);
    if (r.error)
      return { toolchain, buildInfos: [], error: `forge not runnable: ${r.error.message}` };
    if (r.status !== 0 || buildInfos.length === 0) {
      const tail = `${r.stderr ?? ''}${r.stdout ?? ''}`.trim().split('\n').slice(-8).join('\n');
      return { toolchain, buildInfos, error: `forge build failed (exit ${r.status}).\n${tail}` };
    }
    return { toolchain, buildInfos };
  }
  if (toolchain === 'hardhat') {
    const r = spawnSync('npx', ['hardhat', 'compile'], {
      cwd: projectDir,
      encoding: 'utf-8',
      timeout,
      maxBuffer: 64 * 1024 * 1024,
    });
    const buildInfos = readBuildInfos(path.join(projectDir, 'artifacts', 'build-info'));
    if (r.status !== 0 || buildInfos.length === 0) {
      const tail = `${r.stderr ?? ''}${r.stdout ?? ''}`.trim().split('\n').slice(-8).join('\n');
      return {
        toolchain,
        buildInfos,
        error: `hardhat compile failed (exit ${r.status}).\n${tail}`,
      };
    }
    return { toolchain, buildInfos };
  }
  return { toolchain: null, buildInfos: [], error: 'No foundry.toml or hardhat.config.* found.' };
}
