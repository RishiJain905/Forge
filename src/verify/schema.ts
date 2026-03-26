import { z } from "zod";

import { FORGE_SCHEMA_VERSION } from "../intake/constants.js";
import { PLAN_VERIFICATION_TARGET_CATEGORIES } from "../plan/constants.js";
import type {
  VerifyArtifact,
  VerifyFormalLaneContract,
  VerifyFoundationResult,
  VerifyTargetContract,
} from "./types.js";
import {
  FORGE_VERIFY_COMMAND,
  FORGE_VERIFY_STAGE,
  STEP3_BOUNDARY_POLICY,
  VERIFY_INPUT_TOO_WEAK,
  VERIFY_FORMAL_ENTRY_CRITERIA,
  VERIFY_FORMAL_FOCUS_AREAS,
  VERIFY_FORMAL_TOOLING,
  VERIFY_CASE_STATUSES,
  VERIFY_TLA_SPEC_GENERATION_STATUSES,
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
  implementationPriorities: z.array(z.string().min(1)).min(1),
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

const verifyVerificationCategorySchema = z.union([
  z.enum(PLAN_VERIFICATION_TARGET_CATEGORIES),
  z.enum(VERIFY_STRUCTURAL_FOCUS_AREAS),
]);

const verifyCommandFailureSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  fallbackReason: z.string().min(1).optional(),
}).strict();

const verifyWritePolicySchema = z.object({
  mode: z.literal("output-root-only"),
  repoReadOnlyOutsideOutputRoot: z.boolean(),
  allowedRoot: z.string().min(1),
  allowedSideEffects: z.array(z.string().min(1)).min(1),
  deferredCapabilities: z.array(z.string().min(1)).min(1),
  disallowedCapabilities: z.array(z.string().min(1)).min(1),
}).strict();

const verifyFilesSchema = z.object({
  artifactPath: z.string().min(1),
  reportPath: z.string().min(1),
}).strict();

const verifyVerificationTargetSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  category: verifyVerificationCategorySchema,
  sourcePlanItemIds: z.array(z.string().min(1)),
  riskSummary: z.string().min(1),
  candidateLanes: z.array(z.enum(VERIFY_SUPPORTED_LANES)),
  sourceRiskSources: z.array(z.enum(VERIFY_TARGET_RISK_SOURCES)).min(1),
  expectedFindingKinds: z.array(z.string().min(1)),
  verificationCaseIds: z.array(z.string().min(1)),
  traceabilityNotes: z.array(z.string().min(1)),
}).strict();

const verifyVerificationCaseSchema = z.object({
  id: z.string().min(1),
  verificationTargetId: z.string().min(1),
  title: z.string().min(1),
  category: verifyVerificationCategorySchema,
  sourcePlanItemIds: z.array(z.string().min(1)),
  lanes: z.array(z.enum(VERIFY_SUPPORTED_LANES)).min(1),
  goal: z.string().min(1),
  status: z.enum(VERIFY_CASE_STATUSES),
  summary: z.string().min(1),
  findings: z.array(z.string().min(1)),
  mitigations: z.array(z.string().min(1)),
  constraints: z.array(z.string().min(1)),
  traceabilityNotes: z.array(z.string().min(1)),
  formalDetails: z.object({
    enteredFormalLane: z.literal(true),
    entryCriteria: z.array(z.enum(VERIFY_FORMAL_ENTRY_CRITERIA)).min(1),
    stateModelId: z.string().min(1).nullable(),
    tlaSpecId: z.string().min(1).nullable(),
    tlcResultId: z.string().min(1).nullable(),
    cautionNotes: z.array(z.string().min(1)),
    trace: z.string().min(1).nullable(),
    errors: z.array(z.string().min(1)),
  }).strict().nullable(),
}).strict();

const verifyStructuralVerificationSchema = z.object({
  status: z.enum(["not_run", "passed", "failed", "errored"]),
  summary: z.string().min(1),
  findings: z.array(z.string().min(1)),
  constraints: z.array(z.string().min(1)),
}).strict();

