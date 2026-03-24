import type {
  PlanCarryForwardConcern,
  PlanCarryForwardConcernEffect,
  PlanConflictZone,
  PlanDependencyGraphEntry,
  PlanDependencyType,
  PlanFoundationResult,
  PlanItem,
  PlanItemCategory,
  PlanModel,
  PlanParallelization,
  PlanParallelizationSignalEntry,
  PlanRiskLevel,
  PlanTestObligation,
  PlanTestObligationEntry,
  PlanVerificationCategory,
  PlanVerificationRelevance,
} from "./types.js";

type ClusterCategory = Extract<PlanItemCategory, "config" | "interface" | "implementation" | "test">;

interface RiskZoneEntry {
  code: string;
  level: PlanRiskLevel;
  reason: string;
  evidencePaths: string[];
}

interface PlannerContext {
  requirementSeeds: string[];
  configPaths: string[];
  interfacePaths: string[];
  implementationPaths: string[];
  testPaths: string[];
  sourcePaths: string[];
  entryPointPaths: Set<string>;
  fallbackTargetPaths: Set<string>;
  riskZones: RiskZoneEntry[];
  fallbackOnlyTargeting: boolean;
  lowConfidence: boolean;
  sharedRiskPaths: Set<string>;
}

interface ItemDraft {
  id: string;
  clusterKey: string;
  category: ClusterCategory;
  title: string;
  description: string;
  sourceRequirements: string[];
  likelyAffectedPaths: string[];
}

const CATEGORY_ORDER: readonly ClusterCategory[] = [
  "config",
  "interface",
  "implementation",
  "test",
];

const INTERFACE_VERIFICATION_CATEGORIES = new Set<PlanVerificationCategory>([
  "api_contract",
  "migration_order",
  "ownership",
  "parallel_overlap",
]);

const INTERFACE_RISKY_PHRASES = ["api contract", "migration", "ownership", "parallel"] as const;
const CONFIG_KEYWORD_PATTERN =
  /\b(config|configuration|manifest|package\.json|tsconfig|pyproject|setup\.cfg|requirements|pytest\.ini)\b/i;
const IMPLEMENTATION_HINT_PATTERN =
  /\b(add|adjust|align|change|fix|implement|keep|maintain|preserve|refactor|replace|rework|revise|support|tighten|update)\b/i;
const TEST_HINT_PATTERN = /\b(test|tests|testing|regression|smoke|coverage|assert)\b/i;

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\.\/+/, "").replace(/\/+$/, "").toLowerCase();
}

function dedupeStable(values: string[]): string[] {
  const seen = new Set<string>();
  const deduped: string[] = [];

  for (const value of values) {
    const normalized = value.includes("/") || value.includes("\\")
      ? normalizePath(value)
      : normalizeWhitespace(value);

    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    deduped.push(value.includes("/") || value.includes("\\") ? value.replace(/\\/g, "/") : normalizeWhitespace(value));
  }

  return deduped;
}

function uniqueOrdered<T>(values: T[], getKey: (value: T) => string): T[] {
  const seen = new Set<string>();
  const ordered: T[] = [];

  for (const value of values) {
    const key = getKey(value);
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    ordered.push(value);
  }

  return ordered;
}

function pathBasename(value: string): string {
  const normalized = value.replace(/\\/g, "/");
  const segments = normalized.split("/");
  return segments[segments.length - 1] ?? normalized;
}

function normalizeFileStem(filePath: string): string {
  const baseName = pathBasename(filePath).toLowerCase();
  const withoutExtension = baseName.replace(/\.[^.]+$/, "");
  return withoutExtension.replace(/\.(test|spec)$/i, "");
}

function isManifestLikePath(filePath: string): boolean {
  const normalized = normalizePath(filePath);
  const baseName = pathBasename(normalized);

  return (
    baseName === "package.json" ||
    baseName === "package-lock.json" ||
    baseName === "pnpm-lock.yaml" ||
    baseName === "yarn.lock" ||
    baseName === "pyproject.toml" ||
    baseName === "setup.cfg" ||
    baseName === "requirements.txt" ||
    baseName === "requirements-dev.txt" ||
    baseName === "requirements-prod.txt" ||
    baseName === "pytest.ini" ||
    baseName === "tsconfig.json" ||
    normalized.includes("/config/") ||
    normalized.includes(".github/workflows/")
  );
}

function isTestLikePath(filePath: string): boolean {
  const normalized = normalizePath(filePath);
  return (
    normalized.includes("/tests/") ||
    normalized.includes("/__tests__/") ||
    /\.test\./i.test(normalized) ||
    /\.spec\./i.test(normalized)
  );
}

function isSharedRiskPath(filePath: string): boolean {
  if (isManifestLikePath(filePath)) {
    return true;
  }

  return /(^|\/)(app|index|main|server|cli)\.[^.]+$/i.test(filePath.replace(/\\/g, "/"));
}

function textMentionsPath(text: string, filePath: string): boolean {
  const normalizedPath = normalizePath(filePath);
  const baseName = pathBasename(normalizedPath);
  return text.includes(normalizedPath) || text.includes(baseName.toLowerCase());
}

function riskRank(level: PlanRiskLevel): number {
  switch (level) {
    case "high":
      return 3;
    case "medium":
      return 2;
    case "low":
    default:
      return 1;
  }
}

function maxRisk(...levels: PlanRiskLevel[]): PlanRiskLevel {
  return levels.reduce<PlanRiskLevel>((highest, current) =>
    riskRank(current) > riskRank(highest) ? current : highest, "low");
}

