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
  const stem = normalizeFileStem(filePath);

  return (
    text.includes(normalizedPath) ||
    text.includes(baseName) ||
    (stem.length > 0 && text.includes(stem))
  );
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
): CandidateTarget[] {
  const sourceStem = normalizeFileStem(sourceTarget.path);
  const siblingTests = repoContext.testFiles.filter(
    (testFile) => normalizeFileStem(testFile) === sourceStem,
  );

  return siblingTests.map((testFile) =>
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
): CandidateTarget[] {
  if (!taskInput) {
    return [];
  }

  const text = normalizePathForComparison(
    [taskInput.normalizedTaskText, taskInput.parserInputText].filter(Boolean).join("\n"),
  );
  const explicitTargets: CandidateTarget[] = [];

  for (const sourceFile of repoContext.sourceFiles) {
    if (textMentionsPath(text, sourceFile)) {
      pushCandidateTarget(
        explicitTargets,
        buildCandidateTarget(
          sourceFile,
          "source",
          "explicit",
          "Matched a source file path mentioned in the task input.",
          ["Matched an explicit task-to-file reference."],
        ),
      );
    }
  }

  for (const testFile of repoContext.testFiles) {
    if (textMentionsPath(text, testFile)) {
      pushCandidateTarget(
        explicitTargets,
        buildCandidateTarget(
          testFile,
          "test",
          "explicit",
          "Matched a test file path mentioned in the task input.",
          ["Matched an explicit test reference from the task input."],
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

  for (const sourceTarget of explicitTargets.filter((target) => target.kind === "source")) {
    for (const siblingTest of resolveSiblingTestTargets(sourceTarget, repoContext)) {
      if (!hasCandidateTarget(enrichedTargets, siblingTest.path, siblingTest.kind)) {
        enrichedTargets.push(siblingTest);
      }
    }
  }

  return enrichedTargets;
}

function resolveFallbackCandidateTargets(repoContext: RepoContext): CandidateTarget[] {
  const fallbackTargets: CandidateTarget[] = [];

  if (repoContext.sourceFiles.length > 0) {
    fallbackTargets.push(
      buildCandidateTarget(
        repoContext.sourceFiles[0],
        "source",
        "fallback",
        "Inferred a likely source target from the repo layout.",
        ["Fell back to repo-layout targeting because the task had no explicit file match."],
      ),
    );
  }

  if (repoContext.testFiles.length > 0) {
    fallbackTargets.push(
      buildCandidateTarget(
        repoContext.testFiles[0],
        "test",
        "fallback",
        "Inferred a likely test target from the repo layout.",
        ["Fell back to repo-layout targeting because the task had no explicit file match."],
      ),
    );
  }

  if (fallbackTargets.length > 0) {
    return fallbackTargets;
  }

  if (repoContext.manifestFiles.length > 0) {
    return [
      buildCandidateTarget(
        repoContext.manifestFiles[0],
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

  const explicitTargets = resolveExplicitCandidateTargets(taskInput, repoContext);
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
