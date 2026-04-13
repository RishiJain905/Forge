import type {
  SplitCommandFailure,
  SplitExecutionScope,
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
  warningItems: SplitInputIssue[];
  additionalRecommendedActions?: string[];
}): string[] {
  const actions = [
    ...params.foundation.sourcePlan.planningReadiness.recommended_user_actions,
    ...params.foundation.sourceVerify.verificationReadiness.recommended_user_actions,
    ...(params.additionalRecommendedActions ?? []),
  ];

  if (params.blockingItems.length > 0) {
    actions.push("Resolve the upstream Step 2 and Step 3 blockers before attempting forge split again.");
  }

  if (params.foundation.splitInput.usability.warningItems.length > 0) {
    actions.push("Keep the carried-forward warnings visible when regrouping workstreams.");
  }

  if (params.warningItems.some((item) => item.code === "BLOCKED_WORKSTREAMS_PRESENT")) {
    actions.push("Keep blocked workstreams out of active execution until their carried-forward evidence is resolved.");
  }
  if (params.warningItems.some((item) => item.code === "PARTIALLY_BLOCKED_STREAM_ITEMS_PRESENT")) {
    actions.push("Keep blocked plan items explicit inside their grouped workstreams until their carried-forward blockers are resolved.");
  }

  return dedupeStrings(actions);
}

function resolveExecutionScope(params: {
  ready: boolean;
  blockedWorkstreamCount: number;
  partiallyBlockedItemCount: number;
}): SplitExecutionScope {
  if (!params.ready) {
    return "none";
  }

  if (params.blockedWorkstreamCount > 0 || params.partiallyBlockedItemCount > 0) {
    return "non_blocked_only";
  }

  return "all_streams";
}

function buildMaterialExecutionLimits(params: {
  ready: boolean;
  blockedWorkstreamCount: number;
  partiallyBlockedItemCount: number;
  mergeOrderRuleCount: number;
  warningItems: SplitInputIssue[];
  blockingItems: SplitInputIssue[];
  constrainingConcernIds: string[];
  partialOutput: SplitCommandFailure | null;
}): Array<
  | "upstream_blockers_present"
  | "blocked_workstreams_present"
  | "partially_blocked_items_present"
  | "merge_order_constraints_present"
  | "warning_context_present"
  | "partial_output_present"
> {
  const limits: Array<
    | "upstream_blockers_present"
    | "blocked_workstreams_present"
    | "partially_blocked_items_present"
    | "merge_order_constraints_present"
    | "warning_context_present"
    | "partial_output_present"
  > = [];

  if (!params.ready || params.blockingItems.length > 0) {
    limits.push("upstream_blockers_present");
  }
  if (params.blockedWorkstreamCount > 0) {
    limits.push("blocked_workstreams_present");
  }
  if (params.partiallyBlockedItemCount > 0) {
    limits.push("partially_blocked_items_present");
  }
  if (params.mergeOrderRuleCount > 0) {
    limits.push("merge_order_constraints_present");
  }
  if (params.warningItems.length > 0 || params.constrainingConcernIds.length > 0) {
    limits.push("warning_context_present");
  }
  if (params.partialOutput !== null) {
    limits.push("partial_output_present");
  }

  return limits;
}

function buildLaterStepGate(params: {
  ready: boolean;
  materialExecutionLimits: string[];
}): "proceed" | "proceed_with_caution" | "blocked" {
  if (!params.ready) {
    return "blocked";
  }

  return params.materialExecutionLimits.length > 0 ? "proceed_with_caution" : "proceed";
}