function getRequirementSeeds(foundation: PlanFoundationResult): string[] {
  const taskSpec = foundation.carryForward.taskSpec;
  const candidates = [
    taskSpec.explicit_requirements,
    taskSpec.acceptance_criteria,
    taskSpec.implementation_necessities,
    taskSpec.goal ? [taskSpec.goal] : [],
  ];

  for (const values of candidates) {
    const normalized = dedupeStable(values ?? []);
    if (normalized.length > 0) {
      return normalized;
    }
  }

  return [];
}

function buildRiskZones(foundation: PlanFoundationResult): RiskZoneEntry[] {
  const riskAnalysis = foundation.carryForward.riskAnalysis;

  return uniqueOrdered(
    [
      ...riskAnalysis.initial_risk_zones.map((zone) => ({
        code: zone.code,
        level: zone.level,
        reason: zone.reason,
        evidencePaths: zone.evidence_paths,
      })),
      ...riskAnalysis.derived_risk_zones.map((zone) => ({
        code: zone.code,
        level: zone.level,
        reason: zone.reason,
        evidencePaths: zone.evidence_paths,
      })),
    ],
    (zone) => `${zone.code}:${zone.reason}`,
  );
}

function buildSiblingTestPaths(sourcePaths: string[], repoTestFiles: string[]): string[] {
  const siblingTests: string[] = [];

  for (const sourcePath of sourcePaths) {
    const sourceStem = normalizeFileStem(sourcePath);
    for (const testFile of repoTestFiles) {
      if (normalizeFileStem(testFile) === sourceStem) {
        siblingTests.push(testFile);
      }
    }
  }

  return dedupeStable(siblingTests);
}

function buildPlannerContext(foundation: PlanFoundationResult): PlannerContext {
  const carryForward = foundation.carryForward;
  const candidateTargets = carryForward.candidateTargets;
  const sharedRiskPaths = new Set<string>(
    candidateTargets
      .filter((target) => target.shared_risk)
      .map((target) => normalizePath(target.path)),
  );
  const sourcePaths = dedupeStable(
    candidateTargets
      .filter((target) => target.kind === "source")
      .map((target) => target.path),
  );
  const manifestPaths = dedupeStable(
    candidateTargets
      .filter((target) => target.kind === "manifest")
      .map((target) => target.path),
  );
  const testPaths = dedupeStable(
    candidateTargets
      .filter((target) => target.kind === "test")
      .map((target) => target.path),
  );
  const riskZones = buildRiskZones(foundation);
  const manifestRiskPaths = dedupeStable(
    riskZones
      .filter((zone) => zone.code === "manifest_or_config_impact")
      .flatMap((zone) => zone.evidencePaths)
      .filter(isManifestLikePath),
  );
  const interfaceVerificationPaths = dedupeStable(
    carryForward.initialVerificationTargets
      .filter((target) =>
        Boolean(target.category) &&
        INTERFACE_VERIFICATION_CATEGORIES.has(target.category as PlanVerificationCategory),
      )
      .map((target) => target.path),
  );
  const sharedSourcePaths = dedupeStable(
    candidateTargets
      .filter((target) => target.kind === "source" && target.shared_risk)
      .map((target) => target.path),
  );
  const riskyPhrases = new Set(carryForward.taskSpec.risky_phrases ?? []);
  const interfaceSeedPaths = dedupeStable([
    ...sharedSourcePaths,
    ...interfaceVerificationPaths,
  ]);
  const interfacePaths = interfaceSeedPaths.length > 0
    ? interfaceSeedPaths
    : INTERFACE_RISKY_PHRASES.some((phrase) => riskyPhrases.has(phrase))
      ? dedupeStable([...sourcePaths])
      : [];
  const implementationPaths = dedupeStable(sourcePaths);
  const siblingTests = buildSiblingTestPaths(sourcePaths, carryForward.repoContext.test_files);

  return {
    requirementSeeds: getRequirementSeeds(foundation),
    configPaths: dedupeStable([...manifestPaths, ...manifestRiskPaths]),
    interfacePaths,
    implementationPaths,
    testPaths: dedupeStable([...testPaths, ...siblingTests]),
    sourcePaths,
    entryPointPaths: new Set(carryForward.repoContext.entry_points.map(normalizePath)),
    fallbackTargetPaths: new Set(
      candidateTargets
        .filter((target) => target.match_type === "fallback")
        .map((target) => normalizePath(target.path)),
    ),
    riskZones,
    fallbackOnlyTargeting:
      candidateTargets.length > 0 && candidateTargets.every((target) => target.match_type === "fallback"),
    lowConfidence: carryForward.confidence.level === "low",
    sharedRiskPaths,
  };
}

function determineRequirementCategories(
  requirement: string,
  context: PlannerContext,
): ClusterCategory[] {
  const normalizedText = normalizeWhitespace(requirement).toLowerCase();
  const categories = new Set<ClusterCategory>();
  const testSignal =
    TEST_HINT_PATTERN.test(normalizedText) ||
    context.testPaths.some((pathValue) => textMentionsPath(normalizedText, pathValue));
  const configSignal =
    CONFIG_KEYWORD_PATTERN.test(normalizedText) ||
    context.configPaths.some((pathValue) => textMentionsPath(normalizedText, pathValue));
  const interfaceSignal =
    INTERFACE_RISKY_PHRASES.some((phrase) => normalizedText.includes(phrase)) ||
    context.interfacePaths.some((pathValue) => textMentionsPath(normalizedText, pathValue));
  const implementationSignal =
    context.sourcePaths.some((pathValue) => textMentionsPath(normalizedText, pathValue)) ||
    IMPLEMENTATION_HINT_PATTERN.test(normalizedText);

  if (testSignal && context.testPaths.length > 0) {
    categories.add("test");
  }
  if (configSignal && context.configPaths.length > 0) {
    categories.add("config");
  }
  if (interfaceSignal && context.interfacePaths.length > 0) {
    categories.add("interface");
  }
  if ((implementationSignal || categories.size === 0) && context.implementationPaths.length > 0) {
    categories.add("implementation");
  }

  if (categories.size === 0) {
    const fallbackCategory = CATEGORY_ORDER.find((category) => {
      switch (category) {
        case "config":
          return context.configPaths.length > 0;
        case "interface":
          return context.interfacePaths.length > 0;
        case "implementation":
          return context.implementationPaths.length > 0;
        case "test":
          return context.testPaths.length > 0;
        default:
          return false;
      }
    });

    if (fallbackCategory) {
      categories.add(fallbackCategory);
    }
  }

  return [...categories];
}

