import { z } from 'zod';
import {
  ConfigSchema,
  StatsSchema,
  DepsSchema,
  AccessControlSchema,
  StateVarsSchema,
  ExternalCallsSchema,
  AnnotationsSchema,
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
  AnnotationSchema,
  FindingSchema,
  TrackingEntrySchema,
  SpecItemSchema,
} from '../core/schema.js';

export type Config = z.infer<typeof ConfigSchema>;
export type Stats = z.infer<typeof StatsSchema>;
export type Deps = z.infer<typeof DepsSchema>;
export type AccessControl = z.infer<typeof AccessControlSchema>;
export type StateVars = z.infer<typeof StateVarsSchema>;
export type ExternalCalls = z.infer<typeof ExternalCallsSchema>;
export type Annotations = z.infer<typeof AnnotationsSchema>;
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
export type Annotation = z.infer<typeof AnnotationSchema>;
export type Finding = z.infer<typeof FindingSchema>;
export type TrackingEntry = z.infer<typeof TrackingEntrySchema>;
export type SpecItem = z.infer<typeof SpecItemSchema>;
