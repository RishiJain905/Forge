import type { IntakeArtifact } from "./types.js";

function renderList(items: string[]): string {
  if (items.length === 0) {
    return "- none";
  }

  return items.map((item) => `- ${item}`).join("\n");
}

function renderCandidateTargets(
  items: IntakeArtifact["candidateTargets"],
): string {
  if (items.length === 0) {
    return "- none";
  }

  return items
    .map((item) => `- \`${item.path}\` (${item.kind}, ${item.matchType}) - ${item.reason}`)
    .join("\n");
}

function renderBlockingIssues(
  items: IntakeArtifact["nextStepReadiness"]["blockingIssues"],
): string {
  if (items.length === 0) {
    return "- none";
  }

  return items.map((item) => `- \`${item.code}\`: ${item.message}`).join("\n");
}

export function createIntakeReport(artifact: IntakeArtifact): string {
  const failureSection = artifact.failure
    ? [
        "## Failure",
        "",
        `- Code: \`${artifact.failure.code}\``,
        `- Message: ${artifact.failure.message}`,
        artifact.failure.fallbackReason
          ? `- Fallback: ${artifact.failure.fallbackReason}`
          : "- Fallback: none",
      ].join("\n")
    : [
        "## Failure",
        "",
        "- none",
      ].join("\n");

  return [
    "# Forge Intake Report",
    "",
    `- Status: \`${artifact.status}\``,
    `- Command: \`${artifact.command}\``,
    `- Stage: \`${artifact.stage}\``,
    `- Repo root: \`${artifact.repoRoot}\``,
    `- Output root: \`${artifact.outputRoot}\``,
    "",
    "## Purpose",
    "",
    artifact.purpose,
    "",
    "## Source Inputs",
    "",
    `- Input mode: \`${artifact.input_mode ?? "none"}\``,
    `- Primary input path: ${artifact.source_inputs?.primary_input.path ?? "none"}`,
    `- Notes count: ${artifact.source_inputs?.notes.length ?? 0}`,
    `- Constraints count: ${artifact.source_inputs?.constraints.length ?? 0}`,
    `- Config path: ${artifact.source_inputs?.config_path ?? "none"}`,
    `- Focus paths: ${artifact.source_inputs?.focus_paths.join(", ") || "none"}`,
    "",
    "## Runtime Options",
    "",
    `- Output mode: \`${artifact.runtime_options.output_mode}\``,
    `- LLM mode: \`${artifact.runtime_options.llm_mode}\``,
    `- Fail on low confidence: \`${artifact.runtime_options.fail_on_low_confidence}\``,
    "",
    "## Task Spec",
    "",
    `- Goal: ${artifact.taskSpec.goal || "none"}`,
    `- Acceptance criteria present: \`${artifact.taskSpec.hasAcceptanceCriteria}\``,
    "",
    renderList(artifact.taskSpec.acceptanceCriteria),
    "",
    "## Repo Context",
    "",
    `- Grounded: \`${artifact.repoContext.grounded}\``,
    `- Source files found: ${artifact.repoContext.sourceFiles.length}`,
    `- Test files found: ${artifact.repoContext.testFiles.length}`,
    `- Manifest files found: ${artifact.repoContext.manifestFiles.length}`,
    "",
    "## Candidate Targets",
    "",
    renderCandidateTargets(artifact.candidateTargets),
    "",
    "## Ambiguities",
    "",
    renderList(artifact.ambiguities),
    "",
    "## Next Step Readiness",
    "",
    `- Ready for \`forge plan\`: \`${artifact.nextStepReadiness.ready}\``,
    "",
    "### Blocking Issues",
    "",
    renderBlockingIssues(artifact.nextStepReadiness.blockingIssues),
    "",
    "### Recommended User Actions",
    "",
    renderList(artifact.nextStepReadiness.recommendedUserActions),
    "",
    "## Boundary Notes",
    "",
    renderList(artifact.boundaryNotes),
    "",
    "## Deferred Capabilities",
    "",
    renderList([...artifact.writePolicy.deferredCapabilities]),
    "",
    "## Allowed Side Effects",
    "",
    renderList([...artifact.writePolicy.allowedSideEffects]),
    "",
    "## Disallowed Capabilities",
    "",
    renderList([...artifact.writePolicy.disallowedCapabilities]),
    "",
    "## Output Files",
    "",
    `- Artifact: \`${artifact.files.artifactPath}\``,
    `- Report: \`${artifact.files.reportPath}\``,
    "",
    "## Warnings",
    "",
    renderList(artifact.warnings),
    "",
    failureSection,
    "",
    "## Summary",
    "",
    artifact.summary,
    "",
  ].join("\n");
}