function summarizePaths(paths: string[]): string {
  const display = paths.slice(0, 3).map((pathValue) => `\`${pathValue}\``).join(", ");
  if (paths.length <= 3) {
    return display;
  }
  return `${display}, and ${paths.length - 3} more`;
}

function buildItemTitle(category: ClusterCategory, paths: string[]): string {
  const pathSummary = summarizePaths(paths);

  switch (category) {
    case "config":
      return `Plan config updates for ${pathSummary}`;
    case "interface":
      return `Plan shared interface work for ${pathSummary}`;
    case "implementation":
      return `Plan implementation updates for ${pathSummary}`;
    case "test":
      return `Plan test updates for ${pathSummary}`;
    default:
      return `Plan work for ${pathSummary}`;
  }
}

function buildItemDescription(
  category: ClusterCategory,
  paths: string[],
  sourceRequirements: string[],
): string {
  const requirementSummary = sourceRequirements.join("; ");

  switch (category) {
    case "config":
      return `Review manifest and configuration surfaces in ${summarizePaths(paths)} to support: ${requirementSummary}.`;
    case "interface":
      return `Coordinate shared interfaces or entrypoints in ${summarizePaths(paths)} before downstream code changes for: ${requirementSummary}.`;
    case "implementation":
      return `Implement the requested behavior in ${summarizePaths(paths)} for: ${requirementSummary}.`;
    case "test":
      return `Align test coverage in ${summarizePaths(paths)} with the planned behavior for: ${requirementSummary}.`;
    default:
      return `Plan work in ${summarizePaths(paths)} for: ${requirementSummary}.`;
  }
}

function buildCategoryPathGroups(category: ClusterCategory, context: PlannerContext): string[][] {
  switch (category) {
    case "config":
      return context.configPaths.length > 0 ? [context.configPaths] : [];
    case "interface":
      return context.interfacePaths.map((pathValue) => [pathValue]);
    case "implementation":
      return context.implementationPaths.map((pathValue) => [pathValue]);
    case "test":
      return context.testPaths.map((pathValue) => [pathValue]);
    default:
      return [];
  }
}

function buildDraftClusterKey(category: ClusterCategory, paths: string[]): string {
  if (category === "config") {
    return "config";
  }

  const firstPath = paths[0];
  if (!firstPath) {
    return `${category}-unknown`;
  }

  return `${category}:${normalizeFileStem(firstPath)}`;
}

function requirementMatchesPaths(requirement: string, paths: string[]): boolean {
  const normalizedRequirement = normalizeWhitespace(requirement).toLowerCase();

  return paths.some((pathValue) =>
    textMentionsPath(normalizedRequirement, pathValue) ||
    normalizedRequirement.includes(normalizeFileStem(pathValue).toLowerCase()));
}

function buildDrafts(foundation: PlanFoundationResult, context: PlannerContext): ItemDraft[] {
  const requirementCategories = new Map<string, ClusterCategory[]>();

  for (const requirement of context.requirementSeeds) {
    requirementCategories.set(requirement, determineRequirementCategories(requirement, context));
  }

  const drafts: ItemDraft[] = [];

  for (const category of CATEGORY_ORDER) {
    const pathGroups = buildCategoryPathGroups(category, context);

    if (pathGroups.length === 0) {
      continue;
    }

    let categoryIndex = 1;
    for (const paths of pathGroups) {
      const categoryRequirements = context.requirementSeeds.filter(
        (requirement) => requirementCategories.get(requirement)?.includes(category),
      );
      const matchedRequirements = categoryRequirements.filter((requirement) =>
        requirementMatchesPaths(requirement, paths));
      const resolvedRequirements =
        matchedRequirements.length > 0
          ? matchedRequirements
          : categoryRequirements.length > 0
            ? categoryRequirements
            : context.requirementSeeds.length > 0
              ? [context.requirementSeeds[0]]
              : [`Planning surface inferred from Step 1 targeting for ${summarizePaths(paths)}.`];

      drafts.push({
        id: `plan-${category}-${categoryIndex}`,
        clusterKey: buildDraftClusterKey(category, paths),
        category,
        title: buildItemTitle(category, paths),
        description: buildItemDescription(category, paths, resolvedRequirements),
        sourceRequirements: dedupeStable(resolvedRequirements),
        likelyAffectedPaths: dedupeStable(paths),
      });
      categoryIndex += 1;
    }
  }

  if (drafts.length === 0 && context.requirementSeeds.length > 0) {
    drafts.push({
      id: "plan-implementation-1",
      clusterKey: "implementation:inferred",
      category: "implementation",
      title: "Plan implementation updates for inferred targets",
      description: `Implement the requested behavior for: ${context.requirementSeeds.join("; ")}.`,
      sourceRequirements: dedupeStable(context.requirementSeeds),
      likelyAffectedPaths: dedupeStable([
        ...foundation.carryForward.candidateTargets.map((target) => target.path),
        ...(foundation.carryForward.repoContext.entry_points ?? []),
      ]).slice(0, 5),
    });
  }

  return drafts;
}

