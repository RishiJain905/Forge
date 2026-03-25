import type { IntakeArtifact } from "../intake/types.js";

import type {
  PLAN_DEPENDENCY_TYPES,
  PLAN_CARRY_FORWARD_CONCERN_EFFECTS,
  PLAN_CARRY_FORWARD_CONCERN_SOURCES,
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
export type PlanCarryForwardConcernSource = typeof PLAN_CARRY_FORWARD_CONCERN_SOURCES[number];
export type PlanCarryForwardConcernEffect = typeof PLAN_CARRY_FORWARD_CONCERN_EFFECTS[number];
export type PlanItemRequiredField = typeof PLAN_ITEM_REQUIRED_FIELDS[number];
export type PlanRequirementSource =
  | "explicit_requirement"
  | "acceptance_criteria"
  | "implementation_necessity"
  | "goal";
export type PlanFoundationStatus = "ready" | "blocked" | "failed";
export type PlanCommandStatus = PlanFoundationStatus;

export interface PlanFoundationOptions {
  repo?: string;
  outputDir?: string;
  intakePath?: string;
}

export interface PlanCommandOptions {
  repo?: string;
  outputDir?: string;
}

export interface PlanResolvedOutputPaths {
  requestedOutputRoot: string | null;
  outputRoot: string;
  usedFallbackRoot: boolean;
  fallbackReason: string | null;
  intakeArtifactPath: string;
  artifactPath: string;
  reportPath: string;
  debugArtifactPath: string;
  debugPlanItemsPath?: string;
  debugDependenciesPath?: string;
  debugConflictZonesPath?: string;
  debugTestObligationsPath?: string;
}

export interface LoadedPlanFoundationInput {
  repoRoot: string;
  paths: PlanResolvedOutputPaths;
  sourceIntake: PlanInputReference;
  planningInput: PlanPlanningInput;
}

export interface PlanInputReference {
  artifactPath: string;
  command: IntakeArtifact["command"];
  repoRoot: IntakeArtifact["repoRoot"];
  status: IntakeArtifact["status"];
  summary: IntakeArtifact["summary"];
  readyForPlanning: IntakeArtifact["next_step_readiness"]["ready"];
  inputMode: IntakeArtifact["input_mode"];
  sourceInputs: IntakeArtifact["source_inputs"];
  runtimeOptions: IntakeArtifact["runtime_options"];
  failure: IntakeArtifact["failure"];
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

export interface PlanPlanningContext {
  taskSpec: IntakeArtifact["task_spec"];
  repoContext: IntakeArtifact["repo_context"];
  candidateTargets: IntakeArtifact["candidate_targets"];
  riskAnalysis: IntakeArtifact["risk_analysis"];
  initialVerificationTargets: IntakeArtifact["initial_verification_targets"];
}

export interface PlanPlanningUncertainty {
  ambiguities: IntakeArtifact["ambiguities"];
  warnings: IntakeArtifact["warnings"];
  confidence: IntakeArtifact["confidence"];
  nextStepReadiness: IntakeArtifact["next_step_readiness"];
}

export interface PlanInputIssue {
  code: string;
  message: string;
}

export interface PlanInputUsability {
  status: "actionable" | "non_actionable" | "upstream_blocked";
  warningItems: PlanInputIssue[];
  blockingItems: PlanInputIssue[];
}

export interface PlanPlanningInput {
  context: PlanPlanningContext;
  uncertainty: PlanPlanningUncertainty;
  usability: PlanInputUsability;
}

export interface PlanArtifactCarryForward {
  task_spec: IntakeArtifact["task_spec"];
  repo_context: IntakeArtifact["repo_context"];
  candidate_targets: IntakeArtifact["candidate_targets"];
  risk_analysis: IntakeArtifact["risk_analysis"];
  initial_verification_targets: IntakeArtifact["initial_verification_targets"];
  ambiguities: IntakeArtifact["ambiguities"];
  warnings: IntakeArtifact["warnings"];
  confidence: IntakeArtifact["confidence"];
  next_step_readiness: IntakeArtifact["next_step_readiness"];
  concerns: PlanCarryForwardConcern[];
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

export interface PlanParallelizationSignalEntry {
  planItemId: string;
  signal: PlanParallelizationSignal;
  reason: string;
}

export interface PlanTestObligationEntry {
  planItemId: string;
  category: PlanTestObligationCategory;
  reason: string;
}

export interface PlanCarryForwardConcern {
  id: string;
  source: PlanCarryForwardConcernSource;
  code: string | null;
  message: string;
  planItemIds: string[];
  effects: PlanCarryForwardConcernEffect[];
  status: "carried_forward";
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

export interface PlanRequirementSignal {
  text: string;
  sources: PlanRequirementSource[];
}

export interface PlanItemSourceTrace {
  requirement: string;
  requirementSources: PlanRequirementSource[];
  matchedCandidateTargetPaths: string[];
  matchedVerificationTargetPaths: string[];
  matchedVerificationCategories: PlanVerificationCategory[];
  matchedRiskCodes: string[];
  carriesLowConfidence: boolean;
  carriesFallbackTargeting: boolean;
}

export interface PlanItemFoundation {
  id: string;
  clusterKey: string;
  title: string;
  description: string;
  category: Extract<PlanItemCategory, "config" | "interface" | "implementation" | "test">;
  sourceRequirements: string[];
  likelyAffectedPaths: string[];
  sourceTraces: PlanItemSourceTrace[];
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

export interface PlanSourceIntake {
  artifactPath: string;
  command: IntakeArtifact["command"];
  status: IntakeArtifact["status"];
  summary: IntakeArtifact["summary"];
  readyForPlanning: IntakeArtifact["next_step_readiness"]["ready"];
}

export interface PlanWritePolicy {
  mode: "output-root-only";
  repoReadOnlyOutsideOutputRoot: boolean;
  allowedRoot: string;
  allowedSideEffects: readonly string[];
  deferredCapabilities: readonly string[];
  disallowedCapabilities: readonly string[];
}

export interface PlanArtifactFiles {
  artifactPath: string | null;
  reportPath: string | null;
}

export interface PlanDependencyGraphEntry {
  planItemId: string;
  dependsOnPlanItemId: string;
  type: PlanDependencyType;
  reason: string;
}

export interface PlanConflictZone {
  id: string;
  title: string;
  reason: string;
  paths: string[];
  planItemIds: string[];
  riskLevel: PlanRiskLevel;
}

export interface PlanModel {
  planItems: PlanItem[];
  dependencyGraph: PlanDependencyGraphEntry[];
  conflictZones: PlanConflictZone[];
  testObligations: PlanTestObligationEntry[];
  parallelizationSignals: PlanParallelizationSignalEntry[];
  carryForwardConcerns: PlanCarryForwardConcern[];
}

export interface PlanAssistPlanItemEdit {
  id: string;
  title?: string;
  description?: string;
}

export interface PlanAssistDependencyEdit {
  planItemId: string;
  dependsOnPlanItemId: string;
  reason: string;
}

export interface PlanAssistConflictZoneEdit {
  id: string;
  reason: string;
}

export interface PlanAssistSuggestion {
  provider?: string;
  planItemEdits?: PlanAssistPlanItemEdit[];
  dependencyEdits?: PlanAssistDependencyEdit[];
  conflictZoneEdits?: PlanAssistConflictZoneEdit[];
  reportNotes?: string[];
}

export interface PlanAssistInput {
  foundation: PlanFoundationResult;
  model: PlanModel;
}

export type PlanningAssistHook =
  (input: PlanAssistInput) => Promise<PlanAssistSuggestion | null>;

export interface PlanAssistResolution {
  attempted: boolean;
  used: boolean;
  provider: string | null;
  warnings: string[];
  ignoredEdits: string[];
  reportNotes: string[];
}

export type PlanPlanningReadiness = IntakeArtifact["next_step_readiness"];

export interface PlanArtifact {
  schemaVersion: string;
  command: string;
  stage: string;
  status: PlanCommandStatus;
  purpose: string;
  repoRoot: string;
  requestedOutputRoot: string | null;
  outputRoot: string;
  writePolicy: PlanWritePolicy;
  files: PlanArtifactFiles;
  startedAt: string;
  finishedAt: string;
  summary: string;
  boundaryNotes: string[];
  source_intake: PlanSourceIntake;
  plan_item_contract: PlanItemContract;
  plan_items: PlanItem[];
  dependency_graph: PlanDependencyGraphEntry[];
  conflict_zones: PlanConflictZone[];
  test_obligations: PlanTestObligationEntry[];
  parallelization_signals: PlanParallelizationSignalEntry[];
  carry_forward: PlanArtifactCarryForward;
  planning_readiness: PlanPlanningReadiness;
  failure: PlanCommandFailure | null;
}

export interface PlanCommandFailure {
  code: string;
  message: string;
  fallbackReason?: string;
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
  planningInput: PlanPlanningInput;
  carryForward: PlanCarryForwardContext;
  boundaryPolicy: Step2BoundaryPolicy;
  planItemContract: PlanItemContract;
}

export interface PlanFoundationFailure {
  code: string;
  message: string;
}

export interface PlanCommandDependencies {
  planningAssistHook?: PlanningAssistHook;
}

export interface PlanFoundationCommandResult {
  status: PlanFoundationStatus;
  foundation: PlanFoundationResult | null;
  failure: PlanFoundationFailure | null;
}

export interface PlanCommandResult {
  status: PlanCommandStatus;
  artifact: PlanArtifact | null;
  artifactPath: string | null;
  reportPath: string | null;
  outputRoot: string | null;
  summary: string;
  failure: PlanCommandFailure | null;
}
