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
  "task_spec",
  "repo_context",
  "candidate_targets",
  "risk_analysis",
  "initial_verification_targets",
  "ambiguities",
  "confidence",
  "next_step_readiness",
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
    strict_focus: z.boolean(),
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
  task_spec: z.object({
    goal: z.string(),
    acceptance_criteria: z.array(z.string().min(1)),
    has_acceptance_criteria: z.boolean(),
  }),
  repo_context: z.object({
    grounded: z.boolean(),
    source_files: z.array(z.string().min(1)),
    test_files: z.array(z.string().min(1)),
    manifest_files: z.array(z.string().min(1)),
    git_context: z.object({
      status: z.enum(["available", "not_repo", "unavailable", "error"]),
      repo_root: z.string().min(1).nullable(),
      branch: z.string().min(1).nullable(),
      recent_files: z.array(z.string().min(1)),
    }),
  }),
  candidate_targets: z.array(
    z.object({
      path: z.string().min(1),
      kind: z.enum(["source", "test", "manifest"]),
      match_type: z.enum(["explicit", "fallback"]),
      reason: z.string().min(1),
    }),
  ),
  risk_analysis: z.object({
    initial_risk_zones: z.array(
      z.object({
        code: z.enum([
          "weak_repo_grounding",
          "unresolved_referenced_paths",
          "no_candidate_targets",
          "fallback_targeting_only",
          "no_tests_detected",
          "manifest_or_config_impact",
        ]),
        level: z.enum(["medium", "high"]),
        reason: z.string().min(1),
        evidence_paths: z.array(z.string().min(1)),
      }),
    ),
  }),
  initial_verification_targets: z.array(
    z.object({
      path: z.string().min(1),
      kind: z.enum(["source", "test", "manifest"]),
      reason: z.string().min(1),
    }),
  ),
  ambiguities: z.array(z.string().min(1)),
  confidence: z.object({
    level: z.enum(["high", "medium", "low"]),
    signals: z.object({
      task_parsing: z.enum(["strong", "partial", "weak"]),
      repo_inspection: z.enum(["strong", "partial", "weak"]),
      targeting: z.enum(["strong", "partial", "weak"]),
    }),
    reasons: z.array(z.string().min(1)),
  }),
  next_step_readiness: z.object({
    ready: z.boolean(),
    blocking_issues: z.array(
      z.object({
        code: z.string().min(1),
        message: z.string().min(1),
      }),
    ),
    recommended_user_actions: z.array(z.string().min(1)),
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
