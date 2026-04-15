import type { PlanArtifact } from "../plan/types.js";
import type { VerifyArtifact } from "../verify/types.js";
import type {
  SplitBlockedItem,
  SplitDependencyEdge,
  SplitFoundationResult,
  SplitInputIssue,
  SplitMergeOrderEntry,
  SplitPlanItemEvidence,
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
  category: SplitStreamCategory;
  streamDependencies: string[];
  verificationConstraints: VerificationConstraint[];
  blockedReason: string | null;
  groupNote?: string | null;
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

  if (params.groupNote) {
    requirements.push(params.groupNote);
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

type WorkstreamGroupKind = "single" | "direct_dependency_test_pair" | "same_surface_siblings";

interface ResolvedPlanItemSeed {
  evidence: SplitPlanItemEvidence;
  category: SplitStreamCategory;
  blockedReason: string | null;
  dominantSurfaceKey: string | null;
  surfaceSpecificity: number;
  appliedRules: string[];
}

interface WorkstreamGroup {
  id: string;
  kind: WorkstreamGroupKind;
  members: ResolvedPlanItemSeed[];
  category: SplitStreamCategory;
  dominantSurfaceKey: string | null;
  note: string | null;
}

const SURFACE_WRAPPER_SEGMENTS = new Set(["src", "tests", "test", "spec", "lib"]);

function normalizeSurfaceSegments(pathValue: string): string[] {
  const normalizedPath = pathValue.replace(/\\/g, "/").trim();
  if (!normalizedPath) {
    return [];
  }

  const strippedPath = normalizedPath.replace(/^\.\//u, "").replace(/^\/+|\/+$/gu, "");
  const segments = strippedPath.split("/").filter(Boolean);
  if (segments.length === 0) {
    return [];
  }

  const surfaceSegments = [...segments];
  if (surfaceSegments.length > 0 && SURFACE_WRAPPER_SEGMENTS.has(surfaceSegments[0].toLowerCase())) {
    surfaceSegments.shift();
  }

  if (surfaceSegments.length === 0) {
    return [];
  }

  const leafIndex = surfaceSegments.length - 1;
  const leaf = surfaceSegments[leafIndex] ?? "";
  const leafWithoutExtension = leaf.replace(/\.[^.\/]+$/u, "");
  const leafWithoutTestSuffix = leafWithoutExtension.replace(/(?:\.(?:test|spec)|(?:-test|_test))$/iu, "");
  surfaceSegments[leafIndex] = leafWithoutTestSuffix || leafWithoutExtension || leaf;

  return surfaceSegments.filter(Boolean);
}

function buildSurfaceCandidateKeys(pathValue: string): string[] {
  const normalizedPath = pathValue.replace(/\\/g, "/").trim();
  const rawSegments = normalizedPath.replace(/^\.\//u, "").replace(/^\/+|\/+$/gu, "").split("/").filter(Boolean);
  const segments = normalizeSurfaceSegments(pathValue);
  if (segments.length === 0) {
    return [];
  }

  const candidates: string[] = [];
  const isTestLayout = ["tests", "test", "spec"].includes((rawSegments[0] ?? "").toLowerCase());
  const leaf = segments[segments.length - 1] ?? "";
  const parentSurface = segments.length > 1 ? segments.slice(0, segments.length - 1).join("/") : leaf;

  if (isTestLayout) {
    candidates.push(leaf);
    if (parentSurface && parentSurface !== leaf) {
      candidates.push(parentSurface);
    }
  } else {
    if (parentSurface && parentSurface !== leaf) {
      candidates.push(parentSurface);
    }
    candidates.push(leaf);
  }

  for (let index = 1; index <= segments.length; index += 1) {
    candidates.push(segments.slice(0, index).join("/"));
  }
  for (let index = 0; index < segments.length; index += 1) {
    candidates.push(segments.slice(index).join("/"));
  }

  return dedupeStrings(candidates);
}

function resolveSurfaceSpecificity(likelyAffectedPaths: string[]): number {
  let maxSpecificity = 0;

  for (const pathValue of likelyAffectedPaths) {
    const specificity = normalizeSurfaceSegments(pathValue).length;
    if (specificity > maxSpecificity) {
      maxSpecificity = specificity;
    }
  }

  return maxSpecificity;
}

function resolveDominantSurfaceKey(likelyAffectedPaths: string[]): string | null {
  const candidateSets = likelyAffectedPaths
    .map((pathValue) => buildSurfaceCandidateKeys(pathValue))
    .filter((candidates) => candidates.length > 0);

  if (candidateSets.length === 0) {
    return null;
  }

  let sharedCandidates = new Set(candidateSets[0]);
  for (const candidates of candidateSets.slice(1)) {
    const next = new Set<string>();
    for (const candidate of candidates) {
      if (sharedCandidates.has(candidate)) {
        next.add(candidate);
      }
    }
    sharedCandidates = next;
  }

  if (sharedCandidates.size === 0) {
    return null;
  }

  return [...sharedCandidates].sort((left, right) => {
    const leftRank = candidateSets.reduce(
      (total, candidates) => total + Math.max(candidates.indexOf(left), 0),
      0,
    );
    const rightRank = candidateSets.reduce(
      (total, candidates) => total + Math.max(candidates.indexOf(right), 0),
      0,
    );
    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }

    const leftDepth = left.split("/").length;
    const rightDepth = right.split("/").length;
    if (leftDepth !== rightDepth) {
      return rightDepth - leftDepth;
    }

    return left.localeCompare(right);
  })[0] ?? null;
}

function isGroupableStreamCategory(category: SplitStreamCategory): boolean {
  return category !== "blocked" && category !== "serial" && category !== "protected_merge";
}

function isGroupableDependencyType(type: PlanArtifact["dependency_graph"][number]["type"]): boolean {
  return type === "hard";
}

function buildSeedConstraintMessages(seed: ResolvedPlanItemSeed): string[] {
  return dedupeStrings([
    ...seed.evidence.dependencyGraphEntries.map((entry) =>
      formatConstraint(`dependency:${entry.dependsOnPlanItemId}`, entry.reason),
    ),
    ...seed.evidence.conflictZones.map((zone) => formatConstraint(zone.id, zone.reason)),
    ...seed.evidence.testObligations.map((entry) => formatConstraint(`test:${entry.category}`, entry.reason)),
    ...seed.evidence.constraints.map((constraint) => formatConstraint(constraint.id, constraint.summary)),
    ...seed.evidence.concerns.map((concern) => formatConstraint(concern.id, concern.message)),
  ]);
}

function buildGroupNote(kind: WorkstreamGroupKind): string | null {
  if (kind === "single") {
    return null;
  }

  if (kind === "direct_dependency_test_pair") {
    return "Grouped source/test pair; keep the source-before-test order visible inside the stream.";
  }

  return "Grouped same-surface siblings; keep the pair together as a protected merge unit.";
}

function buildGroupingRationale(group: WorkstreamGroup): string {
  const titles = group.members.map((member) => member.evidence.planItem.title);
  if (group.kind === "single") {
    return "Kept as a standalone workstream so its Step 2 and Step 3 traceability remains explicit.";
  }

  const joinedTitles = titles.join(" and ");
  const surfaceSuffix = group.dominantSurfaceKey ? ` on the ${group.dominantSurfaceKey} surface` : "";
  return group.kind === "direct_dependency_test_pair"
    ? `Grouped from ${joinedTitles} because the test item depends directly on the source change${surfaceSuffix}.`
    : `Grouped from ${joinedTitles} because the sibling updates share the same surface context${surfaceSuffix}.`;
}

function buildWorkstreamDescription(group: WorkstreamGroup): string {
  if (group.kind === "single") {
    return buildDescription(group.members[0].evidence.planItem);
  }

  return `${buildGroupingRationale(group)} Step 4 keeps the grouped workstream explicitly traceable to each member plan item.`;
}

function buildGroupAppliedRules(group: WorkstreamGroup): string[] {
  const seedRules = dedupeStrings(group.members.flatMap((member) => member.appliedRules));
  if (group.kind === "single") {
    return seedRules;
  }

  return dedupeStrings([
    ...seedRules,
    `grouping:${group.kind}`,
    `grouped_with:${group.id}`,
    `dominant_surface:${group.dominantSurfaceKey ?? "none"}`,
    ...(group.note ? [group.note] : []),
  ]);
}

interface CandidateChoice {
  kind: WorkstreamGroupKind;
  candidate: ResolvedPlanItemSeed;
  candidateIndex: number;
  sharedContextCount: number;
}

function countSharedGroupingContext(left: ResolvedPlanItemSeed, right: ResolvedPlanItemSeed): number {
  let sharedCount = 0;

  const leftTargetIds = new Set(left.evidence.verificationTargets.map((target) => target.id));
  const rightTargetIds = new Set(right.evidence.verificationTargets.map((target) => target.id));
  for (const targetId of leftTargetIds) {
    if (rightTargetIds.has(targetId)) {
      sharedCount += 1;
    }
  }

  const leftConflictZoneIds = new Set(left.evidence.conflictZones.map((zone) => zone.id));
  const rightConflictZoneIds = new Set(right.evidence.conflictZones.map((zone) => zone.id));
  for (const conflictZoneId of leftConflictZoneIds) {
    if (rightConflictZoneIds.has(conflictZoneId)) {
      sharedCount += 1;
    }
  }

  return sharedCount;
}

function isPreferredCandidateChoice(left: CandidateChoice, right: CandidateChoice): boolean {
  const kindPriority = left.kind === "direct_dependency_test_pair" ? 2 : 1;
  const rightKindPriority = right.kind === "direct_dependency_test_pair" ? 2 : 1;
  if (kindPriority !== rightKindPriority) {
    return kindPriority > rightKindPriority;
  }

  if (left.candidate.surfaceSpecificity !== right.candidate.surfaceSpecificity) {
    return left.candidate.surfaceSpecificity > right.candidate.surfaceSpecificity;
  }

  if (left.sharedContextCount !== right.sharedContextCount) {
    return left.sharedContextCount > right.sharedContextCount;
  }

  if (left.candidateIndex !== right.candidateIndex) {
    return left.candidateIndex < right.candidateIndex;
  }

  return left.candidate.evidence.planItem.id.localeCompare(right.candidate.evidence.planItem.id) < 0;
}

function createResolvedSeeds(params: { foundation: SplitFoundationResult }): ResolvedPlanItemSeed[] {
  return params.foundation.splitInput.context.planItems.map((planItem, index) => {
    const evidence = params.foundation.splitInput.planItemEvidence[index];
    if (!evidence || evidence.planItem.id !== planItem.id) {
      throw new Error("Split workstream evidence is not aligned with the source plan items.");
    }

    const appliedRules: string[] = [];
    const category = resolveCategory({
      foundation: params.foundation,
      planItem,
      verificationCases: evidence.verificationCases,
      verificationFindings: evidence.findings,
      verificationConstraints: evidence.constraints,
      conflictZones: evidence.conflictZones,
      appliedRules,
    });
    const blockedReason = resolveBlockedReason({
      foundation: params.foundation,
      verificationCases: evidence.verificationCases,
      verificationFindings: evidence.findings,
    });
    const dominantSurfaceKey = resolveDominantSurfaceKey(planItem.likelyAffectedPaths);
    const surfaceSpecificity = resolveSurfaceSpecificity(planItem.likelyAffectedPaths);

    return {
      evidence,
      category,
      blockedReason,
      dominantSurfaceKey,
      surfaceSpecificity,
      appliedRules: dedupeStrings([
        ...appliedRules,
        `dominant_surface:${dominantSurfaceKey ?? "none"}`,
        `plan_item:${planItem.id}`,
      ]),
    };
  });
}

function seedDependsOnCandidate(seed: ResolvedPlanItemSeed, candidate: ResolvedPlanItemSeed): boolean {
  return seed.evidence.dependencyGraphEntries.some(
    (entry) => entry.dependsOnPlanItemId === candidate.evidence.planItem.id,
  );
}

function pairHasAnyDirectDependency(left: ResolvedPlanItemSeed, right: ResolvedPlanItemSeed): boolean {
  return seedDependsOnCandidate(left, right) || seedDependsOnCandidate(right, left);
}

function hasOnlyPairInternalDependencies(
  left: ResolvedPlanItemSeed,
  right: ResolvedPlanItemSeed,
): boolean {
  const pairIds = new Set([left.evidence.planItem.id, right.evidence.planItem.id]);
  const dependencyEntries = [...left.evidence.dependencyGraphEntries, ...right.evidence.dependencyGraphEntries];

  return dependencyEntries.every((entry) => pairIds.has(entry.dependsOnPlanItemId));
}

function hasSharedGroupingContext(left: ResolvedPlanItemSeed, right: ResolvedPlanItemSeed): boolean {
  const leftTargetIds = new Set(left.evidence.verificationTargets.map((target) => target.id));
  const rightTargetIds = new Set(right.evidence.verificationTargets.map((target) => target.id));
  for (const targetId of leftTargetIds) {
    if (rightTargetIds.has(targetId)) {
      return true;
    }
  }

  const leftConflictZoneIds = new Set(left.evidence.conflictZones.map((zone) => zone.id));
  const rightConflictZoneIds = new Set(right.evidence.conflictZones.map((zone) => zone.id));
  for (const conflictZoneId of leftConflictZoneIds) {
    if (rightConflictZoneIds.has(conflictZoneId)) {
      return true;
    }
  }

  return false;
}

function isDirectDependencyTestPairCandidate(
  seed: ResolvedPlanItemSeed,
  candidate: ResolvedPlanItemSeed,
): boolean {
  if (
    seed.evidence.planItem.verificationRelevance.categories.includes("migration_order") ||
    candidate.evidence.planItem.verificationRelevance.categories.includes("migration_order")
  ) {
    return false;
  }

  if (!isGroupableStreamCategory(seed.category) || !isGroupableStreamCategory(candidate.category)) {
    return false;
  }

  if (seed.evidence.planItem.category === "test" || candidate.evidence.planItem.category !== "test") {
    return false;
  }

  if (!seed.dominantSurfaceKey || seed.dominantSurfaceKey !== candidate.dominantSurfaceKey) {
    return false;
  }

  if (seedDependsOnCandidate(seed, candidate)) {
    return false;
  }

  return candidate.evidence.dependencyGraphEntries.some(
    (entry) =>
      entry.dependsOnPlanItemId === seed.evidence.planItem.id &&
      isGroupableDependencyType(entry.type),
  );
}

function isSameSurfaceSiblingCandidate(
  seed: ResolvedPlanItemSeed,
  candidate: ResolvedPlanItemSeed,
): boolean {
  if (!isGroupableStreamCategory(seed.category) || !isGroupableStreamCategory(candidate.category)) {
    return false;
  }

  if (seed.evidence.planItem.category === "test" || candidate.evidence.planItem.category === "test") {
    return false;
  }

  if (!seed.dominantSurfaceKey || seed.dominantSurfaceKey !== candidate.dominantSurfaceKey) {
    return false;
  }

  if (!hasSharedGroupingContext(seed, candidate)) {
    return false;
  }

  if (pairHasAnyDirectDependency(seed, candidate)) {
    return false;
  }

  return hasOnlyPairInternalDependencies(seed, candidate);
}

function selectWorkstreamGroups(seeds: ResolvedPlanItemSeed[]): WorkstreamGroup[] {
  const usedPlanItemIds = new Set<string>();
  const groups: WorkstreamGroup[] = [];

  for (let index = 0; index < seeds.length; index += 1) {
    const seed = seeds[index];
    const seedId = seed.evidence.planItem.id;

    if (usedPlanItemIds.has(seedId)) {
      continue;
    }

    let bestChoice: CandidateChoice | null = null;

    for (let candidateIndex = index + 1; candidateIndex < seeds.length; candidateIndex += 1) {
      const possibleCandidate = seeds[candidateIndex];
      const candidateId = possibleCandidate.evidence.planItem.id;
      if (usedPlanItemIds.has(candidateId)) {
        continue;
      }

      const kind = isDirectDependencyTestPairCandidate(seed, possibleCandidate)
        ? "direct_dependency_test_pair"
        : isSameSurfaceSiblingCandidate(seed, possibleCandidate)
          ? "same_surface_siblings"
          : null;
      if (!kind) {
        continue;
      }

      const choice: CandidateChoice = {
        kind,
        candidate: possibleCandidate,
        candidateIndex,
        sharedContextCount:
          kind === "same_surface_siblings" ? countSharedGroupingContext(seed, possibleCandidate) : 0,
      };

      if (!bestChoice || isPreferredCandidateChoice(choice, bestChoice)) {
        bestChoice = choice;
      }
    }

    if (bestChoice) {
      usedPlanItemIds.add(seedId);
      usedPlanItemIds.add(bestChoice.candidate.evidence.planItem.id);
      const group: WorkstreamGroup = {
        id: `ws-${seedId}__${bestChoice.candidate.evidence.planItem.id}`,
        kind: bestChoice.kind,
        members: [seed, bestChoice.candidate],
        category:
          bestChoice.kind === "direct_dependency_test_pair"
            ? "parallel_after_dependency"
            : "protected_merge",
        dominantSurfaceKey: seed.dominantSurfaceKey,
        note: buildGroupNote(bestChoice.kind),
      };

      groups.push(group);
      continue;
    }

    usedPlanItemIds.add(seedId);
    groups.push({
      id: `ws-${seedId}`,
      kind: "single",
      members: [seed],
      category: seed.category,
      dominantSurfaceKey: seed.dominantSurfaceKey,
      note: buildGroupNote("single"),
    });
  }

  return groups;
}

function buildGroupStreamDependencies(
  group: WorkstreamGroup,
  groupIdByPlanItemId: Map<string, string>,
): string[] {
  const dependencies: string[] = [];
  const seen = new Set<string>();

  for (const member of group.members) {
    const currentGroupId = group.id;

    for (const dependency of member.evidence.dependencyGraphEntries) {
      const upstreamWorkstreamId = groupIdByPlanItemId.get(dependency.dependsOnPlanItemId);
      if (!upstreamWorkstreamId || upstreamWorkstreamId === currentGroupId) {
        continue;
      }

      // Only treat merge-order dependency types as workstream ordering constraints.
      // "soft" dependencies are advisory — they are recorded in dependency_edges for
      // visibility but must not become hard mustMergeAfterWorkstreamIds gates.
      if (!isMergeOrderDependencyType(dependency.type)) {
        continue;
      }

      if (seen.has(upstreamWorkstreamId)) {
        continue;
      }

      seen.add(upstreamWorkstreamId);
      dependencies.push(upstreamWorkstreamId);
    }
  }

  return dependencies;
}

function buildDependencyEdgesFromGroups(
  groups: WorkstreamGroup[],
  groupIdByPlanItemId: Map<string, string>,
): SplitDependencyEdge[] {
  const edgesByPair = new Map<
    string,
    {
      upstreamWorkstreamId: string;
      downstreamWorkstreamId: string;
      reasons: string[];
    }
  >();

  for (const group of groups) {
    for (const member of group.members) {
      for (const dependency of member.evidence.dependencyGraphEntries) {
        const upstreamWorkstreamId = groupIdByPlanItemId.get(dependency.dependsOnPlanItemId);
        if (!upstreamWorkstreamId || upstreamWorkstreamId === group.id) {
          continue;
        }

        const pairKey = `${upstreamWorkstreamId}::${group.id}`;
        const existing = edgesByPair.get(pairKey);
        if (existing) {
          existing.reasons.push(dependency.reason);
          continue;
        }

        edgesByPair.set(pairKey, {
          upstreamWorkstreamId,
          downstreamWorkstreamId: group.id,
          reasons: [dependency.reason],
        });
      }
    }
  }

  return [...edgesByPair.values()].map((edge) => ({
    upstreamWorkstreamId: edge.upstreamWorkstreamId,
    downstreamWorkstreamId: edge.downstreamWorkstreamId,
    reason: dedupeStrings(edge.reasons).join("; "),
  }));
}

function blockedPlanItemId(workstreamId: string, planItemId: string): string {
  return `blocked:${workstreamId}:${planItemId}`;
}

function isBlockingDependencyType(type: PlanArtifact["dependency_graph"][number]["type"]): boolean {
  return type === "hard";
}

function isMergeOrderDependencyType(type: PlanArtifact["dependency_graph"][number]["type"]): boolean {
  return type === "hard" || type === "sequencing" || type === "interface_first";
}

function buildGroupIdByPlanItemId(groups: WorkstreamGroup[]): Map<string, string> {
  const groupIdByPlanItemId = new Map<string, string>();

  for (const group of groups) {
    for (const member of group.members) {
      groupIdByPlanItemId.set(member.evidence.planItem.id, group.id);
    }
  }

  return groupIdByPlanItemId;
}

function hasConcernEffect(
  concerns: CarryForwardConcern[],
  effect: CarryForwardConcern["effects"][number],
): boolean {
  return concerns.some((concern) => concern.effects.includes(effect));
}

function buildWarningNotes(params: {
  foundation: SplitFoundationResult;
  group: WorkstreamGroup;
}): string[] {
  return dedupeStrings([
    ...params.foundation.splitInput.usability.warningItems.map((issue) => issue.message),
    ...(params.foundation.sourceVerify.verificationReadiness.status === "ready_with_warnings"
      ? ["Step 3 verification readiness stayed warning-grade and must remain visible in the split output."]
      : []),
    ...(params.foundation.sourcePlan.planningReadiness.status === "ready_with_warnings"
      ? ["Step 2 planning readiness stayed warning-grade and must remain visible in the split output."]
      : []),
    ...params.group.members.flatMap((member) =>
      member.evidence.concerns
        .filter((concern) => concern.effects.includes("parallelization_caution"))
        .map((concern) => concern.message)
    ),
  ]);
}

interface BlockedMemberState {
  member: ResolvedPlanItemSeed;
  blockedReason: string | null;
  blockedUpstreamWorkstreamIds: string[];
}

interface ResolvedGroupAnalysis {
  workstream: SplitWorkstream;
  detail: SplitStreamConstraintDetail;
  blockedMemberStates: BlockedMemberState[];
}

function buildBlockedMemberState(params: {
  member: ResolvedPlanItemSeed;
  groupId: string;
  blockedGroupIds: Set<string>;
  groupIdByPlanItemId: Map<string, string>;
}): BlockedMemberState {
  const blockedReasons: string[] = [];
  const blockedUpstreamWorkstreamIds = new Set<string>();

  if (params.member.blockedReason) {
    blockedReasons.push(params.member.blockedReason);
  }

  for (const concern of params.member.evidence.concerns) {
    if (concern.effects.includes("planning_readiness")) {
      blockedReasons.push(concern.message);
    }
  }

  for (const dependency of params.member.evidence.dependencyGraphEntries) {
    if (!isBlockingDependencyType(dependency.type)) {
      continue;
    }

    const upstreamWorkstreamId = params.groupIdByPlanItemId.get(dependency.dependsOnPlanItemId);
    if (!upstreamWorkstreamId || upstreamWorkstreamId === params.groupId) {
      continue;
    }

    if (!params.blockedGroupIds.has(upstreamWorkstreamId)) {
      continue;
    }

    blockedUpstreamWorkstreamIds.add(upstreamWorkstreamId);
    blockedReasons.push(
      `${dependency.reason} Blocked upstream workstream: ${upstreamWorkstreamId}.`,
    );
  }

  return {
    member: params.member,
    blockedReason: dedupeStrings(blockedReasons).join("; ") || null,
    blockedUpstreamWorkstreamIds: [...blockedUpstreamWorkstreamIds],
  };
}

function resolveBlockedGroupIds(params: {
  groups: WorkstreamGroup[];
  groupIdByPlanItemId: Map<string, string>;
}): Set<string> {
  const blockedGroupIds = new Set<string>(
    params.groups
      .filter((group) => group.members.every((member) => member.blockedReason !== null))
      .map((group) => group.id),
  );

  let changed = true;
  while (changed) {
    changed = false;

    for (const group of params.groups) {
      if (blockedGroupIds.has(group.id)) {
        continue;
      }

      const memberStates = group.members.map((member) =>
        buildBlockedMemberState({
          member,
          groupId: group.id,
          blockedGroupIds,
          groupIdByPlanItemId: params.groupIdByPlanItemId,
        })
      );

      if (memberStates.length > 0 && memberStates.every((state) => state.blockedReason !== null)) {
        blockedGroupIds.add(group.id);
        changed = true;
      }
    }
  }

  return blockedGroupIds;
}

function buildGroupMitigationSummaries(group: WorkstreamGroup): string[] {
  return dedupeStrings(
    group.members.flatMap((member) =>
      member.evidence.verificationCases.flatMap((verificationCase) =>
        Array.isArray(verificationCase.mitigations) ? verificationCase.mitigations : []
      )
    ),
  );
}

function collectUpstreamBlockedEvidence(params: {
  groups: WorkstreamGroup[];
  blockedUpstreamWorkstreamIds: string[];
}): {
  findingIds: string[];
  constraintIds: string[];
  concernIds: string[];
} {
  const upstreamGroups = params.groups.filter((group) =>
    params.blockedUpstreamWorkstreamIds.includes(group.id)
  );

  return {
    findingIds: dedupeStrings(
      upstreamGroups.flatMap((group) =>
        group.members.flatMap((member) => member.evidence.findings.map((finding) => finding.id))
      )
    ),
    constraintIds: dedupeStrings(
      upstreamGroups.flatMap((group) =>
        group.members.flatMap((member) => member.evidence.constraints.map((constraint) => constraint.id))
      )
    ),
    concernIds: dedupeStrings(
      upstreamGroups.flatMap((group) =>
        group.members.flatMap((member) => member.evidence.concerns.map((concern) => concern.id))
      )
    ),
  };
}

function buildRegroupingMemberDetails(blockedMemberStates: BlockedMemberState[]) {
  return blockedMemberStates.map((state) => ({
    planItemId: state.member.evidence.planItem.id,
    title: state.member.evidence.planItem.title,
    category: state.member.evidence.planItem.category,
    likelyAffectedPaths: [...state.member.evidence.planItem.likelyAffectedPaths],
    blockedStatus: state.blockedReason ? "blocked" as const : "unblocked" as const,
    blockedReason: state.blockedReason,
    sourceVerificationCaseIds: state.member.evidence.verificationCases.map((verificationCase) => verificationCase.id),
    sourceFindingIds: state.member.evidence.findings.map((finding) => finding.id),
    sourceConstraintIds: state.member.evidence.constraints.map((constraint) => constraint.id),
    sourceConcernIds: state.member.evidence.concerns.map((concern) => concern.id),
  }));
}

function analyzeGroup(params: {
  foundation: SplitFoundationResult;
  groups: WorkstreamGroup[];
  sourceReadinessIds: string[];
  group: WorkstreamGroup;
  blockedGroupIds: Set<string>;
  groupIdByPlanItemId: Map<string, string>;
}): ResolvedGroupAnalysis {
  const { group } = params;
  const baseCategory = group.category;
  const appliedRules = [...buildGroupAppliedRules(group)];
  const categoryReasons: string[] = [];
  const mergeOrderReasons: string[] = [];
  const blockingReasons: string[] = [];
  const warningNotes = buildWarningNotes({
    foundation: params.foundation,
    group,
  });
  const mitigationSummaries = buildGroupMitigationSummaries(group);
  const blockedMemberStates = group.members.map((member) =>
    buildBlockedMemberState({
      member,
      groupId: group.id,
      blockedGroupIds: params.blockedGroupIds,
      groupIdByPlanItemId: params.groupIdByPlanItemId,
    })
  );
  const partiallyBlockedMembers = blockedMemberStates.filter((state) => state.blockedReason !== null);

  const sourcePlanItemIds = group.members.map((member) => member.evidence.planItem.id);
  const sourceVerificationCaseIds = dedupeStrings(
    group.members.flatMap((member) => member.evidence.verificationCases.map((verificationCase) => verificationCase.id)),
  );
  const sourceFindingIds = dedupeStrings(
    group.members.flatMap((member) => member.evidence.findings.map((finding) => finding.id)),
  );
  const likelyAffectedPaths = dedupeStrings(
    group.members.flatMap((member) => member.evidence.planItem.likelyAffectedPaths),
  );
  const sourceDependencyIds = dedupeStrings(
    group.members.flatMap((member) => member.evidence.dependencyGraphEntries.map(dependencySourceId)),
  );
  const sourceConflictZoneIds = dedupeStrings(
    group.members.flatMap((member) => member.evidence.conflictZones.map((zone) => zone.id)),
  );
  const sourceTestObligationIds = dedupeStrings(
    group.members.flatMap((member) => member.evidence.testObligations.map(testObligationSourceId)),
  );
  const sourceVerificationTargetIds = dedupeStrings(
    group.members.flatMap((member) => member.evidence.verificationTargets.map((target) => target.id)),
  );
  const sourceConstraintIds = dedupeStrings(
    group.members.flatMap((member) => member.evidence.constraints.map((constraint) => constraint.id)),
  );
  const sourceConcernIds = dedupeStrings(
    group.members.flatMap((member) => member.evidence.concerns.map((concern) => concern.id)),
  );
  const streamDependencies = buildGroupStreamDependencies(group, params.groupIdByPlanItemId);
  const verificationConstraints = group.members.flatMap((member) => member.evidence.constraints);
  const blockedUpstreamWorkstreamIds = dedupeStrings(
    partiallyBlockedMembers.flatMap((state) => state.blockedUpstreamWorkstreamIds),
  );
  const blockedPlanItemIds = partiallyBlockedMembers.map((state) => state.member.evidence.planItem.id);
  const hasMigrationOrderCategory = group.members.some((member) =>
    member.evidence.planItem.verificationRelevance.categories.includes("migration_order")
  );
  const hasParallelizationCaution = group.members.some((member) =>
    hasConcernEffect(member.evidence.concerns, "parallelization_caution")
  );
  const hasPlanningReadinessConcern = group.members.some((member) =>
    hasConcernEffect(member.evidence.concerns, "planning_readiness")
  );
  const hasProtectedVerificationSignals =
    baseCategory === "protected_merge" ||
    group.members.some((member) =>
      member.evidence.planItem.verificationRelevance.categories.includes("api_contract") ||
      member.evidence.planItem.verificationRelevance.categories.includes("parallel_overlap")
    ) ||
    group.members.some((member) =>
      member.evidence.conflictZones.some((zone) => zone.riskLevel === "high")
    ) ||
    hasParallelizationCaution ||
    mitigationSummaries.length > 0;
  const hasDependencyDrivenCategory =
    baseCategory === "parallel_after_dependency" ||
    group.members.some((member) =>
      member.evidence.dependencyGraphEntries.some((dependency) =>
        isBlockingDependencyType(dependency.type) &&
        params.groupIdByPlanItemId.get(dependency.dependsOnPlanItemId) !== group.id
      )
    );
  const requiresDependencyMergeOrder = group.members.some((member) =>
    member.evidence.dependencyGraphEntries.some((dependency) =>
      isMergeOrderDependencyType(dependency.type) &&
      params.groupIdByPlanItemId.get(dependency.dependsOnPlanItemId) !== group.id
    )
  );

  let category: SplitStreamCategory;
  if (params.blockedGroupIds.has(group.id)) {
    category = "blocked";
    appliedRules.push("final_category:blocked");
    if (blockedUpstreamWorkstreamIds.length > 0) {
      appliedRules.push("blocked_upstream_dependency");
    }
    if (hasPlanningReadinessConcern) {
      appliedRules.push("carry_forward_concern:planning_readiness");
    }
    blockingReasons.push(
      ...dedupeStrings(partiallyBlockedMembers.flatMap((state) => state.blockedReason ? [state.blockedReason] : [])),
    );
    categoryReasons.push(
      blockedUpstreamWorkstreamIds.length > 0
        ? `Blocked by upstream workstreams: ${blockedUpstreamWorkstreamIds.join(", ")}.`
        : "Blocked by carried-forward Step 3 evidence.",
    );
  } else if (baseCategory === "serial" || hasMigrationOrderCategory) {
    category = "serial";
    appliedRules.push("final_category:serial");
    if (hasMigrationOrderCategory) {
      appliedRules.push("verification_relevance:migration_order");
      categoryReasons.push("Serial category is required because migration/order-sensitive work remains in scope.");
    } else {
      categoryReasons.push("Serial category is required by the base parallelization signal.");
    }
  } else if (hasProtectedVerificationSignals) {
    category = "protected_merge";
    appliedRules.push("final_category:protected_merge");
    if (hasParallelizationCaution) {
      appliedRules.push("carry_forward_concern:parallelization_caution");
      categoryReasons.push("Protected merge is required because warning-grade carry-forward caution reduced confidence without fully blocking the stream.");
    } else {
      categoryReasons.push("Protected merge is required because shared-risk verification constraints or mitigations remain in force.");
    }
    if (mitigationSummaries.length > 0) {
      appliedRules.push("verification_mitigations_present");
    }
  } else if (hasDependencyDrivenCategory) {
    category = "parallel_after_dependency";
    appliedRules.push("final_category:parallel_after_dependency");
    categoryReasons.push("Parallel execution is allowed only after the required upstream dependency settles.");
  } else {
    category = "safe_parallel";
    appliedRules.push("final_category:safe_parallel");
    categoryReasons.push("No blocking, serial-only, or protected-merge constraints remain, so the stream stays safe_parallel.");
  }

  if (requiresDependencyMergeOrder && category !== "blocked") {
    mergeOrderReasons.push(
      streamDependencies.length > 0
        ? `Dependent stream must merge after ${streamDependencies.join(", ")} settles.`
        : "Dependent stream must merge after its upstream prerequisites settle.",
    );
  }

  if (category === "serial") {
    mergeOrderReasons.push("Serial-only stream requires isolated merge ordering.");
  }
  if (category === "protected_merge") {
    mergeOrderReasons.push("Protected merge stream keeps shared-risk work under explicit ordering.");
  }
  if (partiallyBlockedMembers.length > 0 && category !== "blocked") {
    appliedRules.push("partial_blocking_present");
    blockingReasons.push(
      ...dedupeStrings(partiallyBlockedMembers.flatMap((state) => state.blockedReason ? [state.blockedReason] : [])),
    );
  }

  const blockedReason = category === "blocked"
    ? dedupeStrings(blockingReasons).join("; ") || "Blocked workstream"
    : null;
  const mergeOrderRequirements = buildMergeOrderRequirements({
    category,
    streamDependencies,
    verificationConstraints,
    blockedReason,
    groupNote: group.note,
  });
  const constraints = dedupeStrings(
    group.members.flatMap((member) => buildSeedConstraintMessages(member)),
  );
  const upstreamBlockedEvidence = collectUpstreamBlockedEvidence({
    groups: params.groups,
    blockedUpstreamWorkstreamIds,
  });
  const blockingStatus = category === "blocked"
    ? "blocked"
    : blockedPlanItemIds.length > 0
      ? "partially_blocked"
      : "unblocked";
  const mergeOrderRuleKinds = dedupeStrings([
    requiresDependencyMergeOrder || streamDependencies.length > 0 ? "dependency" : "",
    category === "serial" ? "serial" : "",
    category === "protected_merge" ? "protected_merge" : "",
  ]) as Array<"serial" | "dependency" | "protected_merge">;
  const mergeOrderStatus = mergeOrderRuleKinds.length > 0 ? "constrained" : "none";
  const regroupingMemberDetails = buildRegroupingMemberDetails(blockedMemberStates);
  const constrainingFindingIds = dedupeStrings([
    ...(blockingStatus === "blocked" ? sourceFindingIds : []),
    ...partiallyBlockedMembers.flatMap((state) => state.member.evidence.findings.map((finding) => finding.id)),
    ...upstreamBlockedEvidence.findingIds,
  ]);
  const constrainingConstraintIds = dedupeStrings([
    ...(blockingStatus === "blocked" ? sourceConstraintIds : []),
    ...partiallyBlockedMembers.flatMap((state) => state.member.evidence.constraints.map((constraint) => constraint.id)),
    ...upstreamBlockedEvidence.constraintIds,
  ]);
  const constrainingConcernIds = dedupeStrings([
    ...(blockingStatus === "blocked" ? sourceConcernIds : []),
    ...partiallyBlockedMembers.flatMap((state) => state.member.evidence.concerns.map((concern) => concern.id)),
    ...upstreamBlockedEvidence.concernIds,
  ]);
  const workstream = {
    id: group.id,
    title:
      group.members.length === 1
        ? group.members[0].evidence.planItem.title
        : group.members.map((member) => member.evidence.planItem.title).join(" + "),
    description: buildWorkstreamDescription(group),
    category,
    sourcePlanItemIds,
    sourceVerificationCaseIds,
    sourceFindingIds,
    likelyAffectedPaths,
    streamDependencies,
    mergeOrderRequirements,
    constraints,
    blockedReason,
  } satisfies SplitWorkstream;

  return {
    workstream,
    blockedMemberStates,
    detail: {
      workstreamId: group.id,
      baseCategory,
      category,
      appliedRules: dedupeStrings(appliedRules),
      categoryReasons: dedupeStrings(categoryReasons),
      mergeOrderReasons: dedupeStrings(mergeOrderReasons),
      blockingReasons: dedupeStrings(blockingReasons),
      warningNotes,
      mitigationSummaries,
      sourceDependencyIds,
      sourceConflictZoneIds,
      sourceTestObligationIds,
      sourceVerificationTargetIds,
      sourceVerificationCaseIds,
      sourceFindingIds,
      sourceConstraintIds,
      sourceConcernIds,
      sourceReadinessIds: params.sourceReadinessIds,
      blockedUpstreamWorkstreamIds,
      blockedPlanItemIds,
      mergeOrderRuleIds: [],
      blockedItemIds: [],
      mergeOrderRequirements,
      blockedReason,
      regrouping: {
        grouped: group.kind !== "single",
        groupKind: group.kind,
        rationale: buildGroupingRationale(group),
        note: group.note,
        dominantSurfaceKey: group.dominantSurfaceKey,
        preservedSourcePlanItemIds: sourcePlanItemIds,
        memberDetails: regroupingMemberDetails,
      },
      blocking: {
        status: blockingStatus,
        blockedMemberPlanItemIds: blockedPlanItemIds,
        blockedUpstreamWorkstreamIds,
        constrainingFindingIds,
        constrainingConstraintIds,
        constrainingConcernIds,
        canProceedWithConstraints: blockingStatus !== "blocked",
        requiresResolutionBeforeExecution: blockingStatus === "blocked",
      },
      mergeOrder: {
        status: mergeOrderStatus,
        ruleKinds: mergeOrderRuleKinds,
        hardPrerequisiteWorkstreamIds: [...streamDependencies],
        sourceConstraintIds: mergeOrderStatus === "constrained" ? sourceConstraintIds : [],
        sourceConcernIds: mergeOrderStatus === "constrained" ? sourceConcernIds : [],
      },
    },
  };
}

function buildSourceReadinessIds(foundation: SplitFoundationResult): string[] {
  return dedupeStrings([
    foundation.sourcePlan.planningReadiness.status === "ready" ? "" : "planning_readiness",
    foundation.sourceVerify.verificationReadiness.status === "ready" ? "" : "verification_readiness",
  ]);
}

function buildMergeOrder(params: {
  workstreams: SplitWorkstream[];
  streamConstraintDetails: SplitStreamConstraintDetail[];
}): SplitMergeOrderEntry[] {
  const detailByWorkstreamId = new Map(
    params.streamConstraintDetails.map((detail) => [detail.workstreamId, detail] as const),
  );
  const dependencyByDownstream = new Map<string, string[]>();

  for (const workstream of params.workstreams) {
    if (workstream.streamDependencies.length === 0) {
      continue;
    }

    dependencyByDownstream.set(workstream.id, [...workstream.streamDependencies]);
  }

  const depthCache = new Map<string, number>();
  const constrainedWorkstreams = params.workstreams.filter((workstream) => {
    if (workstream.category === "blocked") {
      return false;
    }

    if (
      workstream.category === "serial" ||
      workstream.category === "protected_merge" ||
      workstream.category === "parallel_after_dependency"
    ) {
      return true;
    }

    if (workstream.streamDependencies.length > 0) {
      return true;
    }

    return (detailByWorkstreamId.get(workstream.id)?.mergeOrderReasons.length ?? 0) > 0;
  });
  const indexById = new Map(params.workstreams.map((workstream, index) => [workstream.id, index] as const));

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
          : detailByWorkstreamId.get(workstream.id)?.mergeOrderReasons.join("; ") ||
            "Dependent stream must merge after its upstream work settles.",
    sourceDependencyIds: detailByWorkstreamId.get(workstream.id)?.sourceDependencyIds ?? [],
    sourceConstraintIds: detailByWorkstreamId.get(workstream.id)?.sourceConstraintIds ?? [],
    sourceConcernIds: detailByWorkstreamId.get(workstream.id)?.sourceConcernIds ?? [],
  }));
}

