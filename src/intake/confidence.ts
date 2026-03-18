import type {
  AmbiguityAnalysisResult,
  BlockingIssue,
  CandidateTarget,
  IntakeConfidenceLevel,
  IntakeFailureDetails,
  IntakeStatus,
  IntakeTaskSpec,
  NextStepReadiness,
  RepoContext,
} from "./types.js";

export interface ConfidenceResolutionInput {
  taskParsing: {
    hasGoal: boolean;
    hasAcceptanceCriteria: boolean;
    promptIsThin: boolean;
    ambiguityCount: number;
    promptOpenQuestionCategories: Array<"acceptance_criteria" | "scope" | "constraints" | "repo_alignment">;
  };
  repoInspection: {
    grounded: boolean;
    repoLooksSparse: boolean;
    sourceFileCount: number;
    testFileCount: number;
    missingExplicitTestReference: boolean;
  };
  targeting: {
    candidateTargetCount: number;
    explicitTargetCount: number;
    usedFallbackTargets: boolean;
    unresolvedReferencedPathCount: number;
    focusApplied?: boolean;
    strictFocusApplied?: boolean;
    focusMatchedTargetCount?: number;
    outOfFocusTargetCount?: number;
  };
}

function pushReason(reasons: string[], reason: string): void {
  if (!reasons.includes(reason)) {
    reasons.push(reason);
  }
}

function resolveTaskParsingStrength(
  input: ConfidenceResolutionInput["taskParsing"],
  reasons: string[],
): AmbiguityAnalysisResult["confidence"]["signals"]["taskParsing"] {
  if (!input.hasGoal) {
    pushReason(reasons, "task goal could not be normalized from the input");
  }

  if (input.promptIsThin) {
    pushReason(reasons, "prompt detail is too thin for confident task parsing");
  }

  if (!input.hasAcceptanceCriteria) {
    pushReason(reasons, "acceptance criteria are missing from the task input");
  }

  if (input.promptOpenQuestionCategories.includes("scope")) {
    pushReason(reasons, "prompt scope remains underspecified for the current repo");
  }

  if (input.promptOpenQuestionCategories.includes("constraints")) {
    pushReason(reasons, "prompt constraints or non-goals remain unspecified");
  }

  if (input.ambiguityCount > 0) {
    pushReason(reasons, "task ambiguities remain unresolved");
  }

  if (!input.hasGoal || input.promptIsThin || input.promptOpenQuestionCategories.includes("scope")) {
    return "weak";
  }

  if (
    !input.hasAcceptanceCriteria ||
    input.ambiguityCount > 0 ||
    input.promptOpenQuestionCategories.includes("constraints")
  ) {
    return "partial";
  }

  return "strong";
}

function resolveRepoInspectionStrength(
  input: ConfidenceResolutionInput["repoInspection"],
  reasons: string[],
): AmbiguityAnalysisResult["confidence"]["signals"]["repoInspection"] {
  if (!input.grounded) {
    pushReason(reasons, "repo grounding did not produce usable repository evidence");
  }

  if (input.repoLooksSparse) {
    pushReason(reasons, "repo grounding looks sparse relative to the requested task");
  }

  if (input.missingExplicitTestReference) {
    pushReason(reasons, "explicitly referenced test paths were not found during repo grounding");
  }

  if (input.sourceFileCount === 0) {
    pushReason(reasons, "no source files were detected during repo grounding");
  }

  if (input.testFileCount === 0) {
    pushReason(reasons, "no test files were detected during repo grounding");
  }

  if (!input.grounded || input.repoLooksSparse || input.missingExplicitTestReference) {
    return "weak";
  }

  if (input.sourceFileCount === 0 || input.testFileCount === 0) {
    return "partial";
  }

  return "strong";
}

function resolveTargetingStrength(
  input: ConfidenceResolutionInput["targeting"],
  reasons: string[],
): AmbiguityAnalysisResult["confidence"]["signals"]["targeting"] {
  if (input.candidateTargetCount === 0) {
    pushReason(reasons, "candidate targeting could not produce any plausible targets");
  }

  if (input.unresolvedReferencedPathCount > 0) {
    pushReason(reasons, "task-referenced paths remain unresolved after repo grounding");
  }

  if (input.usedFallbackTargets) {
    pushReason(reasons, "candidate targeting relies on fallback repo structure");
  }

  if (input.explicitTargetCount === 0 && input.candidateTargetCount > 0) {
    pushReason(reasons, "candidate targeting does not have an explicit task-to-file match");
  }

  if (input.focusApplied) {
    if ((input.outOfFocusTargetCount ?? 0) > 0) {
      pushReason(reasons, "focus paths do not cover all likely targets");
    }

    if (input.strictFocusApplied && (input.outOfFocusTargetCount ?? 0) > 0) {
      pushReason(reasons, "strict focus excluded likely relevant candidate targets");
    }
  }

  if (input.candidateTargetCount === 0 || input.unresolvedReferencedPathCount > 0) {
    return "weak";
  }

  if (
    input.usedFallbackTargets ||
    input.explicitTargetCount === 0 ||
    ((input.focusApplied ?? false) && (input.outOfFocusTargetCount ?? 0) > 0)
  ) {
    return "partial";
  }

  return "strong";
}

