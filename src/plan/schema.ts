import { z } from "zod";

import { intakeArtifactSchema } from "../intake/artifact-schema.js";
import { FORGE_SCHEMA_VERSION } from "../intake/constants.js";
import type { PlanArtifact, PlanFoundationResult, PlanItem } from "./types.js";
import {
  FORGE_PLAN_FULL_COMMAND,
  FORGE_PLAN_STAGE,
  FORGE_PLAN_COMMAND,
  PLAN_CARRY_FORWARD_CONCERN_EFFECTS,
  PLAN_CARRY_FORWARD_CONCERN_SOURCES,
  PLAN_DEPENDENCY_TYPES,
  PLAN_ITEM_CATEGORIES,
  PLAN_ITEM_REQUIRED_FIELDS,
  PLAN_PARALLELIZATION_SIGNALS,
  PLAN_RISK_LEVELS,
  PLAN_TEST_OBLIGATION_CATEGORIES,
  PLAN_VERIFICATION_TARGET_CATEGORIES,
  STEP2_BOUNDARY_POLICY,
} from "./constants.js";

const planItemDependencySchema = z.object({
  planItemId: z.string().min(1),
  type: z.enum(PLAN_DEPENDENCY_TYPES),
  reason: z.string().min(1),
}).strict();

const planTestObligationSchema = z.object({
  category: z.enum(PLAN_TEST_OBLIGATION_CATEGORIES),
  reason: z.string().min(1),
}).strict();

const planVerificationRelevanceSchema = z.object({
  relevant: z.boolean(),
  categories: z.array(z.enum(PLAN_VERIFICATION_TARGET_CATEGORIES)),
  notes: z.array(z.string().min(1)),
}).superRefine((value, context) => {
  if (value.relevant && value.categories.length === 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Relevant plan items must name at least one verification category.",
      path: ["categories"],
    });
  }
}).strict();

const planParallelizationSchema = z.object({
  signal: z.enum(PLAN_PARALLELIZATION_SIGNALS),
  reason: z.string().min(1),
}).strict();

const planDependencyGraphEntrySchema = z.object({
  planItemId: z.string().min(1),
  dependsOnPlanItemId: z.string().min(1),
  type: z.enum(PLAN_DEPENDENCY_TYPES),
  reason: z.string().min(1),
}).strict();

const planConflictZoneSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  reason: z.string().min(1),
  paths: z.array(z.string().min(1)),
  planItemIds: z.array(z.string().min(1)),
  riskLevel: z.enum(PLAN_RISK_LEVELS),
}).strict();

const planParallelizationSignalEntrySchema = z.object({
  planItemId: z.string().min(1),
  signal: z.enum(PLAN_PARALLELIZATION_SIGNALS),
  reason: z.string().min(1),
}).strict();

const planTestObligationEntrySchema = z.object({
  planItemId: z.string().min(1),
  category: z.enum(PLAN_TEST_OBLIGATION_CATEGORIES),
  reason: z.string().min(1),
}).strict();

const planCarryForwardConcernSchema = z.object({
  id: z.string().min(1),
  source: z.enum(PLAN_CARRY_FORWARD_CONCERN_SOURCES),
  code: z.string().min(1).nullable(),
  message: z.string().min(1),
  planItemIds: z.array(z.string().min(1)).min(1),
  effects: z.array(z.enum(PLAN_CARRY_FORWARD_CONCERN_EFFECTS)).min(1),
  status: z.literal("carried_forward"),
}).strict();

export const planItemSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  category: z.enum(PLAN_ITEM_CATEGORIES),
  sourceRequirements: z.array(z.string().min(1)).min(1),
  likelyAffectedPaths: z.array(z.string().min(1)).min(1),
  dependencies: z.array(planItemDependencySchema),
  riskLevel: z.enum(PLAN_RISK_LEVELS),
  testObligations: z.array(planTestObligationSchema).min(1),
  verificationRelevance: planVerificationRelevanceSchema,
  parallelization: planParallelizationSchema,
}).strict();

const planBoundaryPolicySchema = z.object({
  command: z.literal(`forge ${FORGE_PLAN_COMMAND}`),
  stage: z.literal(FORGE_PLAN_STAGE),
  purpose: z.string().min(1),
  authoritativeInputs: z.array(z.string().min(1)).min(1),
  deterministicFirst: z.literal(true),
  allowedSideEffects: z.array(z.string().min(1)).min(1),
  deferredCapabilities: z.array(z.string().min(1)).min(1),
  disallowedCapabilities: z.array(z.string().min(1)).min(1),
}).strict();

