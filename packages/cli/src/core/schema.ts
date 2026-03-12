import { z } from 'zod';

// ─── Shared Sub-schemas ─────────────────────────────────────────────

export const EvidenceSchema = z.object({
  file: z.string(),
  line_start: z.number().int(),
  line_end: z.number().int(),
  snippet: z.string().optional(),
});

export const ConfidenceSchema = z.enum(['high', 'medium', 'low']);

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
    output_dir: z.string().default('.solaudit'),
    ai_model: z.string().default('claude-sonnet-4-20250514'),
    finding_template: z.string().default('default'),
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
  modifiers: z.array(z.string()),
  evidence: EvidenceSchema,
});

export const RoleFunctionRefSchema = z.object({
  contract: z.string(),
  function: z.string(),
});

export const RoleSchema = z.object({
  role: z.string(),
  description: z.string(),
  confidence: ConfidenceSchema,
  derived_from: DerivedFromSchema,
  reasoning: z.string(),
  modifier: z.string().nullable(),
  functions: z.array(RoleFunctionRefSchema),
  warnings: z.array(z.string()),
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

export const StateVarsSchema = z.object({
  variables: z.array(StateVariableSchema),
  storage_layout_source: z.enum(['compiler-artifact']).nullable(),
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

// ─── Annotations ────────────────────────────────────────────────────

export const AnnotationSchema = z.object({
  id: z.string(),
  type: z.enum(['issue', 'issue-verified', 'question', 'note']),
  status: z.enum(['unverified', 'verified', 'open', 'resolved']),
  file: z.string(),
  line: z.number().int(),
  text: z.string(),
  context_snippet: z.string().optional(),
  finding_ref: z.string().optional(),
});

export const AnnotationsSchema = z.object({
  extracted_at: z.string(),
  annotations: z.array(AnnotationSchema),
});

// ─── Findings ───────────────────────────────────────────────────────

export const FindingLocationSchema = z.object({
  file: z.string(),
  line_start: z.number().int(),
  line_end: z.number().int(),
  snippet: z.string().optional(),
});

export const FindingSchema = z.object({
  id: z.string(),
  title: z.string(),
  severity: z.enum(['Critical', 'High', 'Medium', 'Low', 'Info']),
  likelihood: z.enum(['High', 'Medium', 'Low']),
  impact: z.enum(['High', 'Medium', 'Low']),
  category: z.string(),
  description: z.string(),
  impact_detail: z.string(),
  root_cause: z.object({
    summary: z.string(),
    locations: z.array(FindingLocationSchema),
  }),
  poc: z.object({
    status: z.enum(['passing', 'failing', 'not_started']),
    file: z.string().nullable(),
    validation_memo: z.string().nullable(),
  }),
  recommendation: z.string(),
  references: z.object({
    annotation_id: z.string().nullable(),
    annotation_location: z.string().nullable(),
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
  severity: z.enum(['Critical', 'High', 'Medium', 'Low', 'Info']),
  source: z.string(),
  status: z.enum(['verified', 'pending_validation', 'rejected', 'duplicate']),
  poc_status: z.enum(['passing', 'failing', 'not_started']),
  poc_file: z.string().nullable(),
  duplicates: z.array(z.string()),
  notes: z.string(),
});

export const TrackingSchema = z.object({
  findings: z.array(TrackingEntrySchema),
});

// ─── Comparison ─────────────────────────────────────────────────────

export const ComparisonDuplicateSchema = z.object({
  ai_finding: z.string(),
  matches: z.string(),
  confidence: ConfidenceSchema,
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
