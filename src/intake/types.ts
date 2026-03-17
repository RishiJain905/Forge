import type { Step1BoundaryPolicy } from "./constants.js";

export type IntakeStatus = "success" | "warning" | "failed";
export type IntakeInputMode = "spec" | "prompt";
export type IntakeOutputMode = "default" | "json-only" | "report-only";
export type IntakeLlmMode = "deterministic" | "assist";
export type IntakeConfidenceLevel = "high" | "medium" | "low";
export type IntakeConfidenceSignalStrength = "strong" | "partial" | "weak";

export interface IntakeCommandOptions {
  repo?: string;
  outputDir?: string;
  spec?: string;
  prompt?: string;
  notes?: string;
  constraints?: string;
  config?: string;
  focus?: string[];
  jsonOnly?: boolean;
  reportOnly?: boolean;
  llmAssist?: boolean;
  noLlm?: boolean;
  failOnLowConfidence?: boolean;
}

export interface ArtifactSourceInputs {
  input_mode: IntakeInputMode;
  primary_input: {
    path: string | null;
    raw_text: string;
  };
  normalized_task_text: string;
  notes: string[];
  constraints: string[];
  config_path: string | null;
  focus_paths: string[];
}

export interface ArtifactRuntimeOptions {
  output_mode: IntakeOutputMode;
  llm_mode: IntakeLlmMode;
  fail_on_low_confidence: boolean;
}

export interface PromptRequirementCandidate {
  text: string;
  source: "acceptance-criteria" | "prompt-clause";
}

export interface PromptOpenQuestion {
  category: "acceptance_criteria" | "scope" | "constraints" | "repo_alignment";
  text: string;
}

export interface PromptDetails {
  title: string;
  goal: string;
  summary: string;
  requirementCandidates: PromptRequirementCandidate[];
  openQuestions: PromptOpenQuestion[];
}

export interface NormalizedTaskInput {
  inputMode: IntakeInputMode;
  primaryInput: {
    path: string | null;
    rawText: string;
  };
  normalizedTaskText: string;
  parserInputText: string;
  notes: string[];
  constraints: string[];
  configPath: string | null;
  focusPaths: string[];
  ambiguities: string[];
  recommendedUserActions: string[];
  promptDetails?: PromptDetails;
}

export interface TaskParserResult {
  taskSpec: IntakeTaskSpec;
  signals: {
    hasGoal: boolean;
    hasAcceptanceCriteria: boolean;
    referencedPaths: string[];
    promptIsThin: boolean;
    promptRequirementCandidateCount: number;
    promptOpenQuestionCategories: PromptOpenQuestion["category"][];
  };
  ambiguities: string[];
  warnings: string[];
  recommendedUserActions: string[];
}

export interface ValidatedIntakeInputs {
  inputMode: IntakeInputMode;
  primaryInput: {
    path: string | null;
    rawText: string;
  };
  notes: string[];
  constraints: string[];
  configPath: string | null;
  focusPaths: string[];
  warnings: string[];
  recommendedUserActions: string[];
}

export interface IntakeTaskSpec {
  goal: string;
  acceptanceCriteria: string[];
  hasAcceptanceCriteria: boolean;
}

export interface ArtifactTaskSpecSection {
  goal: string;
  acceptance_criteria: string[];
  has_acceptance_criteria: boolean;
}

export interface RepoContext {
  grounded: boolean;
  sourceFiles: string[];
  testFiles: string[];
  manifestFiles: string[];
  allFiles: string[];
}

export interface ArtifactRepoContextSection {
  grounded: boolean;
  source_files: string[];
  test_files: string[];
  manifest_files: string[];
}

export interface RepoScanResult {
  repoContext: RepoContext;
  signals: {
    sourceFileCount: number;
    testFileCount: number;
    manifestFileCount: number;
    repoLooksSparse: boolean;
  };
  warnings: string[];
}

export interface CandidateTarget {
  path: string;
  kind: "source" | "test" | "manifest";
  matchType: "explicit" | "fallback";
  reason: string;
}

export interface ArtifactCandidateTargetSectionItem {
  path: string;
  kind: CandidateTarget["kind"];
  match_type: CandidateTarget["matchType"];
  reason: string;
}

