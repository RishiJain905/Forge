import { buildConfidenceResolution } from "./confidence.js";
import {
  NON_STRICT_FOCUS_WARNING,
  STRICT_FOCUS_WARNING,
} from "./focus-policy.js";
import type {
  AmbiguityAnalysisResult,
  ArtifactRiskAnalysisSection,
  ArtifactRiskZone,
  BlockingIssue,
  InferenceResult,
  IntakeFailureDetails,
  NormalizedTaskInput,
  RepoScanResult,
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

export function buildRiskAnalysisResult(params: {
  taskParserResult: TaskParserResult;
  repoScanResult: RepoScanResult;
  inferenceResult: InferenceResult;
  repoContextOverride?: RepoScanResult["repoContext"];
}): ArtifactRiskAnalysisSection {
  const riskZones: ArtifactRiskZone[] = [];
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
      evidence_paths: [],
    });
  }

  if (unresolvedReferencedPaths.length > 0) {
    riskZones.push({
      code: "unresolved_referenced_paths",
      level: "high",
      reason: "The task references paths that were not found during repo grounding.",
      evidence_paths: unresolvedReferencedPaths,
    });
  }

  if (params.inferenceResult.candidateTargets.length === 0) {
    riskZones.push({
      code: "no_candidate_targets",
      level: "high",
      reason: "Intake could not produce any plausible candidate targets for the next step.",
      evidence_paths: [],
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
      evidence_paths: params.inferenceResult.candidateTargets.map((target) => target.path),
    });
  }

  if (repoContext.testFiles.length === 0) {
    riskZones.push({
      code: "no_tests_detected",
      level: "medium",
      reason: "No tests were detected during repo grounding, so later verification coverage may be weak.",
      evidence_paths: [],
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
      reason: "The task appears to affect manifest or configuration surfaces that can widen downstream impact.",
      evidence_paths: manifestOrConfigPaths,
    });
  }

  return {
    initial_risk_zones: riskZones,
  };
}

function addPromptOpenQuestionHandling(params: {
  categories: TaskParserResult["signals"]["promptOpenQuestionCategories"];
  ambiguities: string[];
  recommendedUserActions: string[];
}): void {
  if (params.categories.includes("scope")) {
    pushUnique(
      params.ambiguities,
      "Prompt scope is still unclear for the current repo. Clarify the concrete files, modules, or bounded behavior to change.",
    );
    pushUnique(
      params.recommendedUserActions,
      "Clarify the exact repo surfaces or bounded behavior this prompt should change before planning.",
    );
  }

  if (params.categories.includes("constraints")) {
    pushUnique(
      params.ambiguities,
      "Prompt constraints are missing. Clarify non-goals, rollout limits, or boundaries before planning.",
    );
    pushUnique(
      params.recommendedUserActions,
      "Add explicit constraints or non-goals so the plan stays bounded.",
    );
  }
}

function addFocusHandling(params: {
  inferenceResult: InferenceResult;
  warnings: string[];
  recommendedUserActions: string[];
}): void {
  const signals = params.inferenceResult.signals;

  if (!signals.focusApplied || signals.outOfFocusTargetCount === 0) {
    return;
  }

  pushUnique(
    params.warnings,
    signals.strictFocusApplied ? STRICT_FOCUS_WARNING : NON_STRICT_FOCUS_WARNING,
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

  addPromptOpenQuestionHandling({
    categories: params.taskParserResult.signals.promptOpenQuestionCategories,
    ambiguities,
    recommendedUserActions,
  });
  addFocusHandling({
    inferenceResult: params.inferenceResult,
    warnings,
    recommendedUserActions,
  });

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

  const repoFiles = new Set(
    params.repoScanResult.repoContext.allFiles.map(normalizePathForComparison),
  );
  const unresolvedReferencedPaths = params.taskParserResult.signals.referencedPaths.filter(
    (path) => !repoFiles.has(normalizePathForComparison(path)),
  );

  if (unresolvedReferencedPaths.length > 0) {
    pushUnique(
      ambiguities,
      `Prompt references repo paths that were not found during grounding: ${unresolvedReferencedPaths.join(", ")}.`,
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
    warnings,
    recommendedUserActions,
    confidence,
  };
}
