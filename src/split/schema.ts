import { z } from "zod";
import { isDeepStrictEqual } from "node:util";

import { FORGE_SCHEMA_VERSION } from "../intake/constants.js";
import { planArtifactSchema } from "../plan/schema.js";
import { verifyArtifactSchema } from "../verify/schema.js";
import type { SplitArtifact, SplitFoundationResult } from "./types.js";
import {
  FORGE_SPLIT_COMMAND,
  FORGE_SPLIT_STAGE,
  SPLIT_CONSTRAINT_SOURCES,
  SPLIT_EXECUTION_SCOPES,
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

const splitPlanItemEvidenceSchema = z.object({
  planItem: planArtifactSchema.shape.plan_items.element,
  dependencyGraphEntries: z.array(planArtifactSchema.shape.dependency_graph.element),
  conflictZones: z.array(planArtifactSchema.shape.conflict_zones.element),
  testObligations: z.array(planArtifactSchema.shape.test_obligations.element),
  parallelizationSignal: planArtifactSchema.shape.parallelization_signals.element.nullable(),
  verificationTargets: z.array(verifyArtifactSchema.shape.verification_targets.element),
  verificationCases: z.array(verifyArtifactSchema.shape.verification_cases.element),
  findings: z.array(verifyArtifactSchema.shape.findings.element),
  constraints: z.array(verifyArtifactSchema.shape.constraints.element),
  concerns: z.array(planArtifactSchema.shape.carry_forward.shape.concerns.element),
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
  planItemEvidence: z.array(splitPlanItemEvidenceSchema),
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
  batch2Mission: z.string().min(1),
  implementationPriorities: z.array(z.string().min(1)).min(1),
  requiredImplementationTasks: z.array(z.string().min(1)).min(1),
  requiredCodeSurfaces: z.array(z.string().min(1)).min(1),
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

type SplitPlanningContext = SplitFoundationResult["splitInput"]["context"];
type SplitDependencyGraphEntry = SplitPlanningContext["dependencyGraph"][number];
type SplitConflictZone = SplitPlanningContext["conflictZones"][number];
type SplitTestObligation = SplitPlanningContext["testObligations"][number];
type SplitParallelizationSignal = SplitPlanningContext["parallelizationSignals"][number];
type SplitVerificationTarget = SplitPlanningContext["verificationTargets"][number];
type SplitVerificationCase = SplitPlanningContext["verificationCases"][number];
type SplitFinding = SplitPlanningContext["findings"][number];
type SplitConstraint = SplitPlanningContext["constraints"][number];
type SplitConcern = SplitFoundationResult["splitInput"]["uncertainty"]["planCarryForward"]["concerns"][number];

interface SplitPlanItemEvidenceExpectations {
  dependencyGraphEntriesByPlanItemId: Map<string, SplitDependencyGraphEntry[]>;
  conflictZonesByPlanItemId: Map<string, SplitConflictZone[]>;
  testObligationsByPlanItemId: Map<string, SplitTestObligation[]>;
  parallelizationSignalByPlanItemId: Map<string, SplitParallelizationSignal>;
  verificationTargetsByPlanItemId: Map<string, SplitVerificationTarget[]>;
  verificationCasesByPlanItemId: Map<string, SplitVerificationCase[]>;
  findingsByPlanItemId: Map<string, SplitFinding[]>;
  constraintsByPlanItemId: Map<string, SplitConstraint[]>;
  concernsByPlanItemId: Map<string, SplitConcern[]>;
}

function addToLookup<T>(lookup: Map<string, T[]>, key: string, value: T): void {
  const bucket = lookup.get(key);
  if (bucket) {
    bucket.push(value);
    return;
  }

  lookup.set(key, [value]);
}

function buildSplitPlanItemEvidenceExpectations(
  context: SplitPlanningContext,
  concerns: SplitConcern[],
): SplitPlanItemEvidenceExpectations {
  const dependencyGraphEntriesByPlanItemId = new Map<string, SplitDependencyGraphEntry[]>();
  const conflictZonesByPlanItemId = new Map<string, SplitConflictZone[]>();
  const testObligationsByPlanItemId = new Map<string, SplitTestObligation[]>();
  const parallelizationSignalByPlanItemId = new Map<string, SplitParallelizationSignal>();
  const verificationTargetsByPlanItemId = new Map<string, SplitVerificationTarget[]>();
  const verificationCasesByPlanItemId = new Map<string, SplitVerificationCase[]>();
  const findingsByPlanItemId = new Map<string, SplitFinding[]>();
  const constraintsByPlanItemId = new Map<string, SplitConstraint[]>();
  const concernsByPlanItemId = new Map<string, SplitConcern[]>();
  const verificationCasePlanItemIdsById = new Map<string, string[]>();

  for (const dependencyGraphEntry of context.dependencyGraph) {
    addToLookup(dependencyGraphEntriesByPlanItemId, dependencyGraphEntry.planItemId, dependencyGraphEntry);
  }

  for (const conflictZone of context.conflictZones) {
    for (const planItemId of conflictZone.planItemIds) {
      addToLookup(conflictZonesByPlanItemId, planItemId, conflictZone);
    }
  }

  for (const testObligation of context.testObligations) {
    addToLookup(testObligationsByPlanItemId, testObligation.planItemId, testObligation);
  }

  for (const signal of context.parallelizationSignals) {
    if (!parallelizationSignalByPlanItemId.has(signal.planItemId)) {
      parallelizationSignalByPlanItemId.set(signal.planItemId, signal);
    }
  }

  for (const target of context.verificationTargets) {
    for (const planItemId of target.sourcePlanItemIds) {
      addToLookup(verificationTargetsByPlanItemId, planItemId, target);
    }
  }

  for (const verificationCase of context.verificationCases) {
    verificationCasePlanItemIdsById.set(verificationCase.id, verificationCase.sourcePlanItemIds);

    for (const planItemId of verificationCase.sourcePlanItemIds) {
      addToLookup(verificationCasesByPlanItemId, planItemId, verificationCase);
    }
  }

  for (const finding of context.findings) {
    const planItemIds = verificationCasePlanItemIdsById.get(finding.verification_case_id);
    if (!planItemIds) {
      continue;
    }

    for (const planItemId of planItemIds) {
      addToLookup(findingsByPlanItemId, planItemId, finding);
    }
  }

  for (const constraint of context.constraints) {
    const planItemIds = verificationCasePlanItemIdsById.get(constraint.verification_case_id);
    if (!planItemIds) {
      continue;
    }

    for (const planItemId of planItemIds) {
      addToLookup(constraintsByPlanItemId, planItemId, constraint);
    }
  }

  for (const concern of concerns) {
    for (const planItemId of concern.planItemIds) {
      addToLookup(concernsByPlanItemId, planItemId, concern);
    }
  }

  return {
    dependencyGraphEntriesByPlanItemId,
    conflictZonesByPlanItemId,
    testObligationsByPlanItemId,
    parallelizationSignalByPlanItemId,
    verificationTargetsByPlanItemId,
    verificationCasesByPlanItemId,
    findingsByPlanItemId,
    constraintsByPlanItemId,
    concernsByPlanItemId,
  };
}

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

  const planItems = value.splitInput.context.planItems;
  if (value.splitInput.planItemEvidence.length !== planItems.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Split plan-item evidence must exist for every plan item.",
      path: ["splitInput", "planItemEvidence"],
    });
  }

  const evidenceExpectations = buildSplitPlanItemEvidenceExpectations(
    value.splitInput.context,
    value.splitInput.uncertainty.planCarryForward.concerns,
  );

  for (const [index, evidence] of value.splitInput.planItemEvidence.entries()) {
    const planItem = planItems[index];
    if (!planItem) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Split plan-item evidence must stay aligned with plan items.",
        path: ["splitInput", "planItemEvidence", index],
      });
      continue;
    }

    if (evidence.planItem.id !== planItem.id) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Split plan-item evidence must preserve plan-item ordering and ids.",
        path: ["splitInput", "planItemEvidence", index, "planItem", "id"],
      });
    }

    if (!isDeepStrictEqual(evidence.planItem, planItem)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Plan-item evidence must preserve the source plan item exactly.",
        path: ["splitInput", "planItemEvidence", index, "planItem"],
      });
    }

    const expectedDependencyGraphEntries = evidenceExpectations.dependencyGraphEntriesByPlanItemId.get(planItem.id) ?? [];
    if (!isDeepStrictEqual(evidence.dependencyGraphEntries, expectedDependencyGraphEntries)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Plan-item evidence dependency graph entries must mirror the source plan item exactly.",
        path: ["splitInput", "planItemEvidence", index, "dependencyGraphEntries"],
      });
    }

    const expectedConflictZones = evidenceExpectations.conflictZonesByPlanItemId.get(planItem.id) ?? [];
    if (!isDeepStrictEqual(evidence.conflictZones, expectedConflictZones)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Plan-item evidence conflict zones must mirror the source plan item exactly.",
        path: ["splitInput", "planItemEvidence", index, "conflictZones"],
      });
    }

    const expectedTestObligations = evidenceExpectations.testObligationsByPlanItemId.get(planItem.id) ?? [];
    if (!isDeepStrictEqual(evidence.testObligations, expectedTestObligations)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Plan-item evidence test obligations must mirror the source plan item exactly.",
        path: ["splitInput", "planItemEvidence", index, "testObligations"],
      });
    }

    const expectedParallelizationSignal = evidenceExpectations.parallelizationSignalByPlanItemId.get(planItem.id) ?? null;
    if (!isDeepStrictEqual(evidence.parallelizationSignal, expectedParallelizationSignal)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Plan-item evidence parallelization signals must mirror the source plan item exactly.",
        path: ["splitInput", "planItemEvidence", index, "parallelizationSignal"],
      });
    }

    const expectedVerificationTargets = evidenceExpectations.verificationTargetsByPlanItemId.get(planItem.id) ?? [];
    if (!isDeepStrictEqual(evidence.verificationTargets, expectedVerificationTargets)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Plan-item evidence verification targets must mirror the source plan item exactly.",
        path: ["splitInput", "planItemEvidence", index, "verificationTargets"],
      });
    }

    const expectedVerificationCases = evidenceExpectations.verificationCasesByPlanItemId.get(planItem.id) ?? [];
    if (!isDeepStrictEqual(evidence.verificationCases, expectedVerificationCases)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Plan-item evidence verification cases must mirror the source plan item exactly.",
        path: ["splitInput", "planItemEvidence", index, "verificationCases"],
      });
    }

    const expectedFindings = evidenceExpectations.findingsByPlanItemId.get(planItem.id) ?? [];
    if (!isDeepStrictEqual(evidence.findings, expectedFindings)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Plan-item evidence findings must mirror the source verification cases exactly.",
        path: ["splitInput", "planItemEvidence", index, "findings"],
      });
    }

    const expectedConstraints = evidenceExpectations.constraintsByPlanItemId.get(planItem.id) ?? [];
    if (!isDeepStrictEqual(evidence.constraints, expectedConstraints)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Plan-item evidence constraints must mirror the source verification cases exactly.",
        path: ["splitInput", "planItemEvidence", index, "constraints"],
      });
    }

    const expectedConcerns = evidenceExpectations.concernsByPlanItemId.get(planItem.id) ?? [];
    if (!isDeepStrictEqual(evidence.concerns, expectedConcerns)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Plan-item evidence concerns must mirror the source plan item exactly.",
        path: ["splitInput", "planItemEvidence", index, "concerns"],
      });
    }
  }
});

