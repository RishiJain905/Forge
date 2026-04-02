import type { PlanArtifact } from "../plan/types.js";
import type { VerifyArtifact } from "../verify/types.js";
import type {
  SplitBlockedItem,
  SplitDependencyEdge,
  SplitFoundationResult,
  SplitInputIssue,
  SplitMergeOrderEntry,
  SplitStreamCategory,
  SplitStreamConstraintDetail,
  SplitWorkstream,
  SplitWorkstreamBuildResult,
} from "./types.js";

type PlanItem = PlanArtifact["plan_items"][number];
type VerificationCase = VerifyArtifact["verification_cases"][number];
type VerificationFinding = VerifyArtifact["findings"][number];
type VerificationConstraint = VerifyArtifact["constraints"][number];
type CarryForwardConcern = PlanArtifact["carry_forward"]["concerns"][number];

function dedupeStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = value.trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    result.push(normalized);
  }

  return result;
}

function dedupeIssues(items: SplitInputIssue[]): SplitInputIssue[] {
  const seen = new Set<string>();
  const result: SplitInputIssue[] = [];

  for (const item of items) {
    const key = `${item.code}::${item.message}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(item);
  }

  return result;
}

function workstreamIdForPlanItem(planItemId: string): string {
  return `ws-${planItemId}`;
}

function dependencySourceId(entry: PlanArtifact["dependency_graph"][number]): string {
  return `dependency:${entry.dependsOnPlanItemId}->${entry.planItemId}`;
}

function testObligationSourceId(entry: PlanArtifact["test_obligations"][number]): string {
  return `test:${entry.planItemId}:${entry.category}`;
}

function mergeOrderRuleId(workstreamId: string): string {
  return `merge:${workstreamId}`;
}

function blockedItemId(workstreamId: string): string {
  return `blocked:${workstreamId}`;
}

function buildDescription(planItem: PlanItem): string {
  return `${planItem.description} Step 4 keeps this workstream explicitly traceable to its Step 2 and Step 3 inputs so later execution can honor carried-forward safety and merge-order constraints.`;
}

function formatConstraint(sourceId: string, message: string): string {
  return `${sourceId}: ${message}`;
}

function findCasesForPlanItem(
  verificationCases: VerificationCase[],
  planItemId: string,
): VerificationCase[] {
  return verificationCases.filter((verificationCase) =>
    verificationCase.sourcePlanItemIds.includes(planItemId)
  );
}

function findFindingsForCases(
  findings: VerificationFinding[],
  verificationCaseIds: string[],
): VerificationFinding[] {
  const caseIds = new Set(verificationCaseIds);
  return findings.filter((finding) => caseIds.has(finding.verification_case_id));
}

function findConstraintsForCases(
  constraints: VerificationConstraint[],
  verificationCaseIds: string[],
): VerificationConstraint[] {
  const caseIds = new Set(verificationCaseIds);
  return constraints.filter((constraint) => caseIds.has(constraint.verification_case_id));
}

function findConcernsForPlanItem(
  concerns: CarryForwardConcern[],
  planItemId: string,
): CarryForwardConcern[] {
  return concerns.filter((concern) => concern.planItemIds.includes(planItemId));
}

function buildConstraintMessages(params: {
  planItem: PlanItem;
  dependencyGraph: PlanArtifact["dependency_graph"];
  conflictZones: PlanArtifact["conflict_zones"];
  testObligations: PlanArtifact["test_obligations"];
  verificationConstraints: VerificationConstraint[];
  concerns: CarryForwardConcern[];
}): string[] {
  const dependencyMessages = params.dependencyGraph
    .filter((entry) => entry.planItemId === params.planItem.id)
    .map((entry) => formatConstraint(`dependency:${entry.dependsOnPlanItemId}`, entry.reason));
  const conflictMessages = params.conflictZones
    .filter((zone) => zone.planItemIds.includes(params.planItem.id))
    .map((zone) => formatConstraint(zone.id, zone.reason));
  const testMessages = params.testObligations
    .filter((entry) => entry.planItemId === params.planItem.id)
    .map((entry) => formatConstraint(`test:${entry.category}`, entry.reason));
  const verificationMessages = params.verificationConstraints
    .map((constraint) => formatConstraint(constraint.id, constraint.summary));
  const concernMessages = params.concerns
    .map((concern) => formatConstraint(concern.id, concern.message));

  return dedupeStrings([
    ...dependencyMessages,
    ...conflictMessages,
    ...testMessages,
    ...verificationMessages,
    ...concernMessages,
  ]);
}

function buildMergeOrderRequirements(params: {
  planItem: PlanItem;
  category: SplitStreamCategory;
  streamDependencies: string[];
  verificationConstraints: VerificationConstraint[];
  blockedReason: string | null;
}): string[] {
  const requirements: string[] = [];

  if (params.streamDependencies.length > 0) {
    requirements.push(
      `Wait for ${params.streamDependencies.join(", ")} before parallel execution or merge.`,
    );
  }

  if (params.category === "serial") {
    requirements.push("Serial-only stream; execute and merge in isolation.");
  }

  if (params.category === "protected_merge") {
    requirements.push("Protected merge required due to shared-risk or verification constraints.");
  }

  if (params.category === "parallel_after_dependency" && params.streamDependencies.length === 0) {
    requirements.push("Parallel execution is allowed only after declared prerequisites settle.");
  }

  if (params.blockedReason) {
    requirements.push(`Blocked until resolved: ${params.blockedReason}`);
  }

  for (const constraint of params.verificationConstraints) {
    requirements.push(`Honor ${constraint.id} before merge: ${constraint.summary}`);
  }

  return dedupeStrings(requirements);
}

function resolveBaseCategory(planItem: PlanItem): SplitStreamCategory {
  switch (planItem.parallelization.signal) {
    case "serial_only":
      return "serial";
    case "parallel_after_dependency":
      return "parallel_after_dependency";
    case "protected_merge_order":
    case "risky_shared":
      return "protected_merge";
    case "safe_parallel":
    default:
      return "safe_parallel";
  }
}

function hasBlockingVerificationCase(verificationCases: VerificationCase[]): boolean {
  return verificationCases.some((verificationCase) =>
    ["failed", "errored", "invalid_spec"].includes(verificationCase.status)
  );
}

function hasBlockingVerificationFinding(findings: VerificationFinding[]): boolean {
  return findings.some((finding) =>
    ["failed", "errored", "invalid_spec"].includes(finding.status)
  );
}

function resolveCategory(params: {
  foundation: SplitFoundationResult;
  planItem: PlanItem;
  verificationCases: VerificationCase[];
  verificationFindings: VerificationFinding[];
  verificationConstraints: VerificationConstraint[];
  conflictZones: PlanArtifact["conflict_zones"];
  appliedRules: string[];
}): SplitStreamCategory {
  if (params.foundation.splitInput.usability.status === "upstream_blocked") {
    params.appliedRules.push("upstream_blocked");
    return "blocked";
  }

  if (
    hasBlockingVerificationCase(params.verificationCases) ||
    hasBlockingVerificationFinding(params.verificationFindings)
  ) {
    params.appliedRules.push("blocking_verification_evidence");
    return "blocked";
  }

  const baseCategory = resolveBaseCategory(params.planItem);
  params.appliedRules.push(`parallelization:${params.planItem.parallelization.signal}`);

  if (
    baseCategory === "safe_parallel" &&
    params.planItem.verificationRelevance.categories.includes("migration_order")
  ) {
    params.appliedRules.push("verification_relevance:migration_order");
    return "serial";
  }

  const sharedConflictZone = params.conflictZones.some((zone) =>
    zone.planItemIds.includes(params.planItem.id) && zone.riskLevel === "high"
  );
  const hasProtectedVerificationConstraint = params.verificationConstraints.length > 0 &&
    (params.planItem.verificationRelevance.categories.includes("api_contract") ||
      params.planItem.verificationRelevance.categories.includes("parallel_overlap") ||
      sharedConflictZone);

  if (baseCategory === "safe_parallel" && hasProtectedVerificationConstraint) {
    params.appliedRules.push("shared_risk_constraint");
    return "protected_merge";
  }

  return baseCategory;
}

function resolveBlockedReason(params: {
  foundation: SplitFoundationResult;
  verificationCases: VerificationCase[];
  verificationFindings: VerificationFinding[];
}): string | null {
  if (params.foundation.splitInput.usability.status === "upstream_blocked") {
    return params.foundation.splitInput.usability.blockingItems[0]?.message ??
      "Split is blocked by upstream Step 3 readiness.";
  }

  const blockingFinding = params.verificationFindings.find((finding) =>
    ["failed", "errored", "invalid_spec"].includes(finding.status)
  );
  if (blockingFinding) {
    return blockingFinding.summary;
  }

  const blockingCase = params.verificationCases.find((verificationCase) =>
    ["failed", "errored", "invalid_spec"].includes(verificationCase.status)
  );
  if (blockingCase) {
    return blockingCase.summary;
  }

  return null;
}

function buildDependencyEdges(
  dependencyGraph: PlanArtifact["dependency_graph"],
): SplitDependencyEdge[] {
  return dependencyGraph.map((entry) => ({
    upstreamWorkstreamId: workstreamIdForPlanItem(entry.dependsOnPlanItemId),
    downstreamWorkstreamId: workstreamIdForPlanItem(entry.planItemId),
    reason: entry.reason,
  }));
}

function computeStreamDepth(
  workstreamId: string,
  dependencyByDownstream: Map<string, string[]>,
  cache: Map<string, number>,
  visiting: Set<string> = new Set(),
): number {
  const cached = cache.get(workstreamId);
  if (typeof cached === "number") {
    return cached;
  }

  if (visiting.has(workstreamId)) {
    return 0;
  }

  const upstreamIds = dependencyByDownstream.get(workstreamId) ?? [];
  if (upstreamIds.length === 0) {
    cache.set(workstreamId, 0);
    return 0;
  }

  visiting.add(workstreamId);
  try {
    let maxUpstreamDepth = 0;

    for (const upstreamId of upstreamIds) {
      const upstreamDepth = computeStreamDepth(upstreamId, dependencyByDownstream, cache, visiting);
      if (upstreamDepth > maxUpstreamDepth) {
        maxUpstreamDepth = upstreamDepth;
      }
    }

    const depth = maxUpstreamDepth + 1;
    cache.set(workstreamId, depth);
    return depth;
  } finally {
    visiting.delete(workstreamId);
  }
}

function buildMergeOrder(params: {
  workstreams: SplitWorkstream[];
  dependencyEdges: SplitDependencyEdge[];
  workstreamOrder: string[];
  streamConstraintDetails: SplitStreamConstraintDetail[];
}): SplitMergeOrderEntry[] {
  const dependencyByDownstream = new Map<string, string[]>();

  for (const edge of params.dependencyEdges) {
    dependencyByDownstream.set(edge.downstreamWorkstreamId, [
      ...(dependencyByDownstream.get(edge.downstreamWorkstreamId) ?? []),
      edge.upstreamWorkstreamId,
    ]);
  }

  const depthCache = new Map<string, number>();
  const constrainedWorkstreams = params.workstreams.filter((workstream) =>
    workstream.category === "serial" ||
    workstream.category === "protected_merge" ||
    workstream.category === "parallel_after_dependency"
  );
  const detailByWorkstreamId = new Map(
    params.streamConstraintDetails.map((detail) => [detail.workstreamId, detail] as const),
  );

  const indexById = new Map(params.workstreamOrder.map((workstreamId, index) => [workstreamId, index] as const));

  constrainedWorkstreams.sort((left, right) => {
    const leftDepth = computeStreamDepth(left.id, dependencyByDownstream, depthCache);
    const rightDepth = computeStreamDepth(right.id, dependencyByDownstream, depthCache);
    if (leftDepth !== rightDepth) {
      return leftDepth - rightDepth;
    }

    return (indexById.get(left.id) ?? 0) - (indexById.get(right.id) ?? 0);
  });

  return constrainedWorkstreams.map((workstream, index) => ({
    id: mergeOrderRuleId(workstream.id),
    workstreamId: workstream.id,
    order: index + 1,
    ruleType:
      workstream.category === "serial"
        ? "serial"
        : workstream.category === "protected_merge"
          ? "protected_merge"
          : "dependency",
    mustMergeAfterWorkstreamIds: [...workstream.streamDependencies],
    reason:
      workstream.category === "serial"
        ? "Serial-only stream requires isolated merge ordering."
        : workstream.category === "protected_merge"
          ? "Protected merge stream keeps shared-risk work under explicit ordering."
          : "Dependent stream must merge after its upstream work settles.",
    sourceDependencyIds: detailByWorkstreamId.get(workstream.id)?.sourceDependencyIds ?? [],
    sourceConstraintIds: detailByWorkstreamId.get(workstream.id)?.sourceConstraintIds ?? [],
    sourceConcernIds: detailByWorkstreamId.get(workstream.id)?.sourceConcernIds ?? [],
  }));
}

export function buildSplitWorkstreams(params: {
  foundation: SplitFoundationResult;
}): SplitWorkstreamBuildResult {
  const concerns = params.foundation.carryForward.planCarryForward.concerns;
  const dependencyEdges = buildDependencyEdges(params.foundation.splitInput.context.dependencyGraph);
  const workstreamOrder: string[] = [];
  const streamConstraintDetails: SplitStreamConstraintDetail[] = [];

  const workstreams = params.foundation.splitInput.context.planItems.map((planItem) => {
    const verificationCases = findCasesForPlanItem(
      params.foundation.splitInput.context.verificationCases,
      planItem.id,
    );
    const verificationCaseIds = verificationCases.map((verificationCase) => verificationCase.id);
    const verificationFindings = findFindingsForCases(
      params.foundation.splitInput.context.findings,
      verificationCaseIds,
    );
    const verificationConstraints = findConstraintsForCases(
      params.foundation.splitInput.context.constraints,
      verificationCaseIds,
    );
    const itemConcerns = findConcernsForPlanItem(concerns, planItem.id);
    const sourceDependencyIds = params.foundation.splitInput.context.dependencyGraph
      .filter((entry) => entry.planItemId === planItem.id)
      .map(dependencySourceId);
    const sourceConflictZoneIds = params.foundation.splitInput.context.conflictZones
      .filter((zone) => zone.planItemIds.includes(planItem.id))
      .map((zone) => zone.id);
    const sourceTestObligationIds = params.foundation.splitInput.context.testObligations
      .filter((entry) => entry.planItemId === planItem.id)
      .map(testObligationSourceId);
    const sourceVerificationTargetIds = dedupeStrings(
      verificationCases.map((verificationCase) => verificationCase.verificationTargetId),
    );
    const sourceReadinessIds = dedupeStrings([
      params.foundation.sourcePlan.planningReadiness.status === "ready" ? "" : "planning_readiness",
      params.foundation.sourceVerify.verificationReadiness.status === "ready" ? "" : "verification_readiness",
    ]);
    const appliedRules: string[] = [];
    const category = resolveCategory({
      foundation: params.foundation,
      planItem,
      verificationCases,
      verificationFindings,
      verificationConstraints,
      conflictZones: params.foundation.splitInput.context.conflictZones,
      appliedRules,
    });
    const blockedReason = resolveBlockedReason({
      foundation: params.foundation,
      verificationCases,
      verificationFindings,
    });
    const streamDependencies = planItem.dependencies.map((dependency) =>
      workstreamIdForPlanItem(dependency.planItemId)
    );
    const mergeOrderRequirements = buildMergeOrderRequirements({
      planItem,
      category,
      streamDependencies,
      verificationConstraints,
      blockedReason,
    });
    const constraints = buildConstraintMessages({
      planItem,
      dependencyGraph: params.foundation.splitInput.context.dependencyGraph,
      conflictZones: params.foundation.splitInput.context.conflictZones,
      testObligations: params.foundation.splitInput.context.testObligations,
      verificationConstraints,
      concerns: itemConcerns,
    });
    const workstreamId = workstreamIdForPlanItem(planItem.id);
    workstreamOrder.push(workstreamId);

    streamConstraintDetails.push({
      workstreamId,
      category,
      appliedRules,
      sourceDependencyIds,
      sourceConflictZoneIds,
      sourceTestObligationIds,
      sourceVerificationTargetIds,
      sourceVerificationCaseIds: verificationCaseIds,
      sourceFindingIds: verificationFindings.map((finding) => finding.id),
      sourceConstraintIds: verificationConstraints.map((constraint) => constraint.id),
      sourceConcernIds: itemConcerns.map((concern) => concern.id),
      sourceReadinessIds,
      mergeOrderRuleIds: [],
      blockedItemIds: [],
      mergeOrderRequirements,
      blockedReason,
    });

    return {
      id: workstreamId,
      title: planItem.title,
      description: buildDescription(planItem),
      category,
      sourcePlanItemIds: [planItem.id],
      sourceVerificationCaseIds: verificationCaseIds,
      sourceFindingIds: verificationFindings.map((finding) => finding.id),
      likelyAffectedPaths: dedupeStrings(planItem.likelyAffectedPaths),
      streamDependencies,
      mergeOrderRequirements,
      constraints,
      blockedReason,
    } satisfies SplitWorkstream;
  });

  const blockedItems: SplitBlockedItem[] = workstreams
    .filter((workstream) => workstream.category === "blocked")
    .map((workstream) => {
      const detail = streamConstraintDetails.find((entry) => entry.workstreamId === workstream.id);

      return {
        id: blockedItemId(workstream.id),
        kind: "blocked_workstream",
        code: "BLOCKED_WORKSTREAM",
        message: workstream.blockedReason ?? "Blocked workstream",
        workstreamId: workstream.id,
        sourcePlanItemIds: [...workstream.sourcePlanItemIds],
        sourceVerificationCaseIds: detail?.sourceVerificationCaseIds ?? [],
        sourceFindingIds: detail?.sourceFindingIds ?? [],
        sourceConstraintIds: detail?.sourceConstraintIds ?? [],
        sourceConcernIds: detail?.sourceConcernIds ?? [],
        partialMetadataAvailable: true,
      };
    });

  const mergeOrder = buildMergeOrder({
    workstreams,
    dependencyEdges,
    workstreamOrder,
    streamConstraintDetails,
  });
  const mergeOrderIdsByWorkstream = new Map<string, string[]>();
  const blockedItemIdsByWorkstream = new Map<string, string[]>();

  for (const entry of mergeOrder) {
    mergeOrderIdsByWorkstream.set(entry.workstreamId, [
      ...(mergeOrderIdsByWorkstream.get(entry.workstreamId) ?? []),
      entry.id,
    ]);
  }

  for (const item of blockedItems) {
    if (!item.workstreamId) {
      continue;
    }

    blockedItemIdsByWorkstream.set(item.workstreamId, [
      ...(blockedItemIdsByWorkstream.get(item.workstreamId) ?? []),
      item.id,
    ]);
  }

  const updatedStreamConstraintDetails = streamConstraintDetails.map((detail) => ({
    ...detail,
    mergeOrderRuleIds: mergeOrderIdsByWorkstream.get(detail.workstreamId) ?? [],
    blockedItemIds: blockedItemIdsByWorkstream.get(detail.workstreamId) ?? [],
  }));

  const warningItems: SplitInputIssue[] = [];
  const hasBlockedWorkstreams = blockedItems.length > 0;
  if (params.foundation.splitInput.usability.status === "actionable" && hasBlockedWorkstreams) {
    warningItems.push({
      code: "BLOCKED_WORKSTREAMS_PRESENT",
      message:
        "One or more workstreams remain blocked by carried-forward Step 3 evidence and must stay out of active execution.",
    });
  }

  return {
    workstreams,
    dependencyEdges,
    mergeOrder,
    blockedItems,
    warningItems: dedupeIssues(warningItems),
    streamConstraintDetails: updatedStreamConstraintDetails,
  };
}
