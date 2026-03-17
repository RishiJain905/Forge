import type {
  AmbiguityAnalysisResult,
  BlockingIssue,
  InferenceResult,
  IntakeFailureDetails,
  NormalizedTaskInput,
  RepoScanResult,
  ResolvedRuntimeOptions,
  TaskParserResult,
} from "./types.js";

function pushUnique(values: string[], value: string): void {
  if (!values.includes(value)) {
    values.push(value);
  }
}

function resolveTaskParsingStrength(
  taskParserResult: TaskParserResult,
): AmbiguityAnalysisResult["confidence"]["signals"]["taskParsing"] {
  if (!taskParserResult.signals.hasGoal || taskParserResult.signals.promptIsThin) {
    return "weak";
  }

  if (!taskParserResult.signals.hasAcceptanceCriteria) {
    return "partial";
  }

  return "strong";
}

function resolveRepoInspectionStrength(
  repoScanResult: RepoScanResult,
): AmbiguityAnalysisResult["confidence"]["signals"]["repoInspection"] {
  if (!repoScanResult.repoContext.grounded || repoScanResult.signals.repoLooksSparse) {
    return "weak";
  }

  if (
    repoScanResult.signals.sourceFileCount === 0 ||
    repoScanResult.signals.testFileCount === 0
  ) {
    return "partial";
  }

  return "strong";
}

function resolveTargetingStrength(
  inferenceResult: InferenceResult,
): AmbiguityAnalysisResult["confidence"]["signals"]["targeting"] {
  if (inferenceResult.candidateTargets.length === 0) {
    return "weak";
  }

  if (inferenceResult.signals.usedFallbackTargets) {
    return "partial";
  }

  return "strong";
}

export function buildAmbiguityAnalysisResult(params: {
  taskInput: NormalizedTaskInput | null;
  taskParserResult: TaskParserResult;
  repoScanResult: RepoScanResult;
  inferenceResult: InferenceResult;
  runtimeOptions: ResolvedRuntimeOptions;
  failure: IntakeFailureDetails | null;
  validationBlockingIssues: BlockingIssue[];
  validationWarnings: string[];
  validationRecommendedUserActions: string[];
}): AmbiguityAnalysisResult {
  const ambiguities = [...params.taskParserResult.ambiguities];
  const warnings = [
    ...params.runtimeOptions.warnings,
    ...params.validationWarnings,
    ...params.taskParserResult.warnings,
    ...params.repoScanResult.warnings,
    ...params.inferenceResult.warnings,
  ];
  const recommendedUserActions = [
    ...params.taskParserResult.recommendedUserActions,
    ...params.runtimeOptions.recommendedUserActions,
    ...params.validationRecommendedUserActions,
  ];

  if (!params.taskParserResult.signals.hasAcceptanceCriteria) {
    pushUnique(
      ambiguities,
      "Acceptance criteria are missing from the task input.",
    );
    pushUnique(
      warnings,
      "Acceptance criteria are missing, so Step 2 planning may need user follow-up.",
    );
    pushUnique(
      recommendedUserActions,
      "Add explicit acceptance criteria to the task input before planning.",
    );
  }

  if (params.repoScanResult.signals.testFileCount === 0) {
    pushUnique(
      warnings,
      "No tests were detected during repo grounding.",
    );
    pushUnique(
      recommendedUserActions,
      "Identify or add the test files that should validate the planned changes.",
    );
  }

  if (params.inferenceResult.signals.usedFallbackTargets) {
    pushUnique(
      warnings,
      "Repo mapping is partial but still usable because candidate targets were inferred from repo structure.",
    );
    pushUnique(
      recommendedUserActions,
      "Reference concrete files or directories in the task input to strengthen repo grounding.",
    );
  }

  const confidenceSignals = {
    taskParsing: resolveTaskParsingStrength(params.taskParserResult),
    repoInspection: resolveRepoInspectionStrength(params.repoScanResult),
    targeting: resolveTargetingStrength(params.inferenceResult),
  };
  const confidenceReasons: string[] = [];

  if (confidenceSignals.taskParsing === "weak") {
    confidenceReasons.push("task parsing signals are weak");
  } else if (confidenceSignals.taskParsing === "partial") {
    confidenceReasons.push("task parsing signals are only partial");
  }

  if (confidenceSignals.repoInspection === "weak") {
    confidenceReasons.push("repo inspection signals are weak");
  } else if (confidenceSignals.repoInspection === "partial") {
    confidenceReasons.push("repo inspection signals are only partial");
  }

  if (confidenceSignals.targeting === "weak") {
    confidenceReasons.push("targeting signals are weak");
  } else if (confidenceSignals.targeting === "partial") {
    confidenceReasons.push("targeting signals are only partial");
  }

  const confidenceLevel =
    Object.values(confidenceSignals).some((value) => value === "weak")
      ? "low"
      : Object.values(confidenceSignals).some((value) => value === "partial")
        ? "medium"
        : "high";

  if (confidenceLevel === "low") {
    pushUnique(
      warnings,
      `Overall intake confidence is low because ${confidenceReasons.join(", ")}.`,
    );
  } else if (confidenceLevel === "medium") {
    pushUnique(
      warnings,
      `Overall intake confidence is medium because ${confidenceReasons.join(", ")}.`,
    );
  }

  if (params.failure) {
    pushUnique(
      confidenceReasons,
      `the run already contains a failure state (${params.failure.code})`,
    );
  }

  if (params.validationBlockingIssues.length > 0) {
    pushUnique(
      confidenceReasons,
      "validation blocking issues remain",
    );
  }

  return {
    ambiguities,
    warnings,
    recommendedUserActions,
    confidence: {
      level: confidenceLevel,
      signals: confidenceSignals,
      reasons: confidenceReasons,
    },
  };
}
