import type { SplitArtifact } from "./types.js";

const REQUIRED_HEADINGS = [
  "Overview",
  "Purpose",
  "Source Verify",
  "Source Plan",
  "Workstream Contract",
  "Workstreams",
  "Dependency Edges",
  "Merge Order",
  "Blocked Items",
  "Carried-Forward Constraints",
  "Split Diagnostics",
  "Split Readiness",
  "Boundary Notes",
  "Deferred Capabilities",
  "Allowed Side Effects",
  "Disallowed Capabilities",
  "Output Files",
  "Failure",
  "Summary",
] as const;

function renderList(items: string[]): string {
  return items.length > 0 ? items.map((item) => `- ${item}`).join("\n") : "- none";
}

function renderIssueList(items: Array<{ code: string; message: string }>): string {
  return items.length > 0
    ? items.map((item) => `- [${item.code}] ${item.message}`).join("\n")
    : "- none";
}

function renderSection(title: string, lines: string[]): string {
  return [
    `## ${title}`,
    "",
    ...lines,
  ].join("\n");
}

function renderKeyValueLines(entries: Array<[string, string | number | boolean | null]>): string[] {
  return entries.map(([key, value]) => `- ${key}: ${value === null ? "none" : value}`);
}

function renderFailureDetails(
  failure: SplitArtifact["failure"],
): string {
  if (!failure) {
    return "- none";
  }

  return renderList([
    `Code: ${failure.code}`,
    `Message: ${failure.message}`,
    `Fallback Reason: ${failure.fallbackReason ?? "none"}`,
  ]);
}

function renderReadinessLines(artifact: SplitArtifact): string[] {
  const laterExecutionMustHonor = artifact.split_readiness.recommended_user_actions;

  return [
    `- Can Proceed: ${artifact.split_readiness.ready ? "yes" : "no"}`,
    `- Later-Step Gate: ${artifact.split_readiness.later_step_gate}`,
    `- All Items Safely Assigned: ${artifact.split_readiness.execution_scope === "all_streams" ? "yes" : "no"}`,
    `- Execution Scope: ${artifact.split_readiness.execution_scope}`,
    `- Blocked Workstream Count: ${artifact.split_readiness.blocked_workstream_count}`,
    `- Partially Blocked Item Count: ${artifact.split_readiness.partially_blocked_item_count}`,
    `- Merge-Order Rule Count: ${artifact.split_readiness.merge_order_rule_count}`,
    `- Material Execution Limits: ${artifact.split_readiness.material_execution_limits.join(", ") || "none"}`,
    `- Later Execution Must Honor: ${laterExecutionMustHonor.join("; ") || "none"}`,
  ];
}

function renderWorkstreams(artifact: SplitArtifact): string {
  if (artifact.workstreams.length === 0) {
    return "- none";
  }

  return artifact.workstreams
    .map((workstream) => [
      `- ${workstream.id}: ${workstream.title}`,
      `  - Category: ${workstream.category}`,
      `  - Description: ${workstream.description}`,
      `  - Source Plan Item IDs: ${workstream.sourcePlanItemIds.join(", ") || "none"}`,
      `  - Source Verification Case IDs: ${workstream.sourceVerificationCaseIds.join(", ") || "none"}`,
      `  - Source Finding IDs: ${workstream.sourceFindingIds.join(", ") || "none"}`,
      `  - Likely Affected Paths: ${workstream.likelyAffectedPaths.join(", ") || "none"}`,
      `  - Stream Dependencies: ${workstream.streamDependencies.join(", ") || "none"}`,
      `  - Merge Order Requirements: ${workstream.mergeOrderRequirements.join("; ") || "none"}`,
      `  - Constraints: ${workstream.constraints.join("; ") || "none"}`,
      `  - Blocked Reason: ${workstream.blockedReason ?? "none"}`,
    ].join("\n"))
    .join("\n");
}

function renderDependencyEdges(artifact: SplitArtifact): string {
  if (artifact.dependency_edges.length === 0) {
    return "- none";
  }

  return artifact.dependency_edges
    .map((edge) =>
      `- ${edge.upstreamWorkstreamId} -> ${edge.downstreamWorkstreamId}: ${edge.reason}`)
    .join("\n");
}