export function validateSplitFoundationResult(result: unknown): SplitFoundationResult {
  return splitFoundationSchema.parse(result);
}

const splitWorkstreamSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  category: z.enum(SPLIT_STREAM_CATEGORIES),
  sourcePlanItemIds: z.array(z.string().min(1)),
  sourceVerificationCaseIds: z.array(z.string().min(1)),
  sourceFindingIds: z.array(z.string().min(1)),
  likelyAffectedPaths: z.array(z.string().min(1)),
  streamDependencies: z.array(z.string().min(1)),
  mergeOrderRequirements: z.array(z.string().min(1)),
  constraints: z.array(z.string().min(1)),
  blockedReason: z.string().min(1).nullable(),
}).strict();

const splitDependencyEdgeSchema = z.object({
  upstreamWorkstreamId: z.string().min(1),
  downstreamWorkstreamId: z.string().min(1),
  reason: z.string().min(1),
}).strict();

const splitMergeOrderEntrySchema = z.object({
  id: z.string().min(1),
  workstreamId: z.string().min(1),
  order: z.number().int().positive(),
  ruleType: z.enum(["serial", "dependency", "protected_merge"]),
  mustMergeAfterWorkstreamIds: z.array(z.string().min(1)),
  reason: z.string().min(1),
  sourceDependencyIds: z.array(z.string().min(1)),
  sourceConstraintIds: z.array(z.string().min(1)),
  sourceConcernIds: z.array(z.string().min(1)),
}).strict();

const splitBlockedItemSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["input_blocker", "blocked_workstream", "blocked_plan_item"]),
  code: z.string().min(1),
  message: z.string().min(1),
  workstreamId: z.string().min(1).nullable(),
  sourcePlanItemIds: z.array(z.string().min(1)),
  sourceVerificationCaseIds: z.array(z.string().min(1)),
  sourceFindingIds: z.array(z.string().min(1)),
  sourceConstraintIds: z.array(z.string().min(1)),
  sourceConcernIds: z.array(z.string().min(1)),
  partialMetadataAvailable: z.boolean(),
}).strict();

const splitStreamConstraintDetailSchema = z.object({
  workstreamId: z.string().min(1),
  baseCategory: z.enum(SPLIT_STREAM_CATEGORIES),
  category: z.enum(SPLIT_STREAM_CATEGORIES),
  appliedRules: z.array(z.string().min(1)),
  categoryReasons: z.array(z.string().min(1)),
  mergeOrderReasons: z.array(z.string().min(1)),
  blockingReasons: z.array(z.string().min(1)),
  warningNotes: z.array(z.string().min(1)),
  mitigationSummaries: z.array(z.string().min(1)),
  sourceDependencyIds: z.array(z.string().min(1)),
  sourceConflictZoneIds: z.array(z.string().min(1)),
  sourceTestObligationIds: z.array(z.string().min(1)),
  sourceVerificationTargetIds: z.array(z.string().min(1)),
  sourceVerificationCaseIds: z.array(z.string().min(1)),
  sourceFindingIds: z.array(z.string().min(1)),
  sourceConstraintIds: z.array(z.string().min(1)),
  sourceConcernIds: z.array(z.string().min(1)),
  sourceReadinessIds: z.array(z.enum(["planning_readiness", "verification_readiness"])),
  blockedUpstreamWorkstreamIds: z.array(z.string().min(1)),
  blockedPlanItemIds: z.array(z.string().min(1)),
  mergeOrderRuleIds: z.array(z.string().min(1)),
  blockedItemIds: z.array(z.string().min(1)),
  mergeOrderRequirements: z.array(z.string().min(1)),
  blockedReason: z.string().min(1).nullable(),
}).strict();

