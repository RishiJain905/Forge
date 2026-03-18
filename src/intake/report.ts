import type { IntakeArtifact } from "./types.js";

const REQUIRED_REPORT_HEADINGS = [
  "Overview",
  "Purpose",
  "Source Inputs",
  "Runtime Options",
  "Task Spec",
  "Repo Context",
  "Candidate Targets",
  "Assumptions",
  "Risk Analysis",
  "Initial Verification Targets",
  "Ambiguities",
  "Confidence",
  "Next Step Readiness",
  "Boundary Notes",
  "Deferred Capabilities",
  "Allowed Side Effects",
  "Disallowed Capabilities",
  "Output Files",
  "Warnings",
  "Failure",
  "Summary",
] as const;

function renderList(items: string[]): string {
  if (items.length === 0) {
    return "- none";
  }

  return items.map((item) => `- ${item}`).join("\n");
}

function renderSection(title: string, lines: string[]): string {
  return [
    `## ${title}`,
    "",
    ...lines,
  ].join("\n");
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

function hasRiskZone(
  artifact: IntakeArtifact,
  code: IntakeArtifact["risk_analysis"]["initial_risk_zones"][number]["code"],
): boolean {
  return artifact.risk_analysis.initial_risk_zones.some((zone) => zone.code === code);
}

function buildAssumptions(artifact: IntakeArtifact): string[] {
  const assumptions: string[] = [];

  if (artifact.input_mode === "prompt") {
    assumptions.push("The inline prompt is the authoritative task source for this run.");
  } else if (artifact.input_mode === "spec" && artifact.source_inputs?.primary_input.path) {
    assumptions.push(
      `The spec file \`${artifact.source_inputs.primary_input.path}\` is the authoritative task source for this run.`,
    );
  }

  if (artifact.candidate_targets.some((item) => item.match_type === "fallback")) {
    assumptions.push(
      "Candidate targets marked `fallback` were inferred from repo structure rather than explicit task-to-file references.",
    );
  }

  if (!artifact.repo_context.grounded || hasRiskZone(artifact, "weak_repo_grounding")) {
    assumptions.push(
      "Repo grounding is partial, so later planning should treat repository coverage as incomplete.",
    );
  }

  if (artifact.repo_context.test_files.length === 0) {
    assumptions.push(
      "No test files were grounded, so later validation may need explicit test-path confirmation.",
    );
  }

  return assumptions;
}

function renderOverviewSection(artifact: IntakeArtifact): string {
  const readinessText = artifact.next_step_readiness.ready
    ? "ready for `forge plan`"
    : "not ready for `forge plan`";

  return renderSection("Overview", [
    `Forge intake completed with status \`${artifact.status}\` and is ${readinessText}.`,
    `- Command: \`${artifact.command}\``,
    `- Stage: \`${artifact.stage}\``,
    `- Repo root: \`${artifact.repoRoot}\``,
    `- Output root: \`${artifact.outputRoot}\``,
  ]);
}

function renderPurposeSection(artifact: IntakeArtifact): string {
  return renderSection("Purpose", [artifact.purpose]);
}

function renderSourceInputsSection(artifact: IntakeArtifact): string {
  return renderSection("Source Inputs", [
    "This section records the normalized task inputs captured during intake.",
    `- Input mode: \`${artifact.input_mode ?? "none"}\``,
    artifact.source_inputs?.primary_input.path
      ? `- Primary input path: \`${artifact.source_inputs.primary_input.path}\``
      : "- Primary input path: none",
    `- Notes count: ${artifact.source_inputs?.notes.length ?? 0}`,
    `- Constraints count: ${artifact.source_inputs?.constraints.length ?? 0}`,
    artifact.source_inputs?.config_path
      ? `- Config path: \`${artifact.source_inputs.config_path}\``
      : "- Config path: none",
    artifact.source_inputs?.focus_paths.length
      ? `- Focus paths: ${artifact.source_inputs.focus_paths.join(", ")}`
      : "- Focus paths: none",
  ]);
}

function renderRuntimeOptionsSection(artifact: IntakeArtifact): string {
  return renderSection("Runtime Options", [
    "These runtime selections shaped how intake persisted its outputs for this run.",
    `- Output mode: \`${artifact.runtime_options.output_mode}\``,
    `- LLM mode: \`${artifact.runtime_options.llm_mode}\``,
    `- Strict focus: \`${artifact.runtime_options.strict_focus}\``,
    `- Fail on low confidence: \`${artifact.runtime_options.fail_on_low_confidence}\``,
  ]);
}

function renderTaskSpecSection(artifact: IntakeArtifact): string {
  const taskSpecLines = [
    "This is the normalized task understanding that later workflow steps will consume.",
    `- Title: ${artifact.task_spec.title || "none"}`,
    `- Summary: ${artifact.task_spec.summary || "none"}`,
    `- Goal: ${artifact.task_spec.goal || "none"}`,
    artifact.task_spec.scope.length > 0
      ? `- Scope: ${artifact.task_spec.scope.join(", ")}`
      : "- Scope: none",
    `- Acceptance criteria present: \`${artifact.task_spec.has_acceptance_criteria}\``,
    "",
    "### Acceptance Criteria",
    "",
    renderList(artifact.task_spec.acceptance_criteria),
    "",
    "### Explicit Requirements",
    "",
    renderList(artifact.task_spec.explicit_requirements),
    "",
    "### Implementation Necessities",
    "",
    renderList(artifact.task_spec.implementation_necessities),
    "",
    "### Constraints",
    "",
    renderList(artifact.task_spec.constraints),
    "",
    "### Mentioned Paths",
    "",
    renderList(artifact.task_spec.mentioned_paths),
    "",
    "### Mentioned Tests",
    "",
    renderList(artifact.task_spec.mentioned_tests),
    "",
    "### Mentioned Modules",
    "",
    renderList(artifact.task_spec.mentioned_modules),
    "",
    "### Risky Phrases",
    "",
    renderList(artifact.task_spec.risky_phrases),
    "",
    "### Open Questions",
    "",
    renderList(artifact.task_spec.open_questions.map((question) => `${question.category}: ${question.text}`)),
  ];

  return renderSection("Task Spec", [
    ...taskSpecLines,
  ]);
}

function renderRepoContextSection(artifact: IntakeArtifact): string {
  const gitContext = artifact.repo_context.git_context;

  return renderSection("Repo Context", [
    "Repo grounding summarizes the concrete repository evidence intake found.",
    `- Grounded: \`${artifact.repo_context.grounded}\``,
    `- Source files found: ${artifact.repo_context.source_files.length}`,
    `- Test files found: ${artifact.repo_context.test_files.length}`,
    `- Manifest files found: ${artifact.repo_context.manifest_files.length}`,
    artifact.repo_context.languages.length > 0
      ? `- Languages: ${artifact.repo_context.languages.join(", ")}`
      : "- Languages: none",
    artifact.repo_context.framework_hints.length > 0
      ? `- Framework Hints: ${artifact.repo_context.framework_hints.join(", ")}`
      : "- Framework Hints: none",
    artifact.repo_context.package_manager
      ? `- Package Manager: ${artifact.repo_context.package_manager}`
      : "- Package Manager: none",
    artifact.repo_context.key_directories.length > 0
      ? `- Key Directories: ${artifact.repo_context.key_directories.join(", ")}`
      : "- Key Directories: none",
    artifact.repo_context.entry_points.length > 0
      ? `- Entry Points: ${artifact.repo_context.entry_points.join(", ")}`
      : "- Entry Points: none",
    artifact.repo_context.test_framework_hints.length > 0
      ? `- Test Framework Hints: ${artifact.repo_context.test_framework_hints.join(", ")}`
      : "- Test Framework Hints: none",
    artifact.repo_context.test_command_hints.length > 0
      ? `- Test Command Hints: ${artifact.repo_context.test_command_hints.join(", ")}`
      : "- Test Command Hints: none",
    artifact.repo_context.ci_hints.length > 0
      ? `- CI Hints: ${artifact.repo_context.ci_hints.join(", ")}`
      : "- CI Hints: none",
    `- Layout Summary: ${artifact.repo_context.layout_summary}`,
    `- Git status: \`${gitContext.status}\``,
    gitContext.repo_root
      ? `- Git repo root: \`${gitContext.repo_root}\``
      : "- Git repo root: none",
    gitContext.branch
      ? `- Git branch: \`${gitContext.branch}\``
      : "- Git branch: none",
    "",
    "### Recent Git Files",
    "",
    renderList(gitContext.recent_files),
  ]);
}

function renderCandidateTargetsSection(artifact: IntakeArtifact): string {
  return renderSection("Candidate Targets", [
    "These are the most plausible files or surfaces for the next workflow step.",
    renderCandidateTargets(artifact.candidate_targets),
  ]);
}

function renderAssumptionsSection(artifact: IntakeArtifact): string {
  return renderSection("Assumptions", [
    "These assumptions are derived directly from the final artifact state.",
    renderList(buildAssumptions(artifact)),
  ]);
}

function renderRiskAnalysisSection(artifact: IntakeArtifact): string {
  return renderSection("Risk Analysis", [
    "Initial risk zones call out areas where later planning or verification should be more careful.",
    renderRiskAnalysis(artifact.risk_analysis.initial_risk_zones),
  ]);
}

function renderInitialVerificationTargetsSection(artifact: IntakeArtifact): string {
  return renderSection("Initial Verification Targets", [
    "These are pointer-only verification surfaces identified during intake.",
    renderInitialVerificationTargets(artifact.initial_verification_targets),
  ]);
}

function renderAmbiguitiesSection(artifact: IntakeArtifact): string {
  return renderSection("Ambiguities", [
    "Open questions stay explicit here so later steps do not silently assume missing intent.",
    renderList(artifact.ambiguities),
  ]);
}

function renderConfidenceSection(artifact: IntakeArtifact): string {
  const lead = artifact.confidence.level === "high"
    ? "Confidence is `high` based on explicit task and repo evidence."
    : artifact.confidence.level === "medium"
    ? "Confidence is `medium`, so later planning should still validate key assumptions."
    : "Confidence is `low`, so later planning should treat this result as provisional.";

  return renderSection("Confidence", [
    lead,
    `- Level: \`${artifact.confidence.level}\``,
    `- Task parsing: \`${artifact.confidence.signals.task_parsing}\``,
    `- Repo inspection: \`${artifact.confidence.signals.repo_inspection}\``,
    `- Targeting: \`${artifact.confidence.signals.targeting}\``,
    "",
    renderList(artifact.confidence.reasons),
  ]);
}

function renderNextStepReadinessSection(artifact: IntakeArtifact): string {
  return renderSection("Next Step Readiness", [
    artifact.next_step_readiness.ready
      ? "Intake is ready for `forge plan` on the current artifact state."
      : "Intake is not ready for `forge plan` because blocking issues remain.",
    `- Ready for \`forge plan\`: \`${artifact.next_step_readiness.ready}\``,
    "",
    "### Blocking Issues",
    "",
    renderBlockingIssues(artifact.next_step_readiness.blocking_issues),
    "",
    "### Recommended User Actions",
    "",
    renderList(artifact.next_step_readiness.recommended_user_actions),
  ]);
}

function renderBoundaryNotesSection(artifact: IntakeArtifact): string {
  return renderSection("Boundary Notes", [
    "Boundary notes document what intake intentionally defers to later workflow steps.",
    renderList(artifact.boundaryNotes),
  ]);
}

function renderOutputFilesSection(artifact: IntakeArtifact): string {
  return renderSection("Output Files", [
    "These are the durable files produced for this run.",
    artifact.files.artifactPath
      ? `- Artifact: \`${artifact.files.artifactPath}\``
      : "- Artifact: none",
    artifact.files.reportPath
      ? `- Report: \`${artifact.files.reportPath}\``
      : "- Report: none",
  ]);
}

function renderFailureSection(artifact: IntakeArtifact): string {
  if (!artifact.failure) {
    return renderSection("Failure", ["- none"]);
  }

  return renderSection("Failure", [
    "Failure details are reported directly from the final artifact state.",
    `- Code: \`${artifact.failure.code}\``,
    `- Message: ${artifact.failure.message}`,
    artifact.failure.fallbackReason
      ? `- Fallback: ${artifact.failure.fallbackReason}`
      : "- Fallback: none",
  ]);
}

function renderSummarySection(artifact: IntakeArtifact): string {
  return renderSection("Summary", [artifact.summary]);
}

export function createIntakeReport(artifact: IntakeArtifact): string {
  const sections = [
    renderOverviewSection(artifact),
    renderPurposeSection(artifact),
    renderSourceInputsSection(artifact),
    renderRuntimeOptionsSection(artifact),
    renderTaskSpecSection(artifact),
    renderRepoContextSection(artifact),
    renderCandidateTargetsSection(artifact),
    renderAssumptionsSection(artifact),
    renderRiskAnalysisSection(artifact),
    renderInitialVerificationTargetsSection(artifact),
    renderAmbiguitiesSection(artifact),
    renderConfidenceSection(artifact),
    renderNextStepReadinessSection(artifact),
    renderBoundaryNotesSection(artifact),
    renderSection("Deferred Capabilities", [
      "These later workflow stages are intentionally deferred by intake.",
      renderList([...artifact.writePolicy.deferredCapabilities]),
    ]),
    renderSection("Allowed Side Effects", [
      "These side effects are the only writes intake is allowed to perform.",
      renderList([...artifact.writePolicy.allowedSideEffects]),
    ]),
    renderSection("Disallowed Capabilities", [
      "These capabilities are explicitly out of scope for Step 1 intake.",
      renderList([...artifact.writePolicy.disallowedCapabilities]),
    ]),
    renderOutputFilesSection(artifact),
    renderSection("Warnings", [
      "Warnings are non-blocking signals that still deserve attention before later steps.",
      renderList(artifact.warnings),
    ]),
    renderFailureSection(artifact),
    renderSummarySection(artifact),
  ];

  const headings = sections
    .flatMap((section) => section.split("\n"))
    .filter((line) => line.startsWith("## "))
    .map((line) => line.replace("## ", ""));

  if (headings.join("|") !== REQUIRED_REPORT_HEADINGS.join("|")) {
    throw new Error("Intake report heading contract drifted from the required order.");
  }

  return [
    "# Forge Intake Report",
    "",
    sections.join("\n\n"),
    "",
  ].join("\n");
}
