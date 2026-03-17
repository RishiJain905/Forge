import type { IntakeArtifact } from "./types.js";

function renderList(items: string[]): string {
  if (items.length === 0) {
    return "- none";
  }

  return items.map((item) => `- ${item}`).join("\n");
}

function renderCandidateTargets(
  items: IntakeArtifact["candidate_targets"],
): string {
  if (items.length === 0) {
    return "- none";
  }

  return items
    .map((item) => `- \`${item.path}\` (${item.kind}, ${item.match_type}) - ${item.reason}`)
    .join("\n");
}

function renderInitialVerificationTargets(
  items: IntakeArtifact["initial_verification_targets"],
): string {
  if (items.length === 0) {
    return "- none";
  }

  return items
    .map((item) => `- \`${item.path}\` (${item.kind}) - ${item.reason}`)
    .join("\n");
}

function renderBlockingIssues(
  items: IntakeArtifact["next_step_readiness"]["blocking_issues"],
): string {
  if (items.length === 0) {
    return "- none";
  }

  return items.map((item) => `- \`${item.code}\`: ${item.message}`).join("\n");
}

function renderRiskAnalysis(
  items: IntakeArtifact["risk_analysis"]["initial_risk_zones"],
): string {
  if (items.length === 0) {
    return "- none";
  }

  return items
    .map((item) => {
      const evidence = item.evidence_paths.length > 0
        ? ` [evidence: ${item.evidence_paths.join(", ")}]`
        : "";
      return `- \`${item.code}\` (${item.level}) - ${item.reason}${evidence}`;
    })
    .join("\n");
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
    `- Goal: ${artifact.task_spec.goal || "none"}`,
    `- Acceptance criteria present: \`${artifact.task_spec.has_acceptance_criteria}\``,
    "",
    renderList(artifact.task_spec.acceptance_criteria),
    "",
    "## Repo Context",
    "",
    `- Grounded: \`${artifact.repo_context.grounded}\``,
    `- Source files found: ${artifact.repo_context.source_files.length}`,
    `- Test files found: ${artifact.repo_context.test_files.length}`,
    `- Manifest files found: ${artifact.repo_context.manifest_files.length}`,
    "",
    "## Candidate Targets",
    "",
    renderCandidateTargets(artifact.candidate_targets),
    "",
    "## Risk Analysis",
    "",
    renderRiskAnalysis(artifact.risk_analysis.initial_risk_zones),
    "",
    "## Initial Verification Targets",
    "",
    renderInitialVerificationTargets(artifact.initial_verification_targets),
    "",
    "## Ambiguities",
    "",
    renderList(artifact.ambiguities),
    "",
    "## Confidence",
    "",
    `- Level: \`${artifact.confidence.level}\``,
    `- Task parsing: \`${artifact.confidence.signals.task_parsing}\``,
    `- Repo inspection: \`${artifact.confidence.signals.repo_inspection}\``,
    `- Targeting: \`${artifact.confidence.signals.targeting}\``,
    "",
    renderList(artifact.confidence.reasons),
    "",
    "## Next Step Readiness",
    "",
    `- Ready for \`forge plan\`: \`${artifact.next_step_readiness.ready}\``,
    "",
    "### Blocking Issues",
    "",
    renderBlockingIssues(artifact.next_step_readiness.blocking_issues),
    "",
    "### Recommended User Actions",
    "",
    renderList(artifact.next_step_readiness.recommended_user_actions),
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
    artifact.files.artifactPath
      ? `- Artifact: \`${artifact.files.artifactPath}\``
      : "- Artifact: none",
    artifact.files.reportPath
      ? `- Report: \`${artifact.files.reportPath}\``
      : "- Report: none",
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