function renderMergeOrder(artifact: SplitArtifact): string {
  if (artifact.merge_order.length === 0) {
    return "- none";
  }

  return artifact.merge_order
    .map((entry) => [
      `- ${entry.order}: ${entry.workstreamId}`,
      `  - Rule Type: ${entry.ruleType}`,
      `  - Must Merge After: ${entry.mustMergeAfterWorkstreamIds.join(", ") || "none"}`,
      `  - Source Dependency IDs: ${entry.sourceDependencyIds.join(", ") || "none"}`,
      `  - Source Constraint IDs: ${entry.sourceConstraintIds.join(", ") || "none"}`,
      `  - Source Concern IDs: ${entry.sourceConcernIds.join(", ") || "none"}`,
      `  - Reason: ${entry.reason}`,
    ].join("\n"))
    .join("\n");
}

function renderBlockedItems(artifact: SplitArtifact): string {
  if (artifact.blocked_items.length === 0) {
    return "- none";
  }

  return artifact.blocked_items
    .map((item) => [
      `- ${item.id}: ${item.message}`,
      `  - Kind: ${item.kind}`,
      `  - Code: ${item.code}`,
      `  - Workstream ID: ${item.workstreamId ?? "none"}`,
      `  - Partial Metadata Available: ${item.partialMetadataAvailable}`,
      `  - Source Plan Item IDs: ${item.sourcePlanItemIds.join(", ") || "none"}`,
      `  - Source Verification Case IDs: ${item.sourceVerificationCaseIds.join(", ") || "none"}`,
      `  - Source Finding IDs: ${item.sourceFindingIds.join(", ") || "none"}`,
      `  - Source Constraint IDs: ${item.sourceConstraintIds.join(", ") || "none"}`,
      `  - Source Concern IDs: ${item.sourceConcernIds.join(", ") || "none"}`,
    ].join("\n"))
    .join("\n");
}

