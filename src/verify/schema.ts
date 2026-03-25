import { z } from "zod";

import type {
  VerifyFormalLaneContract,
  VerifyFoundationResult,
  VerifyTargetContract,
} from "./types.js";
import {
  FORGE_VERIFY_COMMAND,
  FORGE_VERIFY_STAGE,
  STEP3_BOUNDARY_POLICY,
  VERIFY_FORMAL_ENTRY_CRITERIA,
  VERIFY_FORMAL_FOCUS_AREAS,
  VERIFY_FORMAL_TOOLING,
  VERIFY_STATE_MODEL_REQUIRED_FIELDS,
  VERIFY_STRUCTURAL_FOCUS_AREAS,
  VERIFY_SUPPORTED_LANES,
  VERIFY_TARGET_REQUIRED_FIELDS,
  VERIFY_TARGET_RISK_SOURCES,
  VERIFY_TLC_STATUSES,
} from "./constants.js";
import { planArtifactSchema } from "../plan/schema.js";

const verifyInputIssueSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
}).strict();

const verifyPlanReferenceSchema = z.object({
  artifactPath: z.string().min(1),
  command: planArtifactSchema.shape.command,
  repoRoot: planArtifactSchema.shape.repoRoot,
  status: planArtifactSchema.shape.status,
  summary: planArtifactSchema.shape.summary,
  readyForVerification: planArtifactSchema.shape.planning_readiness.shape.ready,
  planningReadinessStatus: planArtifactSchema.shape.planning_readiness.shape.status,
  failure: planArtifactSchema.shape.failure,
}).strict();

const verifyPlanningInputSchema = z.object({
  context: z.object({
    planItemContract: planArtifactSchema.shape.plan_item_contract,
    planItems: planArtifactSchema.shape.plan_items,
    dependencyGraph: planArtifactSchema.shape.dependency_graph,
    conflictZones: planArtifactSchema.shape.conflict_zones,
    testObligations: planArtifactSchema.shape.test_obligations,
    parallelizationSignals: planArtifactSchema.shape.parallelization_signals,
  }).strict(),
  uncertainty: z.object({
    carryForward: planArtifactSchema.shape.carry_forward,
    planningDiagnostics: planArtifactSchema.shape.planning_diagnostics,
    planningReadiness: planArtifactSchema.shape.planning_readiness,
  }).strict(),
  usability: z.object({
    status: z.enum(["actionable", "non_actionable", "upstream_blocked"]),
    warningItems: z.array(verifyInputIssueSchema),
    blockingItems: z.array(verifyInputIssueSchema),
  }).strict(),
}).strict();

const verifyCarryForwardContextSchema = z.object({
  sourceIntake: planArtifactSchema.shape.source_intake,
  carryForward: planArtifactSchema.shape.carry_forward,
  planningDiagnostics: planArtifactSchema.shape.planning_diagnostics,
  planningReadiness: planArtifactSchema.shape.planning_readiness,
}).strict();

const verifyFormalLanePolicySchema = z.object({
  tooling: z.array(z.enum(VERIFY_FORMAL_TOOLING)).min(1),
  focusAreas: z.array(z.enum(VERIFY_FORMAL_FOCUS_AREAS)).min(1),
  entryCriteria: z.array(z.enum(VERIFY_FORMAL_ENTRY_CRITERIA)).min(1),
  stateModelRequiredFields: z.array(z.enum(VERIFY_STATE_MODEL_REQUIRED_FIELDS)).min(1),
  tlcStatuses: z.array(z.enum(VERIFY_TLC_STATUSES)).min(1),
}).strict();

