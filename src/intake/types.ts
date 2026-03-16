import type { Step1BoundaryPolicy } from "./constants.js";

export type IntakeStatus = "success" | "warning" | "failed";

export interface IntakeCommandOptions {
  repo?: string;
  outputDir?: string;
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
  failure: IntakeFailureDetails | null;
}
