/**
 * `hex mcp`: a stdio MCP server that gives a Claude Code session typed access
 * to the Hex project — what the auditor is looking at in the dashboard, exact
 * compiler facts, the protocol model, the board, the review map, notes and
 * triage rules. Tools only (no channels). Every tool wraps the same core
 * modules the CLI uses, so behaviour is identical either way.
 */
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { findOutputDir } from '../core/locate.js';
import {
  COLUMN_TO_STATUS,
  createIssue,
  ISSUE_SOURCES,
  moveIssue,
  patchIssue,
  recordValidation,
  type BoardColumn,
  type IssueSource,
  type Severity,
} from '../core/issues.js';
import { dedupCandidates, markDuplicate } from '../core/dedup.js';
import { markFunctions, REVIEW_STATES, reviewSummary, type ReviewState } from '../core/review.js';
import { addLeadIdempotent, readContractNote, resolveNoteTarget } from '../core/notes.js';
import { commentsForFile, readComments } from '../core/comments.js';
import { addRule, readRules } from '../core/rules.js';
import {
  readInvariants,
  readProtocolModel,
  setInvariantStatus,
  setInvariantTest,
} from '../core/model.js';
import {
  FACT_QUERIES,
  loadFacts,
  resolveFunctions,
  runFactQuery,
  type FactQuery,
} from '../facts/query.js';

const INSTRUCTIONS = `Hex is the auditor's Solidity audit workspace for this repository (data in .hex/).
- When the user says "this", "here", "the selected …", "what I'm looking at" or similar, call hex_focus first: it returns what they have selected in the Hex dashboard (a function, card, diagram node, code range, invariant or code comment).
- For exact code relationships (who calls X, who writes Y, storage layout, linearization, which entry points reach X) use hex_facts_query instead of grepping: it comes from the compiler AST.
- The auditor's comments on lines of code (written in the dashboard's code viewer) come from hex_code_comments.
- Board changes (new card, move, patch, duplicate, validation) and review marks go through these tools; never edit .hex JSON by hand.`;

type Json = Record<string, unknown> | unknown[] | string | number | boolean | null;

function ok(data: Json) {
  return {
    content: [
      {
        type: 'text' as const,
        text: typeof data === 'string' ? data : JSON.stringify(data, null, 2),
      },
    ],
  };
}
function err(message: string) {
  return { content: [{ type: 'text' as const, text: message }], isError: true };
}

function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as T;
  } catch {
    return null;
  }
}

export function createHexServer(cwd: string = process.cwd()): McpServer {
  const server = new McpServer({ name: 'hex', version: '0.8.0' }, { instructions: INSTRUCTIONS });
  const outDir = () => {
    const d = findOutputDir(cwd);
    if (!d) throw new Error('No Hex project here (no .hex/config.json). Run `hex init` first.');
    return d;
  };
  const guard =
    <A>(fn: (args: A) => Json) =>
    async (args: A) => {
      try {
        return ok(fn(args));
      } catch (e) {
        return err(e instanceof Error ? e.message : String(e));
      }
    };

  // ── Focus ─────────────────────────────────────────────────────────
  server.registerTool(
    'hex_focus',
    {
      title: 'What the auditor is looking at',
      description:
        'Returns the current selection in the Hex dashboard (function, card, diagram node, code range or invariant), enriched with facts, review state and related cards. Call this whenever the user refers to "this" or "the selected" thing.',
      inputSchema: {},
    },
    guard(() => {
      const dir = outDir();
      const focus = readJson<{
        ref: string;
        kind: string;
        label?: string;
        file?: string;
        line_start?: number;
        line_end?: number;
        updated_at?: string;
      }>(path.join(dir, 'focus.json'));
      if (!focus) return { focus: null, hint: 'Nothing selected in the dashboard yet.' };
      const ageSec = focus.updated_at
        ? Math.round((Date.now() - Date.parse(focus.updated_at)) / 1000)
        : null;
      const out: Record<string, unknown> = { focus, age_seconds: ageSec };
      const facts = loadFacts(dir);
      if (facts && (focus.kind === 'function' || focus.kind === 'diagram_node')) {
        const fns = resolveFunctions(facts, focus.ref);
        if (fns.length) {
          const review = reviewSummary(dir);
          out.functions = fns.map((f) => ({
            ...f,
            review: review.rows.find((r) => r.id === f.id) ?? null,
          }));
        }
      }
      if (focus.kind === 'card') {
        const findings =
          readJson<{ findings: Array<{ id: string }> }>(path.join(dir, 'findings.json'))
            ?.findings ?? [];
        const tracking =
          readJson<{ findings: Array<{ id: string }> }>(path.join(dir, 'tracking.json'))
            ?.findings ?? [];
        out.card = {
          finding: findings.find((f) => f.id === focus.ref) ?? null,
          tracking: tracking.find((t) => t.id === focus.ref) ?? null,
        };
      }
      return out as Json;
    }),
  );

  // ── Facts ─────────────────────────────────────────────────────────
  server.registerTool(
    'hex_facts_query',
    {
      title: 'Exact compiler facts',
      description:
        'Query the compiler AST facts: callers / callees (optionally transitive), readers / writers of a state variable, storage layout, linearization, entry points, which entry points reach a function, or a function record.',
      inputSchema: {
        query: z.enum(FACT_QUERIES),
        ref: z
          .string()
          .optional()
          .describe(
            'Function (Vault.withdraw or Vault.withdraw(uint256) or withdraw), state var (Vault.totalAssets or totalAssets), or contract',
          ),
        transitive: z.boolean().optional(),
      },
    },
    guard(
      ({ query, ref, transitive }: { query: FactQuery; ref?: string; transitive?: boolean }) => {
        const facts = loadFacts(outDir());
        if (!facts) throw new Error('No .hex/facts.json yet. Run `hex facts`.');
        return {
          source: facts.source,
          result: runFactQuery(facts, query, ref, { transitive }) as Json,
        };
      },
    ),
  );

  // ── Model + invariants ────────────────────────────────────────────
  server.registerTool(
    'hex_model_get',
    {
      title: 'Protocol model',
      description:
        'The verified protocol model: actors, assets, privileges, trust assumptions, dependencies, state machines, accounting, risky flows.',
      inputSchema: { section: z.string().optional() },
    },
    guard(({ section }: { section?: string }) => {
      const model = readProtocolModel(outDir());
      if (!model)
        throw new Error('No protocol model yet (/init-audit writes .hex/model/protocol.json).');
      return (section ? (model as Record<string, unknown>)[section] : model) as Json;
    }),
  );
  server.registerTool(
    'hex_invariant_list',
    {
      title: 'Invariants',
      description: 'List invariants with status and test results.',
      inputSchema: { status: z.enum(['proposed', 'accepted', 'rejected']).optional() },
    },
    guard(
      ({ status }: { status?: string }) =>
        readInvariants(outDir()).invariants.filter((i) => !status || i.status === status) as Json,
    ),
  );
  server.registerTool(
    'hex_invariant_set',
    {
      title: 'Update an invariant',
      description: 'Accept or reject an invariant, or record its test/fuzz result.',
      inputSchema: {
        id: z.string(),
        status: z.enum(['proposed', 'accepted', 'rejected']).optional(),
        reason: z.string().optional(),
        test_tool: z.enum(['fizz', 'foundry']).optional(),
        test_status: z.enum(['not_written', 'passing', 'failing', 'broken']).optional(),
        test_file: z.string().optional(),
        repro_file: z.string().optional(),
      },
    },
    guard(
      (a: {
        id: string;
        status?: 'proposed' | 'accepted' | 'rejected';
        reason?: string;
        test_tool?: 'fizz' | 'foundry';
        test_status?: 'not_written' | 'passing' | 'failing' | 'broken';
        test_file?: string;
        repro_file?: string;
      }) => {
        const dir = outDir();
        if (a.status) setInvariantStatus(dir, a.id, a.status, a.reason);
        if (a.test_tool || a.test_status || a.test_file || a.repro_file) {
          setInvariantTest(dir, a.id, {
            ...(a.test_tool ? { tool: a.test_tool } : {}),
            ...(a.test_status ? { status: a.test_status } : {}),
            ...(a.test_file ? { file: a.test_file } : {}),
            ...(a.repro_file ? { repro_file: a.repro_file } : {}),
            last_run_at: new Date().toISOString(),
          });
        }
        return readInvariants(dir).invariants.find((i) => i.id === a.id) as unknown as Json;
      },
    ),
  );

  // ── Board ─────────────────────────────────────────────────────────
  server.registerTool(
    'hex_board_list',
    {
      title: 'Board',
      description:
        'Compact list of cards: id, title, severity, status, source, validation verdict.',
      inputSchema: { status: z.string().optional(), source: z.string().optional() },
    },
    guard(({ status, source }: { status?: string; source?: string }) => {
      const tracking =
        readJson<{ findings: Array<Record<string, unknown>> }>(path.join(outDir(), 'tracking.json'))
          ?.findings ?? [];
      return tracking
        .filter((t) => (!status || t.status === status) && (!source || t.source === source))
        .map((t) => ({
          id: t.id,
          title: t.title,
          severity: t.severity,
          status: t.status,
          source: t.source,
          ...(t.validation ? { verdict: (t.validation as { verdict?: string }).verdict } : {}),
          ...(t.duplicate_of ? { duplicate_of: t.duplicate_of } : {}),
        }));
    }),
  );
  server.registerTool(
    'hex_issue_show',
    {
      title: 'Card',
      description: 'Full finding + tracking record of a card.',
      inputSchema: { id: z.string() },
    },
    guard(({ id }: { id: string }) => {
      const dir = outDir();
      const f =
        readJson<{ findings: Array<{ id: string }> }>(
          path.join(dir, 'findings.json'),
        )?.findings.find((x) => x.id === id) ?? null;
      const t =
        readJson<{ findings: Array<{ id: string }> }>(
          path.join(dir, 'tracking.json'),
        )?.findings.find((x) => x.id === id) ?? null;
      if (!f && !t) throw new Error(`No card ${id}`);
      return { id, finding: f, tracking: t } as unknown as Json;
    }),
  );
  server.registerTool(
    'hex_issue_new',
    {
      title: 'New card',
      description:
        'Create a Potential card with a uniform H-NNN id. Then fill description/recommendation with hex_issue_patch.',
      inputSchema: {
        source: z.enum(ISSUE_SOURCES as unknown as [IssueSource, ...IssueSource[]]),
        title: z.string(),
        severity: z.enum(['Critical', 'High', 'Medium', 'Low', 'Info']).optional(),
        source_ref: z.string().optional(),
        files: z.array(z.string()).optional(),
      },
    },
    guard(
      (a: {
        source: IssueSource;
        title: string;
        severity?: Severity;
        source_ref?: string;
        files?: string[];
      }) => ({
        id: createIssue(outDir(), {
          source: a.source,
          title: a.title,
          severity: a.severity,
          source_ref: a.source_ref ?? null,
          files: a.files,
        }),
      }),
    ),
  );
  server.registerTool(
    'hex_issue_move',
    {
      title: 'Move card',
      description:
        'Move a card between columns (potential | verified | rejected | duplicate). Synced cards are read-only.',
      inputSchema: {
        id: z.string(),
        to: z.enum(Object.keys(COLUMN_TO_STATUS) as [string, ...string[]]),
        duplicate_of: z.string().optional(),
      },
    },
    guard(
      ({ id, to, duplicate_of }: { id: string; to: string; duplicate_of?: string }) =>
        moveIssue(outDir(), id, to as BoardColumn, duplicate_of) as unknown as Json,
    ),
  );
  server.registerTool(
    'hex_issue_patch',
    {
      title: 'Edit card',
      description:
        'Edit card fields (title, severity, description, recommendation, resolution, update_from_client, notes, files).',
      inputSchema: {
        id: z.string(),
        title: z.string().optional(),
        severity: z.enum(['Critical', 'High', 'Medium', 'Low', 'Info']).optional(),
        description: z.string().optional(),
        recommendation: z.string().optional(),
        resolution: z.string().optional(),
        update_from_client: z.string().optional(),
        notes: z.string().optional(),
        files: z.array(z.string()).optional(),
      },
    },
    guard(({ id, ...fields }: { id: string } & Record<string, unknown>) => {
      const updates = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));
      return patchIssue(outDir(), id, updates) as unknown as Json;
    }),
  );
  server.registerTool(
    'hex_issue_validation',
    {
      title: 'Record validation',
      description:
        'Record a verdict, memo and PoC result. With auto_move (agents only) a conclusive verdict moves the card: reproduced + passing PoC + reality gate → Verified; refuted by 2 independent refuters → Rejected.',
      inputSchema: {
        id: z.string(),
        verdict: z.enum(['reproduced', 'refuted', 'uncertain', 'valid_no_poc']),
        by: z.enum(['auditor', 'agent']),
        memo: z.string().optional(),
        poc_file: z.string().optional(),
        poc_status: z.enum(['passing', 'failing', 'not_started']).optional(),
        refuters: z.number().int().optional(),
        reality_gate: z.boolean().optional(),
        auto_move: z.boolean().optional(),
      },
    },
    guard(
      (a: {
        id: string;
        verdict: 'reproduced' | 'refuted' | 'uncertain' | 'valid_no_poc';
        by: 'auditor' | 'agent';
        memo?: string;
        poc_file?: string;
        poc_status?: 'passing' | 'failing' | 'not_started';
        refuters?: number;
        reality_gate?: boolean;
        auto_move?: boolean;
      }) => {
        const r = recordValidation(
          outDir(),
          a.id,
          {
            verdict: a.verdict,
            validated_by: a.by,
            memo: a.memo,
            poc_file: a.poc_file,
            poc_status: a.poc_status,
            refuters: a.refuters,
            reality_gate: a.reality_gate,
          },
          { autoMove: a.auto_move },
        );
        return { id: a.id, moved_to: r.movedTo };
      },
    ),
  );
  server.registerTool(
    'hex_issue_dedup',
    {
      title: 'Duplicate candidates',
      description:
        'Cards that may duplicate this one (exact-function overlap first), plus the match rules and triage rules.',
      inputSchema: { id: z.string() },
    },
    guard(({ id }: { id: string }) => {
      const dir = outDir();
      return { ...dedupCandidates(dir, id), triage_rules: readRules(dir) } as unknown as Json;
    }),
  );
  server.registerTool(
    'hex_issue_mark_duplicate',
    {
      title: 'Mark duplicate',
      description: 'Move a card to Duplicate of a canonical card and record the match signals.',
      inputSchema: {
        id: z.string(),
        of: z.string(),
        same_contract: z.boolean(),
        same_function: z.boolean(),
        root_cause: z.enum(['same', 'overlapping', 'different']),
        attack_vector: z.enum(['same', 'overlapping', 'different']),
        reasoning: z.string(),
        confidence: z.enum(['high', 'medium', 'low']).default('high'),
      },
    },
    guard(
      (a: {
        id: string;
        of: string;
        same_contract: boolean;
        same_function: boolean;
        root_cause: 'same' | 'overlapping' | 'different';
        attack_vector: 'same' | 'overlapping' | 'different';
        reasoning: string;
        confidence: 'high' | 'medium' | 'low';
      }) => {
        markDuplicate(outDir(), a.id, a.of, {
          signals: {
            contract: a.same_contract,
            function: a.same_function,
            root_cause: a.root_cause,
            attack_vector: a.attack_vector,
          },
          reasoning: a.reasoning,
          confidence: a.confidence,
        });
        return { id: a.id, duplicate_of: a.of };
      },
    ),
  );

  // ── Review map ────────────────────────────────────────────────────
  server.registerTool(
    'hex_review_mark',
    {
      title: 'Mark review state',
      description:
        'Set functions (or every function of a contract) to unread / read / questioned / cleared.',
      inputSchema: {
        refs: z.array(z.string()),
        state: z.enum(REVIEW_STATES as unknown as [ReviewState, ...ReviewState[]]),
        note: z.string().optional(),
        by: z.enum(['auditor', 'diane', 'dashboard', 'agent']).default('auditor'),
      },
    },
    guard(
      ({
        refs,
        state,
        note,
        by,
      }: {
        refs: string[];
        state: ReviewState;
        note?: string;
        by: 'auditor' | 'diane' | 'dashboard' | 'agent';
      }) => {
        const dir = outDir();
        const facts = loadFacts(dir);
        if (!facts) throw new Error('No .hex/facts.json yet. Run `hex facts`.');
        const ids = new Set<string>();
        const missing: string[] = [];
        for (const ref of refs) {
          const byContract = facts.functions.filter((f) => f.contract === ref && f.in_scope);
          const hits = byContract.length
            ? byContract
            : resolveFunctions(facts, ref).filter((f) => f.in_scope);
          if (!hits.length) missing.push(ref);
          for (const f of hits) ids.add(f.id);
        }
        if (missing.length) throw new Error(`Unknown function(s): ${missing.join(', ')}`);
        markFunctions(dir, [...ids], state, by, note);
        return { marked: [...ids], state };
      },
    ),
  );
  server.registerTool(
    'hex_review_status',
    {
      title: 'Review progress',
      description: 'Cleared nSLOC, per-state counts and the top blind spots.',
      inputSchema: { blind_spots: z.number().int().optional() },
    },
    guard(({ blind_spots }: { blind_spots?: number }) => {
      const s = reviewSummary(outDir(), { blindSpots: blind_spots ?? 10 });
      return {
        pct: s.pct,
        cleared_nsloc: s.cleared_nsloc,
        total_nsloc: s.total_nsloc,
        counts: s.counts,
        blind_spots: s.blind_spots,
      } as unknown as Json;
    }),
  );

  // ── Notes + rules ─────────────────────────────────────────────────
  server.registerTool(
    'hex_note_show',
    {
      title: 'Contract note',
      description: "A contract's structured note: description, questions, leads.",
      inputSchema: { contract: z.string() },
    },
    guard(({ contract }: { contract: string }) => {
      const dir = outDir();
      return readContractNote(dir, resolveNoteTarget(dir, contract)) as unknown as Json;
    }),
  );
  server.registerTool(
    'hex_code_comments',
    {
      title: 'Code comments',
      description:
        "The auditor's comments pinned to lines of source in the dashboard's code viewer, at the lines their code sits on now (stale = the code changed). Omit file for all files.",
      inputSchema: { file: z.string().optional() },
    },
    guard(({ file }: { file?: string }) => {
      const dir = outDir();
      const files = file ? [file] : [...new Set(readComments(dir).map((c) => c.file))].sort();
      return files.flatMap((f) => commentsForFile(dir, f)) as unknown as Json;
    }),
  );
  server.registerTool(
    'hex_note_lead',
    {
      title: 'Add lead',
      description: 'Add an open lead to a contract note (idempotent on source + source_ref).',
      inputSchema: {
        contract: z.string(),
        text: z.string(),
        source: z.string().optional(),
        source_ref: z.string().optional(),
      },
    },
    guard(
      ({
        contract,
        text,
        source,
        source_ref,
      }: {
        contract: string;
        text: string;
        source?: string;
        source_ref?: string;
      }) => {
        const dir = outDir();
        const { lead, created } = addLeadIdempotent(dir, resolveNoteTarget(dir, contract), text, {
          source,
          source_ref,
        });
        return { lead, created } as unknown as Json;
      },
    ),
  );
  server.registerTool(
    'hex_rules_list',
    {
      title: 'Triage rules',
      description:
        "The auditor's standing decisions (out of scope, trusted roles, by design, known issues).",
      inputSchema: {},
    },
    guard(() => readRules(outDir()) as unknown as Json),
  );
  server.registerTool(
    'hex_rules_add',
    {
      title: 'Add triage rule',
      description:
        'Record a standing decision so AI runs stop raising it. Ask the auditor before adding one.',
      inputSchema: {
        kind: z.enum(['out_of_scope', 'trusted_role', 'by_design', 'known_issue']),
        text: z.string(),
        scope: z.array(z.string()).optional(),
        created_from: z.string().optional(),
      },
    },
    guard(
      (a: {
        kind: 'out_of_scope' | 'trusted_role' | 'by_design' | 'known_issue';
        text: string;
        scope?: string[];
        created_from?: string;
      }) => addRule(outDir(), a) as unknown as Json,
    ),
  );

  return server;
}
