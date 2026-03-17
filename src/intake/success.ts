import type {
  BlockingIssue,
  CandidateTarget,
  IntakeConfidenceLevel,
  IntakeFailureDetails,
  IntakeStatus,
  IntakeTaskSpec,
  NextStepReadiness,
  RepoContext,
} from "./types.js";

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
    blockingIssues.push(
      createBlockingIssue(
        params.failure.code,
        params.failure.message,
      ),
    );
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
