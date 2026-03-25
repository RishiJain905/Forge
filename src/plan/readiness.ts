import { PLAN_READINESS_CONSTRAINING_EFFECTS } from "./constants.js";
import type {
  PlanCarryForwardConcern,
  PlanCommandFailure,
  PlanCommandStatus,
  PlanFoundationResult,
  PlanInputIssue,
  PlanModel,
  PlanPartialOutput,
  PlanPlanningReadiness,
  PlanReadinessStatus,
} from "./types.js";

export interface PlanReadinessResolution {
  status: PlanCommandStatus;
  planningReadiness: PlanPlanningReadiness;
}

const CONSTRAINING_EFFECT_SET = new Set<string>(PLAN_READINESS_CONSTRAINING_EFFECTS);

function cloneIssue(issue: PlanInputIssue): PlanInputIssue {
  return {
    code: issue.code,
    message: issue.message,
  };
}

function dedupeStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const deduped: string[] = [];

  for (const value of values) {
    if (seen.has(value)) {
      continue;
    }

    seen.add(value);
    deduped.push(value);
  }

  return deduped;
}

function buildPartialOutput(failure: PlanCommandFailure | null): PlanPartialOutput | null {
  if (!failure) {
    return null;
  }

  return {
    code: failure.code,
    message: failure.message,
    ...(failure.fallbackReason ? { fallbackReason: failure.fallbackReason } : {}),
  };
}

function buildBlockingIssues(params: {
  foundation: PlanFoundationResult;
  model: PlanModel;
}): PlanInputIssue[] {
  const blockingIssues = params.foundation.planningInput.usability.blockingItems.map(cloneIssue);

  if (
    params.foundation.planningInput.usability.status === "actionable" &&
    params.model.planItems.length === 0 &&
    blockingIssues.every((issue) => issue.code !== "PLAN_INPUT_TOO_WEAK")
  ) {
    blockingIssues.push({
      code: "PLAN_INPUT_TOO_WEAK",
      message:
        "Step 1 output is structurally valid but does not provide enough actionable planning signal for Step 2 to build real plan items.",
    });
  }

  return blockingIssues;
}

function buildWarningItems(foundation: PlanFoundationResult): PlanInputIssue[] {
  return foundation.planningInput.usability.warningItems.map(cloneIssue);
}

function isConstrainingConcern(concern: PlanCarryForwardConcern): boolean {
  return concern.effects.some((effect) => CONSTRAINING_EFFECT_SET.has(effect));
}

function buildConstrainingConcernIds(concerns: PlanCarryForwardConcern[]): string[] {
  return dedupeStrings(
    concerns
      .filter(isConstrainingConcern)
      .map((concern) => concern.id),
  );
}

function buildRecommendedUserActions(params: {
  foundation: PlanFoundationResult;
  blockingIssues: PlanInputIssue[];
}): string[] {
  const actions = [...params.foundation.carryForward.nextStepReadiness.recommended_user_actions];

  if (params.foundation.planningInput.usability.status === "non_actionable") {
    actions.push(
      "Add explicit requirements, acceptance criteria, or concrete repo targets so Step 2 can derive real plan items.",
    );
  }

  if (
    params.blockingIssues.some((issue) => issue.code === "PLAN_INPUT_TOO_WEAK") &&
    params.foundation.planningInput.usability.status !== "non_actionable"
  ) {
    actions.push(
      "Add enough actionable planning signal in the Step 1 handoff for Step 2 to build real plan items.",
    );
  }

  return dedupeStrings(actions);
}

function buildReadinessSummary(params: {
  ready: boolean;
  status: PlanReadinessStatus;
  foundation: PlanFoundationResult;
  blockingIssues: PlanInputIssue[];
  warningItems: PlanInputIssue[];
  partialOutput: PlanPartialOutput | null;
}): string {
  if (!params.ready) {
    if (params.foundation.planningInput.usability.status === "upstream_blocked") {
      return "Later steps should not proceed until the persisted Step 1 handoff is unblocked.";
    }

    if (params.foundation.planningInput.usability.status === "non_actionable") {
      return "Later steps should not proceed until the Step 1 handoff becomes actionable; the current handoff is non-actionable.";
    }

    if (params.blockingIssues.some((issue) => issue.code === "PLAN_INPUT_TOO_WEAK")) {
      return "Later steps should not proceed until the handoff exposes enough actionable planning signal; the current handoff is insufficient.";
    }

    return "Later steps should not proceed yet.";
  }

  if (params.status === "ready_with_warnings") {
    if (
      params.partialOutput !== null &&
      params.warningItems.length === 0
    ) {
      return "Later steps can proceed, but a partial output fallback remains visible.";
    }

    return "Later steps can proceed, but carried-forward warnings still constrain this plan.";
  }

  return "Later steps can proceed.";
}

export function resolvePlanReadiness(params: {
  foundation: PlanFoundationResult;
  model: PlanModel;
  failure: PlanCommandFailure | null;
}): PlanReadinessResolution {
  const warningItems = buildWarningItems(params.foundation);
  const blockingIssues = buildBlockingIssues({
    foundation: params.foundation,
    model: params.model,
  });
  const constrainingConcernIds = buildConstrainingConcernIds(params.model.carryForwardConcerns);
  const partialOutput = buildPartialOutput(params.failure);
  const ready = blockingIssues.length === 0;
  const hasWarningSignals =
    warningItems.length > 0 ||
    constrainingConcernIds.length > 0 ||
    partialOutput !== null;
  const status: PlanReadinessStatus = ready
    ? hasWarningSignals
      ? "ready_with_warnings"
      : "ready"
    : "blocked";

  return {
    status: params.failure
      ? "failed"
      : ready
        ? "ready"
        : "blocked",
    planningReadiness: {
      ready,
      status,
      summary: buildReadinessSummary({
        ready,
        status,
        foundation: params.foundation,
        blockingIssues,
        warningItems,
        partialOutput,
      }),
      warning_items: warningItems,
      blocking_issues: blockingIssues,
      partial_output: partialOutput,
      constraining_concern_ids: constrainingConcernIds,
      recommended_user_actions: buildRecommendedUserActions({
        foundation: params.foundation,
        blockingIssues,
      }),
    },
  };
}
