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

export const LikelihoodSchema = z.enum(['High', 'Medium', 'Low']);

export const ImpactSchema = z.enum(['Critical', 'High', 'Medium', 'Low']);

export const SeverityReasoningSchema = z.object({
  likelihood: LikelihoodSchema,
  impact: ImpactSchema,
  justification: z.string(),
});

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
  }),
  settings: z.object({
    output_dir: z.string().default('.hex'),
    ai_model: z.string().default('claude-sonnet-4-20250514'),
    finding_template: z.string().default('default'),
    ai_tools: z.array(z.lazy(() => AiToolSchema)).optional(),
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

// ─── Dependencies Graph ─────────────────────────────────────────────

export const GraphNodeSchema = z.object({
  inherits: z.array(z.string()),
  imports: z.array(z.string()),
  calls: z.array(z.string()),
});

export const ClusterSchema = z.object({
  id: z.string(),
  contracts: z.array(z.string()),
  total_nsloc: z.number().int(),
});

export const DepsSchema = z.object({
  graph: z.record(z.string(), GraphNodeSchema),
  clusters: z.array(ClusterSchema),
  inheritance_trees: z.array(z.array(z.string())),
  topological_order: z.array(z.string()),
});

// ─── Access Control ─────────────────────────────────────────────────

export const AccessFunctionSchema = z.object({
  contract: z.string(),
  function: z.string(),
  visibility: z.enum(['external', 'public', 'internal', 'private']),
  state_mutability: z.enum(['pure', 'view', 'nonpayable', 'payable']).nullable(),
  modifiers: z.array(z.string()),
  evidence: EvidenceSchema,
  inherited_from: z.string().optional(),
  inheritance_depth: z.number().int().optional(),
});

export const RoleFunctionRefSchema = z.object({
  contract: z.string(),
  function: z.string(),
});

export const RoleKindSchema = z.enum([
  'access_control',
  'state_check',
  'guard',
  'unknown',
]);

export const RoleSchema = z.object({
  role: z.string(),
  description: z.string(),
  confidence: ConfidenceSchema,
  derived_from: DerivedFromSchema,
  reasoning: z.string(),
  modifier: z.string().nullable(),
  functions: z.array(RoleFunctionRefSchema),
  warnings: z.array(z.string()),
  kind: RoleKindSchema.default('access_control'),
  is_likely_access_control: z.boolean().default(true),
});

export const AccessControlSchema = z.object({
  functions: z.array(AccessFunctionSchema),
  roles: z.array(RoleSchema),
});

// ─── State Variables ────────────────────────────────────────────────

export const ReadWriteInfoSchema = z.object({
  functions: z.array(z.string()),
  confidence: ConfidenceSchema,
  derived_from: DerivedFromSchema,
  warnings: z.array(z.string()).optional(),
});

export const StateVariableSchema = z.object({
  contract: z.string(),
  name: z.string(),
  type: z.string(),
  visibility: z.enum(['public', 'internal', 'private']),
  mutability: z.enum(['mutable', 'constant', 'immutable']),
  value: z.string().optional(),
  evidence: EvidenceSchema,
  written_by: ReadWriteInfoSchema,
  read_by: ReadWriteInfoSchema,
  has_setter: z.boolean(),
  is_bounded: z.boolean(),
  bound_description: z.string().nullable().optional(),
  is_unused: z.boolean().optional(),
  storage_slot: z.number().int().nullable().optional(),
});

export const StorageCollisionVariableSchema = z.object({
  contract: z.string(),
  name: z.string(),
  type: z.string(),
});

export const StorageCollisionSchema = z.object({
  slot: z.number().int(),
  offset: z.number().int().default(0),
  variables: z.array(StorageCollisionVariableSchema),
  severity: SeveritySchema.default('Critical'),
  description: z.string(),
});

export const StateVarsSchema = z.object({
  variables: z.array(StateVariableSchema),
  storage_layout_source: z.enum(['compiler-artifact']).nullable(),
  storage_collisions: z.array(StorageCollisionSchema).default([]),
});

// ─── External Calls ─────────────────────────────────────────────────

export const ConfidenceValueSchema = z.object({
  value: z.union([z.boolean(), z.string()]),
  confidence: ConfidenceSchema,
  derived_from: DerivedFromSchema,
  reasoning: z.string().optional(),
  warnings: z.array(z.string()).optional(),
  guard_type: z.string().optional(),
});

export const ExternalCallSchema = z.object({
  contract: z.string(),
  function: z.string(),
  evidence: EvidenceSchema,
  target: z.string(),
  method: z.string(),
  return_checked: ConfidenceValueSchema,
  inside_reentrancy_guard: ConfidenceValueSchema,
  call_type: z.string(),
  trust_level: ConfidenceValueSchema,
});

export const ExternalCallsSchema = z.object({
  calls: z.array(ExternalCallSchema),
});

// ─── Findings ───────────────────────────────────────────────────────

export const FindingLocationSchema = z.object({
  file: z.string(),
  snippet: z.string().optional(),
});

export const FindingSchema = z.object({
  id: z.string(),
  title: z.string(),
  severity: SeveritySchema,
  severity_reasoning: SeverityReasoningSchema.optional(),
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
});

export const FindingsSchema = z.object({
  findings: z.array(FindingSchema),
});

// ─── Tracking ───────────────────────────────────────────────────────

export const TrackingEntrySchema = z.object({
  id: z.string(),
  title: z.string(),
  severity: SeveritySchema,
  source: z.string(),
  status: z.enum(['verified', 'pending_validation', 'rejected', 'duplicate', 'unverified']),
  poc_status: z.enum(['passing', 'failing', 'not_started']),
  poc_file: z.string().nullable(),
  duplicates: z.array(z.string()),
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

// ─── AI Tool Configuration ─────────────────────────────────────────

export const AiToolDependencySchema = z.object({
  binary: z.string(),
  install_cmd: z.string(),
  required: z.boolean().default(false),
});

export const AiToolSchema = z.object({
  name: z.string(),
  type: z.enum(['skill', 'cli']),
  invocation: z.string(),
  install_url: z.string().optional(),
  install_type: z.enum(['skill-file', 'mcp-server', 'manual']).optional(),
  skill_path: z.string().optional(),
  output_format: z.enum(['markdown', 'json', 'stdout']),
  enabled: z.boolean().default(true),
  requires_env: z.array(z.string()).optional(),
  dependencies: z.array(AiToolDependencySchema).optional(),
  long_running: z.boolean().default(false),
  description: z.string().optional(),
});

// ─── AI Result Findings ────────────────────────────────────────────

export const AiResultFindingSchema = z.object({
  id: z.string(),
  tool: z.string(),
  title: z.string(),
  severity: SeveritySchema,
  description: z.string(),
  affected_code: z.array(z.object({
    file: z.string(),
    snippet: z.string().optional(),
  })),
  confidence: ConfidenceSchema.optional(),
  category: z.string().optional(),
  raw_category: z.string().optional(),
  ai_consensus: z.number().int().optional(),
});

export const AiResultFileSchema = z.object({
  tool: z.string(),
  ran_at: z.string(),
  duration_seconds: z.number().optional(),
  total_findings: z.number(),
  findings: z.array(AiResultFindingSchema),
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
