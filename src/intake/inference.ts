import { resolveCandidateTargets } from "./candidate-targets.js";
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
}): InferenceResult {
  if (!params.taskInput) {
    return {
      candidateTargets: [],
      inferredRequirements: [],
      signals: {
        explicitTargetCount: 0,
        usedFallbackTargets: false,
        inferredRequirementCount: 0,
      },
      warnings: [
        "Inference could not propose candidate targets because there is no normalized task input to interpret.",
      ],
    };
  }

  const candidateTargets = resolveCandidateTargets(
    params.taskInput,
    params.repoScanResult.repoContext,
  );
  const inferredRequirements: string[] = [];
  const warnings: string[] = [];
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
    warnings.push(
      "Inference relied on fallback repo targets because the task input did not strongly map to explicit files.",
    );
  }

  if (candidateTargets.length === 0) {
    warnings.push(
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
    },
    warnings,
  };
}
