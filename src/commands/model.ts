import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import { logger } from '../core/logger.js';
import { loadProjectContext } from '../core/config.js';
import { reportError } from '../core/errors.js';
import { InvariantsFileSchema, ProtocolModelSchema } from '../core/schema.js';
import {
  applyVerdicts,
  invariantsMarkdown,
  linkInvariantIssue,
  modelDir,
  readInvariants,
  readProtocolModel,
  setInvariantStatus,
  setInvariantTest,
} from '../core/model.js';
import { loadFacts } from '../facts/query.js';
import { syncFuzzResults, type FuzzSyncInvariant } from '../core/fuzz-sync.js';

const outDir = (opts: { project?: string }) =>
  loadProjectContext(opts.project ?? process.cwd()).outputDir;

const fail = (err: unknown) => {
  reportError(err);
  process.exit(1);
};

// ─── hex model ──────────────────────────────────────────────────────

const showCmd = new Command('show')
  .description('Print the protocol model (or one section) as JSON')
  .argument(
    '[section]',
    'actors | assets | privileges | trust_assumptions | external_dependencies | state_machines | accounting | risky_flows',
  )
  .option('--project <dir>', 'Project directory')
  .action((section: string | undefined, opts: { project?: string }) => {
    try {
      const model = readProtocolModel(outDir(opts));
      if (!model) throw new Error('No .hex/model/protocol.json yet. /init-audit writes it.');
      const data = section ? (model as Record<string, unknown>)[section] : model;
      if (data === undefined) throw new Error(`Unknown section ${section}`);
      console.log(JSON.stringify(data, null, 2));
    } catch (err) {
      fail(err);
    }
  });

/**
 * Schema-check protocol.json / invariants.json and cross-check every function
 * id they cite against facts.json, so a typo'd reference cannot slip through.
 */
const validateCmd = new Command('validate')
  .description(
    'Schema-check the model and invariants and verify every cited function id exists in facts',
  )
  .option('--project <dir>', 'Project directory')
  .action((opts: { project?: string }) => {
    try {
      const dir = outDir(opts);
      const problems: string[] = [];
      const protoPath = path.join(modelDir(dir), 'protocol.json');
      const facts = loadFacts(dir);
      const fnIds = new Set(facts?.functions.map((f) => f.id) ?? []);
      const checkFn = (where: string, id: string) => {
        if (facts && id && !fnIds.has(id))
          problems.push(
            `${where}: unknown function id "${id}" (see \`hex facts query function <name>\`)`,
          );
      };
      if (fs.existsSync(protoPath)) {
        const r = ProtocolModelSchema.safeParse(JSON.parse(fs.readFileSync(protoPath, 'utf-8')));
        if (!r.success) {
          for (const i of r.error.issues)
            problems.push(`protocol.json ${i.path.join('.')}: ${i.message}`);
        } else {
          const m = r.data;
          m.actors.forEach((a) => a.powers.forEach((p) => checkFn(`actor ${a.id}`, p)));
          m.assets.forEach((a) => a.moved_by.forEach((p) => checkFn(`asset ${a.id}`, p)));
          m.privileges.forEach((p) => checkFn(`privilege ${p.claim_id}`, p.function));
          m.state_machines.forEach((s) =>
            s.transitions.forEach((t) => checkFn(`state machine ${s.id}`, t.function)),
          );
          m.accounting.forEach((a) =>
            a.terms.forEach((t) =>
              t.updated_by.forEach((u) => checkFn(`accounting ${a.id}`, u.function)),
            ),
          );
          m.external_dependencies.forEach((d) =>
            d.used_by.forEach((p) => checkFn(`dependency ${d.id}`, p)),
          );
          m.risky_flows.forEach((f) => checkFn(`flow ${f.id}`, f.entry));
        }
      } else {
        problems.push('protocol.json is missing');
      }
      const invPath = path.join(modelDir(dir), 'invariants.json');
      if (fs.existsSync(invPath)) {
        const r = InvariantsFileSchema.safeParse(JSON.parse(fs.readFileSync(invPath, 'utf-8')));
        if (!r.success)
          for (const i of r.error.issues)
            problems.push(`invariants.json ${i.path.join('.')}: ${i.message}`);
        else
          r.data.invariants.forEach((i) =>
            i.scope.functions.forEach((f) => checkFn(`invariant ${i.id}`, f)),
          );
      }
      if (problems.length) {
        for (const p of problems) logger.error(p);
        process.exit(1);
      }
      logger.success('Model and invariants are valid; every cited function exists.');
    } catch (err) {
      fail(err);
    }
  });

