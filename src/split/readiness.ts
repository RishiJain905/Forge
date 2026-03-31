import type {
  SplitCommandFailure,
  SplitFoundationResult,
  SplitInputIssue,
  SplitReadinessResolution,
  SplitReadinessStatus,
} from "./types.js";

function cloneIssue(issue: SplitInputIssue): SplitInputIssue {
  return {
    code: issue.code,
    message: issue.message,
  };
}

function dedupeIssues(items: SplitInputIssue[]): SplitInputIssue[] {
  const seen = new Set<string>();
  const result: SplitInputIssue[] = [];

  for (const item of items) {
    const key = `${item.code}::${item.message}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(item);
  }

  return result;
}

function dedupeStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = value.trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    result.push(normalized);
  }

  return result;
}

function buildPartialOutput(failure: SplitCommandFailure | null): SplitCommandFailure | null {
  if (!failure) {
    return null;
  }

  return {
    code: failure.code,
    message: failure.message,
    ...(failure.fallbackReason ? { fallbackReason: failure.fallbackReason } : {}),
  };
}

function buildWarningItems(foundation: SplitFoundationResult): SplitInputIssue[] {
  return foundation.splitInput.usability.warningItems.map(cloneIssue);
}

function buildBlockingItems(foundation: SplitFoundationResult): SplitInputIssue[] {
  return foundation.splitInput.usability.blockingItems.map(cloneIssue);
}

function buildConcerningIds(foundation: SplitFoundationResult): string[] {
  const planningConcernIds = foundation.sourcePlan.planningReadiness.status === "ready"
    ? []
    : foundation.sourcePlan.planningReadiness.constraining_concern_ids;
  const verificationConcernIds = foundation.sourceVerify.verificationReadiness.status === "ready"
    ? []
    : foundation.sourceVerify.verificationReadiness.constraining_concern_ids;

  return dedupeStrings([
    ...planningConcernIds,
    ...verificationConcernIds,
  ]);
}

function buildRecommendedUserActions(params: {
  foundation: SplitFoundationResult;
  blockingItems: SplitInputIssue[];
}): string[] {
  const actions = [
    ...params.foundation.sourcePlan.planningReadiness.recommended_user_actions,
    ...params.foundation.sourceVerify.verificationReadiness.recommended_user_actions,
  ];

  if (params.blockingItems.length > 0) {
    actions.push("Resolve the upstream Step 2 and Step 3 blockers before attempting forge split again.");
  }

  if (params.foundation.splitInput.usability.warningItems.length > 0) {
    actions.push("Keep the carried-forward warnings visible when regrouping workstreams.");
  }

  return dedupeStrings(actions);
}

function buildReadinessSummary(params: {
  ready: boolean;
  status: "ready" | "ready_with_warnings" | "blocked";
  foundation: SplitFoundationResult;
  blockingItems: SplitInputIssue[];
  warningItems: SplitInputIssue[];
  partialOutput: SplitCommandFailure | null;
}): string {
  if (!params.ready) {
    if (params.foundation.splitInput.usability.status === "upstream_blocked") {
      return "Forge split should not proceed until the persisted Step 3 handoff is unblocked.";
    }

    if (params.foundation.splitInput.usability.status === "non_actionable") {
      return "Forge split should not proceed until the Step 3 handoff becomes actionable.";
    }

    return "Forge split should not proceed until the upstream blockers are resolved.";
  }

  if (params.status === "ready_with_warnings") {
    if (params.partialOutput !== null && params.warningItems.length === 0) {
      return "Forge split can proceed, but a partial output fallback remains visible.";
    }

    return "Forge split can proceed, but carried-forward warnings still constrain regrouping.";
  }

  return "Forge split can proceed.";
}

export function resolveSplitReadiness(params: {
  foundation: SplitFoundationResult;
  failure: SplitCommandFailure | null;
}): SplitReadinessResolution {
  const warningItems = dedupeIssues(buildWarningItems(params.foundation));
  const blockingItems = dedupeIssues(buildBlockingItems(params.foundation));
  const partialOutput = buildPartialOutput(params.failure);
  const constrainingConcernIds = buildConcerningIds(params.foundation);
  const ready = blockingItems.length === 0;
  const hasWarningSignals =
    warningItems.length > 0 ||
    constrainingConcernIds.length > 0 ||
    partialOutput !== null;
  const status: SplitReadinessStatus = ready
    ? hasWarningSignals
      ? "ready_with_warnings"
      : "ready"
    : "blocked";

  const splitDiagnostics = {
    usability_status: params.foundation.splitInput.usability.status,
    warning_items: warningItems,
    blocking_items: blockingItems,
    partial_output: partialOutput,
  };

  const splitReadiness = {
    ready,
    status,
    summary: buildReadinessSummary({
      ready,
      status,
      foundation: params.foundation,
      blockingItems,
      warningItems,
      partialOutput,
    }),
    warning_items: warningItems,
    blocking_issues: blockingItems,
    partial_output: partialOutput,
    constraining_concern_ids: constrainingConcernIds,
    recommended_user_actions: buildRecommendedUserActions({
      foundation: params.foundation,
      blockingItems,
    }),
  };

  return {
    status: params.failure
      ? "failed"
      : ready
        ? "ready"
        : "blocked",
    splitDiagnostics,
    splitReadiness,
  };
}