const planItemContractSchema = z.object({
  requiredFields: z.array(z.enum(PLAN_ITEM_REQUIRED_FIELDS)).min(1),
  categories: z.array(z.enum(PLAN_ITEM_CATEGORIES)).min(1),
  dependencyTypes: z.array(z.enum(PLAN_DEPENDENCY_TYPES)).min(1),
  riskLevels: z.array(z.enum(PLAN_RISK_LEVELS)).min(1),
  testObligationCategories: z.array(z.enum(PLAN_TEST_OBLIGATION_CATEGORIES)).min(1),
  verificationCategories: z.array(z.enum(PLAN_VERIFICATION_TARGET_CATEGORIES)).min(1),
  parallelizationSignals: z.array(z.enum(PLAN_PARALLELIZATION_SIGNALS)).min(1),
}).strict();

const planCarryForwardContextSchema = z.object({
  taskSpec: intakeArtifactSchema.shape.task_spec,
  repoContext: intakeArtifactSchema.shape.repo_context,
  candidateTargets: intakeArtifactSchema.shape.candidate_targets,
  riskAnalysis: intakeArtifactSchema.shape.risk_analysis,
  initialVerificationTargets: intakeArtifactSchema.shape.initial_verification_targets,
  ambiguities: intakeArtifactSchema.shape.ambiguities,
  warnings: intakeArtifactSchema.shape.warnings,
  confidence: intakeArtifactSchema.shape.confidence,
  nextStepReadiness: intakeArtifactSchema.shape.next_step_readiness,
}).strict();

const planArtifactCarryForwardSchema = z.object({
  task_spec: intakeArtifactSchema.shape.task_spec,
  repo_context: intakeArtifactSchema.shape.repo_context,
  candidate_targets: intakeArtifactSchema.shape.candidate_targets,
  risk_analysis: intakeArtifactSchema.shape.risk_analysis,
  initial_verification_targets: intakeArtifactSchema.shape.initial_verification_targets,
  ambiguities: intakeArtifactSchema.shape.ambiguities,
  warnings: intakeArtifactSchema.shape.warnings,
  confidence: intakeArtifactSchema.shape.confidence,
  next_step_readiness: intakeArtifactSchema.shape.next_step_readiness,
  concerns: z.array(planCarryForwardConcernSchema),
}).strict();

const planSourceIntakeSchema = z.object({
  artifactPath: z.string().min(1),
  command: intakeArtifactSchema.shape.command,
  status: intakeArtifactSchema.shape.status,
  summary: intakeArtifactSchema.shape.summary,
  readyForPlanning: intakeArtifactSchema.shape.next_step_readiness.shape.ready,
}).strict();

const planWritePolicySchema = z.object({
  mode: z.literal("output-root-only"),
  repoReadOnlyOutsideOutputRoot: z.boolean(),
  allowedRoot: z.string().min(1),
  allowedSideEffects: z.array(z.string().min(1)).min(1),
  deferredCapabilities: z.array(z.string().min(1)).min(1),
  disallowedCapabilities: z.array(z.string().min(1)).min(1),
}).strict();

const planFilesSchema = z.object({
  artifactPath: z.string().min(1).nullable(),
  reportPath: z.string().min(1).nullable(),
}).strict();

const planPlanningReadinessSchema = intakeArtifactSchema.shape.next_step_readiness;

function extractRequirementSeedsFromArtifact(
  artifact: Pick<PlanArtifact, "carry_forward">,
): string[] {
  const taskSpec = artifact.carry_forward.task_spec;
  const candidates = [
    taskSpec.explicit_requirements,
    taskSpec.acceptance_criteria,
    taskSpec.implementation_necessities,
  ];

  for (const values of candidates) {
    if (values.length > 0) {
      return values;
    }
  }

  return [];
}

function buildDependencyKey(params: {
  planItemId: string;
  dependsOnPlanItemId: string;
  type: string;
  reason: string;
}): string {
  return `${params.planItemId}:${params.dependsOnPlanItemId}:${params.type}:${params.reason}`;
}

function buildTestObligationKey(params: {
  planItemId: string;
  category: string;
  reason: string;
}): string {
  return `${params.planItemId}:${params.category}:${params.reason}`;
}

function buildParallelizationKey(params: {
  planItemId: string;
  signal: string;
  reason: string;
}): string {
  return `${params.planItemId}:${params.signal}:${params.reason}`;
}

export const PLAN_ARTIFACT_TOP_LEVEL_KEYS = [
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
  "source_intake",
  "plan_item_contract",
  "plan_items",
  "dependency_graph",
  "conflict_zones",
  "test_obligations",
  "parallelization_signals",
  "carry_forward",
  "planning_readiness",
  "failure",
] as const satisfies readonly (keyof PlanArtifact)[];