const splitArtifactFilesSchema = z.object({
  artifactPath: z.string().min(1).nullable(),
  reportPath: z.string().min(1).nullable(),
  debugArtifactPath: z.string().min(1),
  debugWorkstreamsPath: z.string().min(1),
  debugMergeOrderPath: z.string().min(1),
  debugBlockedItemsPath: z.string().min(1),
  debugStreamConstraintsPath: z.string().min(1),
}).strict();

const splitWritePolicySchema = z.object({
  mode: z.literal("output-root-only"),
  repoReadOnlyOutsideOutputRoot: z.boolean(),
  allowedRoot: z.string().min(1),
  allowedSideEffects: z.array(z.string().min(1)).min(1),
  deferredCapabilities: z.array(z.string().min(1)).min(1),
  disallowedCapabilities: z.array(z.string().min(1)).min(1),
}).strict();

const splitCarriedForwardConstraintsSchema = z.object({
  findings: z.array(verifyArtifactSchema.shape.findings.element).min(0),
  constraints: z.array(verifyArtifactSchema.shape.constraints.element).min(0),
  plan_concerns: z.array(planArtifactSchema.shape.carry_forward.shape.concerns.element).min(0),
  planning_readiness: planArtifactSchema.shape.planning_readiness,
  verification_readiness: verifyArtifactSchema.shape.verification_readiness,
  stream_constraint_details: z.array(splitStreamConstraintDetailSchema),
}).strict();

