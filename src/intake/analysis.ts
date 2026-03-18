import { buildConfidenceResolution } from "./confidence.js";
import {
  NON_STRICT_FOCUS_WARNING,
  STRICT_FOCUS_WARNING,
} from "./candidate-targets.js";
import type {
  AmbiguityAnalysisResult,
  BlockingIssue,
  InferenceResult,
  IntakeFailureDetails,
  NormalizedTaskInput,
  RepoScanResult,
  RiskAnalysis,
  RiskZone,
  ResolvedRuntimeOptions,
  TaskParserResult,
  OptionalReasoningResolution,
} from "./types.js";

function createEmptyOptionalReasoningResolution(): OptionalReasoningResolution {
  return {
    requested: false,
    attempted: false,
    used: false,
    available: false,
    provider: null,
    ambiguities: [],
    warnings: [],
    recommendedUserActions: [],
    confidenceNotes: [],
    suggestedTargetPaths: [],
    ignoredTargetPaths: [],
  };
}

function pushUnique(values: string[], value: string): void {
  if (!values.includes(value)) {
    values.push(value);
  }
}

function pushAmbiguityItem(
  ambiguityItems: NonNullable<AmbiguityAnalysisResult["ambiguityItems"]>,
  ambiguities: string[],
  item: NonNullable<AmbiguityAnalysisResult["ambiguityItems"]>[number],
): void {
  if (!ambiguityItems.some((existing) => existing.type === item.type && existing.message === item.message)) {
    ambiguityItems.push(item);
  }

  pushUnique(ambiguities, item.message);
}

function pushWarningItem(
  warningItems: NonNullable<AmbiguityAnalysisResult["warningItems"]>,
  warnings: string[],
  item: NonNullable<AmbiguityAnalysisResult["warningItems"]>[number],
): void {
  if (!warningItems.some((existing) => existing.code === item.code && existing.message === item.message)) {
    warningItems.push(item);
  }

  pushUnique(warnings, item.message);
}

function isTestLikePath(value: string): boolean {
  return (
    value.includes("/tests/") ||
    value.includes("/__tests__/") ||
    /\.test\./i.test(value) ||
    /\.spec\./i.test(value)
  );
}

function normalizePathForComparison(value: string): string {
  return value.replace(/\\/g, "/").toLowerCase();
}

function buildManifestOrConfigPaths(params: {
  taskParserResult: TaskParserResult;
  candidateTargets: InferenceResult["candidateTargets"];
}): string[] {
  return [
    ...params.taskParserResult.signals.referencedPaths.filter((path) => /package\.json|tsconfig|config/i.test(path)),
    ...params.candidateTargets
      .filter((target) => target.kind === "manifest")
      .map((target) => target.path),
  ].filter((value, index, values) => values.indexOf(value) === index);
}

function buildSurfaceRiskReason(params: {
  taskParserResult: TaskParserResult;
}): string {
  const riskSignals: string[] = [];

  if (params.taskParserResult.taskSpec.riskyPhrases?.includes("migration")) {
    riskSignals.push("migration");
  }

  if (params.taskParserResult.taskSpec.riskyPhrases?.includes("api contract")) {
    riskSignals.push("API contract");
  }

  if (params.taskParserResult.taskSpec.riskyPhrases?.includes("parallel") === true ||
    params.taskParserResult.taskSpec.riskyPhrases?.includes("ownership") === true) {
    riskSignals.push("coordination");
  }

  if (riskSignals.length === 0) {
    return "The task appears to affect manifest or configuration surfaces that can widen downstream impact.";
  }

  return `The task appears to affect manifest or configuration surfaces and also carries ${riskSignals.join(", ")} risk.`;
}