export const planFoundationSchema = z.object({
  command: z.literal(`forge ${FORGE_PLAN_COMMAND}`),
  stage: z.literal(FORGE_PLAN_STAGE),
  purpose: z.string().min(1),
  deterministicFirst: z.object({
    enforced: z.literal(true),
    authoritativeInputs: z.array(z.string().min(1)).min(1),
    notes: z.array(z.string().min(1)).min(1),
  }).strict(),
  sourceIntake: z.object({
    artifactPath: z.string().min(1),
    command: intakeArtifactSchema.shape.command,
    repoRoot: intakeArtifactSchema.shape.repoRoot,
    status: intakeArtifactSchema.shape.status,
    summary: intakeArtifactSchema.shape.summary,
    readyForPlanning: intakeArtifactSchema.shape.next_step_readiness.shape.ready,
  }).strict(),
  carryForward: planCarryForwardContextSchema,
  boundaryPolicy: planBoundaryPolicySchema,
  planItemContract: planItemContractSchema,
}).strict().superRefine((value, context) => {
  if (value.boundaryPolicy.command !== STEP2_BOUNDARY_POLICY.command) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Boundary policy command drifted from the Step 2 contract.",
      path: ["boundaryPolicy", "command"],
    });
  }
});

export const planArtifactSchema = z.object({
  schemaVersion: z.literal(FORGE_SCHEMA_VERSION),
  command: z.literal(FORGE_PLAN_FULL_COMMAND),
  stage: z.literal(FORGE_PLAN_STAGE),
  status: z.enum(["ready", "blocked", "failed"]),
  purpose: z.string().min(1),
  repoRoot: z.string().min(1),
  requestedOutputRoot: z.string().nullable(),
  outputRoot: z.string().min(1),
  writePolicy: planWritePolicySchema,
  files: planFilesSchema,
  startedAt: z.string().min(1),
  finishedAt: z.string().min(1),
  summary: z.string().min(1),
  boundaryNotes: z.array(z.string().min(1)).min(1),
  source_intake: planSourceIntakeSchema,
  plan_item_contract: planItemContractSchema,
  plan_items: z.array(planItemSchema),
  dependency_graph: z.array(planDependencyGraphEntrySchema),
  conflict_zones: z.array(planConflictZoneSchema),
  test_obligations: z.array(planTestObligationEntrySchema),
  parallelization_signals: z.array(planParallelizationSignalEntrySchema),
  carry_forward: planArtifactCarryForwardSchema,
  planning_readiness: planPlanningReadinessSchema,
  failure: z.object({
    code: z.string().min(1),
    message: z.string().min(1),
    fallbackReason: z.string().optional(),
  }).nullable(),
}).strict().superRefine((value, context) => {
  if (value.writePolicy.allowedSideEffects.length === 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Plan write policy must list at least one allowed side effect.",
      path: ["writePolicy", "allowedSideEffects"],
    });
  }
  if (value.writePolicy.deferredCapabilities.length === 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Plan write policy must list at least one deferred capability.",
      path: ["writePolicy", "deferredCapabilities"],
    });
  }
  if (value.writePolicy.disallowedCapabilities.length === 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Plan write policy must list at least one disallowed capability.",
      path: ["writePolicy", "disallowedCapabilities"],
    });
  }
  if (value.command !== FORGE_PLAN_FULL_COMMAND) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Plan artifact command drifted from the Step 2 contract.",
      path: ["command"],
    });
  }
  if (value.stage !== FORGE_PLAN_STAGE) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Plan artifact stage drifted from the Step 2 contract.",
      path: ["stage"],
    });
  }
  const planItemIds = new Set(value.plan_items.map((item) => item.id));
  if (planItemIds.size !== value.plan_items.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Plan artifact contains duplicate plan item ids.",
      path: ["plan_items"],
    });
  }
  for (const [index, item] of value.plan_items.entries()) {
    for (const [dependencyIndex, dependency] of item.dependencies.entries()) {
      if (!planItemIds.has(dependency.planItemId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Plan item dependencies must reference real plan item ids.",
          path: ["plan_items", index, "dependencies", dependencyIndex, "planItemId"],
        });
      }
    }
  }
  for (const [index, dependency] of value.dependency_graph.entries()) {
    if (!planItemIds.has(dependency.planItemId) || !planItemIds.has(dependency.dependsOnPlanItemId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Dependency graph entries must reference real plan item ids.",
        path: ["dependency_graph", index],
      });
    }
  }
  for (const [index, zone] of value.conflict_zones.entries()) {
    for (const [planItemIndex, planItemId] of zone.planItemIds.entries()) {
      if (!planItemIds.has(planItemId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Conflict zones must reference real plan item ids.",
          path: ["conflict_zones", index, "planItemIds", planItemIndex],
        });
      }
    }
  }
  for (const [index, entry] of value.test_obligations.entries()) {
    if (!planItemIds.has(entry.planItemId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Top-level test obligations must reference real plan item ids.",
        path: ["test_obligations", index, "planItemId"],
      });
    }
  }
  for (const [index, entry] of value.parallelization_signals.entries()) {
    if (!planItemIds.has(entry.planItemId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Top-level parallelization signals must reference real plan item ids.",
        path: ["parallelization_signals", index, "planItemId"],
      });
    }
  }
  for (const [index, concern] of value.carry_forward.concerns.entries()) {
    for (const [planItemIndex, planItemId] of concern.planItemIds.entries()) {
      if (!planItemIds.has(planItemId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Carry-forward concerns must reference real plan item ids.",
          path: ["carry_forward", "concerns", index, "planItemIds", planItemIndex],
        });
      }
    }
  }
  const flattenedDependencies = value.plan_items.flatMap((item) =>
    item.dependencies.map((dependency) => ({
      planItemId: item.id,
      dependsOnPlanItemId: dependency.planItemId,
      type: dependency.type,
      reason: dependency.reason,
    })),
  );
  const flattenedKeys = new Set(flattenedDependencies.map((dependency) => buildDependencyKey(dependency)));
  const graphKeys = new Set(value.dependency_graph.map((dependency) => buildDependencyKey(dependency)));
  if (flattenedKeys.size !== graphKeys.size) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Flattened dependency graph must match the per-item dependency lists.",
      path: ["dependency_graph"],
    });
  } else {
    for (const dependencyKey of flattenedKeys) {
      if (!graphKeys.has(dependencyKey)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Flattened dependency graph must match the per-item dependency lists.",
          path: ["dependency_graph"],
        });
        break;
      }
    }
  }
  const flattenedTestObligations = value.plan_items.flatMap((item) =>
    item.testObligations.map((obligation) => ({
      planItemId: item.id,
      category: obligation.category,
      reason: obligation.reason,
    })),
  );
  const flattenedTestObligationKeys = new Set(
    flattenedTestObligations.map((obligation) => buildTestObligationKey(obligation)),
  );
  const topLevelTestObligationKeys = new Set(
    value.test_obligations.map((obligation) => buildTestObligationKey(obligation)),
  );
  if (flattenedTestObligationKeys.size !== topLevelTestObligationKeys.size) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Top-level test obligations must match the per-item test obligations.",
      path: ["test_obligations"],
    });
  } else {
    for (const obligationKey of flattenedTestObligationKeys) {
      if (!topLevelTestObligationKeys.has(obligationKey)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Top-level test obligations must match the per-item test obligations.",
          path: ["test_obligations"],
        });
        break;
      }
    }
  }
  const flattenedParallelizationKeys = new Set(
    value.plan_items.map((item) =>
      buildParallelizationKey({
        planItemId: item.id,
        signal: item.parallelization.signal,
        reason: item.parallelization.reason,
      })),
  );
  const topLevelParallelizationKeys = new Set(
    value.parallelization_signals.map((entry) => buildParallelizationKey(entry)),
  );
  if (flattenedParallelizationKeys.size !== topLevelParallelizationKeys.size) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Top-level parallelization signals must match the per-item parallelization data.",
      path: ["parallelization_signals"],
    });
  } else {
    for (const parallelizationKey of flattenedParallelizationKeys) {
      if (!topLevelParallelizationKeys.has(parallelizationKey)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Top-level parallelization signals must match the per-item parallelization data.",
          path: ["parallelization_signals"],
        });
        break;
      }
    }
  }
  const hasUsablePlanningSignal =
    extractRequirementSeedsFromArtifact(value).length > 0 ||
    value.carry_forward.candidate_targets.length > 0 ||
    value.carry_forward.initial_verification_targets.length > 0;
  if (
    hasUsablePlanningSignal &&
    (value.status === "ready" || value.status === "blocked") &&
    value.plan_items.length === 0
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Planning-ready or blocked artifacts must emit plan items when Step 1 provided usable planning signals.",
      path: ["plan_items"],
    });
  }
  const requiresCarryForwardConcerns =
    value.carry_forward.ambiguities.length > 0 ||
    value.carry_forward.warnings.length > 0 ||
    value.carry_forward.confidence.level === "low" ||
    !value.carry_forward.next_step_readiness.ready ||
    value.carry_forward.candidate_targets.some((target) => target.match_type === "fallback");
  if (requiresCarryForwardConcerns && value.plan_items.length > 0 && value.carry_forward.concerns.length === 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Artifacts with unresolved Step 1 uncertainty must expose carry-forward concerns.",
      path: ["carry_forward", "concerns"],
    });
  }
});

export function validatePlanItem(item: unknown): PlanItem {
  return planItemSchema.parse(item);
}

export function validatePlanFoundationResult(result: unknown): PlanFoundationResult {
  return planFoundationSchema.parse(result);
}

export function validatePlanArtifact(artifact: unknown): PlanArtifact {
  return planArtifactSchema.parse(artifact);
}
