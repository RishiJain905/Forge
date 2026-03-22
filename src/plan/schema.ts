import { z } from "zod";

import { intakeArtifactSchema } from "../intake/artifact-schema.js";
import type { PlanFoundationResult, PlanItem } from "./types.js";
import {
  FORGE_PLAN_COMMAND,
  FORGE_PLAN_STAGE,
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

export function validatePlanItem(item: unknown): PlanItem {
  return planItemSchema.parse(item);
}

export function validatePlanFoundationResult(result: unknown): PlanFoundationResult {
  return planFoundationSchema.parse(result);
}