function draftsShareSurface(left: ItemDraft, right: ItemDraft): boolean {
  if (left.clusterKey === right.clusterKey) {
    return true;
  }

  return left.likelyAffectedPaths.some((leftPath) =>
    right.likelyAffectedPaths.some((rightPath) => normalizeFileStem(leftPath) === normalizeFileStem(rightPath)));
}

function buildDependencies(drafts: ItemDraft[]): Map<string, PlanDependencyGraphEntry[]> {
  const draftsByCategory = new Map<ClusterCategory, ItemDraft[]>();
  for (const draft of drafts) {
    const existing = draftsByCategory.get(draft.category) ?? [];
    draftsByCategory.set(draft.category, [...existing, draft]);
  }

  const dependencies = new Map<string, PlanDependencyGraphEntry[]>();

  for (const draft of drafts) {
    const itemDependencies: PlanDependencyGraphEntry[] = [];
    const configDrafts = draftsByCategory.get("config") ?? [];
    const interfaceDrafts = draftsByCategory.get("interface") ?? [];
    const implementationDrafts = draftsByCategory.get("implementation") ?? [];

    if (draft.category === "interface") {
      for (const configDraft of configDrafts) {
        itemDependencies.push({
          planItemId: draft.id,
          dependsOnPlanItemId: configDraft.id,
          type: "sequencing",
          reason: "Manifest and config work should land before shared interfaces are finalized.",
        });
      }
    }

    if (draft.category === "implementation") {
      const matchingInterfaceDrafts = interfaceDrafts.filter((interfaceDraft) =>
        draftsShareSurface(draft, interfaceDraft));

      if (matchingInterfaceDrafts.length > 0) {
        for (const interfaceDraft of matchingInterfaceDrafts) {
          itemDependencies.push({
            planItemId: draft.id,
            dependsOnPlanItemId: interfaceDraft.id,
            type: "interface_first",
            reason: "Shared interface decisions should settle before implementation work proceeds.",
          });
        }
      } else {
        for (const configDraft of configDrafts) {
          itemDependencies.push({
            planItemId: draft.id,
            dependsOnPlanItemId: configDraft.id,
            type: "sequencing",
            reason: "Config changes should land before implementation depends on them.",
          });
        }
      }
    }

    if (draft.category === "test") {
      const matchingImplementationDrafts = implementationDrafts.filter((implementationDraft) =>
        draftsShareSurface(draft, implementationDraft));
      const matchedDependencies =
        matchingImplementationDrafts.length > 0
          ? matchingImplementationDrafts
          : drafts.filter((item) => item.category !== "test" && draftsShareSurface(draft, item));

      if (matchedDependencies.length > 0) {
        for (const dependencyDraft of matchedDependencies) {
          itemDependencies.push({
            planItemId: draft.id,
            dependsOnPlanItemId: dependencyDraft.id,
            type: "hard",
            reason: "Test work should validate the finalized related plan item before broader regression work completes.",
          });
        }
      } else {
        for (const dependencyDraft of drafts.filter((item) => item.category !== "test")) {
          itemDependencies.push({
            planItemId: draft.id,
            dependsOnPlanItemId: dependencyDraft.id,
            type: "hard",
            reason: "Test work should validate the finalized non-test plan items.",
          });
        }
      }
    }

    dependencies.set(draft.id, itemDependencies);
  }

  return dependencies;
}

function buildDependencyGraphEntries(dependencyMap: Map<string, PlanDependencyGraphEntry[]>): PlanDependencyGraphEntry[] {
  return uniqueOrdered(
    [...dependencyMap.values()].flat(),
    (entry) => `${entry.planItemId}:${entry.dependsOnPlanItemId}:${entry.type}:${entry.reason}`,
  );
}

function collectDependents(
  rootId: string,
  dependencyGraph: PlanDependencyGraphEntry[],
): string[] {
  const dependents: string[] = [];
  const queue = [rootId];
  const seen = new Set<string>(queue);

  while (queue.length > 0) {
    const currentId = queue.shift() ?? "";
    for (const edge of dependencyGraph) {
      if (edge.dependsOnPlanItemId !== currentId || seen.has(edge.planItemId)) {
        continue;
      }

      seen.add(edge.planItemId);
      dependents.push(edge.planItemId);
      queue.push(edge.planItemId);
    }
  }

  return dependents;
}

