import { Command } from 'commander';
import path from 'node:path';
import { logger } from '../core/logger.js';
import { loadConfig } from '../core/config.js';
import { getOutputDir } from '../core/paths.js';
import { readJsonFile, writeMarkdownOutput } from '../core/output.js';
import type { Findings, Finding } from '../types/index.js';

const SEVERITY_ORDER: Record<string, number> = {
  Critical: 0,
  High: 1,
  Medium: 2,
  Low: 3,
  Info: 4,
};

export const renderFindingsCommand = new Command('render-findings')
  .description('Render findings.md from findings.json')
  .option('--project <dir>', 'Project directory')
  .action(async (opts) => {
    const spin = logger.spinner('Rendering findings...');

    try {
      const projectDir = opts.project ?? process.cwd();
      const config = loadConfig(projectDir);
      const outputDir = getOutputDir(config.project.project_dir, config.settings.output_dir);

      const findings = readJsonFile<Findings>(path.join(outputDir, 'findings.json'));
      if (!findings || findings.findings.length === 0) {
        spin.info('No findings to render');
        return;
      }

      // Sort by severity
      const sorted = [...findings.findings].sort(
        (a, b) => (SEVERITY_ORDER[a.severity] ?? 99) - (SEVERITY_ORDER[b.severity] ?? 99),
      );

      // Build markdown
      const lines: string[] = [];

      // Summary table
      lines.push('# Findings Report');
      lines.push('');
      lines.push('## Summary');
      lines.push('');
      lines.push('| Severity | Count |');
      lines.push('|----------|-------|');

      const counts = new Map<string, number>();
      for (const f of sorted) {
        counts.set(f.severity, (counts.get(f.severity) ?? 0) + 1);
      }
      for (const sev of ['Critical', 'High', 'Medium', 'Low', 'Info']) {
        const count = counts.get(sev) ?? 0;
        if (count > 0) {
          lines.push(`| ${sev} | ${count} |`);
        }
      }
      lines.push('');
      lines.push(`**Total: ${sorted.length} findings**`);
      lines.push('');
      lines.push('---');
      lines.push('');

      // Render each finding
      for (const finding of sorted) {
        lines.push(renderFinding(finding));
        lines.push('---');
        lines.push('');
      }

      const content = lines.join('\n');
      const outPath = writeMarkdownOutput(outputDir, 'findings.md', content);
      spin.succeed('Findings rendered');
      logger.info(`Output: ${outPath}`);
      logger.info(`Rendered: ${sorted.length} findings`);
    } catch (err) {
      spin.fail('Findings rendering failed');
      logger.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

function renderFinding(f: Finding): string {
  const lines: string[] = [];

  // Title with severity
  lines.push(`## **[${f.severity}] ${f.title}**`);
  lines.push('');

  // File locations
  const files = f.root_cause.locations.map((loc) => `\`${loc.file}\``).join(', ');
  if (files) {
    lines.push(`**File(s):** ${files}`);
    lines.push('');
  }

  // Description
  lines.push(`**Description:** ${f.description}`);
  lines.push('');

  // Root cause code with @audit-issue comments
  for (const loc of f.root_cause.locations) {
    if (loc.snippet) {
      lines.push('```solidity');
      lines.push(loc.snippet);
      lines.push('```');
      lines.push('');
    }
  }

  // Recommendation
  lines.push(`**Recommendation(s):** ${f.recommendation}`);
  lines.push('');

  // Status
  lines.push('**Status:** Unresolved');
  lines.push('');

  return lines.join('\n');
}