const applyVerdictsCmd = new Command('apply-verdicts')
  .description(
    'Merge skeptic verdicts (.hex/model/verdicts/*.json) into protocol.json and invariants.json',
  )
  .option('--project <dir>', 'Project directory')
  .action((opts: { project?: string }) => {
    try {
      const r = applyVerdicts(outDir(opts));
      logger.success(`${r.verified} claim(s) verified, ${r.contested} contested`);
      if (r.invariants.verified + r.invariants.contested)
        logger.success(
          `${r.invariants.verified} invariant(s) hold, ${r.invariants.contested} contested`,
        );
      if (r.unknown.length)
        logger.warn(`Verdicts for unknown claim ids (ignored): ${r.unknown.join(', ')}`);
    } catch (err) {
      fail(err);
    }
  });

export const modelCommand = new Command('model')
  .description('The protocol model written by /init-audit (.hex/model/protocol.json)')
  .addCommand(showCmd)
  .addCommand(validateCmd)
  .addCommand(applyVerdictsCmd);

// ─── hex invariant ──────────────────────────────────────────────────

const listInvCmd = new Command('list')
  .description('List invariants')
  .option('--status <s>', 'proposed | accepted | rejected')
  .option('--json', 'JSON output')
  .option('--project <dir>', 'Project directory')
  .action((opts: { status?: string; json?: boolean; project?: string }) => {
    try {
      const list = readInvariants(outDir(opts)).invariants.filter(
        (i) => !opts.status || i.status === opts.status,
      );
      if (opts.json) return void console.log(JSON.stringify(list, null, 2));
      if (!list.length) return void console.log('No invariants.');
      for (const i of list) {
        const test = i.test ? ` [${i.test.tool}: ${i.test.status}]` : '';
        console.log(`${i.id} ${i.status.padEnd(8)} ${i.kind.padEnd(13)} ${i.statement}${test}`);
      }
    } catch (err) {
      fail(err);
    }
  });

const acceptCmd = new Command('accept')
  .description('Accept invariants (they feed /ai-audit, /fuzz and the report)')
  .argument('<ids...>', 'INV-NNN ids')
  .option('--project <dir>', 'Project directory')
  .action((ids: string[], opts: { project?: string }) => {
    try {
      const dir = outDir(opts);
      for (const id of ids) setInvariantStatus(dir, id, 'accepted');
      logger.success(`Accepted ${ids.join(', ')}`);
    } catch (err) {
      fail(err);
    }
  });

const rejectCmd = new Command('reject')
  .description('Reject an invariant (does not hold by design, or is not useful)')
  .argument('<id>', 'INV-NNN')
  .option('--reason <text>', 'Why')
  .option('--project <dir>', 'Project directory')
  .action((id: string, opts: { reason?: string; project?: string }) => {
    try {
      setInvariantStatus(outDir(opts), id, 'rejected', opts.reason);
      logger.success(`Rejected ${id}`);
    } catch (err) {
      fail(err);
    }
  });

const setTestCmd = new Command('set-test')
  .description('Record the test/fuzz status of an invariant')
  .argument('<id>', 'INV-NNN')
  .option('--tool <tool>', 'fizz | foundry')
  .option('--status <status>', 'not_written | passing | failing | broken')
  .option('--file <path>', 'Test / property file')
  .option('--property <id>', 'Tool-side property id (e.g. fizz GL-03)')
  .option('--runs <n>', 'Fuzz runs')
  .option('--repro <path>', 'Repro test for a violation')
  .option('--project <dir>', 'Project directory')
  .action(
    (
      id: string,
      opts: {
        tool?: string;
        status?: string;
        file?: string;
        property?: string;
        runs?: string;
        repro?: string;
        project?: string;
      },
    ) => {
      try {
        const inv = setInvariantTest(outDir(opts), id, {
          ...(opts.tool ? { tool: opts.tool as 'fizz' | 'foundry' } : {}),
          ...(opts.status
            ? { status: opts.status as 'not_written' | 'passing' | 'failing' | 'broken' }
            : {}),
          ...(opts.file ? { file: opts.file } : {}),
          ...(opts.property ? { property_id: opts.property } : {}),
          ...(opts.runs ? { runs: parseInt(opts.runs, 10) } : {}),
          ...(opts.repro ? { repro_file: opts.repro } : {}),
          // Only a real run (a result or a run count) moves the run timestamp.
          ...(opts.runs || (opts.status && opts.status !== 'not_written')
            ? { last_run_at: new Date().toISOString() }
            : {}),
        });
        logger.success(`${id}: ${inv.test?.tool} ${inv.test?.status}`);
      } catch (err) {
        fail(err);
      }
    },
  );

