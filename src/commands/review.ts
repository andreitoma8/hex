import { Command } from 'commander';
import { logger } from '../core/logger.js';
import { loadProjectContext } from '../core/config.js';
import { reportError } from '../core/errors.js';
import { markFunctions, REVIEW_STATES, reviewSummary, type ReviewState } from '../core/review.js';
import { loadFacts, resolveFunctions } from '../facts/query.js';
import { addRule, readRules, removeRule, rulesMarkdown } from '../core/rules.js';

const outDir = (opts: { project?: string }) =>
  loadProjectContext(opts.project ?? process.cwd()).outputDir;
const fail = (err: unknown) => {
  reportError(err);
  process.exit(1);
};

const markCmd = new Command('mark')
  .description(
    'Set the review state of functions (Vault.withdraw, Vault.withdraw(uint256), or a whole contract: Vault)',
  )
  .argument('<refs...>', 'Function refs or contract names')
  .requiredOption('--state <state>', REVIEW_STATES.join(' | '))
  .option('--by <who>', 'auditor | diane | dashboard | agent', 'auditor')
  .option('--note <text>', 'Short note (e.g. the open question)')
  .option('--project <dir>', 'Project directory')
  .action(
    (refs: string[], opts: { state: string; by: string; note?: string; project?: string }) => {
      try {
        if (!(REVIEW_STATES as readonly string[]).includes(opts.state)) {
          throw new Error(`--state must be one of ${REVIEW_STATES.join(', ')}`);
        }
        const dir = outDir(opts);
        const facts = loadFacts(dir);
        if (!facts) throw new Error('No .hex/facts.json yet. Run `hex facts` first.');
        const ids = new Set<string>();
        const unresolved: string[] = [];
        for (const ref of refs) {
          const contractFns = facts.functions.filter((f) => f.contract === ref && f.in_scope);
          const hits = contractFns.length
            ? contractFns
            : resolveFunctions(facts, ref).filter((f) => f.in_scope);
          if (!hits.length) unresolved.push(ref);
          for (const f of hits) ids.add(f.id);
        }
        if (unresolved.length) throw new Error(`Unknown function(s): ${unresolved.join(', ')}`);
        markFunctions(dir, [...ids], opts.state as ReviewState, opts.by as 'auditor', opts.note);
        logger.success(`${[...ids].join(', ')} → ${opts.state}`);
      } catch (err) {
        fail(err);
      }
    },
  );

const statusCmd = new Command('status')
  .description('Review progress: cleared nSLOC and per-state counts')
  .option('--json', 'Full review map as JSON')
  .option('--project <dir>', 'Project directory')
  .action((opts: { json?: boolean; project?: string }) => {
    try {
      const s = reviewSummary(outDir(opts));
      if (opts.json) return void console.log(JSON.stringify(s, null, 2));
      console.log(`${s.pct}% cleared (${s.cleared_nsloc}/${s.total_nsloc} nSLOC)`);
      console.log(
        `cleared ${s.counts.cleared} · questioned ${s.counts.questioned} · read ${s.counts.read} · unread ${s.counts.unread}`,
      );
    } catch (err) {
      fail(err);
    }
  });

const blindCmd = new Command('blind-spots')
  .description('Riskiest code nobody (human or AI) has looked at hard yet')
  .option('--limit <n>', 'How many', '10')
  .option('--json', 'JSON output')
  .option('--project <dir>', 'Project directory')
  .action((opts: { limit: string; json?: boolean; project?: string }) => {
    try {
      const s = reviewSummary(outDir(opts), { blindSpots: parseInt(opts.limit, 10) });
      if (opts.json) return void console.log(JSON.stringify(s.blind_spots, null, 2));
      if (!s.blind_spots.length)
        return void console.log('No blind spots: everything is cleared or questioned.');
      for (const r of s.blind_spots) {
        console.log(
          `${String(r.risk).padStart(3)}  ${r.id}  ${r.file}:${r.line_start}  ${r.state}${r.ai_seen ? ', AI-seen' : ''}  (${r.risk_reasons.join(', ')})`,
        );
      }
    } catch (err) {
      fail(err);
    }
  });

export const reviewCommand = new Command('review')
  .description(
    'Per-function review map: mark functions read / questioned / cleared, see blind spots',
  )
  .addCommand(markCmd)
  .addCommand(statusCmd)
  .addCommand(blindCmd);

// ─── hex rules ──────────────────────────────────────────────────────

const rulesList = new Command('list')
  .description('List triage rules')
  .option('--json', 'JSON output')
  .option('--project <dir>', 'Project directory')
  .action((opts: { json?: boolean; project?: string }) => {
    try {
      const rules = readRules(outDir(opts));
      if (opts.json) return void console.log(JSON.stringify(rules, null, 2));
      if (!rules.length) return void console.log('No triage rules.');
      for (const r of rules)
        console.log(
          `${r.id} ${r.kind.padEnd(13)} ${r.text}${r.scope.length ? ` [${r.scope.join(', ')}]` : ''}`,
        );
    } catch (err) {
      fail(err);
    }
  });

const rulesAdd = new Command('add')
  .description('Add a triage rule (fed into /ai-audit, AuditAgent ingest and pre-validation)')
  .requiredOption('--kind <kind>', 'out_of_scope | trusted_role | by_design | known_issue')
  .requiredOption('--text <text>', 'The rule, as one sentence')
  .option('--scope <refs...>', 'Contracts / function ids it is limited to')
  .option('--from <id>', 'The card that prompted it (H-NNN)')
  .option('--project <dir>', 'Project directory')
  .action(
    (opts: { kind: string; text: string; scope?: string[]; from?: string; project?: string }) => {
      try {
        const kinds = ['out_of_scope', 'trusted_role', 'by_design', 'known_issue'];
        if (!kinds.includes(opts.kind))
          throw new Error(`--kind must be one of ${kinds.join(', ')}`);
        const rule = addRule(outDir(opts), {
          kind: opts.kind as 'out_of_scope',
          text: opts.text,
          scope: opts.scope,
          created_from: opts.from,
        });
        console.log(rule.id);
      } catch (err) {
        fail(err);
      }
    },
  );

const rulesRemove = new Command('remove')
  .description('Remove a triage rule')
  .argument('<id>', 'R-NNN')
  .option('--project <dir>', 'Project directory')
  .action((id: string, opts: { project?: string }) => {
    try {
      removeRule(outDir(opts), id);
      logger.success(`Removed ${id}`);
    } catch (err) {
      fail(err);
    }
  });

const rulesExport = new Command('export')
  .description('Print the rules as markdown for agent bundles (empty when there are none)')
  .option('--project <dir>', 'Project directory')
  .action((opts: { project?: string }) => {
    try {
      process.stdout.write(rulesMarkdown(readRules(outDir(opts))));
    } catch (err) {
      fail(err);
    }
  });

export const rulesCommand = new Command('rules')
  .description("Triage rules: the auditor's standing decisions, fed into every AI run")
  .addCommand(rulesList)
  .addCommand(rulesAdd)
  .addCommand(rulesRemove)
  .addCommand(rulesExport);