function buildConflictZones(
  drafts: ItemDraft[],
  dependencyGraph: PlanDependencyGraphEntry[],
  context: PlannerContext,
): PlanConflictZone[] {
  const zones: PlanConflictZone[] = [];
  const configDrafts = drafts.filter((draft) => draft.category === "config");
  const interfaceDrafts = drafts.filter((draft) => draft.category === "interface");

  if (configDrafts.length > 0) {
    const configPaths = dedupeStable(configDrafts.flatMap((draft) => draft.likelyAffectedPaths));
    const configPlanItemIds = dedupeStable(
      configDrafts.flatMap((draft) => [draft.id, ...collectDependents(draft.id, dependencyGraph)]),
    );

    zones.push({
      id: "conflict-zone-config-1",
      title: "Manifest and configuration overlap",
      reason: "Config and manifest surfaces are shared-risk files that can force protected merge order.",
      paths: configPaths,
      planItemIds: configPlanItemIds,
      riskLevel: context.fallbackOnlyTargeting || context.lowConfidence ? "high" : "medium",
    });
  }

  for (const [index, interfaceDraft] of interfaceDrafts.entries()) {
    if (interfaceDraft.likelyAffectedPaths.length === 0) {
      continue;
    }

    zones.push({
      id: `conflict-zone-interface-${index + 1}`,
      title: "Shared interfaces and entrypoints",
      reason: "Shared-risk interfaces and entrypoints need visible coordination across dependent plan items.",
      paths: interfaceDraft.likelyAffectedPaths,
      planItemIds: dedupeStable([interfaceDraft.id, ...collectDependents(interfaceDraft.id, dependencyGraph)]),
      riskLevel: context.fallbackOnlyTargeting || context.lowConfidence ? "high" : "medium",
    });
  }

  if (zones.length === 0 && drafts.length > 0 && (context.fallbackOnlyTargeting || context.lowConfidence)) {
    zones.push({
      id: "conflict-zone-planning-1",
      title: "Low-confidence planning overlap",
      reason: "Fallback targeting keeps overlap visible because planning confidence is low.",
      paths: dedupeStable(drafts.flatMap((draft) => draft.likelyAffectedPaths)).slice(0, 6),
      planItemIds: drafts.map((draft) => draft.id),
      riskLevel: "high",
    });
  }

  return zones;
}

function buildPlanTestObligationEntries(planItems: PlanItem[]): PlanTestObligationEntry[] {
  return uniqueOrdered(
    planItems.flatMap((item) =>
      item.testObligations.map((obligation) => ({
        planItemId: item.id,
        category: obligation.category,
        reason: obligation.reason,
      }))),
    (entry) => `${entry.planItemId}:${entry.category}:${entry.reason}`,
  );
}

function buildPlanParallelizationSignalEntries(planItems: PlanItem[]): PlanParallelizationSignalEntry[] {
  return uniqueOrdered(
    planItems.map((item) => ({
      planItemId: item.id,
      signal: item.parallelization.signal,
      reason: item.parallelization.reason,
    })),
    (entry) => `${entry.planItemId}:${entry.signal}:${entry.reason}`,
  );
}

function effectRank(effect: PlanCarryForwardConcernEffect): number {
  switch (effect) {
    case "planning_readiness":
      return 5;
    case "parallelization_caution":
      return 4;
    case "dependency_caution":
      return 3;
    case "test_strategy":
      return 2;
    case "risk_level":
    default:
      return 1;
  }
}

function buildConcernEffects(params: {
  source: PlanCarryForwardConcern["source"];
  code: string | null;
  message: string;
}): PlanCarryForwardConcernEffect[] {
  const effects: PlanCarryForwardConcernEffect[] = ["risk_level"];
  const normalizedMessage = normalizeWhitespace(params.message).toLowerCase();
  const normalizedCode = params.code?.toLowerCase() ?? "";

  if (params.source === "low_confidence") {
    effects.push("parallelization_caution");
  }

  if (params.source === "candidate_target_uncertainty") {
    effects.push("dependency_caution", "parallelization_caution");
  }

  if (params.source === "readiness_blocker") {
    effects.push("planning_readiness", "parallelization_caution");
  }

  if (params.source === "ambiguity") {
    effects.push("dependency_caution");
  }

  if (
    params.source === "warning" &&
    (
      normalizedMessage.includes("test") ||
      normalizedMessage.includes("coverage") ||
      normalizedCode.includes("test")
    )
  ) {
    effects.push("test_strategy");
  }

  if (
    normalizedMessage.includes("parallel") ||
    normalizedMessage.includes("ownership") ||
    normalizedMessage.includes("migration") ||
    normalizedMessage.includes("manifest") ||
    normalizedMessage.includes("config") ||
    normalizedMessage.includes("target") ||
    normalizedMessage.includes("focus") ||
    normalizedMessage.includes("path") ||
    normalizedCode.includes("focus") ||
    normalizedCode.includes("target")
  ) {
    effects.push("dependency_caution", "parallelization_caution");
  }

  return uniqueOrdered(effects, (effect) => effect)
    .sort((left, right) => effectRank(right) - effectRank(left));
}

function mapConcernPlanItemIds(params: {
  source: PlanCarryForwardConcern["source"];
  code: string | null;
  message: string;
  drafts: ItemDraft[];
  context: PlannerContext;
}): string[] {
  const normalizedMessage = normalizeWhitespace(params.message).toLowerCase();
  const normalizedCode = params.code?.toLowerCase() ?? "";
  const matchedByPath = params.drafts
    .filter((draft) => draft.likelyAffectedPaths.some((pathValue) => textMentionsPath(normalizedMessage, pathValue)))
    .map((draft) => draft.id);

  if (matchedByPath.length > 0) {
    return dedupeStable(matchedByPath);
  }

  if (params.source === "candidate_target_uncertainty" && params.context.fallbackTargetPaths.size > 0) {
    const fallbackMatches = params.drafts
      .filter((draft) =>
        draft.likelyAffectedPaths.some((pathValue) => params.context.fallbackTargetPaths.has(normalizePath(pathValue))))
      .map((draft) => draft.id);

    if (fallbackMatches.length > 0) {
      return dedupeStable(fallbackMatches);
    }
  }

  const categoryMatches = new Set<ClusterCategory>();
  if (normalizedMessage.includes("test") || normalizedMessage.includes("coverage") || normalizedCode.includes("test")) {
    categoryMatches.add("test");
    categoryMatches.add("implementation");
  }
  if (
    CONFIG_KEYWORD_PATTERN.test(normalizedMessage) ||
    normalizedCode.includes("config") ||
    normalizedCode.includes("manifest")
  ) {
    categoryMatches.add("config");
  }
  if (
    normalizedMessage.includes("api contract") ||
    normalizedMessage.includes("interface") ||
    normalizedMessage.includes("ownership") ||
    normalizedMessage.includes("parallel") ||
    normalizedMessage.includes("migration") ||
    normalizedMessage.includes("entrypoint") ||
    normalizedMessage.includes("entry point")
  ) {
    categoryMatches.add("interface");
  }

  if (categoryMatches.size > 0) {
    const scopedMatches = params.drafts
      .filter((draft) => categoryMatches.has(draft.category))
      .map((draft) => draft.id);

    if (scopedMatches.length > 0) {
      return dedupeStable(scopedMatches);
    }
  }

  return params.drafts.map((draft) => draft.id);
}

