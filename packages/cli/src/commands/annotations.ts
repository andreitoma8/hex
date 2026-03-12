import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import { logger } from '../core/logger.js';
import { loadConfig } from '../core/config.js';
import { getOutputDir, normalizePath } from '../core/paths.js';
import { writeJsonOutput, readJsonFile } from '../core/output.js';
import { scanAnnotations, diffAnnotations } from '../analysis/annotation-scanner.js';
import type { Annotations } from '../types/index.js';

export const annotationsCommand = new Command('annotations')
  .description('Extract @audit annotations from source files')
  .option('--project <dir>', 'Project directory')
  .option('--diff', 'Show only new/changed since last run')
  .action(async (opts) => {
    const spin = logger.spinner('Scanning annotations...');

    try {
      const projectDir = opts.project ?? process.cwd();
      const config = loadConfig(projectDir);
      const outputDir = getOutputDir(config.project.project_dir, config.settings.output_dir);

      // Read all scope files
      const files: Array<{ path: string; source: string }> = [];
      for (const scopeFile of config.project.scope) {
        const filePath = path.resolve(config.project.project_dir, scopeFile);
        if (!fs.existsSync(filePath)) continue;

        files.push({
          path: normalizePath(scopeFile),
          source: fs.readFileSync(filePath, 'utf-8'),
        });
      }

      // Scan for annotations
      const annotations = scanAnnotations(files);

      if (opts.diff) {
        // Compare with previous
        const previous = readJsonFile<Annotations>(
          path.join(outputDir, 'annotations.json'),
        );

        if (previous) {
          const diff = diffAnnotations(annotations, previous.annotations);
          logger.info(`New: ${diff.added.length}, Changed: ${diff.changed.length}, Removed: ${diff.removed.length}`);

          if (diff.added.length > 0) {
            logger.info('New annotations:');
            for (const a of diff.added) {
              logger.dim(`  ${a.id} [${a.type}] ${a.file}:${a.line} — ${a.text}`);
            }
          }
        }
      }

      const result: Annotations = {
        extracted_at: new Date().toISOString(),
        annotations,
      };

      const outPath = writeJsonOutput(outputDir, 'annotations.json', result);
      spin.succeed('Annotation scan complete');
      logger.info(`Output: ${outPath}`);
      logger.info(`Found: ${annotations.length} annotations`);

      // Summary by type
      const byType = new Map<string, number>();
      for (const a of annotations) {
        byType.set(a.type, (byType.get(a.type) ?? 0) + 1);
      }
      for (const [type, count] of byType) {
        logger.dim(`  ${type}: ${count}`);
      }
    } catch (err) {
      spin.fail('Annotation scan failed');
      logger.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });
