import type { PlanArtifact } from "../plan/types.js";
import type { VerifyArtifact } from "../verify/types.js";

import type {
  SPLIT_EXECUTION_SCOPES,
  SPLIT_CONSTRAINT_SOURCES,
  SPLIT_STREAM_CATEGORIES,
  SPLIT_WORKSTREAM_REQUIRED_FIELDS,
  Step4BoundaryPolicy,
} from "./constants.js";

export type SplitExecutionScope = typeof SPLIT_EXECUTION_SCOPES[number];
export type SplitStreamCategory = typeof SPLIT_STREAM_CATEGORIES[number];
export type SplitWorkstreamRequiredField = typeof SPLIT_WORKSTREAM_REQUIRED_FIELDS[number];
export type SplitConstraintSource = typeof SPLIT_CONSTRAINT_SOURCES[number];
export type SplitFoundationStatus = "ready" | "blocked" | "failed";
export type SplitCommandStatus = SplitFoundationStatus;
export type SplitReadinessStatus = "ready" | "ready_with_warnings" | "blocked";

export interface SplitFoundationOptions {
  repo?: string;
  outputDir?: string;
  verifyPath?: string;
}

export interface SplitCommandOptions {
  repo?: string;
  outputDir?: string;
}

export interface SplitResolvedOutputPaths {
  requestedOutputRoot: string | null;
  outputRoot: string;
  usedFallbackRoot: boolean;
  fallbackReason: string | null;
  verifyArtifactPath: string;
  planArtifactPath: string;
  artifactPath?: string;
  reportPath?: string;
  debugArtifactPath?: string;
  debugWorkstreamsPath?: string;
  debugMergeOrderPath?: string;
  debugBlockedItemsPath?: string;
  debugStreamConstraintsPath?: string;
}

export interface SplitVerifyReference {
  artifactPath: string;
  command: VerifyArtifact["command"];
  repoRoot: VerifyArtifact["repoRoot"];
  status: VerifyArtifact["status"];
  summary: VerifyArtifact["summary"];
  readyForSplit: VerifyArtifact["verification_readiness"]["ready"];
  verificationDiagnostics: VerifyArtifact["verification_diagnostics"];
  verificationReadinessStatus: VerifyArtifact["verification_readiness"]["status"];
  verificationReadiness: VerifyArtifact["verification_readiness"];
  failure: VerifyArtifact["failure"];
}

export interface SplitPlanReference {
  artifactPath: string;
  command: PlanArtifact["command"];
  repoRoot: PlanArtifact["repoRoot"];
  status: PlanArtifact["status"];
  summary: PlanArtifact["summary"];
  readyForVerification: PlanArtifact["planning_readiness"]["ready"];
  planningDiagnostics: PlanArtifact["planning_diagnostics"];
  planningReadiness: PlanArtifact["planning_readiness"];
  failure: PlanArtifact["failure"];
}

export interface SplitInputIssue {
  code: string;
  message: string;
}

export interface SplitPlanningContext {
  planItemContract: PlanArtifact["plan_item_contract"];
  planItems: PlanArtifact["plan_items"];
  dependencyGraph: PlanArtifact["dependency_graph"];
  conflictZones: PlanArtifact["conflict_zones"];
  testObligations: PlanArtifact["test_obligations"];
  parallelizationSignals: PlanArtifact["parallelization_signals"];
  verificationTargetContract: VerifyArtifact["verification_target_contract"];
  formalLaneContract: VerifyArtifact["formal_lane_contract"];
  verificationTargets: VerifyArtifact["verification_targets"];
  verificationCases: VerifyArtifact["verification_cases"];
  findings: VerifyArtifact["findings"];
  constraints: VerifyArtifact["constraints"];
}

export interface SplitPlanItemEvidence {
  planItem: PlanArtifact["plan_items"][number];
  dependencyGraphEntries: PlanArtifact["dependency_graph"];
  conflictZones: PlanArtifact["conflict_zones"];
  testObligations: PlanArtifact["test_obligations"];
  parallelizationSignal: PlanArtifact["parallelization_signals"][number] | null;
  verificationTargets: VerifyArtifact["verification_targets"];
  verificationCases: VerifyArtifact["verification_cases"];
  findings: VerifyArtifact["findings"];
  constraints: VerifyArtifact["constraints"];
  concerns: PlanArtifact["carry_forward"]["concerns"];
}

export interface SplitPlanningUncertainty {
  sourceIntake: PlanArtifact["source_intake"];
  planCarryForward: PlanArtifact["carry_forward"];
  planningDiagnostics: PlanArtifact["planning_diagnostics"];
  planningReadiness: PlanArtifact["planning_readiness"];
  verifyCarryForward: VerifyArtifact["carry_forward"];
  verificationDiagnostics: VerifyArtifact["verification_diagnostics"];
  verificationReadiness: VerifyArtifact["verification_readiness"];
}

