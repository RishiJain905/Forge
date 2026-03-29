import type {
  VerifyFoundationResult,
  VerifyLane,
  VerifyFormalScenarioKind,
  VerifyTargetRiskSource,
  VerifyVerificationCase,
  VerifyVerificationCategory,
  VerifyVerificationModel,
  VerifyVerificationTarget,
} from "./types.js";
import {
  buildVerifyFormalBaseCautionNotes,
  buildVerifyFormalEntryCriteria,
  getVerifyFormalScenarioKinds,
  isSupportedFormalCategory,
} from "./formal.js";

interface TargetDraft {
  category: VerifyVerificationCategory;
  sourcePlanItemIds: Set<string>;
  anchorPaths: Set<string>;
  candidateLanes: Set<VerifyLane>;
  sourceRiskSources: Set<VerifyTargetRiskSource>;
  expectedFindingKinds: Set<string>;
  traceabilityNotes: Set<string>;
}

type VerifyPlanItem = VerifyFoundationResult["verificationInput"]["context"]["planItems"][number];
type VerifyTestObligation = VerifyFoundationResult["verificationInput"]["context"]["testObligations"][number];

function normalizePath(value: string): string {
  return value.replace(/\\/g, "/").toLowerCase();
}

function dedupeStable(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = value.trim().toLowerCase();
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    result.push(value.trim());
  }

  return result;
}

function toTitleCase(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function sortedPlanItemIds(ids: Iterable<string>): string[] {
  return [...new Set(ids)].sort((left, right) => left.localeCompare(right));
}

function buildConnectedComponents(foundation: VerifyFoundationResult): Map<string, string> {
  const itemIds = foundation.verificationInput.context.planItems.map((item) => item.id);
  const adjacency = new Map<string, Set<string>>();

  for (const itemId of itemIds) {
    adjacency.set(itemId, new Set<string>());
  }

  const link = (left: string, right: string): void => {
    if (!adjacency.has(left) || !adjacency.has(right) || left === right) {
      return;
    }

    adjacency.get(left)!.add(right);
    adjacency.get(right)!.add(left);
  };

  for (const entry of foundation.verificationInput.context.dependencyGraph) {
    link(entry.planItemId, entry.dependsOnPlanItemId);
  }

  for (const zone of foundation.verificationInput.context.conflictZones) {
    for (const left of zone.planItemIds) {
      for (const right of zone.planItemIds) {
        link(left, right);
      }
    }
  }

  for (const concern of foundation.carryForward.carryForward.concerns) {
    for (const left of concern.planItemIds) {
      for (const right of concern.planItemIds) {
        link(left, right);
      }
    }
  }

  const components = new Map<string, string>();
  let componentIndex = 0;

  for (const itemId of itemIds) {
    if (components.has(itemId)) {
      continue;
    }

    componentIndex += 1;
    const componentId = `component-${componentIndex.toString().padStart(3, "0")}`;
    const queue = [itemId];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (components.has(current)) {
        continue;
      }

      components.set(current, componentId);
      for (const next of adjacency.get(current) ?? []) {
        if (!components.has(next)) {
          queue.push(next);
        }
      }
    }
  }

  return components;
}

function structuralCategoryForSignal(signal: string): VerifyVerificationCategory {
  if (signal === "protected_merge_order") {
    return "merge_or_serialization_contradiction";
  }
  if (signal === "parallel_after_dependency" || signal === "serial_only") {
    return "unsafe_sequencing";
  }

  return "unsafe_parallelization";
}

function structuralCategoryForConcern(concern: {
  effects: string[];
  message: string;
}): VerifyVerificationCategory {
  if (concern.effects.includes("dependency_caution") || concern.effects.includes("planning_readiness")) {
    return "unsafe_sequencing";
  }
  if (/merge|serialization/i.test(concern.message)) {
    return "merge_or_serialization_contradiction";
  }

  return "unsafe_parallelization";
}

function categoryFromObligationReason(reason: string): VerifyVerificationCategory | null {
  const normalizedReason = reason.trim().toLowerCase();

  if (normalizedReason.includes("retry")) {
    return "retry_logic";
  }
  if (normalizedReason.includes("ownership")) {
    return "ownership";
  }
  if (normalizedReason.includes("stale write") || normalizedReason.includes("stale-write")) {
    return "stale_write";
  }
  if (
    normalizedReason.includes("migration") ||
    normalizedReason.includes("ordering") ||
    normalizedReason.includes("merge order") ||
    normalizedReason.includes("sequence")
  ) {
    return "migration_order";
  }
  if (normalizedReason.includes("parallel") || normalizedReason.includes("duplicate execution")) {
    return "parallel_overlap";
  }
  if (
    normalizedReason.includes("api contract") ||
    normalizedReason.includes("interface")
  ) {
    return "api_contract";
  }

  return null;
}