const splitDiagnosticsSchema = z.object({
  usability_status: z.enum(["actionable", "non_actionable", "upstream_blocked"]),
  warning_items: z.array(splitInputIssueSchema),
  blocking_items: z.array(splitInputIssueSchema),
  partial_output: z.object({
    code: z.string().min(1),
    message: z.string().min(1),
    fallbackReason: z.string().min(1).optional(),
  }).strict().nullable(),
}).strict();

const splitReadinessSchema = z.object({
  ready: z.boolean(),
  status: z.enum(["ready", "ready_with_warnings", "blocked"]),
  summary: z.string().min(1),
  execution_scope: z.enum(SPLIT_EXECUTION_SCOPES),
  blocked_workstream_count: z.number().int().nonnegative(),
  partially_blocked_item_count: z.number().int().nonnegative(),
  merge_order_rule_count: z.number().int().nonnegative(),
  warning_items: z.array(splitInputIssueSchema),
  blocking_issues: z.array(splitInputIssueSchema),
  partial_output: z.object({
    code: z.string().min(1),
    message: z.string().min(1),
    fallbackReason: z.string().min(1).optional(),
  }).strict().nullable(),
  constraining_concern_ids: z.array(z.string().min(1)),
  recommended_user_actions: z.array(z.string().min(1)),
}).strict();

export const SPLIT_ARTIFACT_TOP_LEVEL_KEYS = [
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
  "source_verify",
  "source_plan",
  "workstream_contract",
  "workstreams",
  "dependency_edges",
  "merge_order",
  "blocked_items",
  "carried_forward_constraints",
  "split_diagnostics",
  "split_readiness",
  "failure",
] as const satisfies readonly (keyof SplitArtifact)[];

function assertSplitArtifactTopLevelKeys(artifact: SplitArtifact): void {
  const actualKeys = Object.keys(artifact);
  const expectedKeys = [...SPLIT_ARTIFACT_TOP_LEVEL_KEYS];

  if (
    actualKeys.length !== expectedKeys.length ||
    actualKeys.some((key, index) => key !== expectedKeys[index])
  ) {
    throw new Error("Split artifact top-level key contract drifted from the required set.");
  }
}