export function buildSplitWorkstreams(params: {
  foundation: SplitFoundationResult;
}): SplitWorkstreamBuildResult {
  const sourceReadinessIds = buildSourceReadinessIds(params.foundation);
  const seeds = createResolvedSeeds({ foundation: params.foundation });
  const groups = selectWorkstreamGroups(seeds);
  const groupIdByPlanItemId = buildGroupIdByPlanItemId(groups);
  const blockedGroupIds = resolveBlockedGroupIds({
    groups,
    groupIdByPlanItemId,
  });
  const dependencyEdges = buildDependencyEdgesFromGroups(groups, groupIdByPlanItemId);
  const analyses = groups.map((group) =>
    analyzeGroup({
      foundation: params.foundation,
      groups,
      sourceReadinessIds,
      group,
      blockedGroupIds,
      groupIdByPlanItemId,
    })
  );
  const workstreams = analyses.map((analysis) => analysis.workstream);
  const streamConstraintDetails = analyses.map((analysis) => analysis.detail);

  const blockedItems: SplitBlockedItem[] = [];
  for (const analysis of analyses) {
    const { workstream, detail } = analysis;

    if (workstream.category === "blocked") {
      blockedItems.push({
        id: blockedItemId(workstream.id),
        kind: "blocked_workstream",
        code: "BLOCKED_WORKSTREAM",
        message: workstream.blockedReason ?? "Blocked workstream",
        workstreamId: workstream.id,
        sourcePlanItemIds: [...workstream.sourcePlanItemIds],
        sourceVerificationCaseIds: detail.sourceVerificationCaseIds,
        sourceFindingIds: detail.sourceFindingIds,
        sourceConstraintIds: detail.sourceConstraintIds,
        sourceConcernIds: detail.sourceConcernIds,
        partialMetadataAvailable: true,
      });
      continue;
    }

    const blockedPlanItems = analysis.blockedMemberStates.filter((state) => state.blockedReason !== null);
    for (const blockedPlanItem of blockedPlanItems) {
      blockedItems.push({
        id: blockedPlanItemId(workstream.id, blockedPlanItem.member.evidence.planItem.id),
        kind: "blocked_plan_item",
        code: "BLOCKED_PLAN_ITEM",
        message: blockedPlanItem.blockedReason ?? "Blocked plan item",
        workstreamId: workstream.id,
        sourcePlanItemIds: [blockedPlanItem.member.evidence.planItem.id],
        sourceVerificationCaseIds: blockedPlanItem.member.evidence.verificationCases.map((verificationCase) => verificationCase.id),
        sourceFindingIds: blockedPlanItem.member.evidence.findings.map((finding) => finding.id),
        sourceConstraintIds: blockedPlanItem.member.evidence.constraints.map((constraint) => constraint.id),
        sourceConcernIds: blockedPlanItem.member.evidence.concerns.map((concern) => concern.id),
        partialMetadataAvailable: true,
      });
    }
  }

  const mergeOrder = buildMergeOrder({
    workstreams,
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
  const hasBlockedWorkstreams = blockedItems.some((item) => item.kind === "blocked_workstream");
  const hasPartiallyBlockedPlanItems = blockedItems.some((item) => item.kind === "blocked_plan_item");
  if (params.foundation.splitInput.usability.status === "actionable" && hasBlockedWorkstreams) {
    warningItems.push({
      code: "BLOCKED_WORKSTREAMS_PRESENT",
      message:
        "One or more workstreams remain blocked by carried-forward Step 3 evidence and must stay out of active execution.",
    });
  }
  if (params.foundation.splitInput.usability.status === "actionable" && hasPartiallyBlockedPlanItems) {
    warningItems.push({
      code: "PARTIALLY_BLOCKED_STREAM_ITEMS_PRESENT",
      message:
        "One or more grouped workstreams include blocked plan items that must stay explicit until their carried-forward blockers are resolved.",
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