export function buildConfidenceResolution(
  input: ConfidenceResolutionInput,
): AmbiguityAnalysisResult["confidence"] {
  const taskReasons: string[] = [];
  const repoReasons: string[] = [];
  const targetingReasons: string[] = [];

  const signals = {
    taskParsing: resolveTaskParsingStrength(input.taskParsing, taskReasons),
    repoInspection: resolveRepoInspectionStrength(input.repoInspection, repoReasons),
    targeting: resolveTargetingStrength(input.targeting, targetingReasons),
  };

  const level =
    Object.values(signals).some((value) => value === "weak")
      ? "low"
      : Object.values(signals).some((value) => value === "partial")
        ? "medium"
        : "high";

  return {
    level,
    signals,
    reasons: [...taskReasons, ...repoReasons, ...targetingReasons],
  };
}

export interface SuccessEvaluation {
  warnings: string[];
  ambiguities: string[];
  nextStepReadiness: NextStepReadiness;
}

function createBlockingIssue(code: string, message: string): BlockingIssue {
  return { code, message };
}

function hasBlockingIssue(blockingIssues: BlockingIssue[], code: string): boolean {
  return blockingIssues.some((issue) => issue.code === code);
}

export function evaluateSuccessModel(params: {
  taskSpec: IntakeTaskSpec;
  repoContext: RepoContext;
  candidateTargets: CandidateTarget[];
  failure: IntakeFailureDetails | null;
  confidenceLevel: IntakeConfidenceLevel;
  failOnLowConfidence: boolean;
  validationBlockingIssues?: BlockingIssue[];
  inputWarnings?: string[];
  inputAmbiguities?: string[];
  inputRecommendedUserActions?: string[];
}): SuccessEvaluation {
  const warnings = [...(params.inputWarnings ?? [])];
  const ambiguities = [...(params.inputAmbiguities ?? [])];
  const recommendedUserActions = [...(params.inputRecommendedUserActions ?? [])];
  const blockingIssues = [...(params.validationBlockingIssues ?? [])];

  if (params.failure && blockingIssues.length === 0) {
    blockingIssues.push(createBlockingIssue(params.failure.code, params.failure.message));
  }

  if (!params.taskSpec.goal.trim()) {
    blockingIssues.push(
      createBlockingIssue(
        "TASK_GOAL_MISSING",
        "Forge intake could not normalize a usable task goal from the provided input.",
      ),
    );
  }

  if (!params.repoContext.grounded) {
    blockingIssues.push(
      createBlockingIssue(
        "REPO_CONTEXT_MISSING",
        "Forge intake could not ground the task in a usable repo context.",
      ),
    );
  }

  if (params.candidateTargets.length === 0) {
    blockingIssues.push(
      createBlockingIssue(
        "CANDIDATE_TARGETS_MISSING",
        "Forge intake could not produce any plausible candidate targets for the next step.",
      ),
    );
  }

  if (
    params.failOnLowConfidence &&
    params.confidenceLevel === "low" &&
    !hasBlockingIssue(blockingIssues, "LOW_CONFIDENCE_ESCALATED")
  ) {
    blockingIssues.push(
      createBlockingIssue(
        "LOW_CONFIDENCE_ESCALATED",
        "Forge intake was configured to fail on low confidence, and the final confidence level is low.",
      ),
    );
  }

  return {
    warnings,
    ambiguities,
    nextStepReadiness: {
      ready: blockingIssues.length === 0,
      blockingIssues,
      recommendedUserActions,
    },
  };
}

export function resolveIntakeStatus(params: {
  failure: IntakeFailureDetails | null;
  nextStepReadiness: NextStepReadiness;
  warnings: string[];
  ambiguities: string[];
  confidenceLevel: IntakeConfidenceLevel;
}): IntakeStatus {
  if (params.failure || !params.nextStepReadiness.ready) {
    return "failed";
  }

  if (
    params.confidenceLevel !== "high" ||
    params.warnings.length > 0 ||
    params.ambiguities.length > 0
  ) {
    return "warning";
  }

  return "success";
}

export function buildSummary(status: IntakeStatus, nextStepReadiness: NextStepReadiness): string {
  if (status === "failed") {
    if (
      nextStepReadiness.blockingIssues.length === 1 &&
      hasBlockingIssue(nextStepReadiness.blockingIssues, "LOW_CONFIDENCE_ESCALATED")
    ) {
      return "Forge intake is not ready for forge plan because low confidence was escalated to failure.";
    }

    return nextStepReadiness.blockingIssues.length > 0
      ? "Forge intake is not ready for forge plan because blocking issues remain."
      : "Forge intake failed before it could produce a ready result.";
  }

  if (status === "warning") {
    return "Forge intake is ready for forge plan with warnings.";
  }

  return "Forge intake is ready for forge plan.";
}