export function buildRiskAnalysisResult(params: {
  taskParserResult: TaskParserResult;
  repoScanResult: RepoScanResult;
  inferenceResult: InferenceResult;
  repoContextOverride?: RepoScanResult["repoContext"];
}): RiskAnalysis {
  const riskZones: RiskZone[] = [];
  const repoContext = params.repoContextOverride ?? params.repoScanResult.repoContext;
  const repoFiles = new Set(
    repoContext.allFiles.map(normalizePathForComparison),
  );
  const unresolvedReferencedPaths = params.taskParserResult.signals.referencedPaths.filter(
    (path) => !repoFiles.has(normalizePathForComparison(path)),
  );

  if (!repoContext.grounded || params.repoScanResult.signals.repoLooksSparse) {
    riskZones.push({
      code: "weak_repo_grounding",
      level: "high",
      reason: "Repo grounding is partial, so later planning may rely on weak repository evidence.",
      evidencePaths: [],
    });
  }

  if (unresolvedReferencedPaths.length > 0) {
    riskZones.push({
      code: "unresolved_referenced_paths",
      level: "high",
      reason: "The task references paths that were not found during repo grounding.",
      evidencePaths: unresolvedReferencedPaths,
    });
  }

  if (params.inferenceResult.candidateTargets.length === 0) {
    riskZones.push({
      code: "no_candidate_targets",
      level: "high",
      reason: "Intake could not produce any plausible candidate targets for the next step.",
      evidencePaths: [],
    });
  }

  if (
    params.inferenceResult.candidateTargets.length > 0 &&
    params.inferenceResult.signals.usedFallbackTargets
  ) {
    riskZones.push({
      code: "fallback_targeting_only",
      level: "medium",
      reason: "Targeting depends entirely on fallback repo structure instead of explicit task-to-file matches.",
      evidencePaths: params.inferenceResult.candidateTargets.map((target) => target.path),
    });
  }

  if (repoContext.testFiles.length === 0) {
    riskZones.push({
      code: "no_tests_detected",
      level: "medium",
      reason: "No tests were detected during repo grounding, so later verification coverage may be weak.",
      evidencePaths: [],
    });
  }

  const manifestOrConfigPaths = buildManifestOrConfigPaths({
    taskParserResult: params.taskParserResult,
    candidateTargets: params.inferenceResult.candidateTargets,
  });

  if (manifestOrConfigPaths.length > 0) {
    riskZones.push({
      code: "manifest_or_config_impact",
      level: "medium",
      reason: buildSurfaceRiskReason({
        taskParserResult: params.taskParserResult,
      }),
      evidencePaths: manifestOrConfigPaths,
    });
  }

  return {
    initialRiskZones: riskZones,
  };
}

function addParserOpenQuestionHandling(params: {
  inputMode: NormalizedTaskInput["inputMode"] | null;
  categories: TaskParserResult["signals"]["promptOpenQuestionCategories"];
  ambiguityItems: NonNullable<AmbiguityAnalysisResult["ambiguityItems"]>;
  ambiguities: string[];
  recommendedUserActions: string[];
}): void {
  const subject = params.inputMode === "prompt" ? "Prompt" : "Task";

  if (params.categories.includes("scope")) {
    pushAmbiguityItem(
      params.ambiguityItems,
      params.ambiguities,
      {
        type: "scope",
        severity: "medium",
        message:
          `${subject} scope is still unclear for the current repo. Clarify the concrete files, modules, or bounded behavior to change.`,
      },
    );
    pushUnique(
      params.recommendedUserActions,
      `Clarify the exact repo surfaces or bounded behavior this ${params.inputMode === "prompt" ? "prompt" : "task"} should change before planning.`,
    );
  }

  if (params.categories.includes("constraints")) {
    pushAmbiguityItem(
      params.ambiguityItems,
      params.ambiguities,
      {
        type: "constraints",
        severity: "medium",
        message:
          `${subject} constraints are missing. Clarify non-goals, rollout limits, or boundaries before planning.`,
      },
    );
    pushUnique(
      params.recommendedUserActions,
      "Add explicit constraints or non-goals so the plan stays bounded.",
    );
  }
}

function addFocusHandling(params: {
  inferenceResult: InferenceResult;
  warningItems: NonNullable<AmbiguityAnalysisResult["warningItems"]>;
  warnings: string[];
  recommendedUserActions: string[];
}): void {
  const signals = params.inferenceResult.signals;

  if (!signals.focusApplied || signals.outOfFocusTargetCount === 0) {
    return;
  }

  pushWarningItem(
    params.warningItems,
    params.warnings,
    {
      code: signals.strictFocusApplied ? "STRICT_FOCUS_EXCLUDED_TARGETS" : "FOCUS_OUT_OF_COVERAGE",
      message: signals.strictFocusApplied ? STRICT_FOCUS_WARNING : NON_STRICT_FOCUS_WARNING,
    },
  );
  pushUnique(
    params.recommendedUserActions,
    signals.strictFocusApplied
      ? "Widen --focus or drop --strict-focus if the excluded targets are still relevant."
      : "Broaden --focus if you want the out-of-focus targets considered equally during planning.",
  );
}