function fallbackCategoryForObligation(
  obligation: VerifyTestObligation,
  planItem: VerifyPlanItem,
): VerifyVerificationCategory {
  if (obligation.category === "migration_validation") {
    return "migration_order";
  }

  if (obligation.category === "contract_validation") {
    return planItem.category === "config" ? "config_surface" : "api_contract";
  }

  if (planItem.category === "config") {
    return "config_surface";
  }
  if (planItem.category === "test") {
    return "test_surface";
  }

  return "code_surface";
}

function verificationCategoryForObligation(
  obligation: VerifyTestObligation,
  planItem: VerifyPlanItem,
): VerifyVerificationCategory {
  return categoryFromObligationReason(obligation.reason) ?? fallbackCategoryForObligation(obligation, planItem);
}

function determineLanes(
  category: VerifyVerificationCategory,
  sourceRiskSources: Iterable<VerifyTargetRiskSource>,
): VerifyLane[] {
  const riskSources = new Set(sourceRiskSources);

  switch (category) {
    case "migration_order":
    case "parallel_overlap":
      return ["structural", "formal"];
    case "retry_logic":
    case "ownership":
    case "stale_write":
      return riskSources.has("conflict_zone") || riskSources.has("parallelization_signal") || riskSources.has("carry_forward_concern")
        ? ["structural", "formal"]
        : ["formal"];
    default:
      return ["structural"];
  }
}

function structuralFindingKinds(category: VerifyVerificationCategory): string[] {
  switch (category) {
    case "conflict_zone_hazard":
      return ["conflict_zone_hazard"];
    case "unsafe_parallelization":
    case "parallel_overlap":
      return ["unsafe_parallelization"];
    case "merge_or_serialization_contradiction":
    case "config_surface":
      return ["merge_or_serialization_contradiction"];
    case "migration_order":
    case "unsafe_sequencing":
      return ["unsafe_sequencing"];
    default:
      return ["dependency_contradiction"];
  }
}

function formalFindingKinds(category: VerifyVerificationCategory): string[] {
  switch (category) {
    case "retry_logic":
      return ["retry_logic"];
    case "ownership":
      return ["ownership_transition"];
    case "stale_write":
      return ["stale_write_risk"];
    case "parallel_overlap":
      return ["duplicate_execution_risk"];
    case "migration_order":
      return ["ordering_constraint"];
    default:
      return [];
  }
}

function buildTargetTitle(category: VerifyVerificationCategory, anchorPaths: string[]): string {
  const displayCategory = toTitleCase(category);
  if (anchorPaths.length === 0) {
    return `Verify ${displayCategory}`;
  }
  if (anchorPaths.length === 1) {
    return `Verify ${displayCategory} for ${anchorPaths[0]}`;
  }

  return `Verify ${displayCategory} for ${anchorPaths[0]} and ${anchorPaths.length - 1} more path(s)`;
}

function buildRiskSummary(
  category: VerifyVerificationCategory,
  anchorPaths: string[],
  sourceRiskSources: VerifyTargetRiskSource[],
): string {
  const pathSummary = anchorPaths.length > 0 ? ` across ${anchorPaths.join(", ")}` : "";
  return `Step 3 should inspect ${toTitleCase(category)}${pathSummary}; evidence came from ${sourceRiskSources.join(", ")}.`;
}

function buildCaseGoal(target: VerifyVerificationTarget, lane: VerifyLane): string {
  if (lane === "formal") {
    return `Model ${target.category} formally and preserve traceability to the originating Step 2 plan items.`;
  }

  return `Check ${target.category} structurally against the Step 2 dependency, conflict, and parallelization signals.`;
}

function buildFormalCaseTitle(target: VerifyVerificationTarget, scenarioKind: VerifyFormalScenarioKind): string {
  return `${target.title} (${scenarioKind})`;
}

function buildCaseSummary(
  target: VerifyVerificationTarget,
  lane: VerifyLane,
  scenarioKind?: VerifyFormalScenarioKind,
): string {
  if (lane === "formal" && scenarioKind) {
    return `Selected for formal verification in Part 3; execution has not run yet for ${target.category} scenario ${scenarioKind}.`;
  }

  return `Selected for ${lane} verification in Part 3; execution has not run yet for ${target.category}.`;
}

