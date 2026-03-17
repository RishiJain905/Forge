import { buildConfidenceResolution } from "./confidence.js";
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

function isTestLikePath(value: string): boolean {
  return (
    value.includes("/tests/") ||
    value.includes("/__tests__/") ||
    /\.test\./i.test(value) ||
    /\.spec\./i.test(value)
  );
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

  const repoFiles = new Set(params.repoScanResult.repoContext.allFiles);
  const unresolvedReferencedPaths = params.taskParserResult.signals.referencedPaths.filter(
    (path) => !repoFiles.has(path),
  );
  const confidence = buildConfidenceResolution({
    taskParsing: {
      hasGoal: params.taskParserResult.signals.hasGoal,
      hasAcceptanceCriteria: params.taskParserResult.signals.hasAcceptanceCriteria,
      promptIsThin: params.taskParserResult.signals.promptIsThin,
      ambiguityCount: ambiguities.length,
    },
    repoInspection: {
      grounded: params.repoScanResult.repoContext.grounded,
      repoLooksSparse: params.repoScanResult.signals.repoLooksSparse,
      sourceFileCount: params.repoScanResult.signals.sourceFileCount,
      testFileCount: params.repoScanResult.signals.testFileCount,
      missingExplicitTestReference: unresolvedReferencedPaths.some(isTestLikePath),
    },
    targeting: {
      candidateTargetCount: params.inferenceResult.candidateTargets.length,
      explicitTargetCount: params.inferenceResult.signals.explicitTargetCount,
      usedFallbackTargets: params.inferenceResult.signals.usedFallbackTargets,
      unresolvedReferencedPathCount: unresolvedReferencedPaths.length,
    },
  });

  if (confidence.level === "low" || confidence.level === "medium") {
    pushUnique(
      warnings,
      `Overall intake confidence is ${confidence.level} because ${confidence.reasons.join(", ")}.`,
    );
  }

  return {
    ambiguities,
    warnings,
    recommendedUserActions,
    confidence,
  };
}
