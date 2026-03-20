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
  strictFocus?: boolean;
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
  strict_focus: boolean;
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

export interface Ambiguity {
  type:
    | "acceptance_criteria"
    | "scope"
    | "constraints"
    | "repo_alignment"
    | "input";
  severity: "low" | "medium" | "high";
  message: string;
}

export interface WarningItem {
  code: string;
  message: string;
}

export interface IntakePrimaryInput {
  path: string | null;
  rawText: string;
}

export interface LoadedIntakePrimaryInput extends IntakePrimaryInput {
  loaded: boolean;
}

export interface IntakeSupplementalInputs {
  notes: string[];
  constraints: string[];
  configPath: string | null;
  focusPaths: string[];
}

export interface LoadedIntakeSupplementalInputs extends IntakeSupplementalInputs {
  configLoaded: boolean;
  strictFocus: boolean;
}

export interface NormalizedTaskInput {
  inputMode: IntakeInputMode;
  primaryInput: IntakePrimaryInput;
  normalizedTaskText: string;
  parserInputText: string;
  notes: IntakeSupplementalInputs["notes"];
  constraints: IntakeSupplementalInputs["constraints"];
  configPath: IntakeSupplementalInputs["configPath"];
  focusPaths: IntakeSupplementalInputs["focusPaths"];
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
  ambiguityItems?: Ambiguity[];
  warningItems?: WarningItem[];
  ambiguities: string[];
  warnings: string[];
  recommendedUserActions: string[];
}

export interface ValidatedIntakeInputs {
  inputMode: IntakeInputMode;
  primaryInput: IntakePrimaryInput;
  supplementalInputs: IntakeSupplementalInputs;
  warnings: string[];
  recommendedUserActions: string[];
}

export interface LoadedIntakeSourceSelection {
  specProvided: boolean;
  promptProvided: boolean;
}

export interface LoadedIntakeInput {
  inputMode: IntakeInputMode;
  primaryInput: LoadedIntakePrimaryInput;
  supplementalInputs: LoadedIntakeSupplementalInputs;
  sourceSelection: LoadedIntakeSourceSelection;
}

export interface NormalizedTaskSpec {
  title?: string;
  summary?: string;
  goal: string;
  scope?: string[];
  acceptanceCriteria: string[];
  hasAcceptanceCriteria: boolean;
  explicitRequirements?: string[];
  implementationNecessities?: string[];
  constraints?: string[];
  mentionedPaths?: string[];
  mentionedTests?: string[];
  mentionedModules?: string[];
  riskyPhrases?: string[];
  openQuestions?: PromptOpenQuestion[];
}

export type IntakeTaskSpec = NormalizedTaskSpec;

export interface ArtifactTaskSpecSection {
  title: string;
  summary: string;
  goal: string;
  scope: string[];
  acceptance_criteria: string[];
  has_acceptance_criteria: boolean;
  explicit_requirements: string[];
  implementation_necessities: string[];
  constraints: string[];
  mentioned_paths: string[];
  mentioned_tests: string[];
  mentioned_modules: string[];
  risky_phrases: string[];
  open_questions: PromptOpenQuestion[];
}

export interface RepoContext {
  grounded: boolean;
  sourceFiles: string[];
  testFiles: string[];
  manifestFiles: string[];
  allFiles: string[];
  gitContext: GitContext;
  languages?: string[];
  frameworkHints?: string[];
  packageManager?: string | null;
  keyDirectories?: string[];
  entryPoints?: string[];
  testFrameworkHints?: string[];
  testCommandHints?: string[];
  ciHints?: string[];
  layoutSummary?: string;
}

export interface ArtifactRepoContextSection {
  grounded: boolean;
  source_files: string[];
  test_files: string[];
  manifest_files: string[];
  languages: string[];
  framework_hints: string[];
  package_manager: string | null;
  key_directories: string[];
  entry_points: string[];
  test_framework_hints: string[];
  test_command_hints: string[];
  ci_hints: string[];
  layout_summary: string;
  git_context: ArtifactGitContextSection;
}

export type GitContextStatus = "available" | "not_repo" | "unavailable" | "error";

export interface RepoScanSignals {
  sourceFileCount: number;
  testFileCount: number;
  manifestFileCount: number;
  repoLooksSparse: boolean;
  languages?: string[];
  packageManager?: string | null;
  frameworkHints?: string[];
  testFrameworkHints?: string[];
  keyDirectories?: string[];
  entryPoints?: string[];
  layoutSummary?: string;
  testCommandHints?: string[];
  ciHints?: string[];
}

export interface GitContext {
  status: GitContextStatus;
  repoRoot: string | null;
  branch: string | null;
  recentFiles: string[];
}

export interface ArtifactGitContextSection {
  status: GitContextStatus;
  repo_root: string | null;
  branch: string | null;
  recent_files: string[];
}

export interface RepoScanResult {
  repoContext: RepoContext;
  signals: RepoScanSignals;
  warnings: string[];
}

export interface CandidateTarget {
  path: string;
  kind: "source" | "test" | "manifest";
  matchType: "explicit" | "fallback";
  reason: string;
  notes?: string[];
  sharedRisk?: boolean;
}

export type CandidateTargets = CandidateTarget[];

export interface CandidateTargetingOptions {
  focusPaths: string[];
  strictFocus: boolean;
  moduleSignals?: string[];
}

export interface CandidateTargetingSignals {
  focusApplied: boolean;
  strictFocusApplied: boolean;
  focusMatchedTargetCount: number;
  outOfFocusTargetCount: number;
}

export interface CandidateTargetingResolution {
  candidateTargets: CandidateTarget[];
  warnings: string[];
  signals: CandidateTargetingSignals;
}

