import { z } from "zod";

import { planArtifactSchema } from "../plan/schema.js";
import { verifyArtifactSchema } from "../verify/schema.js";
import type { SplitFoundationResult } from "./types.js";
import {
  FORGE_SPLIT_COMMAND,
  FORGE_SPLIT_STAGE,
  SPLIT_CONSTRAINT_SOURCES,
  SPLIT_INPUT_TOO_WEAK,
  SPLIT_STREAM_CATEGORIES,
  SPLIT_WORKSTREAM_REQUIRED_FIELDS,
  STEP4_BOUNDARY_POLICY,
} from "./constants.js";

const splitInputIssueSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
}).strict();

const splitVerifyReferenceSchema = z.object({
  artifactPath: z.string().min(1),
  command: verifyArtifactSchema.shape.command,
  repoRoot: verifyArtifactSchema.shape.repoRoot,
  status: verifyArtifactSchema.shape.status,
  summary: verifyArtifactSchema.shape.summary,
  readyForSplit: verifyArtifactSchema.shape.verification_readiness.shape.ready,
  verificationDiagnostics: verifyArtifactSchema.shape.verification_diagnostics,
  verificationReadinessStatus: verifyArtifactSchema.shape.verification_readiness.shape.status,
  verificationReadiness: verifyArtifactSchema.shape.verification_readiness,
  failure: verifyArtifactSchema.shape.failure,
}).strict();

const splitPlanReferenceSchema = z.object({
  artifactPath: z.string().min(1),
  command: planArtifactSchema.shape.command,
  repoRoot: planArtifactSchema.shape.repoRoot,
  status: planArtifactSchema.shape.status,
  summary: planArtifactSchema.shape.summary,
  readyForVerification: planArtifactSchema.shape.planning_readiness.shape.ready,
  planningDiagnostics: planArtifactSchema.shape.planning_diagnostics,
  planningReadiness: planArtifactSchema.shape.planning_readiness,
  failure: planArtifactSchema.shape.failure,
}).strict();

const splitPlanningInputSchema = z.object({
  context: z.object({
    planItemContract: planArtifactSchema.shape.plan_item_contract,
    planItems: planArtifactSchema.shape.plan_items,
    dependencyGraph: planArtifactSchema.shape.dependency_graph,
    conflictZones: planArtifactSchema.shape.conflict_zones,
    testObligations: planArtifactSchema.shape.test_obligations,
    parallelizationSignals: planArtifactSchema.shape.parallelization_signals,
    verificationTargetContract: verifyArtifactSchema.shape.verification_target_contract,
    formalLaneContract: verifyArtifactSchema.shape.formal_lane_contract,
    verificationTargets: verifyArtifactSchema.shape.verification_targets,
    verificationCases: verifyArtifactSchema.shape.verification_cases,
    findings: verifyArtifactSchema.shape.findings,
    constraints: verifyArtifactSchema.shape.constraints,
  }).strict(),
  uncertainty: z.object({
    sourceIntake: planArtifactSchema.shape.source_intake,
    planCarryForward: planArtifactSchema.shape.carry_forward,
    planningDiagnostics: planArtifactSchema.shape.planning_diagnostics,
    planningReadiness: planArtifactSchema.shape.planning_readiness,
    verifyCarryForward: verifyArtifactSchema.shape.carry_forward,
    verificationDiagnostics: verifyArtifactSchema.shape.verification_diagnostics,
    verificationReadiness: verifyArtifactSchema.shape.verification_readiness,
  }).strict(),
  usability: z.object({
    status: z.enum(["actionable", "non_actionable", "upstream_blocked"]),
    warningItems: z.array(splitInputIssueSchema),
    blockingItems: z.array(splitInputIssueSchema),
  }).strict(),
}).strict();

const splitCarryForwardContextSchema = z.object({
  sourceIntake: planArtifactSchema.shape.source_intake,
  planCarryForward: planArtifactSchema.shape.carry_forward,
  planningDiagnostics: planArtifactSchema.shape.planning_diagnostics,
  planningReadiness: planArtifactSchema.shape.planning_readiness,
  verifyCarryForward: verifyArtifactSchema.shape.carry_forward,
  verificationDiagnostics: verifyArtifactSchema.shape.verification_diagnostics,
  verificationReadiness: verifyArtifactSchema.shape.verification_readiness,
}).strict();

const splitBoundaryPolicySchema = z.object({
  command: z.literal(`forge ${FORGE_SPLIT_COMMAND}`),
  stage: z.literal(FORGE_SPLIT_STAGE),
  purpose: z.string().min(1),
  authoritativeInputs: z.array(z.string().min(1)).min(1),
  deterministicFirst: z.literal(true),
  conservativeRegrouping: z.literal(true),
  deterministicFirstNotes: z.array(z.string().min(1)).min(1),
  conservativeRegroupingNotes: z.array(z.string().min(1)).min(1),
  allowedSideEffects: z.array(z.string().min(1)).min(1),
  deferredCapabilities: z.array(z.string().min(1)).min(1),
  disallowedCapabilities: z.array(z.string().min(1)).min(1),
}).strict();

const splitWorkstreamContractSchema = z.object({
  requiredFields: z.array(z.enum(SPLIT_WORKSTREAM_REQUIRED_FIELDS)).min(1),
  categories: z.array(z.enum(SPLIT_STREAM_CATEGORIES)).min(1),
  constraintSources: z.array(z.enum(SPLIT_CONSTRAINT_SOURCES)).min(1),
}).strict();

export const splitFoundationSchema = z.object({
  command: z.literal(`forge ${FORGE_SPLIT_COMMAND}`),
  stage: z.literal(FORGE_SPLIT_STAGE),
  purpose: z.string().min(1),
  deterministicFirst: z.object({
    enforced: z.literal(true),
    authoritativeInputs: z.array(z.string().min(1)).min(1),
    notes: z.array(z.string().min(1)).min(1),
  }).strict(),
  sourceVerify: splitVerifyReferenceSchema,
  sourcePlan: splitPlanReferenceSchema,
  splitInput: splitPlanningInputSchema,
  carryForward: splitCarryForwardContextSchema,
  boundaryPolicy: splitBoundaryPolicySchema,
  workstreamContract: splitWorkstreamContractSchema,
}).strict().superRefine((value, context) => {
  if (value.boundaryPolicy.command !== STEP4_BOUNDARY_POLICY.command) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Boundary policy command drifted from the Step 4 contract.",
      path: ["boundaryPolicy", "command"],
    });
  }

  if (value.sourceVerify.readyForSplit && value.splitInput.usability.status === "upstream_blocked") {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Split input cannot be upstream_blocked when Step 3 marked the handoff ready for split.",
      path: ["splitInput", "usability", "status"],
    });
  }

  if (!value.sourceVerify.readyForSplit && value.splitInput.usability.status === "actionable") {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Blocked Step 3 handoffs must stay blocked in the normalized split-input usability state.",
      path: ["splitInput", "usability", "status"],
    });
  }

  if (
    value.splitInput.usability.status === "non_actionable" &&
    value.splitInput.usability.blockingItems.every((item) => item.code !== SPLIT_INPUT_TOO_WEAK)
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Non-actionable split input must expose SPLIT_INPUT_TOO_WEAK.",
      path: ["splitInput", "usability", "blockingItems"],
    });
  }
});

export function validateSplitFoundationResult(result: unknown): SplitFoundationResult {
  return splitFoundationSchema.parse(result);
}