export interface InitialVerificationTarget {
  path: string;
  kind: CandidateTarget["kind"];
  reason: string;
}

export interface ArtifactInitialVerificationTargetSectionItem {
  path: string;
  kind: InitialVerificationTarget["kind"];
  reason: string;
}

export interface InferenceResult {
  candidateTargets: CandidateTarget[];
  inferredRequirements: string[];
  signals: {
    explicitTargetCount: number;
    usedFallbackTargets: boolean;
    inferredRequirementCount: number;
  };
  warnings: string[];
}

export interface BlockingIssue {
  code: string;
  message: string;
}

export interface OptionalReasoningSuggestion {
  provider: string;
  ambiguities?: string[];
  warnings?: string[];
  recommendedUserActions?: string[];
  confidenceNotes?: string[];
  suggestedTargetPaths?: string[];
}

export interface OptionalReasoningInput {
  taskInput: NormalizedTaskInput | null;
  taskParserResult: TaskParserResult;
  repoScanResult: RepoScanResult;
  inferenceResult: InferenceResult;
}

export type OptionalReasoningHook =
  (input: OptionalReasoningInput) => Promise<OptionalReasoningSuggestion | null>;

export interface OptionalReasoningResolution {
  requested: boolean;
  attempted: boolean;
  used: boolean;
  available: boolean;
  provider: string | null;
  ambiguities: string[];
  warnings: string[];
  recommendedUserActions: string[];
  confidenceNotes: string[];
  suggestedTargetPaths: string[];
  ignoredTargetPaths: string[];
}

export interface IntakeRunnerDependencies {
  optionalReasoningHook?: OptionalReasoningHook;
}

export interface IntakeValidationResult {
  validatedInput: ValidatedIntakeInputs | null;
  blockingIssues: BlockingIssue[];
  warnings: string[];
  recommendedUserActions: string[];
}

export interface ResolvedRuntimeOptions {
  outputMode: IntakeOutputMode;
  writeArtifact: boolean;
  writeReport: boolean;
  writeDebugArtifact: boolean;
  llmMode: IntakeLlmMode;
  failOnLowConfidence: boolean;
  blockingIssues: BlockingIssue[];
  warnings: string[];
  recommendedUserActions: string[];
}

export interface AmbiguityAnalysisResult {
  ambiguities: string[];
  warnings: string[];
  recommendedUserActions: string[];
  confidence: {
    level: IntakeConfidenceLevel;
    signals: {
      taskParsing: IntakeConfidenceSignalStrength;
      repoInspection: IntakeConfidenceSignalStrength;
      targeting: IntakeConfidenceSignalStrength;
    };
    reasons: string[];
  };
}

export type ArtifactRiskZoneCode =
  | "weak_repo_grounding"
  | "unresolved_referenced_paths"
  | "no_candidate_targets"
  | "fallback_targeting_only"
  | "no_tests_detected"
  | "manifest_or_config_impact";

export interface ArtifactRiskZone {
  code: ArtifactRiskZoneCode;
  level: "medium" | "high";
  reason: string;
  evidence_paths: string[];
}

export interface ArtifactRiskAnalysisSection {
  initial_risk_zones: ArtifactRiskZone[];
}

export interface ArtifactConfidenceSection {
  level: IntakeConfidenceLevel;
  signals: {
    task_parsing: IntakeConfidenceSignalStrength;
    repo_inspection: IntakeConfidenceSignalStrength;
    targeting: IntakeConfidenceSignalStrength;
  };
  reasons: string[];
}

export interface AssembledIntakeResult {
  responsibilities: {
    taskParser: TaskParserResult;
    repoScan: RepoScanResult;
    inference: InferenceResult;
    analysis: AmbiguityAnalysisResult;
  };
  taskSpec: IntakeTaskSpec;
  repoContext: RepoContext;
  candidateTargets: CandidateTarget[];
  ambiguities: string[];
  warnings: string[];
  recommendedUserActions: string[];
  confidence: AmbiguityAnalysisResult["confidence"];
}

