import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import { glob } from 'glob';
import { logger } from '../core/logger.js';
import { createConfig } from '../core/config.js';
import { normalizePath, getOutputDir } from '../core/paths.js';
import { runForge, detectTools } from '../core/external-tools.js';
import { parseSolidity, extractSolidityVersion } from '../parsers/solidity-parser.js';
import { copySkillsToClaudeFormat, getClaudeSkillsDir } from '../core/skills.js';
import { ProgressTracker } from '../core/progress.js';
import { HexError, reportError } from '../core/errors.js';

export const initCommand = new Command('init')
  .description('Initialize a new audit project')
  .option('--project <dir>', 'Project directory (default: cwd)')
  .option('--scope <globs>', 'Comma-separated scope file globs')
  .option('--commit <hash>', 'Git commit hash')
  .option('--chain <chain>', 'Target chain', 'ethereum')
  .option('--name <name>', 'Project name')
  .option('--docs <url>', 'Documentation URL')
  .option('--output-dir <dir>', 'Output directory', '.hex')
  .option('--exclude <globs>', 'Comma-separated exclude globs')
  .option('--github-repo <owner/repo>', 'GitHub repo for issue syncing (sets settings.github.repo)')
  .option('--no-verify', 'Skip build verification')
  .action(async (opts) => {
    const STEPS = [
      'detect project',
      'check tools',
      'resolve scope',
      'detect solidity version',
      'create config',
      'copy skills',
      'verify build',
      'write CLAUDE.md',
    ];
    const tracker = new ProgressTracker(STEPS);
    tracker.start();

    try {
      const projectDir = path.resolve(opts.project ?? process.cwd());

      if (!fs.existsSync(projectDir)) {
        tracker.update('detect project', 'failed', 'project dir missing');
        throw new HexError('project.foundry-missing', `path: ${projectDir}`);
      }

      tracker.update('detect project', 'running');
      const isFoundry = fs.existsSync(path.join(projectDir, 'foundry.toml'));
      const isHardhat =
        fs.existsSync(path.join(projectDir, 'hardhat.config.ts')) ||
        fs.existsSync(path.join(projectDir, 'hardhat.config.js'));
      const projectTypeDetail = isFoundry ? 'Foundry' : isHardhat ? 'Hardhat' : 'none detected';
      tracker.update('detect project', 'ok', projectTypeDetail);

      tracker.update('check tools', 'running');
      const tools = await detectTools();
      const toolDetails: string[] = [];
      for (const tool of tools) {
        if (tool.available) {
          toolDetails.push(`${tool.name} ok`);
        } else {
          toolDetails.push(`${tool.name} missing`);
        }
      }
      const allMissing = tools.every((t) => !t.available);
      tracker.update('check tools', allMissing ? 'failed' : 'ok', toolDetails.join(', '));
      if (!tools.find((t) => t.name === 'forge')?.available) {
        logger.warn(
          'forge not found — compilation verification and test coverage will be unavailable',
        );
      }
      if (!tools.find((t) => t.name === 'slither')?.available) {
        logger.warn(
          'slither not found — access control, state variable, and external call analysis will be limited',
        );
      }
      if (!tools.find((t) => t.name === 'solc')?.available) {
        logger.warn('solc not found — storage layout extraction will be unavailable');
      }

      // Resolve scope globs
      if (!opts.scope) {
        tracker.update('resolve scope', 'failed', '--scope missing');
        throw new HexError('project.scope.empty');
      }

      tracker.update('resolve scope', 'running');
      const scopeGlobs = opts.scope.split(',').map((g: string) => g.trim());
      const excludeGlobs = opts.exclude ? opts.exclude.split(',').map((g: string) => g.trim()) : [];

      const scopeFiles: string[] = [];
      for (const pattern of scopeGlobs) {
        const matches = await glob(pattern, {
          cwd: projectDir,
          ignore: excludeGlobs,
          posix: true,
        });
        scopeFiles.push(...matches);
      }

      const uniqueScope = [...new Set(scopeFiles)].sort();
      if (uniqueScope.length === 0) {
        tracker.update('resolve scope', 'failed', `no match for ${scopeGlobs.join(', ')}`);
        throw new HexError('project.scope.unmatched', `globs: ${scopeGlobs.join(', ')}`);
      }

      for (const file of uniqueScope) {
        const fullPath = path.join(projectDir, file);
        if (!fs.existsSync(fullPath)) {
          tracker.update('resolve scope', 'failed', `missing file: ${file}`);
          throw new HexError('project.scope.missing-file', `path: ${file}`);
        }
      }
      tracker.update('resolve scope', 'ok', `${uniqueScope.length} files`);

      // Detect Solidity version
      tracker.update('detect solidity version', 'running');
      let solidityVersion = '0.8.20'; // default
      let versionSource = 'default';

      if (isFoundry) {
        const foundryToml = fs.readFileSync(path.join(projectDir, 'foundry.toml'), 'utf-8');
        const versionMatch = foundryToml.match(/solc[_-]version\s*=\s*["']?([\d.]+)/);
        if (versionMatch) {
          solidityVersion = versionMatch[1];
          versionSource = 'foundry.toml';
        }
      }

      if (versionSource === 'default') {
        for (const file of uniqueScope.slice(0, 5)) {
          const source = fs.readFileSync(path.join(projectDir, file), 'utf-8');
          const result = parseSolidity(source, file);
          const version = extractSolidityVersion(result.pragmas);
          if (version) {
            solidityVersion = version;
            versionSource = 'pragma';
            break;
          }
        }
      }
      tracker.update('detect solidity version', 'ok', `${solidityVersion} (${versionSource})`);

      // Detect commit hash
      let commit = opts.commit;
      if (!commit) {
        try {
          const { execSync } = await import('node:child_process');
          commit = execSync('git rev-parse HEAD', {
            cwd: projectDir,
            encoding: 'utf-8',
          }).trim();
        } catch {
          commit = 'unknown';
          logger.warn('Could not detect git commit hash. Use --commit to specify.');
        }
      }

      // Determine project name
      const name = opts.name ?? path.basename(projectDir);

      // Create config
      tracker.update('create config', 'running');
      const config = createConfig({
        name,
        projectDir,
        commit,
        chain: opts.chain,
        solidityVersion,
        docsUrl: opts.docs,
        scope: uniqueScope,
        exclude: excludeGlobs,
        outputDir: opts.outputDir,
        githubRepo: opts.githubRepo,
      });

      const outputDir = getOutputDir(projectDir, config.settings.output_dir);
      tracker.update('create config', 'ok', normalizePath(outputDir));

      // Copy skill files to .claude/skills/<name>/SKILL.md
      tracker.update('copy skills', 'running');
      const claudeSkillsDir = getClaudeSkillsDir(projectDir);
      const skillsResult = copySkillsToClaudeFormat({ targetDir: claudeSkillsDir });
      tracker.update('copy skills', 'ok', `${skillsResult.updated + skillsResult.added} skill(s)`);

      // Create subdirectories
      for (const subdir of ['validations', 'ai-results']) {
        const dir = path.join(outputDir, subdir);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
      }

      // Create ai-results subdirectory for auditagent (the only supported AI tool)
      const auditagentDir = path.join(outputDir, 'ai-results', 'auditagent');
      if (!fs.existsSync(auditagentDir)) {
        fs.mkdirSync(auditagentDir, { recursive: true });
      }

      // Optionally verify compilation
      if (opts.verify !== false && isFoundry) {
        tracker.update('verify build', 'running');
        const result = await runForge(projectDir, ['build']);
        if (result.exitCode === 0) {
          tracker.update('verify build', 'ok');
        } else {
          tracker.update('verify build', 'failed', 'forge build returned non-zero (non-fatal)');
          logger.dim(result.stderr.slice(0, 500));
        }
      } else {
        tracker.update(
          'verify build',
          'skipped',
          isFoundry ? '--no-verify' : 'not a Foundry project',
        );
      }

      // Create CLAUDE.md for Claude Code skill discovery
      const claudeMdPath = path.join(projectDir, 'CLAUDE.md');
      if (!fs.existsSync(claudeMdPath)) {
        const claudeMd = `# Hex Project: ${config.project.name}

This project is being audited with Hex.

- **Chain:** ${config.project.chain}
- **Solidity:** ${config.project.solidity_version}
- **Commit:** \`${config.project.commit}\`${config.project.docs_url ? `\n- **Docs:** ${config.project.docs_url}` : ''}
- **Config:** \`${config.settings.output_dir}/config.json\` — source of truth for all project metadata

## Scope

The following files are in audit scope:
${uniqueScope.map((f) => `- \`${f}\``).join('\n')}

## Output Directory (\`${config.settings.output_dir}/\`)

All analysis outputs live here. Key files and what they answer:

| File | Contains | Use when asked about... |
|------|----------|------------------------|
| \`config.json\` | Project config (scope, chain, docs URL, commit) | project setup, documentation, scope |
| \`stats.json\` | nSLOC, contracts, functions, test coverage, dependencies | codebase size, complexity, coverage |
| \`deps.json\` | Inheritance, imports, calls, clusters | contract relationships, dependency graph |
| \`access-control.json\` | Roles, modifiers, function access | who can call what, privileged functions |
| \`state-vars.json\` | State variables, types, visibility, read/write | storage, mutability, state layout |
| \`external-calls.json\` | External calls, reentrancy guards, trust levels | external interactions, reentrancy risk |
| \`overview.md\` | AI-generated protocol overview | what the protocol does, architecture |
| \`spec-conformance.json\` | Spec vs code deviations | spec compliance, ERC conformance |
| \`findings.json\` | Audit findings (canonical), wrapped as \`{ "findings": [...] }\` | reported issues, vulnerabilities |
| \`tracking.json\` | Board state per issue (status, source, duplicate_of), wrapped as \`{ "findings": [...] }\` | finding triage, board columns |
| \`comparison.json\` | Dedup match_signals (auditagent / github) | duplicate detection |
| \`progress.json\` | Audit progress tracking | what has been reviewed |
| \`diagrams/\` | Mermaid architecture and flow diagrams | system diagrams, flows |
| \`overleaf/\` | LaTeX report sections (executive_summary, audited_files, summary_of_findings, findings) | final report export |

Not all files exist initially — they are created as you run skills and CLI commands.

## Skills (Slash Commands)

Skills are in \`.claude/skills/\` and auto-discovered by Claude Code. Type \`/\` to list them.

**Recommended workflow order:**

1. \`/init-audit\` — Initialize, dependency safety, full analysis pipeline, overview, diagrams, flows, spec conformance, board materialization (all in one)
2. \`/write-finding\` — Record a manual issue as a Potential card on the board
3. \`/validate-finding\` — Validate any Potential card (manual / auditagent / conformance / github); per-issue PoC or memo-only
4. \`/generate-poc\` — Generate and run a proof-of-concept test (invoked by /validate-finding)
5. \`/ingest-aa-report\` — Ingest a completed Nethermind AuditAgent scan by ID, with inline dedup
6. \`/sync-issues\` — Two-way GitHub Issues sync (GitHub canonical)
7. \`/generate-overleaf\` — Emit the four LaTeX report sections into \`${config.settings.output_dir}/overleaf/\`

Each skill builds on previous outputs.

## CLI Commands

- \`npx hex analyze\` — Run all deterministic analysis (stats, deps, access, state, calls, patterns, constraints, surface)
- \`npx hex context\` — Assemble full codebase context for AI prompts
- \`npx hex context --target <Contract>\` — Focused context for a single contract
- \`npx hex dashboard\` — Open browser dashboard at http://localhost:3000
- \`npx hex issue move <id> --to <column>\` — Move an issue between board columns
- \`npx hex issue patch <id> [--severity ...] [--resolution ...]\` — Edit issue fields
- \`npx hex update\` — Update hex-audit to the latest version

## Writing Style (applies to every skill that produces text)

Anything you write into \`.hex/\` files (findings, overview, spec conformance) ends up in front of a security team or in a public report. Write like a senior auditor, not like an AI model showing off. The detectable patterns below are off-limits:

### Banned punctuation and words

- **No em dashes (—)** anywhere. Use commas, parentheses, semicolons, or split into separate sentences. This is the single biggest AI tell in audit reports.
- **No en dashes (–) in prose either.** Hyphens are fine for compounds (\`fee-on-transfer\`).
- Avoid these words: *delve, moreover, furthermore, seamlessly, cutting-edge, revolutionize, unlock the potential, streamline, in essence, at its core, it is worth noting, indeed, harness, underscore, illuminate, pivotal, groundbreaking, multifaceted, robust (outside technical contexts), holistic, paradigm, synergy, empower, foster, facilitate*.
- Avoid metaphorical *navigate*, *landscape*, *benchmark* (as a verb).
- Avoid filler openings: *In today's world*, *When it comes to*, *In this article*, *As previously mentioned*, *It goes without saying*.

### Structure

- Don't force the rule of three. If two points cover it, stop at two.
- Don't start consecutive paragraphs with the same syntactic pattern.
- Skip the intro-body-summary shape. Not every paragraph needs a topic sentence and a wrap-up.
- Don't pad bullet points to make the list look fuller.

### Sentences

- Vary sentence length. Mix short with long.
- Don't use parallel grammatical construction across three or more consecutive sentences.
- One present-participle opener per page max (\`Showcasing...\`, \`Leveraging...\`).
- Don't over-hedge with *it could be said*, *one might argue*, *perhaps it is fair to say*.

### Recommendation tone (specific to findings)

Recommendations are suggestions, not orders. The protocol team owns the fix; you propose direction.

- Start with *Consider...*, *One option is...*, *The team may want to...*, *It would be worth...*.
- Avoid *Replace X with Y*, *You must...*, *Always do...*, *Never do...*.
- If you point at a specific pattern (e.g. reentrancy guard, checks-effects-interactions), present it as the common fix rather than the only fix. The team may have constraints you can't see.

### Tone

- Match formality to context, not to a corporate default.
- Be direct and specific over vaguely positive.
- Use concrete numbers and details over generic descriptors.
- Don't restate or summarise what you just said.
- Don't add trailing summaries unless asked.

### Content

- Prefer specific facts over generic claims.
- Don't pad with unnecessary comprehensiveness. Say what needs saying, then stop.
- Avoid rhetorical questions as transitions.

Apply these to every skill output without being reminded.
`;
        fs.writeFileSync(claudeMdPath, claudeMd, 'utf-8');
        tracker.update('write CLAUDE.md', 'ok', normalizePath(claudeMdPath));
      } else {
        tracker.update('write CLAUDE.md', 'skipped', 'already exists');
      }

      tracker.finish();
      logger.success('Audit initialized');
      logger.info(`Config: ${normalizePath(path.join(outputDir, 'config.json'))}`);
      logger.info(`Output: ${normalizePath(outputDir)}`);
      logger.info('');
      logger.info('Next steps:');
      logger.dim('  hex stats    # Generate codebase statistics');
      logger.dim('  hex deps     # Build dependency graph');
      logger.dim('  hex access   # Map access control');
    } catch (err) {
      tracker.finish();
      reportError(err);
      process.exit(1);
    }
  });