export const splitArtifactSchema = z.object({
  schemaVersion: z.literal(FORGE_SCHEMA_VERSION),
  command: z.literal(`forge ${FORGE_SPLIT_COMMAND}`),
  stage: z.literal(FORGE_SPLIT_STAGE),
  status: z.enum(["ready", "blocked", "failed"]),
  purpose: z.string().min(1),
  repoRoot: z.string().min(1),
  requestedOutputRoot: z.string().nullable(),
  outputRoot: z.string().min(1),
  writePolicy: splitWritePolicySchema,
  files: splitArtifactFilesSchema,
  startedAt: z.string().min(1),
  finishedAt: z.string().min(1),
  summary: z.string().min(1),
  boundaryNotes: z.array(z.string().min(1)).min(1),
  source_verify: splitVerifyReferenceSchema,
  source_plan: splitPlanReferenceSchema,
  workstream_contract: splitWorkstreamContractSchema,
  workstreams: z.array(splitWorkstreamSchema),
  dependency_edges: z.array(splitDependencyEdgeSchema),
  merge_order: z.array(splitMergeOrderEntrySchema),
  blocked_items: z.array(splitBlockedItemSchema),
  carried_forward_constraints: splitCarriedForwardConstraintsSchema,
  split_diagnostics: splitDiagnosticsSchema,
  split_readiness: splitReadinessSchema,
  failure: z.object({
    code: z.string().min(1),
    message: z.string().min(1),
    fallbackReason: z.string().min(1).optional(),
  }).strict().nullable(),
}).strict().superRefine((value, context) => {
  const diagnosticWarnings = value.split_diagnostics.warning_items;
  const readinessWarnings = value.split_readiness.warning_items;
  if (
    diagnosticWarnings.length !== readinessWarnings.length ||
    diagnosticWarnings.some(
      (item, index) =>
        item.code !== readinessWarnings[index]?.code ||
        item.message !== readinessWarnings[index]?.message,
    )
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Split readiness warning items must mirror split diagnostics warning items.",
      path: ["split_readiness", "warning_items"],
    });
  }

  const diagnosticBlockingItems = value.split_diagnostics.blocking_items;
  const readinessBlockingIssues = value.split_readiness.blocking_issues;
  if (
    diagnosticBlockingItems.length !== readinessBlockingIssues.length ||
    diagnosticBlockingItems.some(
      (item, index) =>
        item.code !== readinessBlockingIssues[index]?.code ||
        item.message !== readinessBlockingIssues[index]?.message,
    )
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Split readiness blocking issues must mirror split diagnostics blocking items.",
      path: ["split_readiness", "blocking_issues"],
    });
  }

  if (
    value.split_diagnostics.partial_output?.code !== value.split_readiness.partial_output?.code ||
    value.split_diagnostics.partial_output?.message !== value.split_readiness.partial_output?.message ||
    value.split_diagnostics.partial_output?.fallbackReason !== value.split_readiness.partial_output?.fallbackReason
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Split readiness partial output must mirror split diagnostics partial output.",
      path: ["split_readiness", "partial_output"],
    });
  }

  const hasWarnings =
    readinessWarnings.length > 0 ||
    value.split_readiness.constraining_concern_ids.length > 0 ||
    value.split_readiness.partial_output !== null;
  const expectedReadinessStatus = value.split_readiness.ready
    ? hasWarnings
      ? "ready_with_warnings"
      : "ready"
    : "blocked";
  if (value.split_readiness.status !== expectedReadinessStatus) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Split readiness status must match the resolved ready/warning/block state.",
      path: ["split_readiness", "status"],
    });
  }

  const expectedTopLevelStatus = value.failure
    ? "failed"
    : value.split_readiness.ready
      ? "ready"
      : "blocked";
  if (value.status !== expectedTopLevelStatus) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Split artifact status must match the readiness and failure matrix.",
      path: ["status"],
    });
  }

  const expectedExecutionScope = !value.split_readiness.ready
    ? "none"
    : value.split_readiness.blocked_workstream_count > 0 || value.split_readiness.partially_blocked_item_count > 0
      ? "non_blocked_only"
      : "all_streams";
  if (value.split_readiness.execution_scope !== expectedExecutionScope) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Split readiness execution scope must match the ready and blocked-item state.",
      path: ["split_readiness", "execution_scope"],
    });
  }

  const carriedPlanningReadiness = value.carried_forward_constraints.planning_readiness;
  if (
    JSON.stringify(carriedPlanningReadiness) !==
    JSON.stringify(value.source_plan.planningReadiness)
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Split carried-forward planning readiness must mirror the source Step 2 planning readiness.",
      path: ["carried_forward_constraints", "planning_readiness"],
    });
  }

  const carriedVerificationReadiness = value.carried_forward_constraints.verification_readiness;
  if (
    JSON.stringify(carriedVerificationReadiness) !==
    JSON.stringify(value.source_verify.verificationReadiness)
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Split carried-forward verification readiness must mirror the source Step 3 verification readiness.",
      path: ["carried_forward_constraints", "verification_readiness"],
    });
  }

  const workstreamIds = new Set(value.workstreams.map((workstream) => workstream.id));
  const mergeOrderIds = new Set(value.merge_order.map((entry) => entry.id));
  const blockedItemIds = new Set(value.blocked_items.map((item) => item.id));
  const blockedWorkstreamCount = value.blocked_items.filter((item) => item.kind === "blocked_workstream").length;
  const partiallyBlockedItemCount = value.blocked_items.filter((item) => item.kind === "blocked_plan_item").length;
  if (value.split_readiness.blocked_workstream_count !== blockedWorkstreamCount) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Split readiness blocked_workstream_count must match blocked_items.",
      path: ["split_readiness", "blocked_workstream_count"],
    });
  }
  if (value.split_readiness.partially_blocked_item_count !== partiallyBlockedItemCount) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Split readiness partially_blocked_item_count must match blocked_items.",
      path: ["split_readiness", "partially_blocked_item_count"],
    });
  }
  if (value.split_readiness.merge_order_rule_count !== value.merge_order.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Split readiness merge_order_rule_count must match merge_order.",
      path: ["split_readiness", "merge_order_rule_count"],
    });
  }
  for (const [index, workstream] of value.workstreams.entries()) {
    if (workstream.category === "blocked" && workstream.blockedReason === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Blocked workstreams must expose a blockedReason.",
        path: ["workstreams", index, "blockedReason"],
      });
    }

    if (workstream.category !== "blocked" && workstream.blockedReason !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Non-blocked workstreams must not expose a blockedReason.",
        path: ["workstreams", index, "blockedReason"],
      });
    }

    for (const [dependencyIndex, dependencyId] of workstream.streamDependencies.entries()) {
      if (!workstreamIds.has(dependencyId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Workstream dependencies must reference real workstream ids.",
          path: ["workstreams", index, "streamDependencies", dependencyIndex],
        });
      }
    }
  }

  for (const [index, edge] of value.dependency_edges.entries()) {
    if (!workstreamIds.has(edge.upstreamWorkstreamId) || !workstreamIds.has(edge.downstreamWorkstreamId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Dependency edges must reference real workstream ids.",
        path: ["dependency_edges", index],
      });
    }

    if (edge.upstreamWorkstreamId === edge.downstreamWorkstreamId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Dependency edges must not point a workstream at itself.",
        path: ["dependency_edges", index],
      });
    }
  }

  for (const [index, entry] of value.merge_order.entries()) {
    if (!workstreamIds.has(entry.workstreamId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Merge-order entries must reference real workstream ids.",
        path: ["merge_order", index, "workstreamId"],
      });
    }

    for (const [dependencyIndex, dependencyId] of entry.mustMergeAfterWorkstreamIds.entries()) {
      if (!workstreamIds.has(dependencyId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Merge-order dependencies must reference real workstream ids.",
          path: ["merge_order", index, "mustMergeAfterWorkstreamIds", dependencyIndex],
        });
      }
    }
  }

  const inputBlockingItems = value.blocked_items.filter((item) => item.kind === "input_blocker");
  if (
    inputBlockingItems.length !== value.split_diagnostics.blocking_items.length ||
    inputBlockingItems.some(
      (item, index) =>
        item.code !== value.split_diagnostics.blocking_items[index]?.code ||
        item.message !== value.split_diagnostics.blocking_items[index]?.message ||
        item.workstreamId !== null ||
        item.partialMetadataAvailable !== false,
    )
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Input-blocker items must mirror the upstream split diagnostics blockers.",
      path: ["blocked_items"],
    });
  }

  for (const [index, item] of value.blocked_items.entries()) {
    if (item.kind === "input_blocker") {
      if (item.workstreamId !== null) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Input blockers must not reference a workstream id.",
          path: ["blocked_items", index, "workstreamId"],
        });
      }
    } else {
      if (!item.workstreamId || !workstreamIds.has(item.workstreamId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Blocked workstream items must reference a real blocked workstream id.",
          path: ["blocked_items", index, "workstreamId"],
        });
      }
      if (!item.partialMetadataAvailable) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Blocked workstream items must keep partial metadata available.",
          path: ["blocked_items", index, "partialMetadataAvailable"],
        });
      }
    }
  }

  const detailEntries = value.carried_forward_constraints.stream_constraint_details;
  if (detailEntries.length !== value.workstreams.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Stream constraint details must exist for every workstream.",
      path: ["carried_forward_constraints", "stream_constraint_details"],
    });
  }

  for (const [index, detail] of detailEntries.entries()) {
    if (!workstreamIds.has(detail.workstreamId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Stream constraint details must reference real workstream ids.",
        path: ["carried_forward_constraints", "stream_constraint_details", index, "workstreamId"],
      });
    }

    for (const [ruleIndex, ruleId] of detail.mergeOrderRuleIds.entries()) {
      if (!mergeOrderIds.has(ruleId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Stream constraint details must reference real merge-order rule ids.",
          path: ["carried_forward_constraints", "stream_constraint_details", index, "mergeOrderRuleIds", ruleIndex],
        });
      }
    }

    for (const [blockedIndex, blockedId] of detail.blockedItemIds.entries()) {
      if (!blockedItemIds.has(blockedId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Stream constraint details must reference real blocked-item ids.",
          path: ["carried_forward_constraints", "stream_constraint_details", index, "blockedItemIds", blockedIndex],
        });
      }
    }
  }
});

export function validateSplitArtifact(artifact: unknown): SplitArtifact {
  const parsedArtifact = splitArtifactSchema.parse(artifact);
  assertSplitArtifactTopLevelKeys(parsedArtifact);
  return parsedArtifact;
}
