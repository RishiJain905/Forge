import path from "node:path";

import type {
  CandidateTarget,
  CandidateTargetingOptions,
  CandidateTargetingResolution,
  NormalizedTaskInput,
  RepoContext,
} from "./types.js";

export const NON_STRICT_FOCUS_WARNING =
  "Focus paths do not cover all likely targets, so candidate targeting keeps out-of-focus evidence available but prioritizes the focused paths.";

export const STRICT_FOCUS_WARNING =
  "Strict focus excluded likely relevant candidate targets outside the provided focus paths.";

function normalizePathForComparison(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\.\/+/, "").replace(/\/+$/, "").toLowerCase();
}

function buildCandidateTarget(
  pathValue: string,
  kind: CandidateTarget["kind"],
  matchType: CandidateTarget["matchType"],
  reason: string,
  notes: string[] = [],
): CandidateTarget {
  return {
    path: pathValue,
    kind,
    matchType,
    reason,
    notes,
    sharedRisk: isSharedRiskPath(pathValue, kind),
  };
}

function pushCandidateTarget(targets: CandidateTarget[], target: CandidateTarget): void {
  if (!hasCandidateTarget(targets, target.path, target.kind)) {
    targets.push(target);
  }
}

function hasCandidateTarget(
  targets: CandidateTarget[],
  pathValue: string,
  kind: CandidateTarget["kind"],
): boolean {
  return targets.some((target) => target.path === pathValue && target.kind === kind);
}

function normalizeFileStem(filePath: string): string {
  const baseName = path.posix.basename(normalizePathForComparison(filePath));
  const withoutExtension = baseName.replace(/\.[^.]+$/, "");
  return withoutExtension.replace(/\.(test|spec)$/i, "");
}

