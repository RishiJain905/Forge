import type { Step1BoundaryPolicy } from "./constants.js";

export type IntakeStatus = "success" | "warning" | "failed";
export type IntakeInputMode = "spec" | "prompt";

export interface IntakeCommandOptions {
  repo?: string;
  outputDir?: string;
  spec?: string;
  prompt?: string;
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
  ambiguities: string[];
  recommendedUserActions: string[];
}

export interface IntakeTaskSpec {
  goal: string;
  acceptanceCriteria: string[];
  hasAcceptanceCriteria: boolean;
}

export interface RepoContext {
  grounded: boolean;
  sourceFiles: string[];
  testFiles: string[];
  manifestFiles: string[];
}

export interface CandidateTarget {
  path: string;
  kind: "source" | "test" | "manifest";
  matchType: "explicit" | "fallback";
  reason: string;
}

export interface BlockingIssue {
  code: string;
  message: string;
}

export interface NextStepReadiness {
  ready: boolean;
  blockingIssues: BlockingIssue[];
  recommendedUserActions: string[];
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
    artifactPath: string;
    reportPath: string;
  };
  startedAt: string;
  finishedAt: string;
  summary: string;
  taskSpec: IntakeTaskSpec;
  repoContext: RepoContext;
  candidateTargets: CandidateTarget[];
  ambiguities: string[];
  nextStepReadiness: NextStepReadiness;
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