function buildReadinessSummary(params: {
  ready: boolean;
  status: "ready" | "ready_with_warnings" | "blocked";
  foundation: SplitFoundationResult;
  blockingItems: SplitInputIssue[];
  warningItems: SplitInputIssue[];
  partialOutput: SplitCommandFailure | null;
  executionScope: SplitExecutionScope;
  blockedWorkstreamCount: number;
  partiallyBlockedItemCount: number;
  mergeOrderRuleCount: number;
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

  const blockedStreamsPresent = params.blockedWorkstreamCount > 0;
  const partiallyBlockedItemsPresent = params.partiallyBlockedItemCount > 0;
  const mergeOrderConstraintsPresent = params.mergeOrderRuleCount > 0;
  const normalizedAssignmentPhrase = params.executionScope === "all_streams"
    ? "All items were safely assigned"
    : "Not all items were safely assigned";
  const blockedStreamsPhrase = blockedStreamsPresent
    ? "blocked streams remain visible"
    : "no blocked streams remain";
  const partiallyBlockedPhrase = partiallyBlockedItemsPresent
    ? "partially blocked items remain visible"
    : "no partially blocked items remain";
  const mergeOrderPhrase = mergeOrderConstraintsPresent
    ? "merge-order constraints were imposed"
    : "no merge-order constraints were needed";
  const executionPhrase = "later execution must honor the carried-forward constraint detail";

  if (params.status === "ready_with_warnings") {
    if (params.partialOutput !== null && params.warningItems.length === 0) {
      return `Forge split can proceed with warnings. ${normalizedAssignmentPhrase}, ${blockedStreamsPhrase}, ${partiallyBlockedPhrase}, ${mergeOrderPhrase}, and ${executionPhrase}.`;
    }

    return `Forge split can proceed with warnings. ${normalizedAssignmentPhrase}, ${blockedStreamsPhrase}, ${partiallyBlockedPhrase}, ${mergeOrderPhrase}, and ${executionPhrase}.`;
  }

  return `Forge split can proceed. ${normalizedAssignmentPhrase}, ${blockedStreamsPhrase}, ${partiallyBlockedPhrase}, ${mergeOrderPhrase}, and ${executionPhrase}.`;
}

export function resolveSplitReadiness(params: {
  foundation: SplitFoundationResult;
  failure: SplitCommandFailure | null;
  blockedWorkstreamCount?: number;
  partiallyBlockedItemCount?: number;
  mergeOrderRuleCount?: number;
  additionalWarningItems?: SplitInputIssue[];
  additionalRecommendedActions?: string[];
}): SplitReadinessResolution {
  const warningItems = dedupeIssues([
    ...buildWarningItems(params.foundation),
    ...(params.additionalWarningItems ?? []).map(cloneIssue),
  ]);
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
  const executionScope = resolveExecutionScope({
    ready,
    blockedWorkstreamCount: params.blockedWorkstreamCount ?? 0,
    partiallyBlockedItemCount: params.partiallyBlockedItemCount ?? 0,
  });

  const splitDiagnostics = {
    usability_status: params.foundation.splitInput.usability.status,
    warning_items: warningItems,
    blocking_items: blockingItems,
    partial_output: partialOutput,
  };

  const materialExecutionLimits = buildMaterialExecutionLimits({
    ready,
    blockedWorkstreamCount: params.blockedWorkstreamCount ?? 0,
    partiallyBlockedItemCount: params.partiallyBlockedItemCount ?? 0,
    mergeOrderRuleCount: params.mergeOrderRuleCount ?? 0,
    warningItems,
    blockingItems,
    constrainingConcernIds,
    partialOutput,
  });
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
      executionScope,
      blockedWorkstreamCount: params.blockedWorkstreamCount ?? 0,
      partiallyBlockedItemCount: params.partiallyBlockedItemCount ?? 0,
      mergeOrderRuleCount: params.mergeOrderRuleCount ?? 0,
    }),
    execution_scope: executionScope,
    blocked_workstream_count: params.blockedWorkstreamCount ?? 0,
    partially_blocked_item_count: params.partiallyBlockedItemCount ?? 0,
    merge_order_rule_count: params.mergeOrderRuleCount ?? 0,
    later_step_gate: buildLaterStepGate({
      ready,
      materialExecutionLimits,
    }),
    material_execution_limits: materialExecutionLimits,
    warning_items: warningItems,
    blocking_issues: blockingItems,
    partial_output: partialOutput,
    constraining_concern_ids: constrainingConcernIds,
    recommended_user_actions: buildRecommendedUserActions({
      foundation: params.foundation,
      blockingItems,
      warningItems,
      additionalRecommendedActions: params.additionalRecommendedActions,
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