function createConcern(params: {
  id: string;
  source: PlanCarryForwardConcern["source"];
  code: string | null;
  message: string;
  planItemIds: string[];
  effects: PlanCarryForwardConcernEffect[];
}): PlanCarryForwardConcern {
  return {
    id: params.id,
    source: params.source,
    code: params.code,
    message: params.message,
    planItemIds: dedupeStable(params.planItemIds),
    effects: uniqueOrdered(params.effects, (effect) => effect),
    status: "carried_forward",
  };
}

function buildCarryForwardConcerns(
  foundation: PlanFoundationResult,
  drafts: ItemDraft[],
  context: PlannerContext,
): PlanCarryForwardConcern[] {
  if (drafts.length === 0) {
    return [];
  }

  const concerns: PlanCarryForwardConcern[] = [];
  let concernIndex = 1;
  const nextId = () => `carry-forward-${concernIndex++}`;

  if (context.lowConfidence) {
    concerns.push(createConcern({
      id: nextId(),
      source: "low_confidence",
      code: null,
      message: `Step 1 confidence remains low because ${foundation.carryForward.confidence.reasons.join(", ")}.`,
      planItemIds: drafts.map((draft) => draft.id),
      effects: buildConcernEffects({
        source: "low_confidence",
        code: null,
        message: foundation.carryForward.confidence.reasons.join(", "),
      }),
    }));
  }

  if (context.fallbackOnlyTargeting || context.fallbackTargetPaths.size > 0) {
    concerns.push(createConcern({
      id: nextId(),
      source: "candidate_target_uncertainty",
      code: null,
      message: "Step 1 relied on fallback target mapping for at least part of the planning surface.",
      planItemIds: mapConcernPlanItemIds({
        source: "candidate_target_uncertainty",
        code: null,
        message: "fallback target mapping",
        drafts,
        context,
      }),
      effects: buildConcernEffects({
        source: "candidate_target_uncertainty",
        code: null,
        message: "fallback target mapping",
      }),
    }));
  }

  for (const item of foundation.carryForward.riskAnalysis.supporting_analysis.ambiguity_items) {
    concerns.push(createConcern({
      id: nextId(),
      source: "ambiguity",
      code: item.type,
      message: item.message,
      planItemIds: mapConcernPlanItemIds({
        source: "ambiguity",
        code: item.type,
        message: item.message,
        drafts,
        context,
      }),
      effects: buildConcernEffects({
        source: "ambiguity",
        code: item.type,
        message: item.message,
      }),
    }));
  }

  for (const item of foundation.carryForward.riskAnalysis.supporting_analysis.warning_items) {
    concerns.push(createConcern({
      id: nextId(),
      source: "warning",
      code: item.code,
      message: item.message,
      planItemIds: mapConcernPlanItemIds({
        source: "warning",
        code: item.code,
        message: item.message,
        drafts,
        context,
      }),
      effects: buildConcernEffects({
        source: "warning",
        code: item.code,
        message: item.message,
      }),
    }));
  }

  for (const issue of foundation.carryForward.nextStepReadiness.blocking_issues) {
    concerns.push(createConcern({
      id: nextId(),
      source: "readiness_blocker",
      code: issue.code,
      message: issue.message,
      planItemIds: drafts.map((draft) => draft.id),
      effects: buildConcernEffects({
        source: "readiness_blocker",
        code: issue.code,
        message: issue.message,
      }),
    }));
  }

  return uniqueOrdered(
    concerns,
    (concern) =>
      `${concern.source}:${concern.code ?? ""}:${concern.message}:${concern.planItemIds.join("|")}:${concern.effects.join("|")}`,
  );
}

function itemHasSharedRisk(paths: string[], context: PlannerContext): boolean {
  return paths.some((pathValue) =>
    context.sharedRiskPaths.has(normalizePath(pathValue)) || isSharedRiskPath(pathValue),
  );
}

