import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import { glob } from 'glob';
import { logger } from '../core/logger.js';
import { createConfig } from '../core/config.js';
import { normalizePath, makeRelative, getOutputDir, splitLines } from '../core/paths.js';
import { runForge, detectTools } from '../core/external-tools.js';
import { parseSolidity, extractSolidityVersion } from '../parsers/solidity-parser.js';
import { copySkillsToClaudeFormat, getClaudeSkillsDir } from '../core/skills.js';

export const initCommand = new Command('init')
  .description('Initialize a new audit project')
  .option('--project <dir>', 'Project directory (default: cwd)')
  .option('--scope <globs>', 'Comma-separated scope file globs')
  .option('--commit <hash>', 'Git commit hash')
  .option('--chain <chain>', 'Target chain', 'ethereum')
  .option('--name <name>', 'Project name')
  .option('--docs <url>', 'Documentation URL')
  .option('--output-dir <dir>', 'Output directory', '.solaudit')
  .option('--exclude <globs>', 'Comma-separated exclude globs')
  .option('--no-verify', 'Skip build verification')
  .action(async (opts) => {
    const spin = logger.spinner('Initializing audit project...');

    try {
      const projectDir = path.resolve(opts.project ?? process.cwd());

      if (!fs.existsSync(projectDir)) {
        throw new Error(`Project directory not found: ${projectDir}`);
      }

      // Detect project type
      const isFoundry = fs.existsSync(path.join(projectDir, 'foundry.toml'));
      const isHardhat =
        fs.existsSync(path.join(projectDir, 'hardhat.config.ts')) ||
        fs.existsSync(path.join(projectDir, 'hardhat.config.js'));

      spin.text = 'Detecting project type...';
      if (isFoundry) logger.info('Detected Foundry project');
      else if (isHardhat) logger.info('Detected Hardhat project');
      else logger.warn('No Foundry or Hardhat config detected');

      // Check tool availability
      spin.text = 'Checking external tools...';
      const tools = await detectTools();
      for (const tool of tools) {
        if (tool.available) {
          logger.info(`${tool.name}: ${tool.version}`);
        } else {
          switch (tool.name) {
            case 'forge':
              logger.warn('forge not found — compilation verification and test coverage will be unavailable');
              break;
            case 'slither':
              logger.warn('slither not found — access control, state variable, and external call analysis will be limited');
              break;
            case 'solc':
              logger.warn('solc not found — storage layout extraction will be unavailable');
              break;
          }
        }
      }

      // Resolve scope globs
      if (!opts.scope) {
        throw new Error('--scope is required. Specify which files are in audit scope.');
      }

      spin.text = 'Resolving scope files...';
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

      // Deduplicate and validate
      const uniqueScope = [...new Set(scopeFiles)].sort();
      if (uniqueScope.length === 0) {
        throw new Error(`No files matched scope globs: ${scopeGlobs.join(', ')}`);
      }

      // Validate files exist
      for (const file of uniqueScope) {
        const fullPath = path.join(projectDir, file);
        if (!fs.existsSync(fullPath)) {
          throw new Error(`Scope file does not exist: ${file}`);
        }
      }

      logger.info(`Scope: ${uniqueScope.length} files`);

      // Detect Solidity version
      spin.text = 'Detecting Solidity version...';
      let solidityVersion = '0.8.20'; // default

      if (isFoundry) {
        const foundryToml = fs.readFileSync(
          path.join(projectDir, 'foundry.toml'),
          'utf-8',
        );
        const versionMatch = foundryToml.match(
          /solc[_-]version\s*=\s*["']?([\d.]+)/,
        );
        if (versionMatch) solidityVersion = versionMatch[1];
      }

      if (solidityVersion === '0.8.20') {
        // Scan pragmas from scope files
        for (const file of uniqueScope.slice(0, 5)) {
          const source = fs.readFileSync(
            path.join(projectDir, file),
            'utf-8',
          );
          const result = parseSolidity(source, file);
          const version = extractSolidityVersion(result.pragmas);
          if (version) {
            solidityVersion = version;
            break;
          }
        }
      }

      logger.info(`Solidity version: ${solidityVersion}`);

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
      spin.text = 'Creating configuration...';
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
      });

      const outputDir = getOutputDir(projectDir, config.settings.output_dir);

      // Copy skill files to .claude/skills/<name>/SKILL.md
      spin.text = 'Copying skill files...';
      const claudeSkillsDir = getClaudeSkillsDir(projectDir);
      const skillsCopied = copySkillsToClaudeFormat({ targetDir: claudeSkillsDir });
      logger.info(`Copied ${skillsCopied} skill files to .claude/skills/`);

      // Create subdirectories
      for (const subdir of ['validations', 'ai-results']) {
        const dir = path.join(outputDir, subdir);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
      }

      // Optionally verify compilation
      if (opts.verify !== false && isFoundry) {
        spin.text = 'Verifying compilation...';
        const result = await runForge(projectDir, ['build']);
        if (result.exitCode === 0) {
          logger.success('Project compiles successfully');
        } else {
          logger.warn('Compilation failed (non-fatal):');
          logger.dim(result.stderr.slice(0, 500));
        }
      }

      // Create CLAUDE.md for Claude Code skill discovery
      const claudeMdPath = path.join(projectDir, 'CLAUDE.md');
      if (!fs.existsSync(claudeMdPath)) {
        const claudeMd = `# SolAudit Project

This project is being audited with SolAudit.

## Skills
Audit skills are in \`.claude/skills/\` and auto-discovered by Claude Code as slash commands.
Type \`/\` to see available skills (e.g., \`/init-audit\`, \`/generate-overview\`).

## Output Directory
All audit outputs are in \`${config.settings.output_dir}/\`.

## Scope
The following files are in audit scope:
${uniqueScope.map((f) => `- \`${f}\``).join('\n')}
`;
        fs.writeFileSync(claudeMdPath, claudeMd, 'utf-8');
      }

      spin.succeed('Audit initialized');
      logger.info(`Config: ${normalizePath(path.join(outputDir, 'config.json'))}`);
      logger.info(`Output: ${normalizePath(outputDir)}`);
      logger.info('');
      logger.info('Next steps:');
      logger.dim('  solaudit stats    # Generate codebase statistics');
      logger.dim('  solaudit deps     # Build dependency graph');
      logger.dim('  solaudit access   # Map access control');
    } catch (err) {
      spin.fail('Initialization failed');
      logger.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });
