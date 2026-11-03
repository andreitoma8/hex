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
import { ensureMcpConfig } from '../core/mcp-config.js';
import { ProgressTracker } from '../core/progress.js';
import { HexError, reportError } from '../core/errors.js';
import { headCommit, isGitRepo, resolveCommit } from '../core/git.js';

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
  .option('--mode <mode>', 'Audit mode: full | diff (differential audit against --base)', 'full')
  .option('--base <commit>', 'Differential mode: the previously audited commit')
  .option(
    '--previous-audit <path>',
    "Differential mode: the previous engagement's .hex/ folder or its report (PDF/MD)",
  )
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
          'forge not found — exact compiler facts and test coverage will be unavailable (parser fallback)',
        );
      }

      // Audit mode
      const mode: 'full' | 'diff' = opts.mode === 'diff' ? 'diff' : 'full';
      if (opts.mode !== 'full' && opts.mode !== 'diff') {
        throw new Error(`Invalid --mode: ${opts.mode}. Use full or diff.`);
      }
      if (mode === 'diff' && !opts.base) {
        tracker.update('resolve scope', 'failed', '--base missing');
        throw new HexError('diff.base-required');
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

      // Differential mode: pin the base commit and record the previous audit.
      let baseCommit: string | undefined;
      let previousAudit: { kind: 'hex' | 'report'; path: string } | undefined;
      if (mode === 'diff') {
        if (!isGitRepo(projectDir)) throw new HexError('diff.not-git', `path: ${projectDir}`);
        baseCommit = resolveCommit(projectDir, opts.base);
        if (commit && commit !== 'unknown') {
          const resolvedHead = resolveCommit(projectDir, commit);
          const wt = headCommit(projectDir);
          if (wt && wt !== resolvedHead) {
            logger.warn(
              `Working tree is at ${wt.slice(0, 8)} but --commit is ${resolvedHead.slice(0, 8)}. ` +
                'Analyses read the working tree: check out the head commit before `hex analyze`.',
            );
          }
        }
        if (opts.previousAudit) {
          const prev = path.resolve(opts.previousAudit);
          if (!fs.existsSync(prev)) {
            throw new Error(`--previous-audit path not found: ${prev}`);
          }
          const isHexDir =
            fs.statSync(prev).isDirectory() &&
            (fs.existsSync(path.join(prev, 'config.json')) ||
              fs.existsSync(path.join(prev, '.hex', 'config.json')));
          previousAudit = { kind: isHexDir ? 'hex' : 'report', path: prev };
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
        scopeGlobs: scopeGlobs,
        mode,
        baseCommit,
        previousAudit,
      });

      const outputDir = getOutputDir(projectDir, config.settings.output_dir);
      tracker.update('create config', 'ok', normalizePath(outputDir));

      // Copy skill files to .claude/skills/<name>/SKILL.md
      tracker.update('copy skills', 'running');
      const claudeSkillsDir = getClaudeSkillsDir(projectDir);
      const skillsResult = copySkillsToClaudeFormat({ targetDir: claudeSkillsDir });
      ensureMcpConfig(projectDir);
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
        // Build into Hex's cache, never the client's out/ and cache/.
        const cache = path.join(outputDir, '.cache');
        const result = await runForge(projectDir, [
          'build',
          '--out',
          path.join(cache, 'forge-out'),
          '--cache-path',
          path.join(cache, 'forge-cache'),
        ]);
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
- **Config:** \`${config.settings.output_dir}/config.json\` — source of truth for all project metadata${
          mode === 'diff' && baseCommit
            ? `

## Differential audit

This is a **differential audit** of \`${baseCommit.slice(0, 8)}\` → \`${String(config.project.commit).slice(0, 8)}\`. Review effort goes to the changed code and the flows it reaches, not the whole scope.

- \`${config.settings.output_dir}/diff.json\` — changed files and entities, storage-layout changes, and every impacted function with the reason chain (from \`hex diff\`)
- \`${config.settings.output_dir}/diff/changes.patch\` — the in-scope unified diff
- \`${config.settings.output_dir}/diff-overview.md\` — what changed and why (written by /init-audit)${
                previousAudit
                  ? `
- \`${config.settings.output_dir}/previous-audit/\` — prior findings (\`findings.json\`) and their regression check (\`review.json\`)`
                  : ''
              }`
            : ''
        }

## Scope

The following files are in audit scope:
${uniqueScope.map((f) => `- \`${f}\``).join('\n')}

## Output Directory (\`${config.settings.output_dir}/\`)

All Hex data lives here. Key files and what they answer:

