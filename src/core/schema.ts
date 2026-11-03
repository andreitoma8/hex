import { z } from 'zod';

// ─── Shared Sub-schemas ─────────────────────────────────────────────

export const EvidenceSchema = z.object({
  file: z.string(),
  line_start: z.number().int(),
  line_end: z.number().int(),
  snippet: z.string().optional(),
});

export const ConfidenceSchema = z.enum(['high', 'medium', 'low']);

export const SeveritySchema = z.enum(['Critical', 'High', 'Medium', 'Low', 'Info']);

export const DerivedFromSchema = z.enum([
  'solc-ast',
  'slither',
  'forge',
  'regex',
  'heuristic',
  'compiler-layout',
  'manual',
]);

// ─── Config ─────────────────────────────────────────────────────────

export const ConfigSchema = z.object({
  version: z.string().default('1.0'),
  project: z.object({
    name: z.string(),
    project_dir: z.string(),
    commit: z.string(),
    chain: z.string().default('ethereum'),
    solidity_version: z.string(),
    docs_url: z.string().optional(),
    scope: z.array(z.string()),
    exclude: z.array(z.string()).default([]),
    /** Raw --scope globs as typed (lets deleted/renamed files be tested for scope). */
    scope_globs: z.array(z.string()).optional(),
    /** `full` = audit the whole scope at `commit`; `diff` = audit `diff.base_commit` → `commit`. */
    mode: z.enum(['full', 'diff']).default('full'),
    diff: z
      .object({
        base_commit: z.string(),
        previous_audit: z
          .object({
            kind: z.enum(['hex', 'report']),
            path: z.string(),
          })
          .optional(),
      })
      .optional(),
  }),
  settings: z.object({
    output_dir: z.string().default('.hex'),
    finding_template: z.string().default('default'),
    ai: z
      .object({
        auditagent_scan_id: z.string().optional(),
      })
      .optional(),
    github: z
      .object({
        repo: z.string(),
        default_labels: z.array(z.string()).default(['hex', 'audit']),
        severity_label_prefix: z.string().default('severity:'),
        publish_status: z.array(z.enum(['verified', 'pending_validation'])).default(['verified']),
      })
      .optional(),
    report: z
      .object({
        repository_url: z.string().optional(),
        initial_commit: z.string().optional(),
        final_commit: z.string().optional(),
        initial_report_date: z.string().optional(),
        final_report_date: z.string().optional(),
        audit_type: z.string().default('Security Review'),
        doc_assessment: z.enum(['High', 'Medium', 'Low']).optional(),
        test_assessment: z.enum(['High', 'Medium', 'Low']).optional(),
        kickoff_call: z.string().optional(),
        client_availability: z.string().optional(),
      })
      .optional(),
  }),
});

// ─── Stats ──────────────────────────────────────────────────────────

export const CoveragePerContractSchema = z.object({
  contract: z.string(),
  file: z.string(),
  line_pct: z.number(),
  branch_pct: z.number(),
  uncovered_lines: z.array(z.number().int()),
});

export const TestCoverageSchema = z.object({
  status: z.enum(['available', 'failed', 'skipped']),
  failure_reason: z.string().nullable(),
  overall_line_pct: z.number().nullable(),
  overall_branch_pct: z.number().nullable(),
  per_contract: z.array(CoveragePerContractSchema),
});

export const PerContractStatsSchema = z.object({
  file: z.string(),
  contract: z.string(),
  type: z.enum(['contract', 'interface', 'library', 'abstract']),
  nsloc: z.number().int(),
  functions: z.number().int(),
  external_functions: z.number().int(),
  public_functions: z.number().int(),
  internal_functions: z.number().int(),
  private_functions: z.number().int().default(0),
  modifiers: z.number().int(),
  events: z.number().int(),
  errors: z.number().int(),
  assembly_lines: z.number().int(),
  inherits: z.array(z.string()),
  nsloc_with_deps: z.number().int().optional(),
  total_functions: z.number().int().optional(),
  total_external_functions: z.number().int().optional(),
  total_public_functions: z.number().int().optional(),
  total_modifiers: z.number().int().optional(),
  total_events: z.number().int().optional(),
  total_errors: z.number().int().optional(),
});

export const DependencyEntrySchema = z.object({
  package: z.string(),
  version: z.string().nullable(),
  imports: z.number().int(),
});

export const StatsSchema = z.object({
  generated_at: z.string(),
  totals: z.object({
    files: z.number().int(),
    contracts: z.number().int(),
    interfaces: z.number().int(),
    libraries: z.number().int(),
    abstract_contracts: z.number().int(),
    total_lines: z.number().int(),
    nsloc: z.number().int(),
    comment_lines: z.number().int(),
    blank_lines: z.number().int(),
    assembly_lines: z.number().int(),
    nsloc_with_deps: z.number().int().optional(),
  }),
  solidity_version: z.string(),
  erc_eip_usage: z.array(z.string()),
  dependencies: z.array(DependencyEntrySchema),
  test_coverage: TestCoverageSchema.nullable(),
  per_contract: z.array(PerContractStatsSchema),
});

// ─── Findings ───────────────────────────────────────────────────────

export const FindingLocationSchema = z.object({
  file: z.string(),
  snippet: z.string().optional(),
});

export const GithubCommentSchema = z.object({
  id: z.number().int().optional(),
  author: z.string(),
  body: z.string(),
  created_at: z.string(),
  url: z.string().optional(),
});

export const GithubLinkSchema = z.object({
  issue_number: z.number().int(),
  issue_url: z.string(),
  state: z.enum(['open', 'closed']).default('open'),
  last_synced_at: z.string(),
  sync_status: z.enum(['in_sync', 'local_ahead', 'remote_ahead', 'conflict']).default('in_sync'),
  comments: z.array(GithubCommentSchema).default([]),
});

export const ResolutionSchema = z.enum([
  'Fixed',
  'Mitigated',
  'Acknowledged',
  'Not Fixed',
  'Unresolved',
]);

export const FindingSchema = z.object({
  id: z.string(),
  title: z.string(),
  severity: SeveritySchema,
  category: z.string(),
  description: z.string(),
  root_cause: z.object({
    locations: z.array(FindingLocationSchema),
  }),
  poc: z.object({
    status: z.enum(['passing', 'failing', 'not_started']),
    file: z.string().nullable(),
    validation_memo: z.string().nullable(),
  }),
  recommendation: z.string(),
  references: z.object({
    external_links: z.array(z.string()),
  }),
  created_at: z.string(),
  github: GithubLinkSchema.optional(),
  update_from_client: z.string().optional(),
  resolution: ResolutionSchema.optional(),
  // Maps a uniform H-NNN id back to its origin record (conformance item id,
  // auditagent finding id, or GitHub issue number) for materialization/dedup.
  source_ref: z.string().nullable().optional(),
  validation: z.record(z.string(), z.unknown()).optional(),
});

export const FindingsSchema = z.object({
  findings: z.array(FindingSchema),
});

// ─── Tracking ───────────────────────────────────────────────────────

export const TrackingSourceSchema = z.enum([
  'manual',
  'auditagent',
  'conformance',
  'github',
  'ai-audit',
  'prior-audit',
  'invariant',
]);

export const TrackingEntrySchema = z.object({
  id: z.string(),
  title: z.string(),
  severity: SeveritySchema,
  source: TrackingSourceSchema,
  status: z.enum([
    'verified',
    'pending_validation',
    'rejected',
    'duplicate',
    'unverified',
    'synced',
  ]),
  poc_status: z.enum(['passing', 'failing', 'not_started']),
  poc_file: z.string().nullable(),
  duplicates: z.array(z.string()),
  duplicate_of: z.string().nullable().optional(),
  source_ref: z.string().nullable().optional(),
  notes: z.string(),
});

export const TrackingSchema = z.object({
  findings: z.array(TrackingEntrySchema),
});

// ─── Comparison ─────────────────────────────────────────────────────

export const MatchAgreementSchema = z.enum(['same', 'overlapping', 'different']);

export const MatchSignalsSchema = z.object({
  contract: z.boolean(),
  function: z.boolean(),
  root_cause: MatchAgreementSchema,
  attack_vector: MatchAgreementSchema,
});

export const ComparisonDuplicateSchema = z.object({
  ai_finding: z.string(),
  matches: z.string(),
  confidence: ConfidenceSchema,
  match_signals: MatchSignalsSchema.optional(),
  reasoning: z.string().optional(),
});

export const ComparisonNovelSchema = z.object({
  id: z.string(),
  source: z.string(),
  original_id: z.string(),
  title: z.string(),
  validity: z.enum(['likely_valid', 'needs_review', 'likely_false_positive']),
  reasoning: z.string(),
  priority: z.number().int(),
});

export const ComparisonRejectedSchema = z.object({
  id: z.string(),
  reason: z.string(),
});

export const ComparisonSchema = z.object({
  duplicates: z.array(ComparisonDuplicateSchema),
  novel: z.array(ComparisonNovelSchema),
  rejected: z.array(ComparisonRejectedSchema),
});

// ─── Spec Conformance ───────────────────────────────────────────────

export const SpecItemSchema = z.object({
  id: z.string(),
  source: z.enum(['external_docs', 'natspec', 'interface', 'erc_eip']),
  spec_text: z.string(),
  spec_location: z.record(z.string(), z.unknown()),
  status: z.enum(['CONFORMS', 'DEVIATES', 'PARTIAL', 'UNVERIFIABLE', 'UNDOCUMENTED']),
  finding: z.string(),
  code_location: EvidenceSchema.optional(),
  severity_hint: z.enum(['Critical', 'High', 'Medium', 'Low', 'Info']).optional(),
  confidence: ConfidenceSchema,
});

export const SpecConformanceSchema = z.object({
  checked_at: z.string(),
  sources_checked: z.object({
    external_docs: z.boolean(),
    natspec: z.boolean(),
    interfaces: z.boolean(),
    erc_eip: z.array(z.string()),
  }),
  summary: z.object({
    total_checks: z.number().int(),
    conforms: z.number().int(),
    deviates: z.number().int(),
    partial: z.number().int(),
    unverifiable: z.number().int(),
    undocumented: z.number().int(),
  }),
  items: z.array(SpecItemSchema),
});

// ─── AI Result Findings ────────────────────────────────────────────

export const AiResultFindingSchema = z.object({
  id: z.string(),
  tool: z.string(),
  title: z.string(),
  severity: SeveritySchema,
  description: z.string(),
  affected_code: z.array(
    z.object({
      file: z.string(),
      snippet: z.string().optional(),
    }),
  ),
  confidence: ConfidenceSchema.optional(),
  category: z.string().optional(),
  raw_category: z.string().optional(),
  ai_consensus: z.number().int().optional(),
  recommendation: z.string().optional(),
  /** /ai-audit only: the scan's `Contract|function|bug-class` key and run stamp. */
  scan_key: z.string().optional(),
  scan_stamp: z.string().optional(),
});

export const AiResultFileSchema = z.object({
  tool: z.string(),
  ran_at: z.string(),
  duration_seconds: z.number().optional(),
  total_findings: z.number(),
  findings: z.array(AiResultFindingSchema),
});

// ─── Facts (exact, from the compiler AST) ───────────────────────────

export const FactsCallKindSchema = z.enum([
  'internal', // `foo()` / `Base.foo()` resolved to a declaration in the hierarchy or a free function
  'super', // `super.foo()`
  'this', // `this.foo()` (external self-call)
  'library', // `Lib.foo()` or `x.foo()` via `using Lib for`
  'external', // `IFoo(addr).foo()` / `token.transfer()` on a contract-typed value
  'virtual', // runtime dispatch to an override of the referenced function
  'modifier', // the function applies this modifier
  'constructor', // base-constructor invocation
]);

export const FactsFunctionSchema = z.object({
  /** `Contract.name(type1,type2)`; modifiers use the same shape. */
  id: z.string(),
  contract: z.string(),
  name: z.string(),
  signature: z.string(),
  kind: z.enum(['function', 'constructor', 'fallback', 'receive', 'modifier']),
  visibility: z.string(),
  mutability: z.string(),
  file: z.string(),
  line_start: z.number().int(),
  line_end: z.number().int(),
  nsloc: z.number().int(),
  virtual: z.boolean().default(false),
  /** Base functions this one overrides (ids). */
  overrides: z.array(z.string()).default([]),
  modifiers: z.array(z.string()).default([]),
  /** `at`: the caller's lines that make the call (absent in facts written before 0.8.0). */
  calls: z
    .array(
      z.object({
        to: z.string(),
        kind: FactsCallKindSchema,
        at: z.array(z.number().int()).optional(),
      }),
    )
    .default([]),
  called_by: z
    .array(
      z.object({
        from: z.string(),
        kind: FactsCallKindSchema,
        at: z.array(z.number().int()).optional(),
      }),
    )
    .default([]),
  external_calls: z
    .array(
      z.object({
        /** Contract/interface type for typed calls; `address` for low-level calls. */
        target_type: z.string(),
        member: z.string(),
        kind: z.enum(['typed', 'low_level', 'create', 'transfer']),
        line: z.number().int(),
      }),
    )
    .default([]),
  /** State variable ids (`Contract.var`) read / written, including via storage pointers. */
  reads: z.array(z.string()).default([]),
  writes: z.array(z.string()).default([]),
  emits: z.array(z.string()).default([]),
  /** external/public (or fallback/receive) on a contract or abstract contract. */
  is_entry_point: z.boolean(),
  in_scope: z.boolean(),
});

export const FactsContractSchema = z.object({
  name: z.string(),
  kind: z.enum(['contract', 'abstract', 'interface', 'library']),
  file: z.string(),
  line_start: z.number().int(),
  line_end: z.number().int(),
  /** Direct bases, in declaration order. */
  bases: z.array(z.string()),
  /** C3 linearization from the compiler, most-derived first (includes itself). */
  linearization: z.array(z.string()),
  in_scope: z.boolean(),
});

export const FactsStateVarSchema = z.object({
  id: z.string(),
  contract: z.string(),
  name: z.string(),
  type: z.string(),
  mutability: z.enum(['mutable', 'constant', 'immutable']),
  visibility: z.string(),
  file: z.string(),
  line: z.number().int(),
});

export const FactsStorageSlotSchema = z.object({
  label: z.string(),
  slot: z.string(),
  offset: z.number().int(),
  type: z.string(),
  bytes: z.number().int().optional(),
  /** Contract that declares the variable (may be a base). */
  declared_in: z.string(),
});

export const FactsSchema = z.object({
  generated_at: z.string(),
  commit: z.string().optional(),
  /** `solc-ast` = exact compiler data; `parser-fallback` = the build failed and a parser approximated it. */
  source: z.enum(['solc-ast', 'parser-fallback']),
  compiler: z.object({ version: z.string(), toolchain: z.enum(['foundry', 'hardhat']) }).optional(),
  /** `compiler` = solc storageLayout; `declaration-order` = inferred from declarations. */
  layout_source: z.enum(['compiler', 'declaration-order']),
  warnings: z.array(z.string()).default([]),
  contracts: z.array(FactsContractSchema),
  functions: z.array(FactsFunctionSchema),
  state_vars: z.array(FactsStateVarSchema),
  storage_layouts: z.record(z.string(), z.array(FactsStorageSlotSchema)),
  /** Deployable in-scope contract → the external/public functions it exposes (most-derived ids). */
  entry_points: z.record(z.string(), z.array(z.string())),
});

// ─── Protocol model (agents; claims carry evidence + verification) ──

export const EvidenceRefSchema = z.object({
  file: z.string(),
  line_start: z.number().int(),
  line_end: z.number().int().optional(),
});

/** Every model claim: evidence in the code, and whether a skeptic verified it. */
const claim = {
  claim_id: z.string(),
  evidence: z.array(EvidenceRefSchema).default([]),
  status: z.enum(['unverified', 'verified', 'contested']).default('unverified'),
  verified_by: z.string().optional(),
  note: z.string().optional(),
};

export const ModelActorSchema = z.object({
  ...claim,
  id: z.string(),
  name: z.string(),
  kind: z.enum(['user', 'admin', 'keeper', 'guardian', 'external_protocol', 'other']),
  trust: z.enum(['trusted', 'semi_trusted', 'untrusted']),
  /** Function ids (`Contract.sig`) this actor can call that others cannot. */
  powers: z.array(z.string()).default([]),
  description: z.string().default(''),
});

export const ModelAssetSchema = z.object({
  ...claim,
  id: z.string(),
  name: z.string(),
  kind: z.enum(['erc20', 'native', 'nft', 'shares', 'debt', 'other']),
  token: z.string().optional(),
  held_by: z.array(z.string()).default([]),
  moved_by: z.array(z.string()).default([]),
  description: z.string().default(''),
});

export const ModelPrivilegeSchema = z.object({
  ...claim,
  actor: z.string(),
  function: z.string(),
  effect: z.string(),
  worst_case: z.string(),
  timelock: z.string().optional(),
});

export const ModelTrustAssumptionSchema = z.object({ ...claim, text: z.string() });

export const ModelDependencySchema = z.object({
  ...claim,
  id: z.string(),
  name: z.string(),
  kind: z.enum(['oracle', 'dex', 'bridge', 'lending', 'token', 'other']),
  used_by: z.array(z.string()).default([]),
  failure_modes: z.array(z.string()).default([]),
});

export const ModelStateMachineSchema = z.object({
  ...claim,
  id: z.string(),
  entity: z.string(),
  states: z.array(z.string()),
  transitions: z.array(
    z.object({
      from: z.string(),
      to: z.string(),
      function: z.string(),
      guard: z.string().optional(),
    }),
  ),
});

export const ModelAccountingSchema = z.object({
  ...claim,
  id: z.string(),
  name: z.string(),
  equation: z.string(),
  terms: z.array(
    z.object({
      term: z.string(),
      updated_by: z.array(
        z.object({ function: z.string(), direction: z.enum(['increase', 'decrease', 'set']) }),
      ),
    }),
  ),
});

export const ModelFlowSchema = z.object({
  ...claim,
  id: z.string(),
  name: z.string(),
  entry: z.string(),
  steps: z.array(
    z.object({
      actor: z.string().optional(),
      contract: z.string(),
      function: z.string().optional(),
      kind: z.enum(['call', 'callback', 'oracle', 'transfer', 'state']).default('call'),
      note: z.string().optional(),
    }),
  ),
  risk: z.string().default(''),
});

export const ProtocolModelSchema = z.object({
  generated_at: z.string(),
  /** One paragraph: what the protocol does, for whom. */
  summary: z.string().default(''),
  actors: z.array(ModelActorSchema).default([]),
  assets: z.array(ModelAssetSchema).default([]),
  privileges: z.array(ModelPrivilegeSchema).default([]),
  trust_assumptions: z.array(ModelTrustAssumptionSchema).default([]),
  external_dependencies: z.array(ModelDependencySchema).default([]),
  state_machines: z.array(ModelStateMachineSchema).default([]),
  accounting: z.array(ModelAccountingSchema).default([]),
  risky_flows: z.array(ModelFlowSchema).default([]),
});

export const InvariantSchema = z.object({
  id: z.string(), // INV-NNN
  statement: z.string(),
  kind: z.enum([
    'accounting',
    'access',
    'bound',
    'monotonic',
    'state-machine',
    'liveness',
    'economic',
  ]),
  scope: z
    .object({
      contracts: z.array(z.string()).default([]),
      functions: z.array(z.string()).default([]),
    })
    .default({ contracts: [], functions: [] }),
  evidence: z.array(EvidenceRefSchema).default([]),
  /** Does the code enforce it on-chain (require/assert)? `false` = it only holds if the code is right. */
  on_chain_enforced: z.boolean().default(false),
  status: z.enum(['proposed', 'accepted', 'rejected']).default('proposed'),
  rationale: z.string().optional(),
  /** The init-audit skeptic's check: does the code maintain it on every path? */
  verification: z
    .object({
      status: z.enum(['verified', 'contested']),
      /** For contested: the path that breaks it, or what is imprecise. */
      note: z.string().optional(),
      by: z.string().optional(),
    })
    .optional(),
  test: z
    .object({
      tool: z.enum(['fizz', 'foundry']),
      property_id: z.string().optional(),
      file: z.string().optional(),
      status: z.enum(['not_written', 'passing', 'failing', 'broken']).default('not_written'),
      runs: z.number().int().optional(),
      last_run_at: z.string().optional(),
      repro_file: z.string().optional(),
    })
    .optional(),
  issue_id: z.string().optional(),
});

export const InvariantsFileSchema = z.object({
  updated_at: z.string(),
  invariants: z.array(InvariantSchema),
});

// ─── Review map (progress.json v2) ──────────────────────────────────

export const FunctionReviewStateSchema = z.enum(['unread', 'read', 'questioned', 'cleared']);