function deriveVerificationRelevance(
  draft: ItemDraft,
  foundation: PlanFoundationResult,
  context: PlannerContext,
  concerns: PlanCarryForwardConcern[],
): PlanVerificationRelevance {
  const itemPathSet = new Set(draft.likelyAffectedPaths.map(normalizePath));
  const categories = new Set<PlanVerificationCategory>();
  const riskyPhrases = new Set(foundation.carryForward.taskSpec.risky_phrases ?? []);

  for (const target of foundation.carryForward.initialVerificationTargets) {
    if (!target.category || !itemPathSet.has(normalizePath(target.path))) {
      continue;
    }

    categories.add(target.category as PlanVerificationCategory);
  }

  if (draft.category === "implementation") {
    if (riskyPhrases.has("retry")) {
      categories.add("retry_logic");
    }
    if (riskyPhrases.has("stale write")) {
      categories.add("stale_write");
    }
    if (categories.size === 0) {
      categories.add("code_surface");
    }
  }

  if (draft.category === "test" && categories.size === 0) {
    categories.add("test_surface");
  }

  if (draft.category === "config") {
    if (riskyPhrases.has("migration")) {
      categories.add("migration_order");
    }
    if (riskyPhrases.has("api contract")) {
      categories.add("api_contract");
    }
    if (categories.size === 0) {
      categories.add("config_surface");
    }
  }

  if (draft.category === "interface") {
    if (riskyPhrases.has("migration")) {
      categories.add("migration_order");
    }
    if (riskyPhrases.has("api contract")) {
      categories.add("api_contract");
    }
    if (riskyPhrases.has("ownership")) {
      categories.add("ownership");
    }
    if (riskyPhrases.has("parallel")) {
      categories.add("parallel_overlap");
    }
    if (categories.size === 0) {
      categories.add("code_surface");
    }
  }

  const notes: string[] = [];
  if (context.lowConfidence) {
    notes.push("Step 1 confidence is low, so this item should be verified conservatively.");
  }
  if (context.fallbackOnlyTargeting) {
    notes.push("This item is derived from fallback candidate targeting rather than explicit task-to-file mapping.");
  }
  if (concerns.length > 0) {
    const concernSummary = concerns
      .map((concern) => `${concern.source}: ${concern.message}`)
      .slice(0, 2)
      .join(" | ");
    notes.push(`Carried-forward concerns remain relevant to this item: ${concernSummary}`);
  }

  return {
    relevant: categories.size > 0,
    categories: [...categories],
    notes,
  };
}

function addObligation(obligations: PlanTestObligation[], obligation: PlanTestObligation): void {
  if (!obligations.some((existing) => existing.category === obligation.category && existing.reason === obligation.reason)) {
    obligations.push(obligation);
  }
}

function deriveTestObligations(
  draft: ItemDraft,
  verification: PlanVerificationRelevance,
  foundation: PlanFoundationResult,
  context: PlannerContext,
  concerns: PlanCarryForwardConcern[],
): PlanTestObligation[] {
  const obligations: PlanTestObligation[] = [];
  const touchesEntrypoint = draft.likelyAffectedPaths.some((pathValue) =>
    context.entryPointPaths.has(normalizePath(pathValue)),
  );

  if (draft.category === "implementation") {
    addObligation(obligations, {
      category: "unit",
      reason: "Implementation behavior should be covered with focused unit validation.",
    });
    addObligation(obligations, {
      category: "regression",
      reason: "Implementation changes should preserve existing behavior through regression coverage.",
    });
    if (
      verification.categories.some((category) =>
        category === "api_contract" ||
        category === "migration_order" ||
        category === "config_surface" ||
        category === "parallel_overlap",
      )
    ) {
      addObligation(obligations, {
        category: "integration",
        reason: "Shared runtime surfaces require integration coverage alongside the implementation change.",
      });
    }
    if (touchesEntrypoint) {
      addObligation(obligations, {
        category: "smoke",
        reason: "Runtime-facing implementation work should keep smoke validation visible in the plan.",
      });
    }
  }

  if (draft.category === "interface") {
    addObligation(obligations, {
      category: "contract_validation",
      reason: "Shared interfaces should keep contract-level validation visible in the plan.",
    });
    if (
      draft.likelyAffectedPaths.some((pathValue) =>
        foundation.carryForward.repoContext.entry_points.some(
          (entryPoint) => normalizePath(entryPoint) === normalizePath(pathValue),
        ),
      )
    ) {
      addObligation(obligations, {
        category: "integration",
        reason: "Shared runtime entrypoints should keep integration validation visible in the plan.",
      });
      addObligation(obligations, {
        category: "smoke",
        reason: "Shared runtime entrypoints should keep smoke validation visible in the plan.",
      });
    }
  }

  if (draft.category === "config") {
    addObligation(obligations, {
      category: "contract_validation",
      reason: "Config and manifest changes should keep contract validation visible in the plan.",
    });
    if (
      verification.categories.includes("migration_order") ||
      foundation.carryForward.taskSpec.risky_phrases.includes("migration")
    ) {
      addObligation(obligations, {
        category: "migration_validation",
        reason: "Migration-sensitive config changes should keep sequencing validation visible in the plan.",
      });
    }
    if (touchesEntrypoint) {
      addObligation(obligations, {
        category: "smoke",
        reason: "Runtime-facing config changes should keep smoke validation visible in the plan.",
      });
    }
  }

  if (draft.category === "test") {
    addObligation(obligations, {
      category: "regression",
      reason: "Test updates should preserve regression coverage for the planned behavior.",
    });
  }

  if (concerns.some((concern) => concern.effects.includes("test_strategy")) && draft.category !== "test") {
    addObligation(obligations, {
      category: "regression",
      reason: "Carry-forward test-strategy concerns should keep regression validation visible for this item.",
    });
  }

  if (obligations.length === 0 && context.requirementSeeds.length > 0) {
    addObligation(obligations, {
      category: "regression",
      reason: "The planned work should keep at least regression coverage visible.",
    });
  }

  return obligations;
}