export function createSplitReport(artifact: SplitArtifact): string {
  const sections = [
    renderSection("Overview", [
      ...renderKeyValueLines([
        ["Command", artifact.command],
        ["Stage", artifact.stage],
        ["Status", artifact.status],
        ["Repo Root", artifact.repoRoot],
        ["Requested Output Root", artifact.requestedOutputRoot],
        ["Output Root", artifact.outputRoot],
        ["Artifact Path", artifact.files.artifactPath],
        ["Report Path", artifact.files.reportPath],
        ["Split Readiness Status", artifact.split_readiness.status],
        ["Split Usability", artifact.split_diagnostics.usability_status],
        ["Later-Step Gate", artifact.split_readiness.later_step_gate],
        ["Execution Scope", artifact.split_readiness.execution_scope],
        ["V1 Freeze State", "bug-fix-only maintenance mode"],
        ["Warning Items", artifact.split_readiness.warning_items.length],
        ["Blocking Issues", artifact.split_readiness.blocking_issues.length],
        ["Failure Code", artifact.failure?.code ?? null],
        ["Summary", artifact.summary],
      ]),
    ]),
    renderSection("Purpose", [`- ${artifact.purpose}`]),
    renderSection("Source Verify", [
      ...renderKeyValueLines([
        ["Artifact Path", artifact.source_verify.artifactPath],
        ["Command", artifact.source_verify.command],
        ["Repo Root", artifact.source_verify.repoRoot],
        ["Status", artifact.source_verify.status],
        ["Ready For Split", artifact.source_verify.readyForSplit],
        ["Verification Readiness Status", artifact.source_verify.verificationReadinessStatus],
        ["Summary", artifact.source_verify.summary],
      ]),
      "",
      "### Failure",
      "",
      renderFailureDetails(artifact.source_verify.failure),
    ]),
    renderSection("Source Plan", [
      ...renderKeyValueLines([
        ["Artifact Path", artifact.source_plan.artifactPath],
        ["Command", artifact.source_plan.command],
        ["Repo Root", artifact.source_plan.repoRoot],
        ["Status", artifact.source_plan.status],
        ["Ready For Verification", artifact.source_plan.readyForVerification],
        ["Summary", artifact.source_plan.summary],
      ]),
      "",
      "### Failure",
      "",
      renderFailureDetails(artifact.source_plan.failure),
    ]),
    renderSection("Workstream Contract", [
      "This section freezes the public Step 4 workstream contract while the current split artifact keeps workstream output deterministic and conservative.",
      "",
      "### Required Fields",
      "",
      renderList([...artifact.workstream_contract.requiredFields]),
      "",
      "### Categories",
      "",
      renderList([...artifact.workstream_contract.categories]),
      "",
      "### Constraint Sources",
      "",
      renderList([...artifact.workstream_contract.constraintSources]),
    ]),
    renderSection("Workstreams", [renderWorkstreams(artifact)]),
    renderSection("Dependency Edges", [renderDependencyEdges(artifact)]),
    renderSection("Merge Order", [renderMergeOrder(artifact)]),
    renderSection("Blocked Items", [
      "Blocked items include both upstream blockers and blocked workstreams so later execution can distinguish input gating from stream-level blocking.",
      "",
      renderBlockedItems(artifact),
    ]),
    renderSection("Carried-Forward Constraints", [
      "This section preserves the exact Step 2 and Step 3 safety context that later split work must continue honoring.",
      "",
      "### Findings",
      "",
      renderList(
        artifact.carried_forward_constraints.findings.map((finding) => `${finding.id}: ${finding.summary}`),
      ),
      "",
      "### Constraints",
      "",
      renderList(
        artifact.carried_forward_constraints.constraints.map((constraint) => `${constraint.id}: ${constraint.summary}`),
      ),
      "",
      "### Plan Concerns",
      "",
      renderList(
        artifact.carried_forward_constraints.plan_concerns.map((concern) => `${concern.id}: ${concern.message}`),
      ),
      "",
      "### Planning Readiness",
      "",
      ...renderKeyValueLines([
        ["Ready", artifact.carried_forward_constraints.planning_readiness.ready],
        ["Status", artifact.carried_forward_constraints.planning_readiness.status],
        ["Summary", artifact.carried_forward_constraints.planning_readiness.summary],
      ]),
      "",
      "### Verification Readiness",
      "",
      ...renderKeyValueLines([
        ["Ready", artifact.carried_forward_constraints.verification_readiness.ready],
        ["Status", artifact.carried_forward_constraints.verification_readiness.status],
        ["Summary", artifact.carried_forward_constraints.verification_readiness.summary],
      ]),
      "",
      "### Stream Constraint Details",
      "",
      artifact.carried_forward_constraints.stream_constraint_details.length > 0
        ? artifact.carried_forward_constraints.stream_constraint_details.map((detail) => [
            `- ${detail.workstreamId}`,
            `  - Base Category: ${detail.baseCategory}`,
            `  - Category: ${detail.category}`,
            `  - Applied Rules: ${detail.appliedRules.join(", ") || "none"}`,
            `  - Category Reasons: ${detail.categoryReasons.join("; ") || "none"}`,
            `  - Merge-Order Reasons: ${detail.mergeOrderReasons.join("; ") || "none"}`,
            `  - Blocking Reasons: ${detail.blockingReasons.join("; ") || "none"}`,
            `  - Warning Notes: ${detail.warningNotes.join("; ") || "none"}`,
            `  - Mitigation Summaries: ${detail.mitigationSummaries.join("; ") || "none"}`,
            `  - Source Dependency IDs: ${detail.sourceDependencyIds.join(", ") || "none"}`,
            `  - Source Conflict Zone IDs: ${detail.sourceConflictZoneIds.join(", ") || "none"}`,
            `  - Source Test Obligation IDs: ${detail.sourceTestObligationIds.join(", ") || "none"}`,
            `  - Source Verification Target IDs: ${detail.sourceVerificationTargetIds.join(", ") || "none"}`,
            `  - Source Verification Case IDs: ${detail.sourceVerificationCaseIds.join(", ") || "none"}`,
            `  - Source Finding IDs: ${detail.sourceFindingIds.join(", ") || "none"}`,
            `  - Source Constraint IDs: ${detail.sourceConstraintIds.join(", ") || "none"}`,
            `  - Source Concern IDs: ${detail.sourceConcernIds.join(", ") || "none"}`,
            `  - Source Readiness IDs: ${detail.sourceReadinessIds.join(", ") || "none"}`,
            `  - Blocked Upstream Workstream IDs: ${detail.blockedUpstreamWorkstreamIds.join(", ") || "none"}`,
            `  - Blocked Plan Item IDs: ${detail.blockedPlanItemIds.join(", ") || "none"}`,
            `  - Merge Order Rule IDs: ${detail.mergeOrderRuleIds.join(", ") || "none"}`,
            `  - Blocked Item IDs: ${detail.blockedItemIds.join(", ") || "none"}`,
            `  - Blocked Reason: ${detail.blockedReason ?? "none"}`,
            `  - Regrouping Kind: ${detail.regrouping.groupKind}`,
            `  - Regrouping Rationale: ${detail.regrouping.rationale}`,
            `  - Regrouping Note: ${detail.regrouping.note ?? "none"}`,
            `  - Regrouping Preserved Source Plan Item IDs: ${detail.regrouping.preservedSourcePlanItemIds.join(", ") || "none"}`,
            `  - Regrouping Member Details: ${detail.regrouping.memberDetails.map((member) => `${member.planItemId}:${member.blockedStatus}`).join(", ") || "none"}`,
            `  - Blocking Status: ${detail.blocking.status}`,
            `  - Blocking Blocked Member Plan Item IDs: ${detail.blocking.blockedMemberPlanItemIds.join(", ") || "none"}`,
            `  - Blocking Constraining Finding IDs: ${detail.blocking.constrainingFindingIds.join(", ") || "none"}`,
            `  - Blocking Constraining Constraint IDs: ${detail.blocking.constrainingConstraintIds.join(", ") || "none"}`,
            `  - Blocking Constraining Concern IDs: ${detail.blocking.constrainingConcernIds.join(", ") || "none"}`,
            `  - Blocking Can Proceed With Constraints: ${detail.blocking.canProceedWithConstraints}`,
            `  - Blocking Requires Resolution Before Execution: ${detail.blocking.requiresResolutionBeforeExecution}`,
            `  - Merge-Order Status: ${detail.mergeOrder.status}`,
            `  - Merge-Order Rule Kinds: ${detail.mergeOrder.ruleKinds.join(", ") || "none"}`,
            `  - Merge-Order Hard Prerequisite Workstream IDs: ${detail.mergeOrder.hardPrerequisiteWorkstreamIds.join(", ") || "none"}`,
            `  - Merge-Order Source Constraint IDs: ${detail.mergeOrder.sourceConstraintIds.join(", ") || "none"}`,
            `  - Merge-Order Source Concern IDs: ${detail.mergeOrder.sourceConcernIds.join(", ") || "none"}`,
          ].join("\n")).join("\n")
        : "- none",
    ]),
    renderSection("Split Diagnostics", [
      "split_diagnostics explains the warning, blocking, and partial-output context behind the later-step gate without replacing the durable split artifact and report.",
      "",
      ...renderKeyValueLines([
        ["Usability Status", artifact.split_diagnostics.usability_status],
        ["Warning Items", artifact.split_diagnostics.warning_items.length],
        ["Blocking Items", artifact.split_diagnostics.blocking_items.length],
        ["Partial Output", artifact.split_diagnostics.partial_output?.code ?? null],
      ]),
      "",
      "### Warning Items",
      "",
      renderIssueList(artifact.split_diagnostics.warning_items),
      "",
      "### Blocking Items",
      "",
      renderIssueList(artifact.split_diagnostics.blocking_items),
      "",
      "### Partial Output",
      "",
      artifact.split_diagnostics.partial_output
        ? renderList([
            `Code: ${artifact.split_diagnostics.partial_output.code}`,
            `Message: ${artifact.split_diagnostics.partial_output.message}`,
            `Fallback Reason: ${artifact.split_diagnostics.partial_output.fallbackReason ?? "none"}`,
          ])
        : "- none",
    ]),
    renderSection("Split Readiness", [
      "split_readiness is the authoritative later-step gate for Step 5 and later consumers; it stays aligned with warning, blocking, and carried-forward constraint detail.",
      "",
      ...renderReadinessLines(artifact),
      "",
      ...renderKeyValueLines([
        ["Status", artifact.split_readiness.status],
        ["Summary", artifact.split_readiness.summary],
        ["Execution Scope", artifact.split_readiness.execution_scope],
        ["Blocked Workstream Count", artifact.split_readiness.blocked_workstream_count],
        ["Partially Blocked Item Count", artifact.split_readiness.partially_blocked_item_count],
        ["Merge-Order Rule Count", artifact.split_readiness.merge_order_rule_count],
        ["Later-Step Gate", artifact.split_readiness.later_step_gate],
        ["Material Execution Limits", artifact.split_readiness.material_execution_limits.join(", ") || null],
        ["Partial Output", artifact.split_readiness.partial_output?.code ?? null],
        ["Constraining Concern IDs", artifact.split_readiness.constraining_concern_ids.join(", ") || null],
      ]),
      "",
      "### Warning Items",
      "",
      renderIssueList(artifact.split_readiness.warning_items),
      "",
      "### Blocking Issues",
      "",
      renderIssueList(artifact.split_readiness.blocking_issues),
      "",
      "### Recommended Actions",
      "",
      renderList(artifact.split_readiness.recommended_user_actions),
    ]),
    renderSection("Boundary Notes", [renderList([...artifact.boundaryNotes])]),
    renderSection("Deferred Capabilities", [renderList([...artifact.writePolicy.deferredCapabilities])]),
    renderSection("Allowed Side Effects", [renderList([...artifact.writePolicy.allowedSideEffects])]),
    renderSection("Disallowed Capabilities", [renderList([...artifact.writePolicy.disallowedCapabilities])]),
    renderSection("Output Files", [
      "split.json and reports/split-report.md are the durable Step 4 outputs.",
      "split.json and reports/split-report.md remain the authoritative Step 4 outputs.",
      "Debug files are optional internal mirrors and are only written when FORGE_SPLIT_DEBUG=1.",
      "Debug files are optional internal mirrors and never replace the durable Step 4 outputs.",
      "",
      ...renderKeyValueLines([
        ["Requested Output Root", artifact.requestedOutputRoot],
        ["Output Root", artifact.outputRoot],
        ["Allowed Root", artifact.writePolicy.allowedRoot],
        ["Artifact Path", artifact.files.artifactPath],
        ["Report Path", artifact.files.reportPath],
        ["Debug Artifact Path", artifact.files.debugArtifactPath],
        ["Debug Workstreams Path", artifact.files.debugWorkstreamsPath],
        ["Debug Merge Order Path", artifact.files.debugMergeOrderPath],
        ["Debug Blocked Items Path", artifact.files.debugBlockedItemsPath],
        ["Debug Stream Constraints Path", artifact.files.debugStreamConstraintsPath],
        ["Debug Split Readiness Path", artifact.files.debugReadinessPath],
      ]),
    ]),
    renderSection("Failure", [renderFailureDetails(artifact.failure)]),
    renderSection("Summary", [
      ...renderKeyValueLines([
        ["Status", artifact.status],
        ["Summary", artifact.summary],
      ]),
    ]),
  ];

  const headings = sections
    .flatMap((section) => section.split("\n"))
    .filter((line) => line.startsWith("## "))
    .map((line) => line.replace("## ", ""));

  if (headings.join("|") !== REQUIRED_HEADINGS.join("|")) {
    throw new Error("Split report heading contract drifted from the required order.");
  }

  return [
    "# Forge Split Report",
    "",
    sections.join("\n\n"),
    "",
  ].join("\n");
}
