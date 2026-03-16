import { z } from "zod";

import {
  FORGE_INTAKE_COMMAND,
  FORGE_SCHEMA_VERSION,
  STEP1_BOUNDARY_POLICY,
} from "./constants.js";
import { buildSummary, resolveIntakeStatus } from "./success.js";
import type {
  CandidateTarget,
  IntakeArtifact,
  IntakeExecutionContext,
  IntakeFailureDetails,
  IntakeTaskSpec,
  IntakeStatus,
  NextStepReadiness,
  RepoContext,
} from "./types.js";

const intakeArtifactSchema = z.object({
  schemaVersion: z.string().min(1),
  command: z.literal(`forge ${FORGE_INTAKE_COMMAND}`),
  stage: z.string().min(1),
  status: z.enum(["success", "warning", "failed"]),
  inputMode: z.enum(["spec", "prompt"]).nullable(),
  purpose: z.string().min(1),
  repoRoot: z.string().min(1),
  requestedOutputRoot: z.string().nullable(),
  outputRoot: z.string().min(1),
  writePolicy: z.object({
    mode: z.literal("output-root-only"),
    repoReadOnlyOutsideOutputRoot: z.boolean(),
    allowedRoot: z.string().min(1),
    allowedSideEffects: z.array(z.string().min(1)),
    deferredCapabilities: z.array(z.string().min(1)),
    disallowedCapabilities: z.array(z.string().min(1)),
  }),
  files: z.object({
    artifactPath: z.string().min(1),
    reportPath: z.string().min(1),
  }),
  startedAt: z.string().min(1),
  finishedAt: z.string().min(1),
  summary: z.string().min(1),
  taskSpec: z.object({
    inputMode: z.enum(["spec", "prompt"]).nullable(),
    specPath: z.string().nullable(),
    goal: z.string(),
    acceptanceCriteria: z.array(z.string().min(1)),
    hasAcceptanceCriteria: z.boolean(),
  }),
  repoContext: z.object({
    grounded: z.boolean(),
    sourceFiles: z.array(z.string().min(1)),
    testFiles: z.array(z.string().min(1)),
    manifestFiles: z.array(z.string().min(1)),
  }),
  candidateTargets: z.array(
    z.object({
      path: z.string().min(1),
      kind: z.enum(["source", "test", "manifest"]),
      matchType: z.enum(["explicit", "fallback"]),
      reason: z.string().min(1),
    }),
  ),
  ambiguities: z.array(z.string().min(1)),
  nextStepReadiness: z.object({
    ready: z.boolean(),
    blockingIssues: z.array(
      z.object({
        code: z.string().min(1),
        message: z.string().min(1),
      }),
    ),
    recommendedUserActions: z.array(z.string().min(1)),
  }),
  boundaryNotes: z.array(z.string().min(1)),
  warnings: z.array(z.string().min(1)),
  failure: z
    .object({
      code: z.string().min(1),
      message: z.string().min(1),
      fallbackReason: z.string().optional(),
    })
    .nullable(),
});

function buildBoundaryNotes(context: IntakeExecutionContext): string[] {
  return [
    "Intake is limited to repository inspection and artifact/report persistence.",
    "Later workflow steps are deferred; this run does not create plans, workstreams, execution packets, or code edits.",
    context.paths.usedFallbackRoot
      ? "The requested output directory was rejected and Forge fell back to the default .forge output root."
      : "All writes are confined to the resolved output root.",
  ];
}

export function createIntakeArtifact(params: {
  context: IntakeExecutionContext;
  finishedAt: string;
  taskSpec: IntakeTaskSpec;
  repoContext: RepoContext;
  candidateTargets: CandidateTarget[];
  ambiguities?: string[];
  nextStepReadiness: NextStepReadiness;
  warnings?: string[];
  failure?: IntakeFailureDetails | null;
}): IntakeArtifact {
  const warnings = params.warnings ?? [];
  const ambiguities = params.ambiguities ?? [];
  const failure = params.failure ?? null;
  const status = resolveIntakeStatus({
    failure,
    nextStepReadiness: params.nextStepReadiness,
    warnings,
    ambiguities,
  });

  const artifact: IntakeArtifact = {
    schemaVersion: FORGE_SCHEMA_VERSION,
    command: `forge ${FORGE_INTAKE_COMMAND}`,
    stage: STEP1_BOUNDARY_POLICY.stage,
    status,
    inputMode: params.taskSpec.inputMode,
    purpose: STEP1_BOUNDARY_POLICY.purpose,
    repoRoot: params.context.repoRoot,
    requestedOutputRoot: params.context.paths.requestedOutputRoot,
    outputRoot: params.context.paths.outputRoot,
    writePolicy: {
      mode: "output-root-only",
      repoReadOnlyOutsideOutputRoot:
        STEP1_BOUNDARY_POLICY.repoReadOnlyOutsideOutputRoot,
      allowedRoot: params.context.paths.outputRoot,
      allowedSideEffects: STEP1_BOUNDARY_POLICY.allowedSideEffects,
      deferredCapabilities: STEP1_BOUNDARY_POLICY.deferredCapabilities,
      disallowedCapabilities: STEP1_BOUNDARY_POLICY.disallowedCapabilities,
    },
    files: {
      artifactPath: params.context.paths.artifactPath,
      reportPath: params.context.paths.reportPath,
    },
    startedAt: params.context.startedAt,
    finishedAt: params.finishedAt,
    summary: buildSummary(status, params.nextStepReadiness),
    taskSpec: params.taskSpec,
    repoContext: params.repoContext,
    candidateTargets: params.candidateTargets,
    ambiguities,
    nextStepReadiness: params.nextStepReadiness,
    boundaryNotes: buildBoundaryNotes(params.context),
    warnings,
    failure,
  };

  return intakeArtifactSchema.parse(artifact);
}
