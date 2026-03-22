import type {
  PlanConflictZone,
  PlanDependencyGraphEntry,
  PlanDependencyType,
  PlanFoundationResult,
  PlanItem,
  PlanItemCategory,
  PlanModel,
  PlanParallelization,
  PlanRiskLevel,
  PlanTestObligation,
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
  riskZones: RiskZoneEntry[];
  fallbackOnlyTargeting: boolean;
  lowConfidence: boolean;
  sharedRiskPaths: Set<string>;
}

interface ItemDraft {
  id: string;
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
    ...(carryForward.repoContext.entry_points ?? []),
    ...interfaceVerificationPaths,
  ]);
  const interfacePaths = interfaceSeedPaths.length > 0
    ? interfaceSeedPaths
    : INTERFACE_RISKY_PHRASES.some((phrase) => riskyPhrases.has(phrase))
      ? dedupeStable([
          ...(carryForward.repoContext.entry_points ?? []),
          ...sourcePaths,
        ])
      : [];
  const nonSharedImplementationPaths = sourcePaths.filter(
    (pathValue) => !interfacePaths.some((interfacePath) => normalizePath(interfacePath) === normalizePath(pathValue)),
  );
  const implementationPaths = nonSharedImplementationPaths.length > 0
    ? dedupeStable(nonSharedImplementationPaths)
    : dedupeStable(sourcePaths);
  const siblingTests = buildSiblingTestPaths(sourcePaths, carryForward.repoContext.test_files);

  return {
    requirementSeeds: getRequirementSeeds(foundation),
    configPaths: dedupeStable([...manifestPaths, ...manifestRiskPaths]),
    interfacePaths,
    implementationPaths,
    testPaths: dedupeStable([...testPaths, ...siblingTests]),
    sourcePaths,
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

function buildDrafts(foundation: PlanFoundationResult, context: PlannerContext): ItemDraft[] {
  const requirementCategories = new Map<string, ClusterCategory[]>();

  for (const requirement of context.requirementSeeds) {
    requirementCategories.set(requirement, determineRequirementCategories(requirement, context));
  }

  const drafts: ItemDraft[] = [];

  for (const category of CATEGORY_ORDER) {
    const paths =
      category === "config"
        ? context.configPaths
        : category === "interface"
          ? context.interfacePaths
          : category === "implementation"
            ? context.implementationPaths
            : context.testPaths;

    if (paths.length === 0) {
      continue;
    }

    const sourceRequirements = context.requirementSeeds.filter(
      (requirement) => requirementCategories.get(requirement)?.includes(category),
    );
    const resolvedRequirements =
      sourceRequirements.length > 0
        ? sourceRequirements
        : context.requirementSeeds.length > 0
          ? [context.requirementSeeds[0]]
          : [`Planning surface inferred from Step 1 targeting for ${summarizePaths(paths)}.`];

    drafts.push({
      id: `plan-${category}-1`,
      category,
      title: buildItemTitle(category, paths),
      description: buildItemDescription(category, paths, resolvedRequirements),
      sourceRequirements: dedupeStable(resolvedRequirements),
      likelyAffectedPaths: dedupeStable(paths),
    });
  }

  if (drafts.length === 0 && context.requirementSeeds.length > 0) {
    drafts.push({
      id: "plan-implementation-1",
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

function buildDependencies(drafts: ItemDraft[]): Map<string, PlanDependencyGraphEntry[]> {
  const itemByCategory = new Map<ClusterCategory, ItemDraft>();
  for (const draft of drafts) {
    itemByCategory.set(draft.category, draft);
  }

  const dependencies = new Map<string, PlanDependencyGraphEntry[]>();

  for (const draft of drafts) {
    const itemDependencies: PlanDependencyGraphEntry[] = [];

    if (draft.category === "interface") {
      const configDraft = itemByCategory.get("config");
      if (configDraft) {
        itemDependencies.push({
          planItemId: draft.id,
          dependsOnPlanItemId: configDraft.id,
          type: "sequencing",
          reason: "Manifest and config work should land before shared interfaces are finalized.",
        });
      }
    }

    if (draft.category === "implementation") {
      const interfaceDraft = itemByCategory.get("interface");
      const configDraft = itemByCategory.get("config");

      if (interfaceDraft) {
        itemDependencies.push({
          planItemId: draft.id,
          dependsOnPlanItemId: interfaceDraft.id,
          type: "interface_first",
          reason: "Shared interface decisions should settle before implementation work proceeds.",
        });
      } else if (configDraft) {
        itemDependencies.push({
          planItemId: draft.id,
          dependsOnPlanItemId: configDraft.id,
          type: "sequencing",
          reason: "Config changes should land before implementation depends on them.",
        });
      }
    }

    if (draft.category === "test") {
      for (const dependencyDraft of drafts.filter((item) => item.category !== "test")) {
        itemDependencies.push({
          planItemId: draft.id,
          dependsOnPlanItemId: dependencyDraft.id,
          type: "hard",
          reason: "Test work should validate the finalized non-test plan items.",
        });
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
  const draftByCategory = new Map<ClusterCategory, ItemDraft>();
  for (const draft of drafts) {
    draftByCategory.set(draft.category, draft);
  }

  const zones: PlanConflictZone[] = [];

  const configDraft = draftByCategory.get("config");
  if (configDraft && configDraft.likelyAffectedPaths.length > 0) {
    zones.push({
      id: "conflict-zone-config-1",
      title: "Manifest and configuration overlap",
      reason: "Config and manifest surfaces are shared-risk files that can force protected merge order.",
      paths: configDraft.likelyAffectedPaths,
      planItemIds: dedupeStable([configDraft.id, ...collectDependents(configDraft.id, dependencyGraph)]),
      riskLevel: context.fallbackOnlyTargeting || context.lowConfidence ? "high" : "medium",
    });
  }

  const interfaceDraft = draftByCategory.get("interface");
  if (interfaceDraft && interfaceDraft.likelyAffectedPaths.length > 0) {
    zones.push({
      id: "conflict-zone-interface-1",
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

function itemHasSharedRisk(paths: string[], context: PlannerContext): boolean {
  return paths.some((pathValue) =>
    context.sharedRiskPaths.has(normalizePath(pathValue)) || isSharedRiskPath(pathValue),
  );
}

function deriveVerificationRelevance(
  draft: ItemDraft,
  foundation: PlanFoundationResult,
  context: PlannerContext,
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
  if (foundation.carryForward.ambiguities.length > 0 || foundation.carryForward.warnings.length > 0) {
    notes.push("Step 1 ambiguities and warnings remain relevant to this item.");
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
): PlanTestObligation[] {
  const obligations: PlanTestObligation[] = [];

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
  }

  if (draft.category === "test") {
    addObligation(obligations, {
      category: "regression",
      reason: "Test updates should preserve regression coverage for the planned behavior.",
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
): PlanParallelization {
  const itemDependencies = dependencyGraph.filter((entry) => entry.planItemId === draft.id);

  if (draft.category === "config") {
    return {
      signal: "protected_merge_order",
      reason: "Manifest and config work should keep protected merge order because the files are shared-risk.",
    };
  }

  if (draft.category === "interface") {
    return {
      signal: "risky_shared",
      reason: "Shared interfaces and entrypoints are risky to parallelize without extra coordination.",
    };
  }

  if (itemDependencies.length > 0) {
    return {
      signal: "parallel_after_dependency",
      reason: "This work can proceed after its upstream dependencies settle first.",
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
): PlanRiskLevel {
  let riskLevel: PlanRiskLevel = "low";
  const pathSet = new Set(draft.likelyAffectedPaths.map(normalizePath));

  if (context.fallbackOnlyTargeting) {
    riskLevel = "high";
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
  return (
    context.requirementSeeds.length > 0 ||
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
    };
  }

  const drafts = buildDrafts(foundation, context).filter((draft) => draft.likelyAffectedPaths.length > 0);
  const dependencyMap = buildDependencies(drafts);
  const dependencyGraph = buildDependencyGraphEntries(dependencyMap);
  const conflictZones = buildConflictZones(drafts, dependencyGraph, context);
  const planItems: PlanItem[] = drafts.map((draft) => {
    const verificationRelevance = deriveVerificationRelevance(draft, foundation, context);
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
      riskLevel: deriveRiskLevel(draft, conflictZones, context),
      testObligations: deriveTestObligations(draft, verificationRelevance, foundation, context),
      verificationRelevance,
      parallelization: deriveParallelization(draft, dependencyGraph),
    };
  });

  return {
    planItems,
    dependencyGraph,
    conflictZones,
  };
}
