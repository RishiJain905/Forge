import type { PlanArtifact, PlanVerificationCategory } from "../plan/types.js";

import type {
  Step3BoundaryPolicy,
  VERIFY_FORMAL_ENTRY_CRITERIA,
  VERIFY_FORMAL_FOCUS_AREAS,
  VERIFY_FORMAL_TOOLING,
  VERIFY_CASE_STATUSES,
  VERIFY_TLA_SPEC_GENERATION_STATUSES,
  VERIFY_STATE_MODEL_REQUIRED_FIELDS,
  VERIFY_STRUCTURAL_FOCUS_AREAS,
  VERIFY_SUPPORTED_LANES,
  VERIFY_TARGET_REQUIRED_FIELDS,
  VERIFY_TARGET_RISK_SOURCES,
  VERIFY_TLC_STATUSES,
} from "./constants.js";

export type VerifyLane = typeof VERIFY_SUPPORTED_LANES[number];
export type VerifyTargetRequiredField = typeof VERIFY_TARGET_REQUIRED_FIELDS[number];
export type VerifyTargetRiskSource = typeof VERIFY_TARGET_RISK_SOURCES[number];
export type VerifyStructuralFocusArea = typeof VERIFY_STRUCTURAL_FOCUS_AREAS[number];
export type VerifyFormalFocusArea = typeof VERIFY_FORMAL_FOCUS_AREAS[number];
export type VerifyFormalEntryCriterion = typeof VERIFY_FORMAL_ENTRY_CRITERIA[number];
export type VerifyFormalTooling = typeof VERIFY_FORMAL_TOOLING[number];
export type VerifyStateModelField = typeof VERIFY_STATE_MODEL_REQUIRED_FIELDS[number];
export type VerifyTlcStatus = typeof VERIFY_TLC_STATUSES[number];
export type VerifyCaseStatus = typeof VERIFY_CASE_STATUSES[number];
export type VerifyTlaSpecGenerationStatus = typeof VERIFY_TLA_SPEC_GENERATION_STATUSES[number];
export type VerifyVerificationCategory = PlanVerificationCategory | VerifyStructuralFocusArea;
export type VerifyFoundationStatus = "ready" | "blocked" | "failed";

export interface VerifyFoundationOptions {
  repo?: string;
  outputDir?: string;
  planPath?: string;
}

export interface VerifyCommandOptions {
  repo?: string;
  outputDir?: string;
}

export interface VerifyResolvedOutputPaths {
  requestedOutputRoot: string | null;
  outputRoot: string;
  usedFallbackRoot: boolean;
  fallbackReason: string | null;
  planArtifactPath: string;
  verifyArtifactPath: string;
  verifyReportPath: string;
}

export interface VerifyFoundationResolvedPaths {
  requestedOutputRoot: string | null;
  outputRoot: string;
  usedFallbackRoot: boolean;
  fallbackReason: string | null;
  planArtifactPath: string;
}

export interface VerifyPlanReference {
  artifactPath: string;
  command: PlanArtifact["command"];
  repoRoot: PlanArtifact["repoRoot"];
  status: PlanArtifact["status"];
  summary: PlanArtifact["summary"];
  readyForVerification: PlanArtifact["planning_readiness"]["ready"];
  planningReadinessStatus: PlanArtifact["planning_readiness"]["status"];
  failure: PlanArtifact["failure"];
}

export interface VerifyPlanningContext {
  planItemContract: PlanArtifact["plan_item_contract"];
  planItems: PlanArtifact["plan_items"];
  dependencyGraph: PlanArtifact["dependency_graph"];
  conflictZones: PlanArtifact["conflict_zones"];
  testObligations: PlanArtifact["test_obligations"];
  parallelizationSignals: PlanArtifact["parallelization_signals"];
}

export interface VerifyPlanningUncertainty {
  carryForward: PlanArtifact["carry_forward"];
  planningDiagnostics: PlanArtifact["planning_diagnostics"];
  planningReadiness: PlanArtifact["planning_readiness"];
}

