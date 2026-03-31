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
    .map((entry) => `- ${entry.order}: ${entry.workstreamId} - ${entry.reason}`)
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
      "Blocked items mirror the upstream Step 3 blockers instead of re-deriving new Step 4 blockers.",
      "",
      renderIssueList(artifact.blocked_items),
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
    ]),
    renderSection("Split Diagnostics", [
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
      ...renderKeyValueLines([
        ["Ready", artifact.split_readiness.ready],
        ["Status", artifact.split_readiness.status],
        ["Summary", artifact.split_readiness.summary],
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
      "Debug files are optional internal mirrors and are only written when FORGE_SPLIT_DEBUG=1.",
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