const verifyBoundaryPolicySchema = z.object({
  command: z.literal(`forge ${FORGE_VERIFY_COMMAND}`),
  stage: z.literal(FORGE_VERIFY_STAGE),
  purpose: z.string().min(1),
  authoritativeInputs: z.array(z.string().min(1)).min(1),
  deterministicFirst: z.literal(true),
  allowedSideEffects: z.array(z.string().min(1)).min(1),
  deferredCapabilities: z.array(z.string().min(1)).min(1),
  disallowedCapabilities: z.array(z.string().min(1)).min(1),
  supportedLanes: z.array(z.enum(VERIFY_SUPPORTED_LANES)).min(1),
  formalLane: verifyFormalLanePolicySchema,
}).strict();

const verifyTargetContractSchema = z.object({
  requiredFields: z.array(z.enum(VERIFY_TARGET_REQUIRED_FIELDS)).min(1),
  riskSources: z.array(z.enum(VERIFY_TARGET_RISK_SOURCES)).min(1),
  structuralFocusAreas: z.array(z.enum(VERIFY_STRUCTURAL_FOCUS_AREAS)).min(1),
  formalFocusAreas: z.array(z.enum(VERIFY_FORMAL_FOCUS_AREAS)).min(1),
  supportedLanes: z.array(z.enum(VERIFY_SUPPORTED_LANES)).min(1),
}).strict();

const verifyFormalLaneContractSchema = z.object({
  tooling: z.array(z.enum(VERIFY_FORMAL_TOOLING)).min(1),
  entryCriteria: z.array(z.enum(VERIFY_FORMAL_ENTRY_CRITERIA)).min(1),
  stateModelRequiredFields: z.array(z.enum(VERIFY_STATE_MODEL_REQUIRED_FIELDS)).min(1),
  tlcStatuses: z.array(z.enum(VERIFY_TLC_STATUSES)).min(1),
}).strict();

export const verifyFoundationSchema = z.object({
  command: z.literal(`forge ${FORGE_VERIFY_COMMAND}`),
  stage: z.literal(FORGE_VERIFY_STAGE),
  purpose: z.string().min(1),
  deterministicFirst: z.object({
    enforced: z.literal(true),
    authoritativeInputs: z.array(z.string().min(1)).min(1),
    notes: z.array(z.string().min(1)).min(1),
  }).strict(),
  sourcePlan: verifyPlanReferenceSchema,
  verificationInput: verifyPlanningInputSchema,
  carryForward: verifyCarryForwardContextSchema,
  boundaryPolicy: verifyBoundaryPolicySchema,
  targetContract: verifyTargetContractSchema,
  formalLaneContract: verifyFormalLaneContractSchema,
}).strict().superRefine((value, context) => {
  if (value.boundaryPolicy.command !== STEP3_BOUNDARY_POLICY.command) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Boundary policy command drifted from the Step 3 contract.",
      path: ["boundaryPolicy", "command"],
    });
  }
  if (value.sourcePlan.readyForVerification && value.verificationInput.usability.status === "upstream_blocked") {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Verify input cannot be upstream_blocked when Step 2 marked the plan ready for verification.",
      path: ["verificationInput", "usability", "status"],
    });
  }
  if (!value.sourcePlan.readyForVerification && value.verificationInput.usability.status === "actionable") {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Blocked Step 2 handoffs must stay blocked in the normalized verify-input usability state.",
      path: ["verificationInput", "usability", "status"],
    });
  }
  if (
    value.verificationInput.usability.status === "non_actionable" &&
    value.verificationInput.usability.blockingItems.every((item) => item.code !== "VERIFY_INPUT_TOO_WEAK")
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Non-actionable verify input must expose VERIFY_INPUT_TOO_WEAK.",
      path: ["verificationInput", "usability", "blockingItems"],
    });
  }
});

export function validateVerifyFoundationResult(result: unknown): VerifyFoundationResult {
  return verifyFoundationSchema.parse(result);
}

export function validateVerifyTargetContract(contract: unknown): VerifyTargetContract {
  return verifyTargetContractSchema.parse(contract);
}

export function validateVerifyFormalLaneContract(contract: unknown): VerifyFormalLaneContract {
  return verifyFormalLaneContractSchema.parse(contract);
}