export interface VerifyInputIssue {
  code: string;
  message: string;
}

export interface VerifyInputUsability {
  status: "actionable" | "non_actionable" | "upstream_blocked";
  warningItems: VerifyInputIssue[];
  blockingItems: VerifyInputIssue[];
}

export interface VerifyPlanningInput {
  context: VerifyPlanningContext;
  uncertainty: VerifyPlanningUncertainty;
  usability: VerifyInputUsability;
}

export interface VerifyCarryForwardContext {
  sourceIntake: PlanArtifact["source_intake"];
  carryForward: PlanArtifact["carry_forward"];
  planningDiagnostics: PlanArtifact["planning_diagnostics"];
  planningReadiness: PlanArtifact["planning_readiness"];
}

export interface VerifyTargetContract {
  requiredFields: readonly VerifyTargetRequiredField[];
  riskSources: readonly VerifyTargetRiskSource[];
  structuralFocusAreas: readonly VerifyStructuralFocusArea[];
  formalFocusAreas: readonly VerifyFormalFocusArea[];
  supportedLanes: readonly VerifyLane[];
}

export interface VerifyFormalLaneContract {
  tooling: readonly VerifyFormalTooling[];
  entryCriteria: readonly VerifyFormalEntryCriterion[];
  stateModelRequiredFields: readonly VerifyStateModelField[];
  tlcStatuses: readonly VerifyTlcStatus[];
}

export interface VerifyVerificationTarget {
  id: string;
  title: string;
  category: VerifyVerificationCategory;
  sourcePlanItemIds: string[];
  riskSummary: string;
  candidateLanes: VerifyLane[];
  sourceRiskSources: VerifyTargetRiskSource[];
  expectedFindingKinds: string[];
  verificationCaseIds: string[];
  traceabilityNotes: string[];
}

export interface VerifyVerificationCase {
  id: string;
  verificationTargetId: string;
  title: string;
  category: VerifyVerificationCategory;
  sourcePlanItemIds: string[];
  lanes: VerifyLane[];
  goal: string;
  status: VerifyCaseStatus;
  summary: string;
  findings: string[];
  mitigations: string[];
  constraints: string[];
  traceabilityNotes: string[];
  formalDetails: VerifyCaseFormalDetails | null;
}

export interface VerifyCaseFormalDetails {
  enteredFormalLane: true;
  entryCriteria: VerifyFormalEntryCriterion[];
  stateModelId: string | null;
  tlaSpecId: string | null;
  tlcResultId: string | null;
  cautionNotes: string[];
  trace: string | null;
  errors: string[];
}

export interface VerifyStructuralVerification {
  status: "not_run" | "passed" | "failed" | "errored";
  summary: string;
  findings: string[];
  constraints: string[];
}

export interface VerifyStructuralExecutionResult {
  cases: VerifyVerificationCase[];
  structuralVerification: VerifyStructuralVerification;
  findings: string[];
  constraints: string[];
}

export interface VerifyStateModel {
  id: string;
  verification_case_id: string;
  verification_target_id: string;
  name: string;
  summary: string;
  actors: string[];
  entities: string[];
  states: string[];
  transitions: string[];
  unsafe_states: string[];
  invariants: string[];
  initial_conditions: string[];
}

export interface VerifyTlaSpec {
  id: string;
  verification_case_id: string;
  state_model_id: string;
  name: string;
  summary: string;
  module_name: string;
  spec_path: string;
  config_path: string;
  generation_status: VerifyTlaSpecGenerationStatus;
}

export interface VerifyTlcResult {
  id: string;
  verification_case_id: string;
  tla_spec_id: string;
  status: VerifyTlcStatus;
  summary: string;
  trace: string | null;
  errors: string[];
}

export interface VerifyFormalVerification {
  status: VerifyTlcStatus;
  summary: string;
  caution_notes: string[];
  state_models: VerifyStateModel[];
  tla_specs: VerifyTlaSpec[];
  tlc_results: VerifyTlcResult[];
  findings: string[];
  constraints: string[];
}