const verifyStateModelSchema = z.object({
  id: z.string().min(1),
  verification_case_id: z.string().min(1),
  verification_target_id: z.string().min(1),
  name: z.string().min(1),
  summary: z.string().min(1),
  actors: z.array(z.string().min(1)),
  entities: z.array(z.string().min(1)),
  states: z.array(z.string().min(1)),
  transitions: z.array(z.string().min(1)),
  unsafe_states: z.array(z.string().min(1)),
  invariants: z.array(z.string().min(1)),
  initial_conditions: z.array(z.string().min(1)),
}).strict();

const verifyTlaSpecSchema = z.object({
  id: z.string().min(1),
  verification_case_id: z.string().min(1),
  state_model_id: z.string().min(1),
  name: z.string().min(1),
  summary: z.string().min(1),
  module_name: z.string().min(1),
  spec_path: z.string().min(1),
  config_path: z.string().min(1),
  generation_status: z.enum(VERIFY_TLA_SPEC_GENERATION_STATUSES),
}).strict();

const verifyTlcResultSchema = z.object({
  id: z.string().min(1),
  verification_case_id: z.string().min(1),
  tla_spec_id: z.string().min(1),
  status: z.enum(VERIFY_TLC_STATUSES),
  summary: z.string().min(1),
  trace: z.string().min(1).nullable(),
  errors: z.array(z.string().min(1)),
}).strict();

const verifyFormalVerificationSchema = z.object({
  status: z.enum(VERIFY_TLC_STATUSES),
  summary: z.string().min(1),
  caution_notes: z.array(z.string().min(1)),
  state_models: z.array(verifyStateModelSchema),
  tla_specs: z.array(verifyTlaSpecSchema),
  tlc_results: z.array(verifyTlcResultSchema),
  findings: z.array(z.string().min(1)),
  constraints: z.array(z.string().min(1)),
}).strict();

const verifyVerificationDiagnosticsSchema = z.object({
  usability_status: z.enum(["actionable", "non_actionable", "upstream_blocked"]),
  warning_items: z.array(verifyInputIssueSchema),
  blocking_items: z.array(verifyInputIssueSchema),
  partial_output: verifyCommandFailureSchema.nullable(),
}).strict();

const verifyVerificationReadinessSchema = z.object({
  ready: z.boolean(),
  status: z.enum(["ready", "ready_with_warnings", "blocked"]),
  summary: z.string().min(1),
  warning_items: z.array(verifyInputIssueSchema),
  blocking_issues: z.array(verifyInputIssueSchema),
  partial_output: verifyCommandFailureSchema.nullable(),
  constraining_concern_ids: z.array(z.string().min(1)),
  recommended_user_actions: z.array(z.string().min(1)),
}).strict();

export const VERIFY_ARTIFACT_TOP_LEVEL_KEYS = [
  "schemaVersion",
  "command",
  "stage",
  "status",
  "purpose",
  "repoRoot",
  "requestedOutputRoot",
  "outputRoot",
  "writePolicy",
  "files",
  "startedAt",
  "finishedAt",
  "summary",
  "boundaryNotes",
  "source_plan",
  "verification_target_contract",
  "formal_lane_contract",
  "verification_targets",
  "verification_cases",
  "structural_verification",
  "formal_verification",
  "findings",
  "constraints",
  "carry_forward",
  "verification_diagnostics",
  "verification_readiness",
  "failure",
] as const satisfies readonly (keyof VerifyArtifact)[];

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
    value.verificationInput.usability.blockingItems.every((item) => item.code !== VERIFY_INPUT_TOO_WEAK)
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

function assertVerifyArtifactTopLevelKeys(artifact: VerifyArtifact): void {
  const actualKeys = Object.keys(artifact).sort();
  const expectedKeys = [...VERIFY_ARTIFACT_TOP_LEVEL_KEYS].sort();

  if (
    actualKeys.length !== expectedKeys.length ||
    actualKeys.some((key, index) => key !== expectedKeys[index])
  ) {
    throw new Error("Verify artifact top-level key contract drifted from the required set.");
  }
}