function buildAnchorPathsFromItemIds(
  itemIds: Iterable<string>,
  planItemsById: Map<string, VerifyFoundationResult["verificationInput"]["context"]["planItems"][number]>,
): string[] {
  const paths = new Set<string>();

  for (const itemId of itemIds) {
    for (const pathValue of planItemsById.get(itemId)?.likelyAffectedPaths ?? []) {
      paths.add(pathValue);
    }
  }

  return [...paths].sort((left, right) => left.localeCompare(right));
}

function buildKey(
  category: VerifyVerificationCategory,
  componentId: string | null,
  anchorPaths: Iterable<string>,
): string {
  if (componentId) {
    return `${category}|${componentId}`;
  }

  const anchorKey = [...new Set(anchorPaths)].map(normalizePath).sort().join("|");
  return `${category}|${componentId ?? "no-component"}|${anchorKey}`;
}

function ensureTargetDraft(
  drafts: Map<string, TargetDraft>,
  key: string,
  category: VerifyVerificationCategory,
): TargetDraft {
  const existing = drafts.get(key);
  if (existing) {
    return existing;
  }

  const created: TargetDraft = {
    category,
    sourcePlanItemIds: new Set<string>(),
    anchorPaths: new Set<string>(),
    candidateLanes: new Set<VerifyLane>(),
    sourceRiskSources: new Set<VerifyTargetRiskSource>(),
    expectedFindingKinds: new Set<string>(),
    traceabilityNotes: new Set<string>(),
  };
  drafts.set(key, created);
  return created;
}

function addLaneFindingKinds(draft: TargetDraft, lanes: VerifyLane[]): void {
  for (const lane of lanes) {
    draft.candidateLanes.add(lane);
    const findingKinds = lane === "formal"
      ? formalFindingKinds(draft.category)
      : structuralFindingKinds(draft.category);
    for (const findingKind of findingKinds) {
      draft.expectedFindingKinds.add(findingKind);
    }
  }
}