export interface BoundarySafeIntakeResult {
  taskSpec: IntakeTaskSpec;
  repoContext: RepoContext;
  candidateTargets: CandidateTarget[];
  initialVerificationTargets: InitialVerificationTarget[];
  ambiguities: string[];
  warnings: string[];
  recommendedUserActions: string[];
  boundaryNotes: string[];
}

export interface NextStepReadiness {
  ready: boolean;
  blockingIssues: BlockingIssue[];
  recommendedUserActions: string[];
}

export interface ArtifactNextStepReadinessSection {
  ready: boolean;
  blocking_issues: BlockingIssue[];
  recommended_user_actions: string[];
}

export interface ResolvedOutputRoot {
  requestedOutputRoot: string | null;
  outputRoot: string;
  usedFallbackRoot: boolean;
  fallbackReason: string | null;
}

export interface ResolvedOutputPaths extends ResolvedOutputRoot {
  artifactPath: string;
  reportPath: string;
  debugArtifactPath: string;
}

export interface IntakeExecutionContext {
  command: "intake";
  repoRoot: string;
  startedAt: string;
  boundaryPolicy: Step1BoundaryPolicy;
  paths: ResolvedOutputPaths;
}

export interface IntakeFailureDetails {
  code: string;
  message: string;
  fallbackReason?: string;
}

export interface IntakeArtifact {
  schemaVersion: string;
  command: string;
  stage: string;
  status: IntakeStatus;
  input_mode: IntakeInputMode | null;
  source_inputs: ArtifactSourceInputs | null;
  runtime_options: ArtifactRuntimeOptions;
  purpose: string;
  repoRoot: string;
  requestedOutputRoot: string | null;
  outputRoot: string;
  writePolicy: {
    mode: "output-root-only";
    repoReadOnlyOutsideOutputRoot: boolean;
    allowedRoot: string;
    allowedSideEffects: readonly string[];
    deferredCapabilities: readonly string[];
    disallowedCapabilities: readonly string[];
  };
  files: {
    artifactPath: string | null;
    reportPath: string | null;
  };
  startedAt: string;
  finishedAt: string;
  summary: string;
  task_spec: ArtifactTaskSpecSection;
  repo_context: ArtifactRepoContextSection;
  candidate_targets: ArtifactCandidateTargetSectionItem[];
  risk_analysis: ArtifactRiskAnalysisSection;
  initial_verification_targets: ArtifactInitialVerificationTargetSectionItem[];
  ambiguities: string[];
  confidence: ArtifactConfidenceSection;
  next_step_readiness: ArtifactNextStepReadinessSection;
  boundaryNotes: string[];
  warnings: string[];
  failure: IntakeFailureDetails | null;
}

export interface IntakeCommandResult {
  status: IntakeStatus;
  artifact: IntakeArtifact | null;
  artifactPath: string | null;
  reportPath: string | null;
  outputRoot: string | null;
  summary: string;
  nextStepReadiness: NextStepReadiness | null;
  failure: IntakeFailureDetails | null;
}

export interface IntakeDebugArtifact {
  command: string;
  repoRoot: string;
  requestedOutputRoot: string | null;
  outputRoot: string;
  runtimeOptions: {
    outputMode: IntakeOutputMode;
    writeArtifact: boolean;
    writeReport: boolean;
    writeDebugArtifact: boolean;
    llmMode: IntakeLlmMode;
    failOnLowConfidence: boolean;
  };
  paths: {
    artifactPath: string;
    reportPath: string;
    debugArtifactPath: string;
  };
  sourceInputs: ArtifactSourceInputs | null;
  responsibilities: AssembledIntakeResult["responsibilities"];
  assembledResult: {
    taskSpec: IntakeTaskSpec;
    repoContext: RepoContext;
    candidateTargets: CandidateTarget[];
    ambiguities: string[];
    warnings: string[];
    recommendedUserActions: string[];
    confidence: AmbiguityAnalysisResult["confidence"];
  };
  optionalReasoning: OptionalReasoningResolution;
  boundarySafeResult: BoundarySafeIntakeResult;
  nextStepReadiness: NextStepReadiness;
  failure: IntakeFailureDetails | null;
}