export const verifyArtifactSchema = z.object({
  schemaVersion: z.literal(FORGE_SCHEMA_VERSION),
  command: z.literal(`forge ${FORGE_VERIFY_COMMAND}`),
  stage: z.literal(FORGE_VERIFY_STAGE),
  status: z.enum(["ready", "blocked", "failed"]),
  purpose: z.string().min(1),
  repoRoot: z.string().min(1),
  requestedOutputRoot: z.string().nullable(),
  outputRoot: z.string().min(1),
  writePolicy: verifyWritePolicySchema,
  files: verifyFilesSchema,
  startedAt: z.string().min(1),
  finishedAt: z.string().min(1),
  summary: z.string().min(1),
  boundaryNotes: z.array(z.string().min(1)).min(1),
  source_plan: verifyPlanReferenceSchema,
  verification_target_contract: verifyTargetContractSchema,
  formal_lane_contract: verifyFormalLaneContractSchema,
  verification_targets: z.array(verifyVerificationTargetSchema),
  verification_cases: z.array(verifyVerificationCaseSchema),
  structural_verification: verifyStructuralVerificationSchema,
  formal_verification: verifyFormalVerificationSchema,
  findings: z.array(z.string().min(1)),
  constraints: z.array(z.string().min(1)),
  carry_forward: planArtifactSchema.shape.carry_forward,
  verification_diagnostics: verifyVerificationDiagnosticsSchema,
  verification_readiness: verifyVerificationReadinessSchema,
  failure: verifyCommandFailureSchema.nullable(),
}).strict().superRefine((value, context) => {
  if (value.source_plan.readyForVerification && value.verification_diagnostics.usability_status === "upstream_blocked") {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Verify input cannot be upstream_blocked when Step 2 marked the plan ready for verification.",
      path: ["verification_diagnostics", "usability_status"],
    });
  }
  if (!value.source_plan.readyForVerification && value.verification_diagnostics.usability_status === "actionable") {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Blocked Step 2 handoffs must stay blocked in the normalized verify-input usability state.",
      path: ["verification_diagnostics", "usability_status"],
    });
  }
  if (
    value.verification_diagnostics.usability_status === "non_actionable" &&
    value.verification_diagnostics.blocking_items.every((item) => item.code !== VERIFY_INPUT_TOO_WEAK)
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Non-actionable verify input must expose VERIFY_INPUT_TOO_WEAK.",
      path: ["verification_diagnostics", "blocking_items"],
    });
  }

  const readinessWarningItems = value.verification_readiness.warning_items;
  const mirroredWarningItems = value.verification_diagnostics.warning_items;
  if (
    readinessWarningItems.length !== mirroredWarningItems.length ||
    readinessWarningItems.some(
      (item, index) =>
        item.code !== mirroredWarningItems[index]?.code ||
        item.message !== mirroredWarningItems[index]?.message,
    )
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Verification readiness warning items must mirror verification diagnostics warning items.",
      path: ["verification_readiness", "warning_items"],
    });
  }

  const readinessBlockingIssues = value.verification_readiness.blocking_issues;
  const mirroredBlockingItems = value.verification_diagnostics.blocking_items;
  if (
    readinessBlockingIssues.length !== mirroredBlockingItems.length ||
    readinessBlockingIssues.some(
      (item, index) =>
        item.code !== mirroredBlockingItems[index]?.code ||
        item.message !== mirroredBlockingItems[index]?.message,
    )
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Verification readiness blocking issues must mirror verification diagnostics blocking items.",
      path: ["verification_readiness", "blocking_issues"],
    });
  }

  if (
    value.verification_readiness.partial_output?.code !== value.verification_diagnostics.partial_output?.code ||
    value.verification_readiness.partial_output?.message !== value.verification_diagnostics.partial_output?.message ||
    value.verification_readiness.partial_output?.fallbackReason !== value.verification_diagnostics.partial_output?.fallbackReason
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Verification readiness partial output must mirror verification diagnostics partial output.",
      path: ["verification_readiness", "partial_output"],
    });
  }

  const readinessHasWarnings =
    readinessWarningItems.length > 0 ||
    value.verification_readiness.constraining_concern_ids.length > 0 ||
    value.verification_readiness.partial_output !== null;
  const expectedReadinessStatus = value.verification_readiness.ready
    ? readinessHasWarnings
      ? "ready_with_warnings"
      : "ready"
    : "blocked";
  if (value.verification_readiness.status !== expectedReadinessStatus) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Verification readiness status must match the resolved ready/warning/block state.",
      path: ["verification_readiness", "status"],
    });
  }

  const expectedTopLevelStatus = value.failure
    ? "failed"
    : value.verification_readiness.ready
      ? "ready"
      : "blocked";
  if (value.status !== expectedTopLevelStatus) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Verify artifact status must match the readiness and failure matrix.",
      path: ["status"],
    });
  }

  if (value.verification_readiness.ready && readinessBlockingIssues.length > 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Ready verification readiness must not carry blocking issues.",
      path: ["verification_readiness", "blocking_issues"],
    });
  }
  if (!value.verification_readiness.ready && readinessBlockingIssues.length === 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Blocked verification readiness must carry at least one blocking issue.",
      path: ["verification_readiness", "blocking_issues"],
    });
  }
  if (value.failure && !value.verification_diagnostics.partial_output) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Artifacts with a failure must mirror it in verification diagnostics partial_output.",
      path: ["verification_diagnostics", "partial_output"],
    });
  }
  if (!value.failure && value.verification_diagnostics.partial_output) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Artifacts without a failure must keep verification diagnostics partial_output empty.",
      path: ["verification_diagnostics", "partial_output"],
    });
  }

  const targetIdCounts = new Map<string, number>();
  const caseIdCounts = new Map<string, number>();
  for (const target of value.verification_targets) {
    targetIdCounts.set(target.id, (targetIdCounts.get(target.id) ?? 0) + 1);
  }
  for (const verificationCase of value.verification_cases) {
    caseIdCounts.set(verificationCase.id, (caseIdCounts.get(verificationCase.id) ?? 0) + 1);
  }

  for (const [index, target] of value.verification_targets.entries()) {
    if ((targetIdCounts.get(target.id) ?? 0) > 1) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Verification target ids must be unique.",
        path: ["verification_targets", index, "id"],
      });
    }

    if (target.sourcePlanItemIds.length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Verification targets must keep at least one source plan item id.",
        path: ["verification_targets", index, "sourcePlanItemIds"],
      });
    }
    if (target.candidateLanes.length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Verification targets must keep at least one candidate lane.",
        path: ["verification_targets", index, "candidateLanes"],
      });
    }
    const targetCaseIds = new Set<string>();
    for (const [caseIndex, caseId] of target.verificationCaseIds.entries()) {
      if (targetCaseIds.has(caseId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Verification target case ids must not contain duplicates.",
          path: ["verification_targets", index, "verificationCaseIds", caseIndex],
        });
      } else {
        targetCaseIds.add(caseId);
      }

      if (!value.verification_cases.some((verificationCase) => verificationCase.id === caseId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Verification target case ids must point at existing verification cases.",
          path: ["verification_targets", index, "verificationCaseIds", caseIndex],
        });
      }
    }
  }

  const targetById = new Map(value.verification_targets.map((target) => [target.id, target] as const));
  const structuralCases = value.verification_cases.filter((verificationCase) =>
    verificationCase.lanes.includes("structural"),
  );
  const formalCases = value.verification_cases.filter((verificationCase) =>
    verificationCase.lanes.includes("formal"),
  );
  const formalCaseById = new Map(formalCases.map((verificationCase) => [verificationCase.id, verificationCase] as const));
  const stateModelById = new Map(value.formal_verification.state_models.map((stateModel) => [stateModel.id, stateModel] as const));
  const tlaSpecById = new Map(value.formal_verification.tla_specs.map((spec) => [spec.id, spec] as const));
  const tlcResultById = new Map(value.formal_verification.tlc_results.map((result) => [result.id, result] as const));

  function buildWorstStructuralStatus(
    cases: Array<{ status: typeof VERIFY_CASE_STATUSES[number] }>,
  ): "not_run" | "passed" | "failed" | "errored" {
    if (cases.length === 0) {
      return "not_run";
    }

    if (cases.some((verificationCase) => verificationCase.status === "failed")) {
      return "failed";
    }
    if (cases.some((verificationCase) => verificationCase.status === "errored")) {
      return "errored";
    }
    if (cases.some((verificationCase) => verificationCase.status === "not_run")) {
      return "not_run";
    }

    return "passed";
  }

  if (value.formal_verification.status !== buildWorstTlcStatus(value.formal_verification.tlc_results)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Formal verification status must match the worst TLC result status.",
      path: ["formal_verification", "status"],
    });
  }
  if (value.structural_verification.status !== buildWorstStructuralStatus(structuralCases)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Structural verification status must match the resolved structural case outcomes.",
      path: ["structural_verification", "status"],
    });
  }
  if (
    structuralCases.length > 0 &&
    value.structural_verification.status === "not_run"
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Structural verification cannot remain not_run once structural cases were selected.",
      path: ["structural_verification", "status"],
    });
  }

  if (value.formal_verification.state_models.length !== formalCases.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Formal verification must emit one state model per formal verification case.",
      path: ["formal_verification", "state_models"],
    });
  }
  if (value.formal_verification.tla_specs.length !== formalCases.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Formal verification must emit one TLA spec per formal verification case.",
      path: ["formal_verification", "tla_specs"],
    });
  }
  if (value.formal_verification.tlc_results.length !== formalCases.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Formal verification must emit one TLC result per formal verification case.",
      path: ["formal_verification", "tlc_results"],
    });
  }

  function buildWorstTlcStatus(results: Array<{ status: typeof VERIFY_TLC_STATUSES[number] }>): typeof VERIFY_TLC_STATUSES[number] {
    const precedence: typeof VERIFY_TLC_STATUSES[number][] = ["failed", "errored", "invalid_spec", "not_run", "passed"];
    for (const status of precedence) {
      if (results.some((result) => result.status === status)) {
        return status;
      }
    }
    return "not_run";
  }

  for (const [index, verificationCase] of value.verification_cases.entries()) {
    if ((caseIdCounts.get(verificationCase.id) ?? 0) > 1) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Verification case ids must be unique.",
        path: ["verification_cases", index, "id"],
      });
    }

    if (verificationCase.lanes.includes("formal")) {
      if (!verificationCase.formalDetails) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Formal verification cases must carry formalDetails.",
          path: ["verification_cases", index, "formalDetails"],
        });
      } else {
        if (verificationCase.formalDetails.stateModelId === null) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Formal verification cases must keep a stateModelId.",
            path: ["verification_cases", index, "formalDetails", "stateModelId"],
          });
        }
        if (verificationCase.formalDetails.tlaSpecId === null) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Formal verification cases must keep a tlaSpecId.",
            path: ["verification_cases", index, "formalDetails", "tlaSpecId"],
          });
        }
        if (verificationCase.formalDetails.tlcResultId === null) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Formal verification cases must keep a tlcResultId.",
            path: ["verification_cases", index, "formalDetails", "tlcResultId"],
          });
        }
      }
    } else if (verificationCase.formalDetails !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Structural-only verification cases must keep formalDetails null.",
        path: ["verification_cases", index, "formalDetails"],
      });
    }

    const target = targetById.get(verificationCase.verificationTargetId);
    if (!target) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Verification cases must point at an existing verification target.",
        path: ["verification_cases", index, "verificationTargetId"],
      });
      continue;
    }

    if (!target.verificationCaseIds.includes(verificationCase.id)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Verification cases must be listed back on the owning verification target.",
        path: ["verification_cases", index, "id"],
      });
    }

    for (const [laneIndex, lane] of verificationCase.lanes.entries()) {
      if (!target.candidateLanes.includes(lane)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Verification case lanes must be a subset of the target candidate lanes.",
          path: ["verification_cases", index, "lanes", laneIndex],
        });
      }
    }

    for (const [planItemIndex, planItemId] of verificationCase.sourcePlanItemIds.entries()) {
      if (!target.sourcePlanItemIds.includes(planItemId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Verification case source plan items must be a subset of the target source plan items.",
          path: ["verification_cases", index, "sourcePlanItemIds", planItemIndex],
        });
      }
    }
  }

  for (const [index, stateModel] of value.formal_verification.state_models.entries()) {
    if (stateModelById.get(stateModel.id) !== stateModel) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Formal state model ids must be unique.",
        path: ["formal_verification", "state_models", index, "id"],
      });
    }

    const owningCase = formalCaseById.get(stateModel.verification_case_id);
    if (!owningCase) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Formal state models must point at an existing formal verification case.",
        path: ["formal_verification", "state_models", index, "verification_case_id"],
      });
      continue;
    }

    const owningTarget = targetById.get(owningCase.verificationTargetId);
    if (!owningTarget || owningTarget.id !== stateModel.verification_target_id) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Formal state models must point at the owning verification target.",
        path: ["formal_verification", "state_models", index, "verification_target_id"],
      });
    }

    if (owningCase.formalDetails?.stateModelId !== stateModel.id) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Formal state models must be referenced by the owning case formalDetails.",
        path: ["formal_verification", "state_models", index, "id"],
      });
    }
  }

  for (const [index, spec] of value.formal_verification.tla_specs.entries()) {
    if (tlaSpecById.get(spec.id) !== spec) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Formal TLA spec ids must be unique.",
        path: ["formal_verification", "tla_specs", index, "id"],
      });
    }

    const owningCase = formalCaseById.get(spec.verification_case_id);
    if (!owningCase) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Formal TLA specs must point at an existing formal verification case.",
        path: ["formal_verification", "tla_specs", index, "verification_case_id"],
      });
      continue;
    }

    if (owningCase.formalDetails?.tlaSpecId !== spec.id) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Formal TLA specs must be referenced by the owning case formalDetails.",
        path: ["formal_verification", "tla_specs", index, "id"],
      });
    }

    const stateModel = stateModelById.get(spec.state_model_id);
    if (!stateModel || stateModel.verification_case_id !== spec.verification_case_id) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Formal TLA specs must point at an emitted state model for the same case.",
        path: ["formal_verification", "tla_specs", index, "state_model_id"],
      });
    }
  }

  for (const [index, result] of value.formal_verification.tlc_results.entries()) {
    if (tlcResultById.get(result.id) !== result) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Formal TLC result ids must be unique.",
        path: ["formal_verification", "tlc_results", index, "id"],
      });
    }

    const owningCase = formalCaseById.get(result.verification_case_id);
    if (!owningCase) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Formal TLC results must point at an existing formal verification case.",
        path: ["formal_verification", "tlc_results", index, "verification_case_id"],
      });
      continue;
    }

    if (owningCase.formalDetails?.tlcResultId !== result.id) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Formal TLC results must be referenced by the owning case formalDetails.",
        path: ["formal_verification", "tlc_results", index, "id"],
      });
    }

    const spec = tlaSpecById.get(result.tla_spec_id);
    if (!spec || spec.verification_case_id !== result.verification_case_id) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Formal TLC results must point at an emitted TLA spec for the same case.",
        path: ["formal_verification", "tlc_results", index, "tla_spec_id"],
      });
    }
  }
});

export function validateVerifyArtifact(artifact: unknown): VerifyArtifact {
  const parsedArtifact = verifyArtifactSchema.parse(artifact);
  assertVerifyArtifactTopLevelKeys(parsedArtifact);
  return parsedArtifact;
}
