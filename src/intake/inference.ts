import { resolveCandidateTargets } from "./candidate-targets.js";
import { resolveFocusTargeting } from "./focus-policy.js";
import type {
  InferenceResult,
  NormalizedTaskInput,
  RepoScanResult,
  TaskParserResult,
} from "./types.js";

function pushUnique(values: string[], value: string): void {
  if (!values.includes(value)) {
    values.push(value);
  }
}

export function buildInferenceResult(params: {
  taskInput: NormalizedTaskInput | null;
  taskParserResult: TaskParserResult;
  repoScanResult: RepoScanResult;
  strictFocus?: boolean;
}): InferenceResult {
  if (!params.taskInput) {
    return {
      candidateTargets: [],
      inferredRequirements: [],
      signals: {
        explicitTargetCount: 0,
        usedFallbackTargets: false,
        inferredRequirementCount: 0,
        focusApplied: false,
        strictFocusApplied: params.strictFocus === true,
        focusMatchedTargetCount: 0,
        outOfFocusTargetCount: 0,
      },
      warnings: [
        "Inference could not propose candidate targets because there is no normalized task input to interpret.",
      ],
    };
  }

  const rawCandidateTargets = resolveCandidateTargets(
    params.taskInput,
    params.repoScanResult.repoContext,
  );
  const focusResolution = resolveFocusTargeting({
    candidateTargets: rawCandidateTargets,
    focusPaths: params.taskInput.focusPaths,
    strictFocus: params.strictFocus === true,
  });
  const candidateTargets = focusResolution.candidateTargets;
  const inferredRequirements: string[] = [];
  const warnings = [...focusResolution.warnings];
  const explicitTargetCount = candidateTargets.filter((target) => target.matchType === "explicit").length;
  const usedFallbackTargets =
    candidateTargets.length > 0 &&
    candidateTargets.every((target) => target.matchType === "fallback");

  if (candidateTargets.some((target) => target.kind === "source")) {
    pushUnique(
      inferredRequirements,
      "Update or add tests that validate the impacted behavior before integration.",
    );
  }

  if (params.repoScanResult.signals.testFileCount === 0) {
    pushUnique(
      inferredRequirements,
      "Identify or add test coverage for the impacted behavior before integration.",
    );
  }

  if (
    params.taskParserResult.signals.referencedPaths.some((value) =>
      /package\.json|tsconfig|config/i.test(value),
    )
  ) {
    pushUnique(
      inferredRequirements,
      "Review manifest or configuration impact before planning the implementation steps.",
    );
  }

  if (usedFallbackTargets) {
    pushUnique(
      warnings,
      "Inference relied on fallback repo targets because the task input did not strongly map to explicit files.",
    );
  }

  if (candidateTargets.length === 0) {
    pushUnique(
      warnings,
      "Inference could not produce candidate targets from the current task and repo evidence.",
    );
  }

  return {
    candidateTargets,
    inferredRequirements,
    signals: {
      explicitTargetCount,
      usedFallbackTargets,
      inferredRequirementCount: inferredRequirements.length,
      focusApplied: focusResolution.signals.focusApplied,
      strictFocusApplied: focusResolution.signals.strictFocusApplied,
      focusMatchedTargetCount: focusResolution.signals.focusMatchedTargetCount,
      outOfFocusTargetCount: focusResolution.signals.outOfFocusTargetCount,
    },
    warnings,
  };
}
