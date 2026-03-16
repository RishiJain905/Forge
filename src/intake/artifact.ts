import { z } from "zod";

import {
  FORGE_INTAKE_COMMAND,
  FORGE_SCHEMA_VERSION,
  STEP1_BOUNDARY_POLICY,
} from "./constants.js";
import type {
  IntakeArtifact,
  IntakeExecutionContext,
  IntakeFailureDetails,
  IntakeStatus,
} from "./types.js";

const intakeArtifactSchema = z.object({
  schemaVersion: z.string().min(1),
  command: z.literal(`forge ${FORGE_INTAKE_COMMAND}`),
  stage: z.string().min(1),
  status: z.enum(["success", "warning", "failed"]),
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

export function resolveStatus(
  warnings: string[],
  failure: IntakeFailureDetails | null,
): IntakeStatus {
  if (failure) {
    return "failed";
  }

  if (warnings.length > 0) {
    return "warning";
  }

  return "success";
}

function buildBoundaryNotes(context: IntakeExecutionContext): string[] {
  return [
    "Intake is limited to repository inspection and artifact/report persistence.",
    "Later workflow steps are deferred; this run does not create plans, workstreams, execution packets, or code edits.",
    context.paths.usedFallbackRoot
      ? "The requested output directory was rejected and Forge fell back to the default .forge output root."
      : "All writes are confined to the resolved output root.",
  ];
}

function buildSummary(status: IntakeStatus): string {
  if (status === "failed") {
    return "Forge intake stopped safely and persisted a failure result when a safe output root was available.";
  }

  if (status === "warning") {
    return "Forge intake completed with warnings but stayed within the Step 1 boundary.";
  }

  return "Forge intake completed within the Step 1 boundary and persisted its artifact and report.";
}

export function createIntakeArtifact(params: {
  context: IntakeExecutionContext;
  finishedAt: string;
  warnings?: string[];
  failure?: IntakeFailureDetails | null;
}): IntakeArtifact {
  const warnings = params.warnings ?? [];
  const failure = params.failure ?? null;
  const status = resolveStatus(warnings, failure);

  const artifact: IntakeArtifact = {
    schemaVersion: FORGE_SCHEMA_VERSION,
    command: `forge ${FORGE_INTAKE_COMMAND}`,
    stage: STEP1_BOUNDARY_POLICY.stage,
    status,
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
    summary: buildSummary(status),
    boundaryNotes: buildBoundaryNotes(params.context),
    warnings,
    failure,
  };

  return intakeArtifactSchema.parse(artifact);
}
