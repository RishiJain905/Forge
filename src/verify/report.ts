import type { VerifyArtifact } from "./types.js";

const REQUIRED_HEADINGS = [
  "Overview",
  "Purpose",
  "Source Plan",
  "Verification Target Contract",
  "Formal Lane Contract",
  "Verification Targets",
  "Verification Cases",
  "Structural Verification",
  "Formal Verification",
  "Findings",
  "Constraints",
  "Carry-Forward Context",
  "Verification Readiness",
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

function countVerificationWarnings(artifact: VerifyArtifact): number {
  return artifact.verification_readiness.warning_items.length;
}

function countVerificationBlockingIssues(artifact: VerifyArtifact): number {
  return artifact.verification_readiness.blocking_issues.length;
}

function renderIssueList(items: Array<{ code: string; message: string }>): string {
  return items.length > 0
    ? items.map((item) => `- [${item.code}] ${item.message}`).join("\n")
    : "- none";
}

function renderForgeSplitGateValue(readiness: Pick<VerifyArtifact["verification_readiness"], "ready" | "status">): string {
  if (!readiness.ready) {
    return "blocked";
  }

  return readiness.status === "ready_with_warnings" ? "can proceed with warnings" : "can proceed";
}

function renderStructuredFindings(artifact: VerifyArtifact, lane: "structural" | "formal"): string {
  const findings = artifact.findings.filter((finding) => finding.lane === lane);

  if (findings.length === 0) {
    return "- none";
  }

  return findings
    .map((finding) => [
      `- ${finding.id}: ${finding.summary}`,
      `  - Case ID: ${finding.verification_case_id}`,
      `  - Target ID: ${finding.verification_target_id}`,
      `  - Status: ${finding.status}`,
      `  - TLA Spec ID: ${finding.tla_spec_id ?? "none"}`,
      `  - TLC Result ID: ${finding.tlc_result_id ?? "none"}`,
      `  - Trace: ${finding.trace ?? "none"}`,
      `  - Errors: ${finding.errors.length > 0 ? finding.errors.join("; ") : "none"}`,
    ].join("\n"))
    .join("\n");
}

function renderStructuredConstraints(artifact: VerifyArtifact, lane: "structural" | "formal"): string {
  const constraints = artifact.constraints.filter((constraint) => constraint.lane === lane);

  if (constraints.length === 0) {
    return "- none";
  }

  return constraints
    .map((constraint) => [
      `- ${constraint.id}: ${constraint.summary}`,
      `  - Case ID: ${constraint.verification_case_id}`,
      `  - Target ID: ${constraint.verification_target_id}`,
    ].join("\n"))
    .join("\n");
}

function renderVerificationTargetList(artifact: VerifyArtifact): string {
  if (artifact.verification_targets.length === 0) {
    return "- none";
  }

  return artifact.verification_targets
    .map((target) => [
      `- ${target.id}: ${target.title}`,
      `  - Category: ${target.category}`,
      `  - Source Plan Item IDs: ${target.sourcePlanItemIds.join(", ") || "none"}`,
      `  - Risk Summary: ${target.riskSummary}`,
      `  - Candidate Lanes: ${target.candidateLanes.join(", ") || "none"}`,
      `  - Risk Sources: ${target.sourceRiskSources.join(", ") || "none"}`,
      `  - Expected Finding Kinds: ${target.expectedFindingKinds.join(", ") || "none"}`,
      `  - Case IDs: ${target.verificationCaseIds.join(", ") || "none"}`,
      `  - Traceability Notes: ${target.traceabilityNotes.join("; ") || "none"}`,
    ].join("\n"))
    .join("\n");
}

function renderVerificationCaseList(artifact: VerifyArtifact): string {
  if (artifact.verification_cases.length === 0) {
    return "- none";
  }

  return artifact.verification_cases
    .map((verificationCase) => [
      `- ${verificationCase.id}: ${verificationCase.title}`,
      `  - Target ID: ${verificationCase.verificationTargetId}`,
      `  - Category: ${verificationCase.category}`,
      `  - Source Plan Item IDs: ${verificationCase.sourcePlanItemIds.join(", ") || "none"}`,
      `  - Lanes: ${verificationCase.lanes.join(", ") || "none"}`,
      `  - Goal: ${verificationCase.goal}`,
      `  - Status: ${verificationCase.status}`,
      `  - Summary: ${verificationCase.summary}`,
      `  - Findings: ${renderList(verificationCase.findings)}`,
      `  - Mitigations: ${renderList(verificationCase.mitigations)}`,
      `  - Constraints: ${renderList(verificationCase.constraints)}`,
      `  - Traceability Notes: ${verificationCase.traceabilityNotes.join("; ") || "none"}`,
      verificationCase.formalDetails
        ? [
            "  - Formal Details:",
            `    - Scenario Kind: ${verificationCase.formalDetails.scenarioKind}`,
            `    - Entry Criteria: ${verificationCase.formalDetails.entryCriteria.join(", ") || "none"}`,
            `    - State Model ID: ${verificationCase.formalDetails.stateModelId ?? "none"}`,
            `    - TLA Spec ID: ${verificationCase.formalDetails.tlaSpecId ?? "none"}`,
            `    - TLC Result ID: ${verificationCase.formalDetails.tlcResultId ?? "none"}`,
            `    - Caution Notes: ${verificationCase.formalDetails.cautionNotes.join("; ") || "none"}`,
            `    - Trace: ${verificationCase.formalDetails.trace ?? "none"}`,
            `    - Errors: ${verificationCase.formalDetails.errors.length > 0 ? verificationCase.formalDetails.errors.join("; ") : "none"}`,
          ].join("\n")
        : "  - Formal Details: none",
    ].join("\n"))
    .join("\n");
}

function renderStructuralVerification(artifact: VerifyArtifact): string {
  return renderSection("Structural Verification", [
    ...renderKeyValueLines([
      ["Status", artifact.structural_verification.status],
      ["Summary", artifact.structural_verification.summary],
    ]),
    "",
    "### Findings",
    "",
    renderList(artifact.structural_verification.findings),
    "",
    "### Constraints",
    "",
    renderList(artifact.structural_verification.constraints),
  ]);
}

function renderFormalVerification(artifact: VerifyArtifact): string {
  const formalVerification = artifact.formal_verification;

  return renderSection("Formal Verification", [
    ...renderKeyValueLines([
      ["Status", formalVerification.status],
      ["Summary", formalVerification.summary],
    ]),
    "",
    "### Caution Notes",
    "",
    renderList(formalVerification.caution_notes),
    "",
    "### State Models",
    "",
    formalVerification.state_models.length === 0
      ? "- none"
      : formalVerification.state_models
          .map((stateModel) => [
            `- ${stateModel.id}: ${stateModel.name}`,
            `  - Verification Case ID: ${stateModel.verification_case_id}`,
            `  - Verification Target ID: ${stateModel.verification_target_id}`,
            `  - Scenario Kind: ${stateModel.scenario_kind}`,
            `  - Summary: ${stateModel.summary}`,
            `  - Actors: ${stateModel.actors.join(", ") || "none"}`,
            `  - Entities: ${stateModel.entities.join(", ") || "none"}`,
            `  - States: ${stateModel.states.join(", ") || "none"}`,
            `  - Transitions: ${stateModel.transitions.join("; ") || "none"}`,
            `  - Unsafe States: ${stateModel.unsafe_states.join(", ") || "none"}`,
            `  - Unsafe Conditions: ${stateModel.unsafe_conditions?.join("; ") || "none"}`,
            `  - Invariants: ${stateModel.invariants.join("; ") || "none"}`,
            `  - Initial Conditions: ${stateModel.initial_conditions.join("; ") || "none"}`,
          ].join("\n"))
          .join("\n"),
    "",
    "### TLA Specs",
    "",
    formalVerification.tla_specs.length === 0
      ? "- none"
      : formalVerification.tla_specs
          .map((spec) => [
            `- ${spec.id}: ${spec.name}`,
            `  - Verification Case ID: ${spec.verification_case_id}`,
            `  - State Model ID: ${spec.state_model_id}`,
            `  - Scenario Kind: ${spec.scenario_kind}`,
            `  - Summary: ${spec.summary}`,
            `  - Module Name: ${spec.module_name}`,
            `  - Spec Path: ${spec.spec_path}`,
            `  - Config Path: ${spec.config_path}`,
            `  - Generation Status: ${spec.generation_status}`,
          ].join("\n"))
          .join("\n"),
    "",
    "### TLC Results",
    "",
    formalVerification.tlc_results.length === 0
      ? "- none"
      : formalVerification.tlc_results
          .map((result) => [
            `- ${result.id}: ${result.status}`,
            `  - Verification Case ID: ${result.verification_case_id}`,
            `  - TLA Spec ID: ${result.tla_spec_id}`,
            `  - Scenario Kind: ${result.scenario_kind}`,
            `  - Summary: ${result.summary}`,
            `  - Trace: ${result.trace ?? "none"}`,
            `  - Errors: ${result.errors.length > 0 ? result.errors.join("; ") : "none"}`,
          ].join("\n"))
          .join("\n"),
    "",
    "### Findings",
    "",
    renderList(formalVerification.findings),
    "",
    "### Constraints",
    "",
    renderList(formalVerification.constraints),
  ]);
}

function renderCarryForwardContext(artifact: VerifyArtifact): string {
  const carryForward = artifact.carry_forward;
  const sourcePlan = artifact.source_plan;
  const repoContext = carryForward.repo_context;
  const planningDiagnostics = sourcePlan.planning_diagnostics;
  const planningReadiness = sourcePlan.planning_readiness;

  return renderSection("Carry-Forward Context", [
    "This section preserves the Step 2 handoff so `forge verify` can stay artifact-derived.",
    "",
    "### Source Plan",
    "",
    ...renderKeyValueLines([
      ["Artifact Path", sourcePlan.artifactPath],
      ["Command", sourcePlan.command],
      ["Status", sourcePlan.status],
      ["Summary", sourcePlan.summary],
      ["Ready for Verification", sourcePlan.readyForVerification],
      ["Planning Readiness Status", sourcePlan.planningReadinessStatus],
    ]),
    "",
    "### Repo Context",
    "",
    ...renderKeyValueLines([
      ["Grounded", repoContext.grounded],
      ["Source Files", repoContext.source_files.length],
      ["Test Files", repoContext.test_files.length],
      ["Manifest Files", repoContext.manifest_files.length],
      ["Languages", repoContext.languages.join(", ") || null],
      ["Package Manager", repoContext.package_manager],
      ["Layout Summary", repoContext.layout_summary],
      ["Git Repo Root", repoContext.git_context.repo_root],
    ]),
    "",
    "### Candidate Targets",
    "",
    renderList(
      carryForward.candidate_targets.map((target) => {
        const notes = target.notes.length > 0 ? ` [notes: ${target.notes.join("; ")}]` : "";
        return `\`${target.path}\` (${target.kind}, ${target.match_type}) - ${target.reason}${notes} [shared risk: ${target.shared_risk ? "yes" : "no"}]`;
      }),
    ),
    "",
    "### Initial Verification Targets",
    "",
    renderList(
      carryForward.initial_verification_targets.map((target) => {
        const category = target.category ? `, ${target.category}` : "";
        return `\`${target.path}\` (${target.kind}${category}) - ${target.reason}`;
      }),
    ),
    "",
    "### Risk Analysis",
    "",
    renderList([
      ...carryForward.risk_analysis.initial_risk_zones.map(
        (zone) => `\`${zone.code}\` (${zone.level}) - ${zone.reason}`,
      ),
      ...carryForward.risk_analysis.derived_risk_zones.map(
        (zone) => `\`${zone.code}\` (${zone.level}) - ${zone.reason}`,
      ),
    ]),
    "",
    "### Ambiguities",
    "",
    renderList(carryForward.ambiguities),
    "",
    "### Warnings",
    "",
    renderList(carryForward.warnings),
    "",
    "### Step 2 Planning Diagnostics",
    "",
    ...renderKeyValueLines([
      ["Usability Status", planningDiagnostics.usability_status],
      ["Warning Items", planningDiagnostics.warning_items.length],
      ["Blocking Items", planningDiagnostics.blocking_items.length],
      ["Partial Output", planningDiagnostics.partial_output ? planningDiagnostics.partial_output.code : null],
    ]),
    "",
    "### Step 2 Planning Readiness",
    "",
    ...renderKeyValueLines([
      ["Ready", planningReadiness.ready],
      ["Status", planningReadiness.status],
      ["Summary", planningReadiness.summary],
      ["Warning Items", planningReadiness.warning_items.length],
      ["Blocking Issues", planningReadiness.blocking_issues.length],
      ["Partial Output", planningReadiness.partial_output ? planningReadiness.partial_output.code : null],
      ["Constraining Concerns", planningReadiness.constraining_concern_ids.join(", ") || null],
      ["Recommended Actions", planningReadiness.recommended_user_actions.join("; ") || null],
    ]),
    "",
    "### Concerns",
    "",
    renderList(
      carryForward.concerns.map((concern) => {
        const code = concern.code ? ` [code: ${concern.code}]` : "";
        return `\`${concern.id}\` (${concern.source})${code} - ${concern.message} [plan items: ${concern.planItemIds.join(", ")}] [effects: ${concern.effects.join(", ")}]`;
      }),
    ),
  ]);
}

function renderVerificationReadiness(artifact: VerifyArtifact): string {
  const readiness = artifact.verification_readiness;

  return renderSection("Verification Readiness", [
    "This section answers the `forge split` gate from the Step 3 outputs.",
    "",
    ...renderKeyValueLines([
      ["Forge Split Gate", renderForgeSplitGateValue(readiness)],
      ["Ready", readiness.ready],
      ["Status", readiness.status],
      ["Summary", readiness.summary],
      ["Partial Output", readiness.partial_output ? readiness.partial_output.code : null],
      ["Constraining Concerns", readiness.constraining_concern_ids.join(", ") || null],
      ["Recommended Actions", readiness.recommended_user_actions.join("; ") || null],
    ]),
    "",
    "### Warning Items",
    "",
    renderIssueList(readiness.warning_items),
    "",
    "### Blocking Issues",
    "",
    renderIssueList(readiness.blocking_issues),
  ]);
}

function renderFailure(artifact: VerifyArtifact): string {
  if (!artifact.failure) {
    return renderSection("Failure", ["- none"]);
  }

  return renderSection("Failure", [
    ...renderKeyValueLines([
      ["Code", artifact.failure.code],
      ["Message", artifact.failure.message],
      ["Fallback Reason", artifact.failure.fallbackReason ?? null],
    ]),
  ]);
}

function renderOverview(artifact: VerifyArtifact): string {
  return renderSection("Overview", [
    ...renderKeyValueLines([
      ["Command", artifact.command],
      ["Stage", artifact.stage],
      ["Status", artifact.status],
      ["Repo Root", artifact.repoRoot],
      ["Requested Output Root", artifact.requestedOutputRoot],
      ["Output Root", artifact.outputRoot],
      ["Artifact Path", artifact.files.artifactPath],
      ["Report Path", artifact.files.reportPath],
      ["Verification Readiness Status", artifact.verification_readiness.status],
      ["Structural Verification Status", artifact.structural_verification.status],
      ["Formal Verification Status", artifact.formal_verification.status],
      ["Verification Warning Items", countVerificationWarnings(artifact)],
      ["Verification Blocking Issues", countVerificationBlockingIssues(artifact)],
      ["Failure Code", artifact.failure?.code ?? null],
      ["Summary", artifact.summary],
    ]),
  ]);
}

function renderOutputFiles(artifact: VerifyArtifact): string {
  return renderSection("Output Files", [
    "These are the durable files produced for this verify run.",
    "verify.json and verify-report.md remain the durable Step 3 outputs.",
    "Debug files are optional internal mirrors and are only written when FORGE_VERIFY_DEBUG=1.",
    "",
    ...renderKeyValueLines([
      ["Requested Output Root", artifact.requestedOutputRoot],
      ["Output Root", artifact.outputRoot],
      ["Allowed Root", artifact.writePolicy.allowedRoot],
      ["Artifact Path", artifact.files.artifactPath],
      ["Report Path", artifact.files.reportPath],
      ["Debug Artifact Path", artifact.files.debugArtifactPath],
      ["Debug Verification Cases Path", artifact.files.debugVerificationCasesPath],
      ["Debug Structural Findings Path", artifact.files.debugStructuralFindingsPath],
      ["Debug Verification Readiness Path", artifact.files.debugVerificationReadinessPath],
      ["Debug State Models Path", artifact.files.debugStateModelsPath],
      ["Debug TLA Specs Path", artifact.files.debugTlaSpecsPath],
      ["Debug TLC Results Path", artifact.files.debugTlcResultsPath],
    ]),
  ]);
}

export function createVerifyReport(artifact: VerifyArtifact): string {
  const sections = [
    renderOverview(artifact),
    "",
    renderSection("Purpose", [`- ${artifact.purpose}`]),
    "",
    renderSection("Source Plan", [
      ...renderKeyValueLines([
        ["Artifact Path", artifact.source_plan.artifactPath],
        ["Command", artifact.source_plan.command],
        ["Repo Root", artifact.source_plan.repoRoot],
        ["Status", artifact.source_plan.status],
        ["Ready for Verification", artifact.source_plan.readyForVerification],
        ["Planning Readiness Status", artifact.source_plan.planningReadinessStatus],
        ["Summary", artifact.source_plan.summary],
      ]),
      "",
      "### Failure",
      "",
      artifact.source_plan.failure
        ? renderList([
            `Code: ${artifact.source_plan.failure.code}`,
            `Message: ${artifact.source_plan.failure.message}`,
            `Fallback Reason: ${artifact.source_plan.failure.fallbackReason ?? "none"}`,
          ])
        : "- none",
    ]),
    "",
    renderSection("Verification Target Contract", [
      "This is the frozen public contract for target selection in Part 3.",
      "",
      "### Required Fields",
      "",
      renderList([...artifact.verification_target_contract.requiredFields]),
      "",
      "### Risk Sources",
      "",
      renderList([...artifact.verification_target_contract.riskSources]),
      "",
      "### Structural Focus Areas",
      "",
      renderList([...artifact.verification_target_contract.structuralFocusAreas]),
      "",
      "### Formal Focus Areas",
      "",
      renderList([...artifact.verification_target_contract.formalFocusAreas]),
      "",
      "### Supported Lanes",
      "",
      renderList([...artifact.verification_target_contract.supportedLanes]),
    ]),
    "",
    renderSection("Formal Lane Contract", [
      "This is the frozen public contract for the formal lane in Part 3.",
      "",
      "### Tooling",
      "",
      renderList([...artifact.formal_lane_contract.tooling]),
      "",
      "### Scenario Kinds",
      "",
      renderList([...artifact.formal_lane_contract.scenarioKinds]),
      "",
      "### Entry Criteria",
      "",
      renderList([...artifact.formal_lane_contract.entryCriteria]),
      "",
      "### State Model Required Fields",
      "",
      renderList([...artifact.formal_lane_contract.stateModelRequiredFields]),
      "",
      "### TLC Statuses",
      "",
      renderList([...artifact.formal_lane_contract.tlcStatuses]),
    ]),
    "",
    renderSection("Verification Targets", [renderVerificationTargetList(artifact)]),
    "",
    renderSection("Verification Cases", [renderVerificationCaseList(artifact)]),
    "",
    renderStructuralVerification(artifact),
    "",
    renderFormalVerification(artifact),
    "",
    renderSection("Findings", [
      "### Structural Findings",
      "",
      renderStructuredFindings(artifact, "structural"),
      "",
      "### Formal Findings",
      "",
      renderStructuredFindings(artifact, "formal"),
    ]),
    "",
    renderSection("Constraints", [
      "### Structural Constraints",
      "",
      renderStructuredConstraints(artifact, "structural"),
      "",
      "### Formal Constraints",
      "",
      renderStructuredConstraints(artifact, "formal"),
    ]),
    "",
    renderCarryForwardContext(artifact),
    "",
    renderVerificationReadiness(artifact),
    "",
    renderSection("Boundary Notes", [renderList([...artifact.boundaryNotes])]),
    "",
    renderSection("Deferred Capabilities", [renderList([...artifact.writePolicy.deferredCapabilities])]),
    "",
    renderSection("Allowed Side Effects", [renderList([...artifact.writePolicy.allowedSideEffects])]),
    "",
    renderSection("Disallowed Capabilities", [renderList([...artifact.writePolicy.disallowedCapabilities])]),
    "",
    renderOutputFiles(artifact),
    "",
    renderFailure(artifact),
    "",
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
    throw new Error("Verify report heading contract drifted from the required order.");
  }

  return [
    "# Forge Verify Report",
    "",
    sections.join("\n\n"),
    "",
  ].join("\n");
}
