import { z } from "zod";

import {
  FORGE_INTAKE_COMMAND,
  FORGE_SCHEMA_VERSION,
  STEP1_BOUNDARY_POLICY,
} from "./constants.js";
import type { IntakeArtifact } from "./types.js";

export const INTAKE_ARTIFACT_TOP_LEVEL_KEYS = [
  "schemaVersion",
  "command",
  "stage",
  "status",
  "input_mode",
  "source_inputs",
  "runtime_options",
  "purpose",
  "repoRoot",
  "requestedOutputRoot",
  "outputRoot",
  "writePolicy",
  "files",
  "startedAt",
  "finishedAt",
  "summary",
  "taskSpec",
  "repoContext",
  "candidateTargets",
  "initialVerificationTargets",
  "ambiguities",
  "nextStepReadiness",
  "boundaryNotes",
  "warnings",
  "failure",
] as const satisfies readonly (keyof IntakeArtifact)[];

export const intakeArtifactSchema = z.object({
  schemaVersion: z.literal(FORGE_SCHEMA_VERSION),
  command: z.literal(`forge ${FORGE_INTAKE_COMMAND}`),
  stage: z.literal(STEP1_BOUNDARY_POLICY.stage),
  status: z.enum(["success", "warning", "failed"]),
  input_mode: z.enum(["spec", "prompt"]).nullable(),
  source_inputs: z
    .object({
      input_mode: z.enum(["spec", "prompt"]),
      primary_input: z.object({
        path: z.string().nullable(),
        raw_text: z.string().min(1),
      }),
      normalized_task_text: z.string().min(1),
      notes: z.array(z.string()),
      constraints: z.array(z.string()),
      config_path: z.string().nullable(),
      focus_paths: z.array(z.string()),
    })
    .nullable(),
  runtime_options: z.object({
    output_mode: z.enum(["default", "json-only", "report-only"]),
    llm_mode: z.enum(["deterministic", "assist"]),
    fail_on_low_confidence: z.boolean(),
  }),
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
    artifactPath: z.string().min(1).nullable(),
    reportPath: z.string().min(1).nullable(),
  }),
  startedAt: z.string().min(1),
  finishedAt: z.string().min(1),
  summary: z.string().min(1),
  taskSpec: z.object({
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
  initialVerificationTargets: z.array(
    z.object({
      path: z.string().min(1),
      kind: z.enum(["source", "test", "manifest"]),
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
}).strict();

export function validateIntakeArtifact(artifact: unknown): IntakeArtifact {
  return intakeArtifactSchema.parse(artifact);
}
