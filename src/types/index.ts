import { z } from 'zod';
import {
  ConfigSchema,
  StatsSchema,
  FindingsSchema,
  TrackingSchema,
  ComparisonSchema,
  SpecConformanceSchema,
  EvidenceSchema,
  ConfidenceSchema,
  DerivedFromSchema,
  PerContractStatsSchema,
  TestCoverageSchema,
  FindingSchema,
  TrackingEntrySchema,
  TrackingSourceSchema,
  ResolutionSchema,
  SpecItemSchema,
  DiffSchema,
  DiffChangeSchema,
  ImpactedFunctionSchema,
  StorageLayoutChangeSchema,
  PriorFindingsSchema,
  PriorReviewSchema,
  FactsSchema,
  FactsFunctionSchema,
  FactsContractSchema,
  FactsStateVarSchema,
  FactsStorageSlotSchema,
  ProtocolModelSchema,
  InvariantSchema,
  InvariantsFileSchema,
  TriageRuleSchema,
  ValidationSchema,
  FunctionReviewSchema,
  DiagramSpecSchema,
  DiagramIndexEntrySchema,
  FixReviewSchema,
  FixReviewCardSchema,
} from '../core/schema.js';

export type Config = z.infer<typeof ConfigSchema>;
export type Stats = z.infer<typeof StatsSchema>;
export type Findings = z.infer<typeof FindingsSchema>;
export type Tracking = z.infer<typeof TrackingSchema>;
export type Comparison = z.infer<typeof ComparisonSchema>;
export type SpecConformance = z.infer<typeof SpecConformanceSchema>;

export type Evidence = z.infer<typeof EvidenceSchema>;
export type Confidence = z.infer<typeof ConfidenceSchema>;
export type DerivedFrom = z.infer<typeof DerivedFromSchema>;
export type PerContractStats = z.infer<typeof PerContractStatsSchema>;
export type TestCoverage = z.infer<typeof TestCoverageSchema>;
export type Finding = z.infer<typeof FindingSchema>;
export type TrackingEntry = z.infer<typeof TrackingEntrySchema>;
export type TrackingSource = z.infer<typeof TrackingSourceSchema>;
export type Resolution = z.infer<typeof ResolutionSchema>;
export type SpecItem = z.infer<typeof SpecItemSchema>;
export type Diff = z.infer<typeof DiffSchema>;
export type DiffChange = z.infer<typeof DiffChangeSchema>;
export type ImpactedFunction = z.infer<typeof ImpactedFunctionSchema>;
export type StorageLayoutChange = z.infer<typeof StorageLayoutChangeSchema>;
export type PriorFindings = z.infer<typeof PriorFindingsSchema>;
export type PriorReview = z.infer<typeof PriorReviewSchema>;
export type Facts = z.infer<typeof FactsSchema>;
export type FactsFunction = z.infer<typeof FactsFunctionSchema>;
export type FactsContract = z.infer<typeof FactsContractSchema>;
export type FactsStateVar = z.infer<typeof FactsStateVarSchema>;
export type FactsStorageSlot = z.infer<typeof FactsStorageSlotSchema>;
export type ProtocolModel = z.infer<typeof ProtocolModelSchema>;
export type Invariant = z.infer<typeof InvariantSchema>;
export type InvariantsFile = z.infer<typeof InvariantsFileSchema>;
export type TriageRule = z.infer<typeof TriageRuleSchema>;
export type Validation = z.infer<typeof ValidationSchema>;
export type FunctionReview = z.infer<typeof FunctionReviewSchema>;
export type DiagramSpec = z.infer<typeof DiagramSpecSchema>;
export type DiagramIndexEntry = z.infer<typeof DiagramIndexEntrySchema>;
export type FixReview = z.infer<typeof FixReviewSchema>;
export type FixReviewCard = z.infer<typeof FixReviewCardSchema>;