export interface SplitInputUsability {
  status: "actionable" | "non_actionable" | "upstream_blocked";
  warningItems: SplitInputIssue[];
  blockingItems: SplitInputIssue[];
}

export interface SplitPlanningInput {
  context: SplitPlanningContext;
  planItemEvidence: SplitPlanItemEvidence[];
  uncertainty: SplitPlanningUncertainty;
  usability: SplitInputUsability;
}

export interface SplitCarryForwardContext {
  sourceIntake: PlanArtifact["source_intake"];
  planCarryForward: PlanArtifact["carry_forward"];
  planningDiagnostics: PlanArtifact["planning_diagnostics"];
  planningReadiness: PlanArtifact["planning_readiness"];
  verifyCarryForward: VerifyArtifact["carry_forward"];
  verificationDiagnostics: VerifyArtifact["verification_diagnostics"];
  verificationReadiness: VerifyArtifact["verification_readiness"];
}

export interface SplitWorkstreamContract {
  requiredFields: readonly SplitWorkstreamRequiredField[];
  categories: readonly SplitStreamCategory[];
  constraintSources: readonly SplitConstraintSource[];
}

export interface SplitWritePolicy {
  mode: "output-root-only";
  repoReadOnlyOutsideOutputRoot: boolean;
  allowedRoot: string;
  allowedSideEffects: readonly string[];
  deferredCapabilities: readonly string[];
  disallowedCapabilities: readonly string[];
}

export interface SplitWorkstream {
  id: string;
  title: string;
  description: string;
  category: SplitStreamCategory;
  sourcePlanItemIds: string[];
  sourceVerificationCaseIds: string[];
  sourceFindingIds: string[];
  likelyAffectedPaths: string[];
  streamDependencies: string[];
  mergeOrderRequirements: string[];
  constraints: string[];
  blockedReason: string | null;
}

export interface SplitDependencyEdge {
  upstreamWorkstreamId: string;
  downstreamWorkstreamId: string;
  reason: string;
}

export interface SplitMergeOrderEntry {
  id: string;
  workstreamId: string;
  order: number;
  ruleType: "serial" | "dependency" | "protected_merge";
  mustMergeAfterWorkstreamIds: string[];
  reason: string;
  sourceDependencyIds: string[];
  sourceConstraintIds: string[];
  sourceConcernIds: string[];
}

export interface SplitBlockedItem {
  id: string;
  kind: "input_blocker" | "blocked_workstream" | "blocked_plan_item";
  code: string;
  message: string;
  workstreamId: string | null;
  sourcePlanItemIds: string[];
  sourceVerificationCaseIds: string[];
  sourceFindingIds: string[];
  sourceConstraintIds: string[];
  sourceConcernIds: string[];
  partialMetadataAvailable: boolean;
}

export type SplitRegroupingGroupKind = "single" | "direct_dependency_test_pair" | "same_surface_siblings";
export type SplitBlockingStatus = "unblocked" | "partially_blocked" | "blocked";
export type SplitMergeOrderStatus = "none" | "constrained";
export type SplitMergeOrderRuleKind = "serial" | "dependency" | "protected_merge";

export interface SplitRegroupingMemberDetail {
  planItemId: string;
  title: string;
  category: PlanArtifact["plan_items"][number]["category"];
  likelyAffectedPaths: string[];
  blockedStatus: "unblocked" | "blocked";
  blockedReason: string | null;
  sourceVerificationCaseIds: string[];
  sourceFindingIds: string[];
  sourceConstraintIds: string[];
  sourceConcernIds: string[];
}

export interface SplitRegroupingDetail {
  grouped: boolean;
  groupKind: SplitRegroupingGroupKind;
  rationale: string;
  note: string | null;
  dominantSurfaceKey: string | null;
  preservedSourcePlanItemIds: string[];
  memberDetails: SplitRegroupingMemberDetail[];
}

export interface SplitBlockingDetail {
  status: SplitBlockingStatus;
  blockedMemberPlanItemIds: string[];
  blockedUpstreamWorkstreamIds: string[];
  constrainingFindingIds: string[];
  constrainingConstraintIds: string[];
  constrainingConcernIds: string[];
  canProceedWithConstraints: boolean;
  requiresResolutionBeforeExecution: boolean;
}

export interface SplitMergeOrderDetail {
  status: SplitMergeOrderStatus;
  ruleKinds: SplitMergeOrderRuleKind[];
  hardPrerequisiteWorkstreamIds: string[];
  sourceConstraintIds: string[];
  sourceConcernIds: string[];
}