function deriveParallelization(
  draft: ItemDraft,
  dependencyGraph: PlanDependencyGraphEntry[],
  verification: PlanVerificationRelevance,
  concerns: PlanCarryForwardConcern[],
): PlanParallelization {
  const itemDependencies = dependencyGraph.filter((entry) => entry.planItemId === draft.id);
  const hasPlanningReadinessConcern = concerns.some((concern) => concern.effects.includes("planning_readiness"));
  const hasDependencyCaution = concerns.some((concern) => concern.effects.includes("dependency_caution"));
  const hasParallelizationCaution = concerns.some((concern) => concern.effects.includes("parallelization_caution"));

  if (
    hasPlanningReadinessConcern ||
    (verification.categories.includes("migration_order") && draft.category !== "config" && itemDependencies.length === 0)
  ) {
    return {
      signal: "serial_only",
      reason: "Unresolved readiness or migration-order caution keeps this work serial-only at planning time.",
    };
  }

  if (draft.category === "config") {
    return {
      signal: "protected_merge_order",
      reason: "Manifest and config work should keep protected merge order because the files are shared-risk.",
    };
  }

  if (draft.category === "interface") {
    return {
      signal: "risky_shared",
      reason: itemDependencies.length > 0
        ? "Shared interface work stays risky even after upstream config dependencies settle."
        : "Shared interfaces and entrypoints are risky to parallelize without extra coordination.",
    };
  }

  if (itemDependencies.length > 0 || hasDependencyCaution || hasParallelizationCaution) {
    return {
      signal: "parallel_after_dependency",
      reason: "This work can proceed after its upstream dependencies and carry-forward caution settle first.",
    };
  }

  return {
    signal: "safe_parallel",
    reason: "This work is isolated enough to parallelize without protected ordering.",
  };
}

function deriveRiskLevel(
  draft: ItemDraft,
  conflictZones: PlanConflictZone[],
  context: PlannerContext,
  concerns: PlanCarryForwardConcern[],
): PlanRiskLevel {
  let riskLevel: PlanRiskLevel = "low";
  const pathSet = new Set(draft.likelyAffectedPaths.map(normalizePath));

  if (context.fallbackOnlyTargeting) {
    riskLevel = "high";
  }

  if (concerns.some((concern) => concern.effects.includes("planning_readiness"))) {
    riskLevel = maxRisk(riskLevel, "high");
  } else if (concerns.some((concern) =>
    concern.effects.includes("risk_level") ||
    concern.effects.includes("dependency_caution") ||
    concern.effects.includes("parallelization_caution"))) {
    riskLevel = maxRisk(riskLevel, "medium");
  }

  for (const zone of context.riskZones) {
    const appliesToItem =
      zone.evidencePaths.length === 0 ||
      zone.evidencePaths.some((pathValue) => pathSet.has(normalizePath(pathValue)));

    if (!appliesToItem) {
      continue;
    }

    riskLevel = maxRisk(riskLevel, zone.level);
  }

  if (itemHasSharedRisk(draft.likelyAffectedPaths, context)) {
    riskLevel = maxRisk(riskLevel, "medium");
  }

  for (const zone of conflictZones) {
    if (!zone.planItemIds.includes(draft.id)) {
      continue;
    }

    riskLevel = maxRisk(riskLevel, zone.riskLevel);
  }

  return riskLevel;
}

function hasUsablePlanningSignal(foundation: PlanFoundationResult, context: PlannerContext): boolean {
  const taskSpec = foundation.carryForward.taskSpec;

  return (
    taskSpec.explicit_requirements.length > 0 ||
    taskSpec.acceptance_criteria.length > 0 ||
    taskSpec.implementation_necessities.length > 0 ||
    foundation.carryForward.candidateTargets.length > 0 ||
    foundation.carryForward.initialVerificationTargets.length > 0
  );
}

export function buildPlanModel(foundation: PlanFoundationResult): PlanModel {
  const context = buildPlannerContext(foundation);

  if (!hasUsablePlanningSignal(foundation, context)) {
    return {
      planItems: [],
      dependencyGraph: [],
      conflictZones: [],
      testObligations: [],
      parallelizationSignals: [],
      carryForwardConcerns: [],
    };
  }

  const drafts = buildDrafts(foundation, context).filter((draft) => draft.likelyAffectedPaths.length > 0);
  const dependencyMap = buildDependencies(drafts);
  const dependencyGraph = buildDependencyGraphEntries(dependencyMap);
  const conflictZones = buildConflictZones(drafts, dependencyGraph, context);
  const carryForwardConcerns = buildCarryForwardConcerns(foundation, drafts, context);
  const planItems: PlanItem[] = drafts.map((draft) => {
    const itemConcerns = carryForwardConcerns.filter((concern) => concern.planItemIds.includes(draft.id));
    const verificationRelevance = deriveVerificationRelevance(draft, foundation, context, itemConcerns);
    return {
      id: draft.id,
      title: draft.title,
      description: draft.description,
      category: draft.category,
      sourceRequirements: draft.sourceRequirements,
      likelyAffectedPaths: draft.likelyAffectedPaths,
      dependencies: (dependencyMap.get(draft.id) ?? []).map((entry) => ({
        planItemId: entry.dependsOnPlanItemId,
        type: entry.type as PlanDependencyType,
        reason: entry.reason,
      })),
      riskLevel: deriveRiskLevel(draft, conflictZones, context, itemConcerns),
      testObligations: deriveTestObligations(draft, verificationRelevance, foundation, context, itemConcerns),
      verificationRelevance,
      parallelization: deriveParallelization(draft, dependencyGraph, verificationRelevance, itemConcerns),
    };
  });

  return {
    planItems,
    dependencyGraph,
    conflictZones,
    testObligations: buildPlanTestObligationEntries(planItems),
    parallelizationSignals: buildPlanParallelizationSignalEntries(planItems),
    carryForwardConcerns,
  };
}