export interface VerifyCommandFailure {
  code: string;
  message: string;
  fallbackReason?: string;
}

export interface VerifyVerificationDiagnostics {
  usability_status: VerifyInputUsability["status"];
  warning_items: VerifyInputIssue[];
  blocking_items: VerifyInputIssue[];
  partial_output: VerifyCommandFailure | null;
}

export interface VerifyVerificationReadiness {
  ready: boolean;
  status: "ready" | "ready_with_warnings" | "blocked";
  summary: string;
  warning_items: VerifyInputIssue[];
  blocking_issues: VerifyInputIssue[];
  partial_output: VerifyCommandFailure | null;
  constraining_concern_ids: string[];
  recommended_user_actions: string[];
}

export interface VerifyReadinessResolution {
  status: VerifyFoundationStatus;
  verificationDiagnostics: VerifyVerificationDiagnostics;
  verificationReadiness: VerifyVerificationReadiness;
}

export interface VerifyWritePolicy {
  mode: "output-root-only";
  repoReadOnlyOutsideOutputRoot: boolean;
  allowedRoot: string;
  allowedSideEffects: readonly string[];
  deferredCapabilities: readonly string[];
  disallowedCapabilities: readonly string[];
}

export interface VerifyArtifactFiles {
  artifactPath: string | null;
  reportPath: string | null;
}

export interface VerifyArtifact {
  schemaVersion: string;
  command: string;
  stage: string;
  status: VerifyFoundationStatus;
  purpose: string;
  repoRoot: string;
  requestedOutputRoot: string | null;
  outputRoot: string;
  writePolicy: VerifyWritePolicy;
  files: VerifyArtifactFiles;
  startedAt: string;
  finishedAt: string;
  summary: string;
  boundaryNotes: string[];
  source_plan: VerifyPlanReference;
  verification_target_contract: VerifyTargetContract;
  formal_lane_contract: VerifyFormalLaneContract;
  verification_targets: VerifyVerificationTarget[];
  verification_cases: VerifyVerificationCase[];
  structural_verification: VerifyStructuralVerification;
  formal_verification: VerifyFormalVerification;
  findings: string[];
  constraints: string[];
  carry_forward: PlanArtifact["carry_forward"];
  verification_diagnostics: VerifyVerificationDiagnostics;
  verification_readiness: VerifyVerificationReadiness;
  failure: VerifyCommandFailure | null;
}

export interface VerifyVerificationModel {
  targets: VerifyVerificationTarget[];
  cases: VerifyVerificationCase[];
  structuralCaseCount: number;
  formalCaseCount: number;
}

export interface LoadedVerifyFoundationInput {
  repoRoot: string;
  paths: VerifyFoundationResolvedPaths;
  sourcePlan: VerifyPlanReference;
  sourceIntake: PlanArtifact["source_intake"];
  verificationInput: VerifyPlanningInput;
}

export interface VerifyFoundationResult {
  command: string;
  stage: string;
  purpose: string;
  deterministicFirst: {
    enforced: true;
    authoritativeInputs: readonly string[];
    notes: readonly string[];
  };
  sourcePlan: VerifyPlanReference;
  verificationInput: VerifyPlanningInput;
  carryForward: VerifyCarryForwardContext;
  boundaryPolicy: Step3BoundaryPolicy;
  targetContract: VerifyTargetContract;
  formalLaneContract: VerifyFormalLaneContract;
}

export interface VerifyFoundationFailure {
  code: string;
  message: string;
}

export interface VerifyFoundationCommandResult {
  status: VerifyFoundationStatus;
  foundation: VerifyFoundationResult | null;
  failure: VerifyFoundationFailure | null;
}

export interface VerifyCommandResult {
  status: VerifyFoundationStatus;
  artifact: VerifyArtifact | null;
  artifactPath: string | null;
  reportPath: string | null;
  outputRoot: string | null;
  summary: string;
  failure: VerifyCommandFailure | null;
}
