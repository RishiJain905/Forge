import { join } from "node:path";

import { FORGE_SCHEMA_VERSION } from "../../src/intake/constants.js";
import type { PlanArtifact } from "../../src/plan/types.js";
import {
  FORGE_VERIFY_FULL_COMMAND,
  FORGE_VERIFY_STAGE,
  STEP3_ALLOWED_SIDE_EFFECTS,
  STEP3_DEFERRED_CAPABILITIES,
  STEP3_DETERMINISTIC_FIRST_NOTES,
  STEP3_DISALLOWED_CAPABILITIES,
  STEP3_VERIFY_PURPOSE,
  VERIFY_FORMAL_ENTRY_CRITERIA,
  VERIFY_FORMAL_FOCUS_AREAS,
  VERIFY_FORMAL_TOOLING,
  VERIFY_STATE_MODEL_REQUIRED_FIELDS,
  VERIFY_STRUCTURAL_FOCUS_AREAS,
  VERIFY_SUPPORTED_LANES,
  VERIFY_TARGET_REQUIRED_FIELDS,
  VERIFY_TARGET_RISK_SOURCES,
  VERIFY_TLC_STATUSES,
} from "../../src/verify/constants.js";
import { verifyArtifactPath, verifyReportPath } from "./forge-cli.js";

type FormalCaseStatus = "not_run" | "passed" | "failed" | "errored" | "invalid_spec";

function buildFormalDetail(params: {
  entryCriteria: string[];
  stateModelId: string;
  tlaSpecId: string;
  tlcResultId: string;
  trace: string | null;
  errors: string[];
  cautionNotes: string[];
}): Record<string, unknown> {
  return {
    enteredFormalLane: true,
    entryCriteria: params.entryCriteria,
    stateModelId: params.stateModelId,
    tlaSpecId: params.tlaSpecId,
    tlcResultId: params.tlcResultId,
    trace: params.trace,
    errors: params.errors,
    cautionNotes: params.cautionNotes,
  };
}

function buildFormalStateModel(params: {
  id: string;
  verificationCaseId: string;
  verificationTargetId: string;
  summary: string;
  actors: string[];
  entities: string[];
  states: string[];
  transitions: string[];
  unsafeStates: string[];
  invariants: string[];
  initialConditions: string[];
}): Record<string, unknown> {
  return {
    id: params.id,
    verification_case_id: params.verificationCaseId,
    verification_target_id: params.verificationTargetId,
    name: params.id.replace(/-/g, " "),
    summary: params.summary,
    actors: params.actors,
    entities: params.entities,
    states: params.states,
    transitions: params.transitions,
    unsafe_states: params.unsafeStates,
    invariants: params.invariants,
    initial_conditions: params.initialConditions,
  };
}

function buildFormalSpec(params: {
  id: string;
  verificationCaseId: string;
  stateModelId: string;
  moduleName: string;
  specPath: string;
  configPath: string;
}): Record<string, unknown> {
  return {
    id: params.id,
    verification_case_id: params.verificationCaseId,
    state_model_id: params.stateModelId,
    name: `${params.moduleName} TLA+ spec`,
    module_name: params.moduleName,
    summary: `${params.moduleName} generated from ${params.stateModelId}.`,
    spec_path: params.specPath,
    config_path: params.configPath,
    generation_status: "generated",
  };
}

function buildFormalTlcResult(params: {
  id: string;
  verificationCaseId: string;
  tlaSpecId: string;
  status: FormalCaseStatus;
  summary: string;
  trace: string | null;
  errors: string[];
}): Record<string, unknown> {
  return {
    id: params.id,
    verification_case_id: params.verificationCaseId,
    tla_spec_id: params.tlaSpecId,
    status: params.status,
    summary: params.summary,
    trace: params.trace,
    errors: params.errors,
  };
}