const linkIssueCmd = new Command('link-issue')
  .description('Link a violated invariant to its board card')
  .argument('<id>', 'INV-NNN')
  .argument('<issue>', 'H-NNN')
  .option('--project <dir>', 'Project directory')
  .action((id: string, issue: string, opts: { project?: string }) => {
    try {
      linkInvariantIssue(outDir(opts), id, issue);
      logger.success(`${id} → ${issue}`);
    } catch (err) {
      fail(err);
    }
  });

const exportCmd = new Command('export')
  .description('Print accepted invariants as markdown (for agent bundles and the report)')
  .option('--include-proposed', 'Also include proposed invariants')
  .option('--project <dir>', 'Project directory')
  .action((opts: { includeProposed?: boolean; project?: string }) => {
    try {
      process.stdout.write(
        invariantsMarkdown(readInvariants(outDir(opts)), { includeProposed: opts.includeProposed }),
      );
    } catch (err) {
      fail(err);
    }
  });

const syncFuzzCmd = new Command('sync-fuzz')
  .description(
    'Fold the latest /fuzz campaign into the invariants; open a card per reproduced violation',
  )
  .option(
    '--suite-dir <dir>',
    'Fuzz suite dir relative to the project (default: from last-run.json, else test/fizz)',
  )
  .option('--dry-run', 'Report only; write nothing')
  .option('--json', 'JSON output')
  .option('--project <dir>', 'Project directory')
  .action((opts: { suiteDir?: string; dryRun?: boolean; json?: boolean; project?: string }) => {
    try {
      const s = syncFuzzResults(outDir(opts), { suiteDir: opts.suiteDir, dryRun: opts.dryRun });
      if (opts.json) return void console.log(JSON.stringify(s, null, 2));
      if (!s.logs.length)
        logger.warn(
          'No campaign log under .hex/fuzz/fizz_data yet; synced mappings and broken / not-written states only.',
        );
      for (const l of s.logs) {
        const calls = l.calls != null ? `, ${l.calls.toLocaleString('en-US')} calls` : '';
        logger.dim(
          `${l.tool}: ${l.file} (${l.finished_at}${calls}${l.failed.length ? `, failed: ${l.failed.join(', ')}` : ''})`,
        );
      }
      const show = (label: string, status: string, fmt: (i: FuzzSyncInvariant) => string) => {
        const rows = s.invariants.filter((i) => i.status === status);
        if (rows.length) console.log(`  ${label.padEnd(12)} ${rows.map(fmt).join(', ')}`);
      };
      show('passing', 'passing', (i) => i.id);
      show('failing', 'failing', (i) =>
        i.issue_id
          ? `${i.id} → ${i.issue_id}${i.issue_created ? ' (new card)' : ''}`
          : `${i.id} (${i.reason}; no card)`,
      );
      show('broken', 'broken', (i) => `${i.id} (${i.reason})`);
      show('not written', 'not_written', (i) => i.id);
      show('unchanged', 'unchanged', (i) => `${i.id} (${i.reason})`);
      if (s.unmapped_properties.length)
        logger.warn(`Not tracked in Hex (no (INV-NNN) tag): ${s.unmapped_properties.join(', ')}`);
      for (const u of s.unknown_invariants)
        logger.warn(`${u.property} names ${u.invariant}, which is not in invariants.json`);
      for (const u of s.unattributed) {
        logger.warn(
          `${u.property}${u.invariant ? ` (${u.invariant})` : ''}: ${u.handlers.join(', ')} failed, but no test_repro_<property> names it. Write one to attribute the violation.`,
        );
      }
      const cards = s.created_issues.length ? `; ${s.created_issues.length} new card(s)` : '';
      logger.success(
        `Synced ${s.invariants.length} invariant(s) from ${s.properties_file}${cards}${opts.dryRun ? ' (dry run: nothing written)' : ''}`,
      );
    } catch (err) {
      fail(err);
    }
  });

export const invariantCommand = new Command('invariant')
  .description('Invariants (.hex/model/invariants.json): accept, track tests, link violations')
  .addCommand(listInvCmd)
  .addCommand(acceptCmd)
  .addCommand(rejectCmd)
  .addCommand(setTestCmd)
  .addCommand(linkIssueCmd)
  .addCommand(exportCmd)
  .addCommand(syncFuzzCmd);
