import { resolveCandidateTargeting } from "./candidate-targets.js";
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

function buildStructuredTargetingInput(
  taskInput: NormalizedTaskInput,
  taskParserResult: TaskParserResult,
): NormalizedTaskInput {
  const taskSpec = taskParserResult.taskSpec;
  const structuredFragments = [
    ...(taskSpec.scope ?? []),
    ...(taskSpec.mentionedPaths ?? []),
    ...(taskSpec.mentionedTests ?? []),
    ...(taskSpec.mentionedModules ?? []),
    ...taskSpec.acceptanceCriteria,
    ...(taskSpec.constraints ?? []),
  ];
  const structuredText = structuredFragments.join("\n").trim();

  return {
    ...taskInput,
    normalizedTaskText: [taskInput.normalizedTaskText, structuredText].filter(Boolean).join("\n\n"),
    parserInputText: [taskInput.parserInputText, structuredText].filter(Boolean).join("\n\n"),
  };
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

  const structuredTaskInput = buildStructuredTargetingInput(params.taskInput, params.taskParserResult);
  const targetResolution = resolveCandidateTargeting(
    structuredTaskInput,
    params.repoScanResult.repoContext,
    {
      focusPaths: structuredTaskInput.focusPaths,
      strictFocus: params.strictFocus === true,
      moduleSignals: params.taskParserResult.taskSpec.mentionedModules ?? [],
    },
  );
  const candidateTargets = targetResolution.candidateTargets;
  const inferredRequirements: string[] = [];
  const warnings = [...targetResolution.warnings];
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
      focusApplied: targetResolution.signals.focusApplied,
      strictFocusApplied: targetResolution.signals.strictFocusApplied,
      focusMatchedTargetCount: targetResolution.signals.focusMatchedTargetCount,
      outOfFocusTargetCount: targetResolution.signals.outOfFocusTargetCount,
    },
    warnings,
  };
}
