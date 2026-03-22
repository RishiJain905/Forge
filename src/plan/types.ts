import type { IntakeArtifact } from "../intake/types.js";

import type {
  PLAN_DEPENDENCY_TYPES,
  PLAN_ITEM_CATEGORIES,
  PLAN_ITEM_REQUIRED_FIELDS,
  PLAN_PARALLELIZATION_SIGNALS,
  PLAN_RISK_LEVELS,
  PLAN_TEST_OBLIGATION_CATEGORIES,
  PLAN_VERIFICATION_TARGET_CATEGORIES,
  Step2BoundaryPolicy,
} from "./constants.js";

export type PlanItemCategory = typeof PLAN_ITEM_CATEGORIES[number];
export type PlanDependencyType = typeof PLAN_DEPENDENCY_TYPES[number];
export type PlanRiskLevel = typeof PLAN_RISK_LEVELS[number];
export type PlanTestObligationCategory = typeof PLAN_TEST_OBLIGATION_CATEGORIES[number];
export type PlanVerificationCategory = typeof PLAN_VERIFICATION_TARGET_CATEGORIES[number];
export type PlanParallelizationSignal = typeof PLAN_PARALLELIZATION_SIGNALS[number];
export type PlanItemRequiredField = typeof PLAN_ITEM_REQUIRED_FIELDS[number];
export type PlanFoundationStatus = "ready" | "blocked" | "failed";

export interface PlanFoundationOptions {
  repo?: string;
  intakePath?: string;
}

export interface LoadedPlanFoundationInput {
  repoRoot: string;
  artifactPath: string;
  artifact: IntakeArtifact;
}

export interface PlanInputReference {
  artifactPath: string;
  command: IntakeArtifact["command"];
  repoRoot: IntakeArtifact["repoRoot"];
  status: IntakeArtifact["status"];
  summary: IntakeArtifact["summary"];
  readyForPlanning: IntakeArtifact["next_step_readiness"]["ready"];
}

export interface PlanCarryForwardContext {
  taskSpec: IntakeArtifact["task_spec"];
  repoContext: IntakeArtifact["repo_context"];
  candidateTargets: IntakeArtifact["candidate_targets"];
  riskAnalysis: IntakeArtifact["risk_analysis"];
  initialVerificationTargets: IntakeArtifact["initial_verification_targets"];
  ambiguities: IntakeArtifact["ambiguities"];
  warnings: IntakeArtifact["warnings"];
  confidence: IntakeArtifact["confidence"];
  nextStepReadiness: IntakeArtifact["next_step_readiness"];
}

export interface PlanItemDependency {
  planItemId: string;
  type: PlanDependencyType;
  reason: string;
}

export interface PlanTestObligation {
  category: PlanTestObligationCategory;
  reason: string;
}

export interface PlanVerificationRelevance {
  relevant: boolean;
  categories: PlanVerificationCategory[];
  notes: string[];
}

export interface PlanParallelization {
  signal: PlanParallelizationSignal;
  reason: string;
}

export interface PlanItem {
  id: string;
  title: string;
  description: string;
  category: PlanItemCategory;
  sourceRequirements: string[];
  likelyAffectedPaths: string[];
  dependencies: PlanItemDependency[];
  riskLevel: PlanRiskLevel;
  testObligations: PlanTestObligation[];
  verificationRelevance: PlanVerificationRelevance;
  parallelization: PlanParallelization;
}

export interface PlanItemContract {
  requiredFields: readonly PlanItemRequiredField[];
  categories: readonly PlanItemCategory[];
  dependencyTypes: readonly PlanDependencyType[];
  riskLevels: readonly PlanRiskLevel[];
  testObligationCategories: readonly PlanTestObligationCategory[];
  verificationCategories: readonly PlanVerificationCategory[];
  parallelizationSignals: readonly PlanParallelizationSignal[];
}

export interface PlanFoundationResult {
  command: string;
  stage: string;
  purpose: string;
  deterministicFirst: {
    enforced: true;
    authoritativeInputs: readonly string[];
    notes: readonly string[];
  };
  sourceIntake: PlanInputReference;
  carryForward: PlanCarryForwardContext;
  boundaryPolicy: Step2BoundaryPolicy;
  planItemContract: PlanItemContract;
}

export interface PlanFoundationFailure {
  code: string;
  message: string;
}

export interface PlanFoundationCommandResult {
  status: PlanFoundationStatus;
  foundation: PlanFoundationResult | null;
  failure: PlanFoundationFailure | null;
}