function normalizeModuleSignal(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function tokenizeModuleCandidates(filePath: string): string[] {
  const normalizedPath = normalizePathForComparison(filePath);
  const stem = normalizeFileStem(filePath);
  const tokens = normalizedPath
    .split("/")
    .flatMap((segment) => segment.split(/[^a-z0-9]+/i))
    .concat(stem.split(/[^a-z0-9]+/i))
    .map((segment) => normalizeModuleSignal(segment))
    .filter((segment) => segment.length > 0);

  return [...new Set(tokens)];
}

function matchesModuleSignal(filePath: string, moduleSignals: string[]): boolean {
  if (moduleSignals.length === 0) {
    return false;
  }

  const candidateTokens = tokenizeModuleCandidates(filePath);
  return moduleSignals.some((moduleSignal) => candidateTokens.includes(normalizeModuleSignal(moduleSignal)));
}

function isSharedRiskPath(
  filePath: string,
  kind: CandidateTarget["kind"],
): boolean {
  if (kind === "manifest") {
    return true;
  }

  return /(^|\/)(app|index|main|server|cli)\.[^.]+$/i.test(filePath);
}

function textMentionsPath(text: string, filePath: string): boolean {
  const normalizedPath = normalizePathForComparison(filePath);
  const baseName = path.posix.basename(normalizedPath);

  return text.includes(normalizedPath) || text.includes(baseName);
}

function normalizeFocusPath(value: string): string {
  const normalized = normalizePathForComparison(value);
  return normalized.length > 0 ? normalized : ".";
}

function textMentionsManifest(text: string, filePath: string): boolean {
  const normalizedPath = normalizePathForComparison(filePath);
  const baseName = path.posix.basename(normalizedPath);
  const stem = baseName.replace(/\.[^.]+$/, "");

  if (text.includes(normalizedPath) || text.includes(baseName)) {
    return true;
  }

  if (stem.length > 0 && text.includes(stem)) {
    return true;
  }

  return stem.includes("config") && text.includes("config");
}

function resolveSiblingTestTargets(
  sourceTarget: CandidateTarget,
  repoContext: RepoContext,
  testsByStem?: Map<string, string[]>,
): CandidateTarget[] {
  const sourceStem = normalizeFileStem(sourceTarget.path);
  const siblingTestPaths = testsByStem
    ? (testsByStem.get(sourceStem) || [])
    : repoContext.testFiles.filter((testFile) => normalizeFileStem(testFile) === sourceStem);

  return siblingTestPaths.map((testFile) =>
    buildCandidateTarget(
      testFile,
      "test",
      "fallback",
      `Derived a sibling test surface from explicit source target \`${sourceTarget.path}\`.`,
      ["Derived from an explicitly referenced source target."],
    ),
  );
}

function resolveExplicitCandidateTargets(
  taskInput: NormalizedTaskInput | null,
  repoContext: RepoContext,
  moduleSignals: string[] = [],
): CandidateTarget[] {
  if (!taskInput) {
    return [];
  }

  const text = normalizePathForComparison(
    [taskInput.normalizedTaskText, taskInput.parserInputText].filter(Boolean).join("\n"),
  );
  const explicitTargets: CandidateTarget[] = [];

  for (const sourceFile of repoContext.sourceFiles) {
    const matchedByPathText = textMentionsPath(text, sourceFile);
    const matchedByModule = !matchedByPathText && matchesModuleSignal(sourceFile, moduleSignals);

    if (matchedByPathText || matchedByModule) {
      pushCandidateTarget(
        explicitTargets,
        buildCandidateTarget(
          sourceFile,
          "source",
          "explicit",
          matchedByModule
            ? "Matched a parser-derived module signal to a source file."
            : "Matched a source file path mentioned in the task input.",
          [
            matchedByModule
              ? "Matched an explicit module signal derived by the task parser."
              : "Matched an explicit task-to-file reference.",
          ],
        ),
      );
    }
  }

  for (const testFile of repoContext.testFiles) {
    const matchedByPathText = textMentionsPath(text, testFile);
    const matchedByModule = !matchedByPathText && matchesModuleSignal(testFile, moduleSignals);

    if (matchedByPathText || matchedByModule) {
      pushCandidateTarget(
        explicitTargets,
        buildCandidateTarget(
          testFile,
          "test",
          "explicit",
          matchedByModule
            ? "Matched a parser-derived module signal to a test file."
            : "Matched a test file path mentioned in the task input.",
          [
            matchedByModule
              ? "Matched an explicit module signal derived by the task parser."
              : "Matched an explicit test reference from the task input.",
          ],
        ),
      );
    }
  }

  for (const manifestFile of repoContext.manifestFiles) {
    if (textMentionsManifest(text, manifestFile)) {
      pushCandidateTarget(
        explicitTargets,
        buildCandidateTarget(
          manifestFile,
          "manifest",
          "explicit",
          "Matched a manifest or configuration file mentioned in the task input.",
          [
            "Matched an explicit manifest/config reference from the task input.",
            "Manifest/config surfaces are shared-risk files for downstream planning.",
          ],
        ),
      );
    }
  }

  if (explicitTargets.length === 0) {
    return [];
  }

  const enrichedTargets = [...explicitTargets];

  const testsByStem = new Map<string, string[]>();
  for (const testFile of repoContext.testFiles) {
    const stem = normalizeFileStem(testFile);
    let tests = testsByStem.get(stem);
    if (!tests) {
      tests = [];
      testsByStem.set(stem, tests);
    }
    tests.push(testFile);
  }

  const seenTargets = new Set<string>();
  for (const t of enrichedTargets) {
    seenTargets.add(`${t.path}:${t.kind}`);
  }

  for (const sourceTarget of explicitTargets) {
    if (sourceTarget.kind !== "source") {
      continue;
    }

    for (const siblingTest of resolveSiblingTestTargets(sourceTarget, repoContext, testsByStem)) {
      const key = `${siblingTest.path}:${siblingTest.kind}`;
      if (!seenTargets.has(key)) {
        seenTargets.add(key);
        enrichedTargets.push(siblingTest);
      }
    }
  }

  return enrichedTargets;
}

function resolveFallbackCandidateTargets(repoContext: RepoContext): CandidateTarget[] {
  const rankByPreferredOrder = (candidates: string[], priorityOrder: string[]): string[] => {
    const priorityIndex = new Map<string, number>();

    priorityOrder.forEach((value, index) => {
      const normalizedValue = normalizePathForComparison(value);

      if (!priorityIndex.has(normalizedValue)) {
        priorityIndex.set(normalizedValue, index);
      }
    });

    return [...candidates].sort((left, right) => {
      const leftKey = normalizePathForComparison(left);
      const rightKey = normalizePathForComparison(right);
      const leftPriority = priorityIndex.get(leftKey);
      const rightPriority = priorityIndex.get(rightKey);

      if (leftPriority !== undefined || rightPriority !== undefined) {
        if (leftPriority === undefined) {
          return 1;
        }

        if (rightPriority === undefined) {
          return -1;
        }

        if (leftPriority !== rightPriority) {
          return leftPriority - rightPriority;
        }
      }

      const leftSharedRisk = isSharedRiskPath(left, "source") ? 1 : 0;
      const rightSharedRisk = isSharedRiskPath(right, "source") ? 1 : 0;

      if (leftSharedRisk !== rightSharedRisk) {
        return rightSharedRisk - leftSharedRisk;
      }

      return left.localeCompare(right);
    });
  };

  const rankManifestFallbacks = (manifestFiles: string[]): string[] => {
    const manifestPriority = ["package.json", "pyproject.toml", "setup.cfg", "tsconfig.json"];

    return rankByPreferredOrder(manifestFiles, manifestPriority);
  };

  const fallbackTargets: CandidateTarget[] = [];
  const rankedSourceFiles = rankByPreferredOrder(repoContext.sourceFiles, repoContext.entryPoints ?? []);
  const primarySourceTarget = rankedSourceFiles[0];

  if (primarySourceTarget) {
    fallbackTargets.push(
      buildCandidateTarget(
        primarySourceTarget,
        "source",
        "fallback",
        "Inferred a likely source target from the repo layout.",
        [
          "Fell back to repo-layout targeting because the task had no explicit file match.",
          "Repo entry points shape fallback ordering when explicit evidence is weak.",
        ],
      ),
    );
  }

  const rankedTestFiles = rankByPreferredOrder(repoContext.testFiles, [
    ...(primarySourceTarget
      ? repoContext.testFiles.filter(
          (testFile) => normalizeFileStem(testFile) === normalizeFileStem(primarySourceTarget),
        )
      : []),
  ]);
  const primaryTestTarget = rankedTestFiles[0];

  if (primaryTestTarget) {
    fallbackTargets.push(
      buildCandidateTarget(
        primaryTestTarget,
        "test",
        "fallback",
        "Inferred a likely test target from the repo layout.",
        [
          "Fell back to repo-layout targeting because the task had no explicit file match.",
          "Fallback test ordering prefers sibling coverage for the most plausible source target when available.",
        ],
      ),
    );
  }

  if (fallbackTargets.length > 0) {
    return fallbackTargets;
  }

  if (repoContext.manifestFiles.length > 0) {
    const primaryManifestTarget = rankManifestFallbacks(repoContext.manifestFiles)[0];

    if (!primaryManifestTarget) {
      return [];
    }

    return [
      buildCandidateTarget(
        primaryManifestTarget,
        "manifest",
        "fallback",
        "Inferred a likely manifest target from the repo layout.",
        [
          "Fell back to repo-layout targeting because the task had no explicit file match.",
          "Manifest/config surfaces are shared-risk files for downstream planning.",
        ],
      ),
    ];
  }

  return [];
}

function isTargetInFocus(targetPath: string, focusPaths: string[]): boolean {
  const normalizedTargetPath = normalizePathForComparison(targetPath);

  for (const rawFocusPath of focusPaths) {
    const normalizedFocusPath = normalizeFocusPath(rawFocusPath);

    if (normalizedFocusPath === ".") {
      return true;
    }

    if (
      normalizedTargetPath === normalizedFocusPath ||
      normalizedTargetPath.startsWith(`${normalizedFocusPath}/`)
    ) {
      return true;
    }
  }

  return false;
}

function applyFocusTargeting(
  candidateTargets: CandidateTarget[],
  focusPaths: string[],
  strictFocus: boolean,
): CandidateTargetingResolution {
  const focusApplied = focusPaths.length > 0;

  if (!focusApplied) {
    return {
      candidateTargets: [...candidateTargets],
      warnings: [],
      signals: {
        focusApplied: false,
        strictFocusApplied: strictFocus,
        focusMatchedTargetCount: 0,
        outOfFocusTargetCount: 0,
      },
    };
  }

  const inFocusTargets: CandidateTarget[] = [];
  const outOfFocusTargets: CandidateTarget[] = [];

  for (const candidateTarget of candidateTargets) {
    if (isTargetInFocus(candidateTarget.path, focusPaths)) {
      inFocusTargets.push(candidateTarget);
      continue;
    }

    outOfFocusTargets.push(candidateTarget);
  }

  const warnings: string[] = [];
  const orderedTargets = strictFocus
    ? [...inFocusTargets]
    : [...inFocusTargets, ...outOfFocusTargets];

  if (outOfFocusTargets.length > 0) {
    warnings.push(strictFocus ? STRICT_FOCUS_WARNING : NON_STRICT_FOCUS_WARNING);
  }

  return {
    candidateTargets: orderedTargets,
    warnings,
    signals: {
      focusApplied: true,
      strictFocusApplied: strictFocus,
      focusMatchedTargetCount: inFocusTargets.length,
      outOfFocusTargetCount: outOfFocusTargets.length,
    },
  };
}

export function resolveFocusTargeting(params: {
  candidateTargets: CandidateTarget[];
  focusPaths: string[];
  strictFocus: boolean;
}): CandidateTargetingResolution {
  return applyFocusTargeting(params.candidateTargets, params.focusPaths, params.strictFocus);
}

export function resolveCandidateTargeting(
  taskInput: NormalizedTaskInput | null,
  repoContext: RepoContext,
  focusOptions?: CandidateTargetingOptions,
): CandidateTargetingResolution {
  if (!taskInput) {
    return {
      candidateTargets: [],
      warnings: [
        "Inference could not propose candidate targets because there is no normalized task input to interpret.",
      ],
      signals: {
        focusApplied: false,
        strictFocusApplied: focusOptions?.strictFocus === true,
        focusMatchedTargetCount: 0,
        outOfFocusTargetCount: 0,
      },
    };
  }

  const explicitTargets = resolveExplicitCandidateTargets(
    taskInput,
    repoContext,
    focusOptions?.moduleSignals ?? [],
  );
  const rawCandidateTargets =
    explicitTargets.length > 0 ? explicitTargets : resolveFallbackCandidateTargets(repoContext);
  const focusPaths = focusOptions?.focusPaths ?? [];
  const strictFocus = focusOptions?.strictFocus === true;

  return applyFocusTargeting(rawCandidateTargets, focusPaths, strictFocus);
}

export function resolveCandidateTargets(
  taskInput: NormalizedTaskInput | null,
  repoContext: RepoContext,
  focusOptions?: CandidateTargetingOptions,
): CandidateTarget[] {
  return resolveCandidateTargeting(taskInput, repoContext, focusOptions).candidateTargets;
}