export function buildAmbiguityAnalysisResult(params: {
  taskInput: NormalizedTaskInput | null;
  taskParserResult: TaskParserResult;
  repoScanResult: RepoScanResult;
  inferenceResult: InferenceResult;
  runtimeOptions: ResolvedRuntimeOptions;
  optionalReasoningResult?: OptionalReasoningResolution;
  failure: IntakeFailureDetails | null;
  validationBlockingIssues: BlockingIssue[];
  validationWarnings: string[];
  validationRecommendedUserActions: string[];
}): AmbiguityAnalysisResult {
  const optionalReasoningResult = params.optionalReasoningResult ?? createEmptyOptionalReasoningResolution();
  const warnings = [
    ...params.runtimeOptions.warnings,
    ...optionalReasoningResult.warnings,
    ...params.validationWarnings,
    ...params.taskParserResult.warnings,
    ...params.repoScanResult.warnings,
    ...params.inferenceResult.warnings,
  ];
  const recommendedUserActions = [
    ...params.taskParserResult.recommendedUserActions,
    ...optionalReasoningResult.recommendedUserActions,
    ...params.runtimeOptions.recommendedUserActions,
    ...params.validationRecommendedUserActions,
  ];
  const ambiguities = [
    ...params.taskParserResult.ambiguities,
    ...optionalReasoningResult.ambiguities,
  ];
  const ambiguityItems: AmbiguityAnalysisResult["ambiguityItems"] = [];
  const warningItems: AmbiguityAnalysisResult["warningItems"] = [];

  addParserOpenQuestionHandling({
    inputMode: params.taskInput?.inputMode ?? null,
    categories: params.taskParserResult.signals.promptOpenQuestionCategories,
    ambiguityItems,
    ambiguities,
    recommendedUserActions,
  });
  addFocusHandling({
    inferenceResult: params.inferenceResult,
    warningItems,
    warnings,
    recommendedUserActions,
  });

  if (!params.taskParserResult.signals.hasAcceptanceCriteria) {
    pushAmbiguityItem(
      ambiguityItems,
      ambiguities,
      {
        type: "acceptance_criteria",
        severity: "high",
        message: "Acceptance criteria are missing from the task input.",
      },
    );
    pushWarningItem(
      warningItems,
      warnings,
      {
        code: "ACCEPTANCE_CRITERIA_MISSING",
        message: "Acceptance criteria are missing, so Step 2 planning may need user follow-up.",
      },
    );
    pushUnique(
      recommendedUserActions,
      "Add explicit acceptance criteria to the task input before planning.",
    );
  }

  if (params.repoScanResult.signals.testFileCount === 0) {
    pushWarningItem(
      warningItems,
      warnings,
      {
        code: "NO_TESTS_DETECTED",
        message: "No tests were detected during repo grounding.",
      },
    );
    pushUnique(
      recommendedUserActions,
      "Identify or add the test files that should validate the planned changes.",
    );
  }

  if (params.inferenceResult.signals.usedFallbackTargets) {
    pushWarningItem(
      warningItems,
      warnings,
      {
        code: "FALLBACK_TARGETING",
        message: "Repo mapping is partial but still usable because candidate targets were inferred from repo structure.",
      },
    );
    pushUnique(
      recommendedUserActions,
      "Reference concrete files or directories in the task input to strengthen repo grounding.",
    );
  }

  const repoFiles = new Set(
    params.repoScanResult.repoContext.allFiles.map(normalizePathForComparison),
  );
  const unresolvedReferencedPaths = params.taskParserResult.signals.referencedPaths.filter(
    (path) => !repoFiles.has(normalizePathForComparison(path)),
  );

  if (unresolvedReferencedPaths.length > 0) {
    pushAmbiguityItem(
      ambiguityItems,
      ambiguities,
      {
        type: "repo_alignment",
        severity: "high",
        message: `Prompt references repo paths that were not found during grounding: ${unresolvedReferencedPaths.join(", ")}.`,
      },
    );
    pushUnique(
      recommendedUserActions,
      "Fix the prompt's missing repo references or clarify the intended replacement paths before planning.",
    );
  }

  const confidence = buildConfidenceResolution({
    taskParsing: {
      hasGoal: params.taskParserResult.signals.hasGoal,
      hasAcceptanceCriteria: params.taskParserResult.signals.hasAcceptanceCriteria,
      promptIsThin: params.taskParserResult.signals.promptIsThin,
      ambiguityCount: ambiguities.length,
      promptOpenQuestionCategories: params.taskParserResult.signals.promptOpenQuestionCategories,
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
      focusApplied: params.inferenceResult.signals.focusApplied === true,
      strictFocusApplied: params.inferenceResult.signals.strictFocusApplied === true,
      focusMatchedTargetCount: params.inferenceResult.signals.focusMatchedTargetCount ?? 0,
      outOfFocusTargetCount: params.inferenceResult.signals.outOfFocusTargetCount ?? 0,
    },
  });

  for (const note of optionalReasoningResult.confidenceNotes) {
    pushUnique(confidence.reasons, note);
  }

  if (confidence.level === "low" || confidence.level === "medium") {
    pushUnique(
      warnings,
      `Overall intake confidence is ${confidence.level} because ${confidence.reasons.join(", ")}.`,
    );
  }

  return {
    ambiguities,
    ambiguityItems,
    warnings,
    warningItems,
    recommendedUserActions,
    confidence,
  };
}
