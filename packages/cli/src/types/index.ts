import { z } from 'zod';
import {
  ConfigSchema,
  StatsSchema,
  DepsSchema,
  AccessControlSchema,
  StateVarsSchema,
  ExternalCallsSchema,
  FindingsSchema,
  TrackingSchema,
  ComparisonSchema,
  SpecConformanceSchema,
  EvidenceSchema,
  ConfidenceSchema,
  DerivedFromSchema,
  PerContractStatsSchema,
  TestCoverageSchema,
  GraphNodeSchema,
  ClusterSchema,
  AccessFunctionSchema,
  RoleFunctionRefSchema,
  RoleSchema,
  StateVariableSchema,
  ExternalCallSchema,
  FindingSchema,
  TrackingEntrySchema,
  TrackingSourceSchema,
  ResolutionSchema,
  SpecItemSchema,
} from '../core/schema.js';

export type Config = z.infer<typeof ConfigSchema>;
export type Stats = z.infer<typeof StatsSchema>;
export type Deps = z.infer<typeof DepsSchema>;
export type AccessControl = z.infer<typeof AccessControlSchema>;
export type StateVars = z.infer<typeof StateVarsSchema>;
export type ExternalCalls = z.infer<typeof ExternalCallsSchema>;
export type Findings = z.infer<typeof FindingsSchema>;
export type Tracking = z.infer<typeof TrackingSchema>;
export type Comparison = z.infer<typeof ComparisonSchema>;
export type SpecConformance = z.infer<typeof SpecConformanceSchema>;

export type Evidence = z.infer<typeof EvidenceSchema>;
export type Confidence = z.infer<typeof ConfidenceSchema>;
export type DerivedFrom = z.infer<typeof DerivedFromSchema>;
export type PerContractStats = z.infer<typeof PerContractStatsSchema>;
export type TestCoverage = z.infer<typeof TestCoverageSchema>;
export type GraphNode = z.infer<typeof GraphNodeSchema>;
export type Cluster = z.infer<typeof ClusterSchema>;
export type AccessFunction = z.infer<typeof AccessFunctionSchema>;
export type RoleFunctionRef = z.infer<typeof RoleFunctionRefSchema>;
export type Role = z.infer<typeof RoleSchema>;
export type StateVariable = z.infer<typeof StateVariableSchema>;
export type ExternalCall = z.infer<typeof ExternalCallSchema>;
export type Finding = z.infer<typeof FindingSchema>;
export type TrackingEntry = z.infer<typeof TrackingEntrySchema>;
export type TrackingSource = z.infer<typeof TrackingSourceSchema>;
export type Resolution = z.infer<typeof ResolutionSchema>;
export type SpecItem = z.infer<typeof SpecItemSchema>;