export interface ArtifactCandidateTargetSectionItem {
  path: string;
  kind: CandidateTarget["kind"];
  match_type: CandidateTarget["matchType"];
  reason: string;
  notes: string[];
  shared_risk: boolean;
}

export interface VerificationTarget {
  path: string;
  kind: CandidateTarget["kind"];
  category?:
    | "code_surface"
    | "test_surface"
    | "config_surface"
    | "retry_logic"
    | "ownership"
    | "api_contract"
    | "migration_order"
    | "parallel_overlap"
    | "stale_write";
  reason: string;
}

export type InitialVerificationTarget = VerificationTarget;

export interface ArtifactInitialVerificationTargetSectionItem {
  path: string;
  kind: InitialVerificationTarget["kind"];
  category: InitialVerificationTarget["category"] | null;
  reason: string;
}

export interface ArtifactAnalysisRiskZone {
  code: AnalysisRiskZoneCode;
  level: "medium" | "high";
  reason: string;
  evidence_paths: string[];
}

export interface ArtifactAmbiguityItem {
  type: Ambiguity["type"];
  severity: Ambiguity["severity"];
  message: string;
}

export interface ArtifactWarningItem {
  code: string;
  message: string;
}

export interface InferenceResult {
  candidateTargets: CandidateTarget[];
  inferredRequirements: string[];
  signals: {
    explicitTargetCount: number;
    usedFallbackTargets: boolean;
    inferredRequirementCount: number;
    focusApplied?: boolean;
    strictFocusApplied?: boolean;
    focusMatchedTargetCount?: number;
    outOfFocusTargetCount?: number;
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

export interface GitCommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

export type GitCommandRunner = (
  args: string[],
  cwd: string,
) => Promise<GitCommandResult>;

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
  gitCommandRunner?: GitCommandRunner;
}

export interface ResolvedIntakeInput {
  inputMode: IntakeInputMode;
  sourceSelection: LoadedIntakeSourceSelection;
  primaryInput: LoadedIntakePrimaryInput;
  supplementalInputs: LoadedIntakeSupplementalInputs;
  normalizedTaskInput: NormalizedTaskInput | null;
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
  strictFocus: boolean;
  failOnLowConfidence: boolean;
  blockingIssues: BlockingIssue[];
  warnings: string[];
  recommendedUserActions: string[];
}

export interface AmbiguityAnalysisResult {
  ambiguities: string[];
  ambiguityItems?: Ambiguity[];
  warnings: string[];
  warningItems?: WarningItem[];
  recommendedUserActions: string[];
  confidence: ConfidenceSummary;
}

export type ArtifactRiskZoneCode =
  | "weak_repo_grounding"
  | "unresolved_referenced_paths"
  | "no_candidate_targets"
  | "fallback_targeting_only"
  | "no_tests_detected"
  | "manifest_or_config_impact";

export type AnalysisRiskZoneCode =
  | ArtifactRiskZoneCode
  | "migration_risk"
  | "api_compatibility_risk"
  | "coordination_overlap_risk"
  | "test_strategy_risk";

export interface ArtifactRiskZone {
  code: ArtifactRiskZoneCode;
  level: "medium" | "high";
  reason: string;
  evidence_paths: string[];
}

export interface RiskZone {
  code: ArtifactRiskZoneCode;
  level: "medium" | "high";
  reason: string;
  evidencePaths: string[];
}

export interface AnalysisRiskZone {
  code: AnalysisRiskZoneCode;
  level: "medium" | "high";
  reason: string;
  evidencePaths: string[];
}

export interface RiskAnalysis {
  initialRiskZones: RiskZone[];
  typedRiskZones?: AnalysisRiskZone[];
}

export interface ArtifactRiskAnalysisSection {
  initial_risk_zones: ArtifactRiskZone[];
  derived_risk_zones: ArtifactAnalysisRiskZone[];
  supporting_analysis: {
    ambiguity_items: ArtifactAmbiguityItem[];
    warning_items: ArtifactWarningItem[];
  };
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

export interface ConfidenceSummary {
  level: IntakeConfidenceLevel;
  signals: {
    taskParsing: IntakeConfidenceSignalStrength;
    repoInspection: IntakeConfidenceSignalStrength;
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
  taskSpec: NormalizedTaskSpec;
  repoContext: RepoContext;
  candidateTargets: CandidateTarget[];
  riskAnalysis?: RiskAnalysis;
  verificationTargets?: VerificationTarget[];
  ambiguities: string[];
  warnings: string[];
  recommendedUserActions: string[];
  confidence: ConfidenceSummary;
}

export interface BoundarySafeIntakeResult {
  taskSpec: NormalizedTaskSpec;
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

export interface IntakeRunResult {
  status: IntakeStatus;
  artifact: IntakeArtifact | null;
  artifactPath: string | null;
  reportPath: string | null;
  outputRoot: string | null;
  summary: string;
  nextStepReadiness: NextStepReadiness | null;
  failure: IntakeFailureDetails | null;
}

export type IntakeCommandResult = IntakeRunResult;

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
    strictFocus: boolean;
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
    taskSpec: NormalizedTaskSpec;
    repoContext: RepoContext;
    candidateTargets: CandidateTarget[];
    riskAnalysis?: RiskAnalysis;
    verificationTargets?: VerificationTarget[];
    ambiguities: string[];
    warnings: string[];
    recommendedUserActions: string[];
    confidence: ConfidenceSummary;
  };
  optionalReasoning: OptionalReasoningResolution;
  boundarySafeResult: BoundarySafeIntakeResult;
  nextStepReadiness: NextStepReadiness;
  failure: IntakeFailureDetails | null;
}
