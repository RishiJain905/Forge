import type {
  PlanArtifact,
  PlanArtifactCarryForward,
  PlanAssistResolution,
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

function planningAssistLabel(planningAssist?: PlanAssistResolution): string {
  if (!planningAssist) {
    return "not_attempted";
  }

  return planningAssist.outcome;
}

function renderPlanItemContractSection(artifact: PlanArtifact): string {
  return renderSection("Plan Item Contract", [
    "This section freezes the stable Step 2 plan-item contract that later steps can consume directly.",
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

function renderPlanItemsSection(artifact: PlanArtifact): string {
  if (artifact.plan_items.length === 0) {
    return renderSection("Plan Items", ["- none"]);
  }

  const lines = artifact.plan_items.flatMap((item) => {
    const carryForwardSummary = artifact.carry_forward.concerns
      .filter((concern) => concern.planItemIds.includes(item.id))
      .map((concern) => `\`${concern.id}\` (${concern.source})`)
      .join(", ");
    const dependencySummary = item.dependencies.length > 0
      ? item.dependencies.map((dependency) => `\`${dependency.planItemId}\` (${dependency.type})`).join(", ")
      : "none";
    const verificationSummary = item.verificationRelevance.categories.length > 0
      ? item.verificationRelevance.categories.join(", ")
      : "none";
    const testObligationSummary = item.testObligations.map((obligation) => obligation.category).join(", ");

    return [
      `- \`${item.id}\` (${item.category}, risk: ${item.riskLevel}) - ${item.title}`,
      `- Paths: ${item.likelyAffectedPaths.join(", ")}`,
      `- Requirements: ${item.sourceRequirements.join("; ")}`,
      `- Dependencies: ${dependencySummary}`,
      `- Verification: relevant=${item.verificationRelevance.relevant}; categories=${verificationSummary}`,
      `- Test Obligations: ${testObligationSummary}`,
      `- Parallelization: ${item.parallelization.signal} - ${item.parallelization.reason}`,
      `- Carry-Forward: ${carryForwardSummary || "none"}`,
    ];
  });

  return renderSection("Plan Items", lines);
}

function renderDependenciesSection(artifact: PlanArtifact): string {
  if (artifact.dependency_graph.length === 0) {
    return renderSection("Dependencies", ["- none"]);
  }

  return renderSection(
    "Dependencies",
    artifact.dependency_graph.map((dependency) =>
      `- \`${dependency.planItemId}\` depends on \`${dependency.dependsOnPlanItemId}\` (${dependency.type}) - ${dependency.reason}`),
  );
}

function renderConflictZonesSection(artifact: PlanArtifact): string {
  if (artifact.conflict_zones.length === 0) {
    return renderSection("Conflict Zones", ["- none"]);
  }

  return renderSection(
    "Conflict Zones",
    artifact.conflict_zones.flatMap((zone) => [
      `- \`${zone.id}\` (${zone.riskLevel}) - ${zone.title}`,
      `- Paths: ${zone.paths.join(", ")}`,
      `- Plan Items: ${zone.planItemIds.join(", ")}`,
      `- Reason: ${zone.reason}`,
    ]),
  );
}

function renderTestObligationsSection(artifact: PlanArtifact): string {
  if (artifact.test_obligations.length === 0) {
    return renderSection("Test Obligations", ["- none"]);
  }

  return renderSection(
    "Test Obligations",
    artifact.test_obligations.map((entry) =>
      `- \`${entry.planItemId}\` -> ${entry.category} - ${entry.reason}`),
  );
}

function renderParallelizationSection(artifact: PlanArtifact): string {
  if (artifact.parallelization_signals.length === 0) {
    return renderSection("Parallelization", ["- none"]);
  }

  return renderSection(
    "Parallelization",
    artifact.parallelization_signals.map((entry) =>
      `- \`${entry.planItemId}\` -> ${entry.signal} - ${entry.reason}`),
  );
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
    "### Derived Concerns",
    "",
    renderList(
      artifact.carry_forward.concerns.map((concern) => {
        const code = concern.code ? ` [code: ${concern.code}]` : "";
        return `\`${concern.id}\` (${concern.source})${code} - ${concern.message} [plan items: ${concern.planItemIds.join(", ")}] [effects: ${concern.effects.join(", ")}]`;
      }),
    ),
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
  const diagnostics = artifact.planning_diagnostics;

  return renderSection("Planning Readiness", [
    readiness.ready
      ? "Forge plan is ready for later workflow steps."
      : "Forge plan is blocked until the remaining Step 1 issues are addressed.",
    "",
    ...renderKeyValueList([
      ["Ready", readiness.ready],
      ["Planning Usability", diagnostics.usability_status],
      ["Warning Items", diagnostics.warning_items.length],
      ["Blocking Issues", readiness.blocking_issues.length],
      ["Planning Blocking Items", diagnostics.blocking_items.length],
      ["Recommended Actions", readiness.recommended_user_actions.length],
    ]),
    "",
    "### Step 2 Warning Items",
    "",
    renderList(
      diagnostics.warning_items.map((item) => `\`${item.code}\`: ${item.message}`),
    ),
    "",
    "### Blocking Issues",
    "",
    renderList(
      readiness.blocking_issues.map((issue) => `\`${issue.code}\`: ${issue.message}`),
    ),
    "",
    "### Step 2 Blocking Items",
    "",
    renderList(
      diagnostics.blocking_items.map((item) => `\`${item.code}\`: ${item.message}`),
    ),
    "",
    "### Partial Output",
    "",
    diagnostics.partial_output
      ? renderList([
        `\`${diagnostics.partial_output.code}\`: ${diagnostics.partial_output.message}`,
        diagnostics.partial_output.fallbackReason
          ? `Fallback: ${diagnostics.partial_output.fallbackReason}`
          : "Fallback: none",
      ])
      : "- none",
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

export function createPlanReport(
  artifact: PlanArtifact,
  options?: {
    planningAssist?: PlanAssistResolution;
  },
): string {
  const planningAssist = options?.planningAssist ?? artifact.planning_diagnostics.planning_assist;
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
        ["Planning Usability", artifact.planning_diagnostics.usability_status],
        ["Planning Assist", planningAssistLabel(planningAssist)],
        ...(planningAssist.provider
          ? [["Planning Assist Provider", planningAssist.provider] as [string, string]]
          : []),
      ]),
      ...(planningAssist?.reportNotes.length
        ? ["", renderList(planningAssist.reportNotes)]
        : []),
      ...(planningAssist?.warnings.length
        ? ["", renderList(planningAssist.warnings)]
        : []),
      ...(planningAssist?.ignoredEdits.length
        ? ["", renderList(planningAssist.ignoredEdits)]
        : []),
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
    renderPlanItemsSection(artifact),
    renderDependenciesSection(artifact),
    renderConflictZonesSection(artifact),
    renderTestObligationsSection(artifact),
    renderParallelizationSection(artifact),
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
