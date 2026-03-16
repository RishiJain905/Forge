import type {
  BlockingIssue,
  CandidateTarget,
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

function pushUnique(values: string[], value: string): void {
  if (!values.includes(value)) {
    values.push(value);
  }
}

function createBlockingIssue(code: string, message: string): BlockingIssue {
  return { code, message };
}

export function evaluateSuccessModel(params: {
  taskSpec: IntakeTaskSpec;
  repoContext: RepoContext;
  candidateTargets: CandidateTarget[];
  failure: IntakeFailureDetails | null;
}): SuccessEvaluation {
  const warnings: string[] = [];
  const ambiguities: string[] = [];
  const recommendedUserActions: string[] = [];
  const blockingIssues: BlockingIssue[] = [];

  if (params.failure) {
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

  if (!params.taskSpec.hasAcceptanceCriteria) {
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

  if (params.repoContext.testFiles.length === 0) {
    pushUnique(
      warnings,
      "No tests were detected during repo grounding.",
    );
    pushUnique(
      recommendedUserActions,
      "Identify or add the test files that should validate the planned changes.",
    );
  }

  if (
    params.candidateTargets.length > 0 &&
    params.candidateTargets.every((target) => target.matchType === "fallback")
  ) {
    pushUnique(
      warnings,
      "Repo mapping is partial but still usable because candidate targets were inferred from repo structure.",
    );
    pushUnique(
      recommendedUserActions,
      "Reference concrete files or directories in the task input to strengthen repo grounding.",
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
}): IntakeStatus {
  if (params.failure || !params.nextStepReadiness.ready) {
    return "failed";
  }

  if (params.warnings.length > 0 || params.ambiguities.length > 0) {
    return "warning";
  }

  return "success";
}

export function buildSummary(status: IntakeStatus, nextStepReadiness: NextStepReadiness): string {
  if (status === "failed") {
    return nextStepReadiness.blockingIssues.length > 0
      ? "Forge intake is not ready for forge plan because blocking issues remain."
      : "Forge intake failed before it could produce a ready result.";
  }

  if (status === "warning") {
    return "Forge intake is ready for forge plan with warnings.";
  }

  return "Forge intake is ready for forge plan.";
}