export const FunctionReviewSchema = z.object({
  state: FunctionReviewStateSchema,
  by: z.enum(['auditor', 'diane', 'dashboard', 'agent']).default('auditor'),
  updated_at: z.string(),
  note: z.string().optional(),
});

// ─── Triage rules (feedback into AI runs) ───────────────────────────

export const TriageRuleSchema = z.object({
  id: z.string(), // R-NNN
  kind: z.enum(['out_of_scope', 'trusted_role', 'by_design', 'known_issue']),
  text: z.string(),
  /** Contracts / function ids the rule is limited to; empty = whole audit. */
  scope: z.array(z.string()).default([]),
  created_from: z.string().optional(),
  created_at: z.string(),
});

export const TriageRulesFileSchema = z.object({ rules: z.array(TriageRuleSchema) });

// ─── Validation (recorded on cards) ─────────────────────────────────

export const ValidationSchema = z.object({
  verdict: z.enum(['reproduced', 'refuted', 'uncertain', 'valid_no_poc']),
  validated_by: z.enum(['auditor', 'agent']),
  memo: z.string().optional(),
  poc_file: z.string().optional(),
  poc_status: z.enum(['passing', 'failing', 'not_started']).optional(),
  refuters: z.number().int().optional(),
  /** Set when an agent moved the card; cleared if the auditor reverts it. */
  auto_moved_to: z.enum(['verified', 'rejected']).optional(),
  at: z.string(),
});

// ─── Diagram specs (model → Excalidraw) ─────────────────────────────

const DiagramNodeRef = z.string().optional(); // facts function id / model id the node stands for

const DiagramBase = {
  name: z.string().regex(/^[a-z0-9][a-z0-9-]*$/, 'kebab-case file name'),
  title: z.string(),
  /** One sentence: what this picture tells an auditor that the code does not show at a glance. */
  takeaway: z.string().min(10),
  annotations: z
    .array(
      z.object({
        target: z.string(),
        text: z.string(),
        kind: z.enum(['risk', 'note']).default('risk'),
      }),
    )
    .default([]),
};

export const CustodyDiagramSchema = z.object({
  ...DiagramBase,
  type: z.literal('custody'),
  actors: z.array(z.object({ id: z.string(), label: z.string(), ref: DiagramNodeRef })),
  holdings: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      assets: z.array(z.string()).default([]),
      ref: DiagramNodeRef,
    }),
  ),
  moves: z.array(
    z.object({
      from: z.string(),
      to: z.string(),
      via: z.string(),
      ref: DiagramNodeRef,
      asset: z.string().optional(),
    }),
  ),
});

export const PrivilegeDiagramSchema = z.object({
  ...DiagramBase,
  type: z.literal('privilege'),
  actors: z.array(z.object({ id: z.string(), label: z.string(), ref: DiagramNodeRef })),
  powers: z.array(
    z.object({ id: z.string(), label: z.string(), ref: DiagramNodeRef, worst_case: z.string() }),
  ),
  grants: z.array(z.object({ actor: z.string(), power: z.string() })),
});

export const StateMachineDiagramSchema = z.object({
  ...DiagramBase,
  type: z.literal('state-machine'),
  entity: z.string(),
  states: z.array(
    z.object({ id: z.string(), label: z.string(), terminal: z.boolean().default(false) }),
  ),
  transitions: z.array(
    z.object({
      from: z.string(),
      to: z.string(),
      label: z.string(),
      ref: DiagramNodeRef,
      guard: z.string().optional(),
    }),
  ),
});

export const AccountingDiagramSchema = z.object({
  ...DiagramBase,
  type: z.literal('accounting'),
  equation: z.string(),
  terms: z.array(z.object({ id: z.string(), label: z.string() })),
  updates: z.array(
    z.object({
      term: z.string(),
      function: z.string(),
      ref: DiagramNodeRef,
      direction: z.enum(['increase', 'decrease', 'set']),
    }),
  ),
});

export const SequenceDiagramSchema = z.object({
  ...DiagramBase,
  type: z.literal('sequence'),
  participants: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      kind: z.enum(['actor', 'contract', 'external']).default('contract'),
      ref: DiagramNodeRef,
    }),
  ),
  messages: z.array(
    z.object({
      from: z.string(),
      to: z.string(),
      label: z.string(),
      kind: z.enum(['call', 'callback', 'oracle', 'transfer', 'state']).default('call'),
      ref: DiagramNodeRef,
      note: z.string().optional(),
    }),
  ),
});