export function buildVerifyVerificationModel(
  foundation: VerifyFoundationResult,
): VerifyVerificationModel {
  if (foundation.verificationInput.usability.status !== "actionable") {
    return {
      targets: [],
      cases: [],
      structuralCaseCount: 0,
      formalCaseCount: 0,
    };
  }

  const planItemsById = new Map(
    foundation.verificationInput.context.planItems.map((item) => [item.id, item] as const),
  );
  const pathToPlanItemIds = new Map<string, Set<string>>();

  for (const item of foundation.verificationInput.context.planItems) {
    for (const pathValue of item.likelyAffectedPaths) {
      const normalizedPath = normalizePath(pathValue);
      const existing = pathToPlanItemIds.get(normalizedPath) ?? new Set<string>();
      existing.add(item.id);
      pathToPlanItemIds.set(normalizedPath, existing);
    }
  }

  const componentByItemId = buildConnectedComponents(foundation);
  const drafts = new Map<string, TargetDraft>();

  const seedFromPlanItem = (
    itemId: string,
    category: VerifyVerificationCategory,
    riskSource: VerifyTargetRiskSource,
    note: string,
  ): void => {
    const item = planItemsById.get(itemId);
    if (!item) {
      return;
    }

    const componentId = componentByItemId.get(itemId) ?? null;
    const key = buildKey(category, componentId, item.likelyAffectedPaths);
    const draft = ensureTargetDraft(drafts, key, category);
    draft.sourcePlanItemIds.add(itemId);
    for (const pathValue of item.likelyAffectedPaths) {
      draft.anchorPaths.add(pathValue);
    }
    draft.sourceRiskSources.add(riskSource);
    draft.traceabilityNotes.add(note);
    addLaneFindingKinds(draft, determineLanes(category, draft.sourceRiskSources));
  };

  for (const item of foundation.verificationInput.context.planItems) {
    if (!item.verificationRelevance.relevant) {
      continue;
    }

    for (const category of item.verificationRelevance.categories as VerifyVerificationCategory[]) {
      seedFromPlanItem(
        item.id,
        category,
        "plan_item_verification_relevance",
        `Step 2 marked ${item.id} as verification-relevant for ${category}.`,
      );
    }
  }

  for (const obligation of foundation.verificationInput.context.testObligations) {
    const planItem = planItemsById.get(obligation.planItemId);
    if (!planItem) {
      continue;
    }

    seedFromPlanItem(
      obligation.planItemId,
      verificationCategoryForObligation(obligation, planItem),
      "test_obligation",
      `Step 2 kept ${obligation.category} visible for ${obligation.planItemId}: ${obligation.reason}`,
    );
  }

  for (const target of foundation.carryForward.carryForward.initial_verification_targets) {
    const matchedItemIds = [...(pathToPlanItemIds.get(normalizePath(target.path)) ?? new Set<string>())];
    const conflictZoneItemIds = sortedPlanItemIds(
      foundation.verificationInput.context.conflictZones
        .filter((zone) => zone.paths.some((pathValue) => normalizePath(pathValue) === normalizePath(target.path)))
        .flatMap((zone) => zone.planItemIds),
    );
    const category = (target.category ?? (
      target.kind === "test"
        ? "test_surface"
        : target.kind === "manifest"
          ? "config_surface"
          : "code_surface"
    )) as VerifyVerificationCategory;
    const resolvedItemIds = matchedItemIds.length > 0
      ? matchedItemIds
      : conflictZoneItemIds;

    if (resolvedItemIds.length === 0) {
      continue;
    }

    for (const itemId of resolvedItemIds) {
      const item = planItemsById.get(itemId);
      if (!item) {
        continue;
      }

      if (isSupportedFormalCategory(category)) {
        const itemCategories = item.verificationRelevance.categories as VerifyVerificationCategory[];
        if (!itemCategories.includes(category)) {
          continue;
        }
      }

      seedFromPlanItem(
        itemId,
        category,
        "initial_verification_target",
        `Step 1 carried ${target.path} forward as an initial verification target.`,
      );
    }
  }

  const enrichExistingTargets = (
    planItemIds: string[],
    riskSource: VerifyTargetRiskSource,
    note: string,
    fallbackCategory: VerifyVerificationCategory,
    anchorPaths: string[],
  ): void => {
    const matchingDrafts = [...drafts.values()].filter((draft) =>
      planItemIds.some((itemId) => draft.sourcePlanItemIds.has(itemId)),
    );

    if (matchingDrafts.length > 0) {
      for (const draft of matchingDrafts) {
        for (const itemId of planItemIds) {
          draft.sourcePlanItemIds.add(itemId);
        }
        draft.sourceRiskSources.add(riskSource);
        draft.traceabilityNotes.add(note);
        for (const pathValue of anchorPaths) {
          draft.anchorPaths.add(pathValue);
        }
        addLaneFindingKinds(draft, determineLanes(draft.category, draft.sourceRiskSources));
      }
      return;
    }

    const componentId = planItemIds.length > 0
      ? componentByItemId.get(planItemIds[0]) ?? null
      : null;
    const key = buildKey(fallbackCategory, componentId, anchorPaths);
    const draft = ensureTargetDraft(drafts, key, fallbackCategory);
    for (const itemId of planItemIds) {
      draft.sourcePlanItemIds.add(itemId);
    }
    for (const pathValue of anchorPaths) {
      draft.anchorPaths.add(pathValue);
    }
    draft.sourceRiskSources.add(riskSource);
    draft.traceabilityNotes.add(note);
    addLaneFindingKinds(draft, determineLanes(draft.category, draft.sourceRiskSources));
  };

  for (const zone of foundation.verificationInput.context.conflictZones) {
    enrichExistingTargets(
      zone.planItemIds,
      "conflict_zone",
      `Conflict zone ${zone.id} keeps ${zone.paths.join(", ")} under coordinated verification.`,
      "conflict_zone_hazard",
      zone.paths,
    );
  }

  for (const signal of foundation.verificationInput.context.parallelizationSignals) {
    if (signal.signal === "safe_parallel") {
      continue;
    }

    const itemPaths = planItemsById.get(signal.planItemId)?.likelyAffectedPaths ?? [];
    enrichExistingTargets(
      [signal.planItemId],
      "parallelization_signal",
      `Step 2 marked ${signal.planItemId} as ${signal.signal}: ${signal.reason}`,
      structuralCategoryForSignal(signal.signal),
      itemPaths,
    );
  }

  for (const concern of foundation.carryForward.carryForward.concerns) {
    const anchorPaths = buildAnchorPathsFromItemIds(concern.planItemIds, planItemsById);
    enrichExistingTargets(
      concern.planItemIds,
      "carry_forward_concern",
      `Carry-forward concern ${concern.id} remains active: ${concern.message}`,
      structuralCategoryForConcern(concern),
      anchorPaths,
    );
  }

  const baseTraceabilityNotes: string[] = [];
  const baseFormalCautionNotes = buildVerifyFormalBaseCautionNotes(foundation);
  if (foundation.carryForward.carryForward.confidence.level === "low") {
    baseTraceabilityNotes.push("Step 2 carried low-confidence context into verification; results must stay conservative.");
  }
  if (foundation.verificationInput.usability.warningItems.length > 0) {
    baseTraceabilityNotes.push(
      ...foundation.verificationInput.usability.warningItems.map(
        (item) => `Verification warning context: [${item.code}] ${item.message}`,
      ),
    );
  }

  const targets: VerifyVerificationTarget[] = [...drafts.values()]
    .map((draft, index) => {
      const sourcePlanItemIds = sortedPlanItemIds(draft.sourcePlanItemIds);
      const anchorPaths = [...draft.anchorPaths].sort((left, right) => left.localeCompare(right));
      const sourceRiskSources = [...draft.sourceRiskSources].sort((left, right) => left.localeCompare(right));
      const candidateLanes = determineLanes(draft.category, sourceRiskSources);
      const traceabilityNotes = dedupeStable([
        ...draft.traceabilityNotes,
        ...baseTraceabilityNotes,
      ]);

      return {
        id: `verify-target-${(index + 1).toString().padStart(3, "0")}`,
        title: buildTargetTitle(draft.category, anchorPaths),
        category: draft.category,
        sourcePlanItemIds,
        riskSummary: buildRiskSummary(draft.category, anchorPaths, sourceRiskSources),
        candidateLanes,
        sourceRiskSources,
        expectedFindingKinds: [...draft.expectedFindingKinds].sort((left, right) => left.localeCompare(right)),
        verificationCaseIds: [],
        traceabilityNotes,
      };
    })
    .filter((target) => target.sourcePlanItemIds.length > 0)
    .sort((left, right) => {
      const byCategory = left.category.localeCompare(right.category);
      if (byCategory !== 0) {
        return byCategory;
      }

      const byPlanItems = left.sourcePlanItemIds.join("|").localeCompare(right.sourcePlanItemIds.join("|"));
      if (byPlanItems !== 0) {
        return byPlanItems;
      }

      return left.title.localeCompare(right.title);
    })
    .map((target, index) => ({
      ...target,
      id: `verify-target-${(index + 1).toString().padStart(3, "0")}`,
    }));

  const structuralLaneOrder: Record<VerifyLane, number> = {
    structural: 0,
    formal: 1,
  };

  const cases: VerifyVerificationCase[] = [];
  for (const target of targets) {
    const targetCaseIds: string[] = [];

    for (const lane of [...target.candidateLanes].sort((left, right) => structuralLaneOrder[left] - structuralLaneOrder[right])) {
      if (lane === "formal") {
        for (const scenarioKind of getVerifyFormalScenarioKinds(target.category)) {
          const caseId = `verify-case-${(cases.length + 1).toString().padStart(3, "0")}`;
          targetCaseIds.push(caseId);
          cases.push({
            id: caseId,
            verificationTargetId: target.id,
            title: buildFormalCaseTitle(target, scenarioKind),
            category: target.category,
            sourcePlanItemIds: [...target.sourcePlanItemIds],
            lanes: [lane],
            goal: `Model ${target.category} scenario ${scenarioKind} formally and preserve traceability to the originating Step 2 plan items.`,
            status: "not_run",
            summary: buildCaseSummary(target, lane, scenarioKind),
            findings: [],
            mitigations: [],
            constraints: [],
            traceabilityNotes: [...target.traceabilityNotes],
            formalDetails: {
              enteredFormalLane: true,
              entryCriteria: buildVerifyFormalEntryCriteria(
                target.category,
                target.sourceRiskSources,
                target.sourcePlanItemIds,
              ),
              stateModelId: null,
              tlaSpecId: null,
              tlcResultId: null,
              scenarioKind,
              cautionNotes: [...baseFormalCautionNotes],
              trace: null,
              errors: [],
            },
          });
        }
        continue;
      }

      const caseId = `verify-case-${(cases.length + 1).toString().padStart(3, "0")}`;
      targetCaseIds.push(caseId);
      cases.push({
        id: caseId,
        verificationTargetId: target.id,
        title: `${target.title} (${lane})`,
        category: target.category,
        sourcePlanItemIds: [...target.sourcePlanItemIds],
        lanes: [lane],
        goal: buildCaseGoal(target, lane),
        status: "not_run",
        summary: buildCaseSummary(target, lane),
        findings: [],
        mitigations: [],
        constraints: [],
        traceabilityNotes: [...target.traceabilityNotes],
        formalDetails: null,
      });
    }

    target.verificationCaseIds = targetCaseIds;
  }

  return {
    targets,
    cases,
    structuralCaseCount: cases.filter((item) => item.lanes.includes("structural")).length,
    formalCaseCount: cases.filter((item) => item.lanes.includes("formal")).length,
  };
}
