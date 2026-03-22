import type {
  PlanArtifact,
  PlanArtifactCarryForward,
} from "./types.js";

const REQUIRED_REPORT_HEADINGS = [
  "Overview",
  "Purpose",
  "Source Intake",
  "Plan Item Contract",
  "Plan Items",
  "Dependencies",
  "Conflict Zones",
  "Test Obligations",
  "Parallelization",
  "Carry-Forward Context",
  "Planning Readiness",
  "Boundary Notes",
  "Deferred Capabilities",
  "Allowed Side Effects",
  "Disallowed Capabilities",
  "Output Files",
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

function renderKeyValueList(entries: Array<[string, string | number | boolean | null]>): string[] {
  return entries.map(([key, value]) => `- ${key}: ${value === null ? "none" : value}`);
}

function renderPlanItemContractSection(artifact: PlanArtifact): string {
  return renderSection("Plan Item Contract", [
    "This section freezes the plan-item contract that later Step 2 batches will populate.",
    "",
    "### Required Fields",
    "",
    renderList([...artifact.plan_item_contract.requiredFields]),
    "",
    "### Categories",
    "",
    renderList([...artifact.plan_item_contract.categories]),
    "",
    "### Dependency Types",
    "",
    renderList([...artifact.plan_item_contract.dependencyTypes]),
    "",
    "### Risk Levels",
    "",
    renderList([...artifact.plan_item_contract.riskLevels]),
    "",
    "### Test Obligation Categories",
    "",
    renderList([...artifact.plan_item_contract.testObligationCategories]),
    "",
    "### Verification Categories",
    "",
    renderList([...artifact.plan_item_contract.verificationCategories]),
    "",
    "### Parallelization Signals",
    "",
    renderList([...artifact.plan_item_contract.parallelizationSignals]),
  ]);
}

function renderEmptySection(title: string): string {
  return renderSection(title, ["- none"]);
}

function renderCarryForwardRiskAnalysis(
  carryForward: PlanArtifactCarryForward,
): string {
  return renderList([
    ...carryForward.risk_analysis.initial_risk_zones.map(
      (zone) => `\`${zone.code}\` (${zone.level}) - ${zone.reason}`,
    ),
    ...carryForward.risk_analysis.derived_risk_zones.map(
      (zone) => `\`${zone.code}\` (${zone.level}) - ${zone.reason}`,
    ),
  ]);
}

function renderCarryForwardContextSection(artifact: PlanArtifact): string {
  const taskSpec = artifact.carry_forward.task_spec;
  const repoContext = artifact.carry_forward.repo_context;
  const candidateTargets = artifact.carry_forward.candidate_targets;
  const verificationTargets = artifact.carry_forward.initial_verification_targets;
  const readiness = artifact.carry_forward.next_step_readiness;

  return renderSection("Carry-Forward Context", [
    "This section preserves the Step 1 planning handoff exactly as Step 2 received it.",
    "",
    "### Task Spec",
    "",
    ...renderKeyValueList([
      ["Title", taskSpec.title ?? null],
      ["Summary", taskSpec.summary ?? null],
      ["Goal", taskSpec.goal],
      ["Acceptance Criteria", taskSpec.acceptance_criteria.length],
      ["Has Acceptance Criteria", taskSpec.has_acceptance_criteria],
    ]),
    "",
    "### Repo Context",
    "",
    ...renderKeyValueList([
      ["Grounded", repoContext.grounded],
      ["Source Files", repoContext.source_files.length],
      ["Test Files", repoContext.test_files.length],
      ["Manifest Files", repoContext.manifest_files.length],
      ["Languages", repoContext.languages.join(", ") || null],
      ["Package Manager", repoContext.package_manager],
      ["Layout Summary", repoContext.layout_summary],
    ]),
    "",
    "### Candidate Targets",
    "",
    renderList(
      candidateTargets.map((item) => {
        const notes = item.notes.length > 0 ? ` [notes: ${item.notes.join("; ")}]` : "";
        const sharedRisk = ` [shared risk: ${item.shared_risk ? "yes" : "no"}]`;
        return `\`${item.path}\` (${item.kind}, ${item.match_type}) - ${item.reason}${notes}${sharedRisk}`;
      }),
    ),
    "",
    "### Risk Analysis",
    "",
    renderCarryForwardRiskAnalysis(artifact.carry_forward),
    "",
    "### Initial Verification Targets",
    "",
    renderList(
      verificationTargets.map((target) => {
        const category = target.category ? `, ${target.category}` : "";
        return `\`${target.path}\` (${target.kind}${category}) - ${target.reason}`;
      }),
    ),
    "",
    "### Ambiguities",
    "",
    renderList(artifact.carry_forward.ambiguities),
    "",
    "### Warnings",
    "",
    renderList(artifact.carry_forward.warnings),
    "",
    "### Confidence",
    "",
    ...renderKeyValueList([
      ["Level", artifact.carry_forward.confidence.level],
      ["Task Parsing", artifact.carry_forward.confidence.signals.task_parsing],
      ["Repo Inspection", artifact.carry_forward.confidence.signals.repo_inspection],
      ["Targeting", artifact.carry_forward.confidence.signals.targeting],
    ]),
    "",
    renderList(artifact.carry_forward.confidence.reasons),
    "",
    "### Next Step Readiness",
    "",
    ...renderKeyValueList([
      ["Ready", readiness.ready],
      ["Blocking Issues", readiness.blocking_issues.length],
      ["Recommended Actions", readiness.recommended_user_actions.length],
    ]),
  ]);
}

function renderPlanningReadinessSection(artifact: PlanArtifact): string {
  const readiness = artifact.planning_readiness;

  return renderSection("Planning Readiness", [
    readiness.ready
      ? "Forge plan is ready for later workflow steps."
      : "Forge plan is blocked until the remaining Step 1 issues are addressed.",
    "",
    ...renderKeyValueList([
      ["Ready", readiness.ready],
      ["Blocking Issues", readiness.blocking_issues.length],
      ["Recommended Actions", readiness.recommended_user_actions.length],
    ]),
    "",
    "### Blocking Issues",
    "",
    renderList(
      readiness.blocking_issues.map((issue) => `\`${issue.code}\`: ${issue.message}`),
    ),
    "",
    "### Recommended Actions",
    "",
    renderList(readiness.recommended_user_actions),
  ]);
}

function renderOutputFilesSection(artifact: PlanArtifact): string {
  return renderSection("Output Files", [
    "These are the durable files produced for this plan run.",
    ...renderKeyValueList([
      ["Artifact", artifact.files.artifactPath],
      ["Report", artifact.files.reportPath],
      ["Output Root", artifact.outputRoot],
    ]),
  ]);
}

function renderFailureSection(artifact: PlanArtifact): string {
  if (!artifact.failure) {
    return renderSection("Failure", ["- none"]);
  }

  return renderSection("Failure", [
    `- Code: \`${artifact.failure.code}\``,
    `- Message: ${artifact.failure.message}`,
    artifact.failure.fallbackReason
      ? `- Fallback: ${artifact.failure.fallbackReason}`
      : "- Fallback: none",
  ]);
}

export function createPlanReport(artifact: PlanArtifact): string {
  const sections = [
    renderSection("Overview", [
      `Forge plan completed with status \`${artifact.status}\`.`,
      ...renderKeyValueList([
        ["Command", artifact.command],
        ["Stage", artifact.stage],
        ["Repo Root", artifact.repoRoot],
        ["Output Root", artifact.outputRoot],
        ["Requested Output Root", artifact.requestedOutputRoot],
        ["Planning Readiness", artifact.planning_readiness.ready],
      ]),
    ]),
    renderSection("Purpose", [artifact.purpose]),
    renderSection("Source Intake", [
      "This section records the persisted Step 1 handoff consumed by `forge plan`.",
      ...renderKeyValueList([
        ["Artifact Path", artifact.source_intake.artifactPath],
        ["Command", artifact.source_intake.command],
        ["Status", artifact.source_intake.status],
        ["Summary", artifact.source_intake.summary],
        ["Ready For Planning", artifact.source_intake.readyForPlanning],
      ]),
    ]),
    renderPlanItemContractSection(artifact),
    renderEmptySection("Plan Items"),
    renderEmptySection("Dependencies"),
    renderEmptySection("Conflict Zones"),
    renderEmptySection("Test Obligations"),
    renderEmptySection("Parallelization"),
    renderCarryForwardContextSection(artifact),
    renderPlanningReadinessSection(artifact),
    renderSection("Boundary Notes", [renderList(artifact.boundaryNotes)]),
    renderSection("Deferred Capabilities", [renderList([...artifact.writePolicy.deferredCapabilities])]),
    renderSection("Allowed Side Effects", [renderList([...artifact.writePolicy.allowedSideEffects])]),
    renderSection("Disallowed Capabilities", [renderList([...artifact.writePolicy.disallowedCapabilities])]),
    renderOutputFilesSection(artifact),
    renderFailureSection(artifact),
    renderSection("Summary", [artifact.summary]),
  ];

  const headings = sections
    .flatMap((section) => section.split("\n"))
    .filter((line) => line.startsWith("## "))
    .map((line) => line.replace("## ", ""));

  if (headings.join("|") !== REQUIRED_REPORT_HEADINGS.join("|")) {
    throw new Error("Plan report heading contract drifted from the required order.");
  }

  return [
    "# Forge Plan Report",
    "",
    sections.join("\n\n"),
    "",
  ].join("\n");
}