export const DiagramSpecSchema = z.discriminatedUnion('type', [
  CustodyDiagramSchema,
  PrivilegeDiagramSchema,
  StateMachineDiagramSchema,
  AccountingDiagramSchema,
  SequenceDiagramSchema,
]);

export const DiagramIndexEntrySchema = z.object({
  name: z.string(),
  type: z.string(),
  title: z.string(),
  takeaway: z.string(),
  spec_hash: z.string(),
  built_at: z.string(),
  /** The auditor edited the scene in the dashboard; rebuilds never overwrite it. */
  edited: z.boolean().default(false),
  /** A rebuild produced `<name>.regenerated.excalidraw` because the edited scene is out of date. */
  stale: z.boolean().default(false),
  in_report: z.boolean().default(false),
});

// ─── Fix review (.hex/fix-review/<to-sha>.json) ─────────────────────

export const FixReviewCardSchema = z.object({
  id: z.string(),
  title: z.string(),
  severity: SeveritySchema,
  github_issue: z.number().int().optional(),
  status: z.enum(['fixed', 'partially_fixed', 'not_fixed', 'unaddressed', 'unknown']),
  /** One or two sentences: why this status (PoC result, code path removed, ...). */
  evidence: z.string().default(''),
  poc: z
    .object({
      file: z.string().optional(),
      /** PoC result at the audited commit (expected: passing = bug present). */
      before: z.enum(['passing', 'failing', 'error', 'missing']).optional(),
      /** PoC result at the fix commit (expected: failing = bug gone). */
      after: z.enum(['passing', 'failing', 'error', 'missing']).optional(),
    })
    .default({}),
  changed_functions: z.array(z.string()).default([]),
  commits: z.array(z.string()).default([]),
  proposed: z
    .object({
      resolution: z
        .enum(['Fixed', 'Mitigated', 'Acknowledged', 'Not Fixed', 'Unresolved'])
        .optional(),
      update_from_client: z.string().optional(),
    })
    .default({}),
  /** Set once the proposal was applied to GitHub (`gh issue edit`). */
  applied_at: z.string().optional(),
});

export const FixReviewSchema = z.object({
  generated_at: z.string(),
  from_commit: z.string(),
  to_commit: z.string(),
  cards: z.array(FixReviewCardSchema),
  /** Fix-commit code changes not tied to any card: they need a review of their own. */
  unmapped_changes: z.array(
    z.object({
      contract: z.string(),
      entity: z.string(),
      kind: z.string(),
      change: z.string(),
      file: z.string(),
      impacted_entry_points: z.array(z.string()).default([]),
      reviewed: z.boolean().default(false),
      note: z.string().optional(),
    }),
  ),
  summary: z.object({
    fixed: z.number().int(),
    partially_fixed: z.number().int(),
    not_fixed: z.number().int(),
    unaddressed: z.number().int(),
    unknown: z.number().int(),
    unmapped: z.number().int(),
  }),
});

// ─── Differential audit ─────────────────────────────────────────────

export const DiffFileStatusSchema = z.enum(['added', 'modified', 'deleted', 'renamed']);

export const DiffFileSchema = z.object({
  path: z.string(),
  status: DiffFileStatusSchema,
  old_path: z.string().optional(),
  additions: z.number().int(),
  deletions: z.number().int(),
});

export const DiffEntityKindSchema = z.enum([
  'contract',
  'function',
  'modifier',
  'state_variable',
  'event',
  'error',
  'struct',
  'inheritance',
]);

export const DiffChangeKindSchema = z.enum(['added', 'removed', 'modified', 'comments_only']);

export const DiffChangeSchema = z.object({
  contract: z.string(),
  /** Entity name; functions carry their signature, e.g. `deposit(uint256,address)`. */
  entity: z.string(),
  kind: DiffEntityKindSchema,
  file: z.string(),
  change: DiffChangeKindSchema,
  line_start: z.number().int().optional(),
  line_end: z.number().int().optional(),
  visibility: z.string().optional(),
});

export const StorageLayoutChangeSchema = z.object({
  contract: z.string(),
  file: z.string(),
  kind: z.enum([
    'variable_added',
    'variable_removed',
    'variable_reordered',
    'variable_type_changed',
    'inheritance_changed',
    'struct_changed',
  ]),
  detail: z.string(),
});

