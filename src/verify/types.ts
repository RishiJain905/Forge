import type { PlanArtifact } from "../plan/types.js";

import type {
  Step3BoundaryPolicy,
  VERIFY_FORMAL_ENTRY_CRITERIA,
  VERIFY_FORMAL_FOCUS_AREAS,
  VERIFY_FORMAL_TOOLING,
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
export type VerifyFoundationStatus = "ready" | "blocked" | "failed";

export interface VerifyFoundationOptions {
  repo?: string;
  outputDir?: string;
  planPath?: string;
}

export interface VerifyResolvedOutputPaths {
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

export interface LoadedVerifyFoundationInput {
  repoRoot: string;
  paths: VerifyResolvedOutputPaths;
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
