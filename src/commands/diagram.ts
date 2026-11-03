import { Command } from 'commander';
import { logger } from '../core/logger.js';
import { loadProjectContext } from '../core/config.js';
import { reportError } from '../core/errors.js';
import { buildDiagrams, readDiagramIndex } from '../diagrams/build.js';

const outDir = (opts: { project?: string }) =>
  loadProjectContext(opts.project ?? process.cwd()).outputDir;

const buildCmd = new Command('build')
  .description('Lay out .hex/model/diagrams/*.spec.json into .excalidraw scenes')
  .argument('[names...]', 'Only these diagrams (file names without .spec.json)')
  .option('--force', 'Overwrite scenes you edited in the dashboard')
  .option('--project <dir>', 'Project directory')
  .action((names: string[], opts: { force?: boolean; project?: string }) => {
    try {
      const outcomes = buildDiagrams(outDir(opts), { names, force: opts.force });
      if (!outcomes.length) {
        logger.warn('No diagram specs in .hex/model/diagrams/ (/init-audit writes them).');
        return;
      }
      let invalid = 0;
      for (const o of outcomes) {
        if (o.status === 'invalid') {
          invalid++;
          logger.error(`${o.name}: ${o.error}`);
        } else if (o.status === 'regenerated') {
          logger.warn(
            `${o.name}: you edited this scene; the new layout is in ${o.name}.regenerated.excalidraw`,
          );
        } else if (o.status === 'unchanged-edited') {
          logger.dim(`${o.name}: kept your edits (spec unchanged)`);
        } else {
          logger.success(`${o.name}`);
        }
      }
      if (invalid) process.exit(1);
    } catch (err) {
      reportError(err);
      process.exit(1);
    }
  });

const listCmd = new Command('list')
  .description('List diagrams')
  .option('--project <dir>', 'Project directory')
  .action((opts: { project?: string }) => {
    try {
      const idx = readDiagramIndex(outDir(opts));
      if (!idx.length) return void console.log('No diagrams.');
      for (const d of idx) {
        const flags = [
          d.edited ? 'edited' : '',
          d.stale ? 'stale' : '',
          d.in_report ? 'in report' : '',
        ]
          .filter(Boolean)
          .join(', ');
        console.log(
          `${d.name.padEnd(28)} ${d.type.padEnd(14)} ${d.title}${flags ? `  (${flags})` : ''}`,
        );
      }
    } catch (err) {
      reportError(err);
      process.exit(1);
    }
  });

export const diagramCommand = new Command('diagram')
  .description(
    'Diagrams that explain the protocol (custody, privilege, state machine, accounting, sequence)',
  )
  .addCommand(buildCmd)
  .addCommand(listCmd);