| File | Contains | Use when asked about... |
|------|----------|------------------------|
| \`config.json\` | Project config (scope, mode, chain, docs URL, commit) | project setup, documentation, scope |
| \`facts.json\` | **Exact compiler facts**: call graph, reads/writes, modifiers, inheritance, entry points, storage layout | who calls what, who writes a variable, storage slots |
| \`stats.json\` | nSLOC, ERCs, test coverage, dependencies | codebase size, complexity, coverage |
| \`model/protocol.json\` | Verified protocol model: actors, assets, privileges, trust, dependencies, state machines, accounting, risky flows (each claim verified or contested) | how the protocol works, who can do what |
| \`model/invariants.json\` | Invariants (proposed / accepted / rejected) and their test results | what must always hold |
| \`model/diagrams/\` | Diagram specs and Excalidraw scenes | system pictures |
| \`overview.md\` | Protocol overview | what the protocol does, architecture |
| \`spec-conformance.json\` | Docs / NatSpec / ERC promises vs code | spec compliance |
| \`findings.json\` / \`tracking.json\` | Board cards (content / status, source, validation) | reported issues, triage |
| \`progress.json\` | Per-function review state (unread / read / questioned / cleared) | review progress, blind spots |
| \`triage-rules.json\` | The auditor's standing decisions (trusted roles, out of scope, by design, known issues) | what not to report |
| \`notes/\` | Contract notes, questions and leads (Diane) | auditor's notes |
| \`ai-audit/\`, \`ai-results/\` | /ai-audit runs and the records behind AI cards | AI audit results |
| \`fix-review/\` | Fix review results per fix commit | which issues the client fixed |
| \`report/\` | LaTeX report sections and figures | final report |

Not all files exist initially — they are created as you run skills and CLI commands.

## Skills (Slash Commands)

Skills are in \`.claude/skills/\` and auto-discovered by Claude Code. Type \`/\` to list them.

1. \`/init-audit\` — Safety gate, exact facts, then agents build and verify the protocol model, invariants, conformance and diagrams
2. \`/ai-audit\` — 12 parallel attacker agents; findings land on the board (pre-validated), leads in notes
3. \`/write-finding\` — Record a manual issue as a Potential card
4. \`/validate-finding\` / \`/validate-all-findings\` — Validate cards; PoC by default
5. \`/prevalidate\` — Parallel agent validation of new machine-generated cards; conclusive cases move automatically
6. \`/fuzz\` — Fuzz the accepted invariants (Echidna / Medusa / Foundry); violations become cards
7. \`/diane\` — Turn recorded narration into notes and review ticks
8. \`/ingest-aa-report\` — Ingest a Nethermind AuditAgent scan
9. \`/sync-issues\` — Two-way GitHub Issues sync (GitHub canonical)
10. \`/fix-review\` — Check the client's fixes (PoCs re-run at the fix commit) and update GitHub
11. \`/generate-report\` — Emit the LaTeX report sections

## Hex MCP tools

The project's \`.mcp.json\` registers the Hex MCP server. **When the auditor says "this", "here" or "the selected …", call \`hex_focus\` first**: it returns what they have selected in the dashboard. Use \`hex_facts_query\` for exact code relationships instead of grepping.

## CLI Commands (always \`npx --no-install hex …\`; an unrelated npm package is named \`hex\`)

- \`analyze\` — stats + compiler facts (+ diff in differential mode)
- \`facts query <callers|callees|readers|writers|layout|linearization|entry-points|reach|function> [ref]\` — exact relationships
- \`model show|validate\`, \`invariant list|accept|reject|set-test|export\`
- \`review mark <ref> --state <read|questioned|cleared>\`, \`review status\`, \`review blind-spots\`
- \`issue new|move|patch|show|validation|dedup|mark-duplicate|exclude\`
- \`rules list|add|remove|export\`
- \`diagram build|list\`, \`diff\`, \`fix-review\`, \`dashboard\`, \`update\`

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

### Findings (report-facing content)

A finding's title, description, and recommendation are published verbatim in the client's report. Write them to a single standard, whatever the source:

- **Structure for readability.** Split the description into short paragraphs that separate how the code is supposed to work (expected behavior), what is wrong (the flaw), and the impact. Not one dense block. No markdown headings and no bold section labels (\`**Summary**:\`, \`**Impact**:\`) — the separation is paragraph breaks.
- **Backtick every Solidity identifier.** Functions as \`\` \`functionName(...)\` \`\` with literal \`(...)\`; contracts, variables, constants, and hex/number literals in plain backticks. Standard names (ERC-4626, UUPS) stay plain. Never leave a bare identifier in the prose.
- **Show the offending code.** Include a minimal fenced \`\`\`solidity block of the relevant code rather than describing it only in words.
- **No line numbers.** Don't cite specific source lines ("line 56"); they drift when code or comments change. The code snippet replaces them.
- **Stand alone, no cross-references to other findings.** Never cite another issue by its Hex id (\`H-NNN\`) or by number/title. Report readers have no Hex ids and sections get reordered. Describe any shared mechanism inline.
- **No PoC references.** Don't name or link the proof-of-concept test or its path. The PoC lives in the validation memo, not the report.

These apply to findings from every source (manual, spec-conformance, AuditAgent, GitHub) identically.

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
      logger.dim('  hex analyze     # Stats + exact compiler facts (+ diff in differential mode)');
      logger.dim('  hex dashboard   # Open the review workspace');
    } catch (err) {
      tracker.finish();
      reportError(err);
      process.exit(1);
    }
  });