export interface SplitStreamConstraintDetail {
  workstreamId: string;
  baseCategory: SplitStreamCategory;
  category: SplitStreamCategory;
  appliedRules: string[];
  categoryReasons: string[];
  mergeOrderReasons: string[];
  blockingReasons: string[];
  warningNotes: string[];
  mitigationSummaries: string[];
  sourceDependencyIds: string[];
  sourceConflictZoneIds: string[];
  sourceTestObligationIds: string[];
  sourceVerificationTargetIds: string[];
  sourceVerificationCaseIds: string[];
  sourceFindingIds: string[];
  sourceConstraintIds: string[];
  sourceConcernIds: string[];
  sourceReadinessIds: string[];
  blockedUpstreamWorkstreamIds: string[];
  blockedPlanItemIds: string[];
  mergeOrderRuleIds: string[];
  blockedItemIds: string[];
  mergeOrderRequirements: string[];
  blockedReason: string | null;
  regrouping: SplitRegroupingDetail;
  blocking: SplitBlockingDetail;
  mergeOrder: SplitMergeOrderDetail;
}

export interface SplitWorkstreamBuildResult {
  workstreams: SplitWorkstream[];
  dependencyEdges: SplitDependencyEdge[];
  mergeOrder: SplitMergeOrderEntry[];
  blockedItems: SplitBlockedItem[];
  warningItems: SplitInputIssue[];
  streamConstraintDetails: SplitStreamConstraintDetail[];
}

export interface SplitArtifactFiles {
  artifactPath: string | null;
  reportPath: string | null;
  debugArtifactPath: string;
  debugWorkstreamsPath: string;
  debugMergeOrderPath: string;
  debugBlockedItemsPath: string;
  debugStreamConstraintsPath: string;
}

export interface SplitCommandFailure {
  code: string;
  message: string;
  fallbackReason?: string;
}

export interface SplitCarriedForwardConstraints {
  findings: VerifyArtifact["findings"];
  constraints: VerifyArtifact["constraints"];
  plan_concerns: PlanArtifact["carry_forward"]["concerns"];
  planning_readiness: PlanArtifact["planning_readiness"];
  verification_readiness: VerifyArtifact["verification_readiness"];
  stream_constraint_details: SplitStreamConstraintDetail[];
}

export interface SplitDiagnostics {
  usability_status: SplitInputUsability["status"];
  warning_items: SplitInputIssue[];
  blocking_items: SplitInputIssue[];
  partial_output: SplitCommandFailure | null;
}

export interface SplitReadiness {
  ready: boolean;
  status: SplitReadinessStatus;
  summary: string;
  execution_scope: SplitExecutionScope;
  blocked_workstream_count: number;
  partially_blocked_item_count: number;
  merge_order_rule_count: number;
  warning_items: SplitInputIssue[];
  blocking_issues: SplitInputIssue[];
  partial_output: SplitCommandFailure | null;
  constraining_concern_ids: string[];
  recommended_user_actions: string[];
}

export interface SplitReadinessResolution {
  status: SplitCommandStatus;
  splitDiagnostics: SplitDiagnostics;
  splitReadiness: SplitReadiness;
}

export interface LoadedSplitFoundationInput {
  repoRoot: string;
  paths: SplitResolvedOutputPaths;
  sourceVerify: SplitVerifyReference;
  sourcePlan: SplitPlanReference;
  sourceIntake: PlanArtifact["source_intake"];
  splitInput: SplitPlanningInput;
}

export interface SplitFoundationResult {
  command: string;
  stage: string;
  purpose: string;
  deterministicFirst: {
    enforced: true;
    authoritativeInputs: readonly string[];
    notes: readonly string[];
  };
  sourceVerify: SplitVerifyReference;
  sourcePlan: SplitPlanReference;
  splitInput: SplitPlanningInput;
  carryForward: SplitCarryForwardContext;
  boundaryPolicy: Step4BoundaryPolicy;
  workstreamContract: SplitWorkstreamContract;
}

export interface SplitFoundationFailure {
  code: string;
  message: string;
}

export interface SplitFoundationCommandResult {
  status: SplitFoundationStatus;
  foundation: SplitFoundationResult | null;
  failure: SplitFoundationFailure | null;
}

export interface SplitArtifact {
  schemaVersion: string;
  command: string;
  stage: string;
  status: SplitCommandStatus;
  purpose: string;
  repoRoot: string;
  requestedOutputRoot: string | null;
  outputRoot: string;
  writePolicy: SplitWritePolicy;
  files: SplitArtifactFiles;
  startedAt: string;
  finishedAt: string;
  summary: string;
  boundaryNotes: string[];
  source_verify: SplitVerifyReference;
  source_plan: SplitPlanReference;
  workstream_contract: SplitWorkstreamContract;
  workstreams: SplitWorkstream[];
  dependency_edges: SplitDependencyEdge[];
  merge_order: SplitMergeOrderEntry[];
  blocked_items: SplitBlockedItem[];
  carried_forward_constraints: SplitCarriedForwardConstraints;
  split_diagnostics: SplitDiagnostics;
  split_readiness: SplitReadiness;
  failure: SplitCommandFailure | null;
}

export interface SplitCommandResult {
  status: SplitCommandStatus;
  artifact: SplitArtifact | null;
  artifactPath: string | null;
  reportPath: string | null;
  outputRoot: string | null;
  summary: string;
  failure: SplitCommandFailure | null;
}