export function buildFormalVerifyArtifactFixture(params: {
  repoRoot: string;
  planArtifact: PlanArtifact;
  formalVerificationStatus?: FormalCaseStatus;
}): Record<string, unknown> {
  const outputRoot = join(params.repoRoot, ".forge");
  const formalRoot = join(outputRoot, "formal");
  const artifactPath = verifyArtifactPath(params.repoRoot);
  const reportPath = verifyReportPath(params.repoRoot);

  const targetOne = {
    id: "verify-target-001",
    title: "Verify Ownership Transition for src/worker.ts",
    category: "ownership",
    sourcePlanItemIds: ["plan-item-ownership"],
    riskSummary: "Step 3 should inspect Ownership Transition across src/worker.ts; evidence came from plan_item_verification_relevance, test_obligation.",
    candidateLanes: ["formal"],
    sourceRiskSources: ["plan_item_verification_relevance", "test_obligation"],
    expectedFindingKinds: ["ownership_transition"],
    verificationCaseIds: ["verify-case-001", "verify-case-002", "verify-case-003", "verify-case-004"],
    traceabilityNotes: [
      "Step 2 marked plan-item-ownership as verification-relevant for ownership.",
      "Step 2 kept contract_validation visible for plan-item-ownership: Ownership transfer must remain valid when the worker claim path changes.",
    ],
  };

  const targetTwo = {
    id: "verify-target-002",
    title: "Verify Config Surface for package.json",
    category: "config_surface",
    sourcePlanItemIds: ["plan-item-config"],
    riskSummary: "Step 3 should inspect Config Surface across package.json; evidence came from plan_item_verification_relevance.",
    candidateLanes: ["structural"],
    sourceRiskSources: ["plan_item_verification_relevance"],
    expectedFindingKinds: ["merge_or_serialization_contradiction"],
    verificationCaseIds: ["verify-case-005"],
    traceabilityNotes: [
      "Step 2 marked plan-item-config as verification-relevant for config_surface.",
    ],
  };

  const formalCaseStatuses: FormalCaseStatus[] = ["passed", "failed", "errored", "invalid_spec"];
  const formalCases = formalCaseStatuses.map((status, index) => {
    const caseNumber = index + 1;
    const caseId = `verify-case-00${caseNumber}`;
    const stateModelId = `verify-state-model-00${caseNumber}`;
    const tlaSpecId = `verify-tla-spec-00${caseNumber}`;
    const tlcResultId = `verify-tlc-result-00${caseNumber}`;
    const entryCriteria = index === 0
      ? ["state_machine_like", "ownership_or_version_validity"]
      : index === 1
        ? ["multi_actor_or_interleaving", "ownership_or_version_validity"]
        : index === 2
          ? ["retry_or_reassignment", "state_machine_like"]
          : ["ownership_or_version_validity", "structural_check_insufficient"];
    const trace = status === "failed"
      ? "Counterexample trace: actor A still owns the resource after reassignment."
      : null;
    const errors = status === "errored"
      ? ["TLC execution failed to start cleanly."]
      : status === "invalid_spec"
        ? ["The generated TLA+ spec could not be validated."]
        : [];

    return {
      id: caseId,
      verificationTargetId: targetOne.id,
      title: `Verify Ownership Transition for src/worker.ts (${status})`,
      category: "ownership",
      sourcePlanItemIds: ["plan-item-ownership"],
      lanes: ["formal"],
      goal: "Model ownership transitions formally and preserve traceability to the originating Step 2 plan items.",
      status: "not_run",
      summary: `Selected for formal verification in Part 4; execution has not run yet for ownership (${status}).`,
      findings: [],
      mitigations: [],
      constraints: [],
      tlcStatus: status,
      traceabilityNotes: [
        "Step 2 marked plan-item-ownership as verification-relevant for ownership.",
        `Part 4 formal lane selected this case for ${status} coverage.`,
      ],
      formalDetails: buildFormalDetail({
        entryCriteria,
        stateModelId,
        tlaSpecId,
        tlcResultId,
        trace,
        errors,
        cautionNotes: [
          "Carry-forward caution: formal results must remain conservative when TLC output is partial or unavailable.",
        ],
      }),
    };
  });

  const structuralCase = {
    id: "verify-case-005",
    verificationTargetId: targetTwo.id,
    title: "Verify Config Surface for package.json (structural)",
    category: "config_surface",
    sourcePlanItemIds: ["plan-item-config"],
    lanes: ["structural"],
    goal: "Check config surface structurally against Step 2 signals.",
    status: "passed",
    summary: "Structural verification passed for config_surface.",
    findings: [
      "Structural verification passed for config_surface.",
      "Structural evidence remained traceable to plan_item_verification_relevance.",
    ],
    mitigations: ["Carry the structural safeguards forward into later steps."],
    constraints: ["Keep validation visible: Config changes should keep contract validation visible."],
    traceabilityNotes: [
      "Step 2 marked plan-item-config as verification-relevant for config_surface.",
    ],
    formalDetails: null,
  };

  return {
    schemaVersion: FORGE_SCHEMA_VERSION,
    command: FORGE_VERIFY_FULL_COMMAND,
    stage: FORGE_VERIFY_STAGE,
    status: "ready",
    purpose: STEP3_VERIFY_PURPOSE,
    repoRoot: params.repoRoot,
    requestedOutputRoot: null,
    outputRoot,
    writePolicy: {
      mode: "output-root-only",
      repoReadOnlyOutsideOutputRoot: true,
      allowedRoot: outputRoot,
      allowedSideEffects: [...STEP3_ALLOWED_SIDE_EFFECTS],
      deferredCapabilities: [...STEP3_DEFERRED_CAPABILITIES],
      disallowedCapabilities: [...STEP3_DISALLOWED_CAPABILITIES],
    },
    files: {
      artifactPath,
      reportPath,
    },
    startedAt: "2026-03-25T00:00:00.000Z",
    finishedAt: "2026-03-25T00:01:00.000Z",
    summary: params.planArtifact.planning_readiness.summary,
    boundaryNotes: [...STEP3_DETERMINISTIC_FIRST_NOTES],
    source_plan: {
      artifactPath: join(params.repoRoot, ".forge", "plan.json"),
      command: params.planArtifact.command,
      repoRoot: params.planArtifact.repoRoot,
      status: params.planArtifact.status,
      summary: params.planArtifact.summary,
      readyForVerification: params.planArtifact.planning_readiness.ready,
      planningReadinessStatus: params.planArtifact.planning_readiness.status,
      failure: params.planArtifact.failure,
    },
    verification_target_contract: {
      requiredFields: [...VERIFY_TARGET_REQUIRED_FIELDS],
      riskSources: [...VERIFY_TARGET_RISK_SOURCES],
      structuralFocusAreas: [...VERIFY_STRUCTURAL_FOCUS_AREAS],
      formalFocusAreas: [...VERIFY_FORMAL_FOCUS_AREAS],
      supportedLanes: [...VERIFY_SUPPORTED_LANES],
    },
    formal_lane_contract: {
      tooling: [...VERIFY_FORMAL_TOOLING],
      entryCriteria: [...VERIFY_FORMAL_ENTRY_CRITERIA],
      stateModelRequiredFields: [...VERIFY_STATE_MODEL_REQUIRED_FIELDS],
      tlcStatuses: [...VERIFY_TLC_STATUSES],
    },
    verification_targets: [targetOne, targetTwo],
    verification_cases: [
      ...formalCases.map((entry) => ({
        id: entry.id,
        verificationTargetId: entry.verificationTargetId,
        title: entry.title,
        category: entry.category,
        sourcePlanItemIds: entry.sourcePlanItemIds,
        lanes: entry.lanes,
        goal: entry.goal,
        status: entry.status,
        summary: entry.summary,
        findings: entry.findings,
        mitigations: entry.mitigations,
        constraints: entry.constraints,
        traceabilityNotes: entry.traceabilityNotes,
        formalDetails: entry.formalDetails,
      })),
      structuralCase,
    ],
    structural_verification: {
      status: "passed",
      summary: "1 structural verification case(s) passed deterministic structural verification.",
      findings: [
        "Structural verification passed for config_surface.",
        "Structural evidence remained traceable to plan_item_verification_relevance.",
      ],
      constraints: ["Keep validation visible: Config changes should keep contract validation visible."],
    },
    formal_verification: {
      status: params.formalVerificationStatus ?? "failed",
      summary: "4 formal verification case(s) were selected in Part 4; execution has produced mixed TLC outcomes.",
      caution_notes: [
        "Formal results are intentionally mixed so the report and schema contract stay honest about caution handling.",
        "Low-confidence carry-forward context must remain visible alongside passed TLC cases.",
      ],
      state_models: formalCases.map((entry, index) =>
        buildFormalStateModel({
          id: `verify-state-model-00${index + 1}`,
          verificationCaseId: entry.id,
          verificationTargetId: targetOne.id,
          summary: `State model for ownership formal case ${index + 1}.`,
          actors: ["developer", "runtime"],
          entities: ["work item", "owner", "lease"],
          states: ["unowned", "owned", "handoff_pending", "released", "completed"],
          transitions: [
            "claim",
            "hand_off",
            "release",
            "complete",
          ],
          unsafeStates: ["duplicate_owner", "stale_owner"],
          invariants: [
            "At most one owner may be active at a time.",
            "Released work must not remain owned.",
          ],
          initialConditions: [
            "Work starts unowned.",
            "No active lease exists at time zero.",
          ],
        }),
      ),
      tla_specs: formalCases.map((entry, index) =>
        buildFormalSpec({
          id: `verify-tla-spec-00${index + 1}`,
          verificationCaseId: entry.id,
          stateModelId: `verify-state-model-00${index + 1}`,
          moduleName: `ForgeVerifyOwnership${index + 1}`,
          specPath: join(formalRoot, `ForgeVerifyOwnership${index + 1}.tla`),
          configPath: join(formalRoot, `ForgeVerifyOwnership${index + 1}.cfg`),
        }),
      ),
      tlc_results: formalCases.map((entry, index) =>
        buildFormalTlcResult({
          id: `verify-tlc-result-00${index + 1}`,
          verificationCaseId: entry.id,
          tlaSpecId: `verify-tla-spec-00${index + 1}`,
          status: entry.tlcStatus,
          summary:
            index === 0
              ? "TLC passed for the ownership formal case."
              : index === 1
                ? "TLC found a counterexample for the ownership formal case."
                : index === 2
                  ? "TLC errored while running the ownership formal case."
                  : "The ownership formal case could not be made runnable.",
          trace:
            index === 1
              ? "Counterexample trace: actor A still owns the resource after reassignment."
              : null,
          errors:
            index === 2
              ? ["TLC execution failed to start cleanly."]
              : index === 3
                ? ["The generated TLA+ spec could not be validated."]
                : [],
        }),
      ),
      findings: [
        "TLC passed for one formal case.",
        "TLC failed for one formal case.",
        "TLC errored for one formal case.",
        "One formal case remained invalid_spec.",
      ],
      constraints: [
        "Trace details must remain attached to failed formal cases.",
        "Invalid formal specs must stay explicit in the artifact.",
      ],
    },
    findings: [
      "Formal verification passed for one ownership case.",
      "Formal verification failed for one ownership case.",
      "Formal verification errored for one ownership case.",
      "Formal verification remained invalid_spec for one ownership case.",
    ],
    constraints: [
      "Keep formal results separate from structural-only findings.",
      "Preserve caution notes when formal execution is incomplete.",
    ],
    carry_forward: params.planArtifact.carry_forward,
    verification_diagnostics: {
      usability_status: params.planArtifact.planning_diagnostics.usability_status,
      warning_items: params.planArtifact.planning_diagnostics.warning_items,
      blocking_items: [],
      partial_output: params.planArtifact.planning_diagnostics.partial_output,
    },
    verification_readiness: {
      ready: params.planArtifact.planning_readiness.ready,
      status: params.planArtifact.planning_readiness.status,
      summary: params.planArtifact.planning_readiness.summary,
      warning_items: params.planArtifact.planning_readiness.warning_items,
      blocking_issues: params.planArtifact.planning_readiness.blocking_issues,
      partial_output: params.planArtifact.planning_readiness.partial_output,
      constraining_concern_ids: params.planArtifact.planning_readiness.constraining_concern_ids,
      recommended_user_actions: params.planArtifact.planning_readiness.recommended_user_actions,
    },
    failure: null,
  };
}