export const ImpactReasonSchema = z.object({
  kind: z.enum(['changed', 'calls', 'modifier', 'reads_state', 'override', 'inherits']),
  /** The changed or impacted entity this hop goes through, e.g. `Vault._accrue()`. */
  via: z.string(),
});

export const ImpactedFunctionSchema = z.object({
  contract: z.string(),
  function: z.string(),
  file: z.string(),
  visibility: z.string(),
  is_entry_point: z.boolean(),
  /** 0 = the function itself changed; n = n hops from the nearest change. */
  depth: z.number().int(),
  reasons: z.array(ImpactReasonSchema),
  confidence: ConfidenceSchema,
  derived_from: DerivedFromSchema,
  line_start: z.number().int().optional(),
});

export const DiffSchema = z.object({
  generated_at: z.string(),
  base_commit: z.string(),
  head_commit: z.string(),
  /** `compiler` = impact from exact compiler facts; `parser` = name-resolved fallback. */
  analysis: z.enum(['compiler', 'parser']).default('parser'),
  /** `compiler` = slot-exact layout diff of both commits; else inferred from declaration order. */
  layout_analysis: z.enum(['compiler', 'declaration-order']).default('declaration-order'),
  /** Set when the working tree HEAD is not head_commit (analyses read the working tree). */
  warnings: z.array(z.string()).default([]),
  files: z.array(DiffFileSchema),
  changes: z.array(DiffChangeSchema),
  storage_layout_changes: z.array(StorageLayoutChangeSchema),
  impacted: z.array(ImpactedFunctionSchema),
  summary: z.object({
    files_changed: z.number().int(),
    additions: z.number().int(),
    deletions: z.number().int(),
    functions_added: z.number().int(),
    functions_modified: z.number().int(),
    functions_removed: z.number().int(),
    impacted_functions: z.number().int(),
    impacted_entry_points: z.number().int(),
    storage_layout_changes: z.number().int(),
  }),
});

// ─── Prior audit (differential mode) ────────────────────────────────

export const PriorFindingSchema = z.object({
  id: z.string(),
  title: z.string(),
  severity: SeveritySchema,
  /** The prior report's resolution (Fixed / Acknowledged / ...), when known. */
  resolution: z.string().optional(),
  status: z.string().optional(),
  description: z.string().default(''),
  recommendation: z.string().optional(),
  locations: z.array(
    z.object({
      file: z.string(),
      function: z.string().optional(),
      snippet: z.string().optional(),
    }),
  ),
  source: z.enum(['hex', 'report']),
});

export const PriorFindingsSchema = z.object({
  imported_at: z.string(),
  base_commit: z.string().optional(),
  source_path: z.string(),
  findings: z.array(PriorFindingSchema),
});

export const PriorReviewItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  severity: SeveritySchema,
  status: z.enum([
    'fixed_unchanged',
    'fix_touched_ok',
    'regressed',
    'acknowledged_still_present',
    'code_removed',
  ]),
  reasoning: z.string(),
  /** Board card id when a regression was materialized. */
  issue_id: z.string().optional(),
});

export const PriorReviewSchema = z.object({
  reviewed_at: z.string(),
  items: z.array(PriorReviewItemSchema),
});

// ─── AI Run Status ─────────────────────────────────────────────────

export const AiToolStatusSchema = z.object({
  status: z.enum(['completed', 'running', 'failed', 'not_started', 'pending_scan']),
  ran_at: z.string().optional(),
  started_at: z.string().optional(),
  pid: z.number().optional(),
  findings_count: z.number().optional(),
  error: z.string().optional(),
  scan_id: z.string().optional(),
});

export const AiStatusSchema = z.object({
  tools: z.record(z.string(), AiToolStatusSchema),
});

// ─── GitHub Sync Status ────────────────────────────────────────────

export const GithubSyncStatusSchema = z.object({
  repo: z.string(),
  last_synced_at: z.string(),
  pushed: z.number().int().default(0),
  updated: z.number().int().default(0),
  pulled: z.number().int().default(0),
  teammate_findings: z.number().int().default(0),
  duplicates_detected: z.number().int().default(0),
  errors: z.array(z.string()).default([]),
});
