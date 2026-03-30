import type { PlanArtifact } from "../plan/types.js";
import type { VerifyArtifact } from "../verify/types.js";

import type {
  SPLIT_CONSTRAINT_SOURCES,
  SPLIT_STREAM_CATEGORIES,
  SPLIT_WORKSTREAM_REQUIRED_FIELDS,
  Step4BoundaryPolicy,
} from "./constants.js";

export type SplitStreamCategory = typeof SPLIT_STREAM_CATEGORIES[number];
export type SplitWorkstreamRequiredField = typeof SPLIT_WORKSTREAM_REQUIRED_FIELDS[number];
export type SplitConstraintSource = typeof SPLIT_CONSTRAINT_SOURCES[number];
export type SplitFoundationStatus = "ready" | "blocked" | "failed";

export interface SplitFoundationOptions {
  repo?: string;
  outputDir?: string;
  verifyPath?: string;
}

export interface SplitResolvedOutputPaths {
  requestedOutputRoot: string | null;
  outputRoot: string;
  usedFallbackRoot: boolean;
  fallbackReason: string | null;
  verifyArtifactPath: string;
  planArtifactPath: string;
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
