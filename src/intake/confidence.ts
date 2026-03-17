import type { AmbiguityAnalysisResult } from "./types.js";

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

  if (input.candidateTargetCount === 0 || input.unresolvedReferencedPathCount > 0) {
    return "weak";
  }

  if (input.usedFallbackTargets || input.explicitTargetCount === 0) {
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
