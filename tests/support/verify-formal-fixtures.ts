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

type VerifyFinding = {
  id: string;
  lane: "structural" | "formal";
  verification_case_id: string;
  verification_target_id: string;
  status: FormalCaseStatus | "passed";
  summary: string;
  tla_spec_id: string | null;
  tlc_result_id: string | null;
  trace: string | null;
  errors: string[];
};

type VerifyConstraint = {
  id: string;
  lane: "structural" | "formal";
  verification_case_id: string;
  verification_target_id: string;
  summary: string;
};

type FormalCaseDetails = {
  enteredFormalLane: boolean;
  entryCriteria: string[];
  stateModelId: string;
  tlaSpecId: string;
  tlcResultId: string;
  trace: string | null;
  errors: string[];
  cautionNotes: string[];
};

function buildFormalDetail(params: {
  entryCriteria: string[];
  stateModelId: string;
  tlaSpecId: string;
  tlcResultId: string;
  trace: string | null;
  errors: string[];
  cautionNotes: string[];
}): FormalCaseDetails {
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
  unsafeConditions: string[];
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
    unsafe_conditions: params.unsafeConditions,
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

function buildFinding(params: {
  id: string;
  lane: "structural" | "formal";
  verificationCaseId: string;
  verificationTargetId: string;
  status: FormalCaseStatus | "passed";
  summary: string;
  tlaSpecId: string | null;
  tlcResultId: string | null;
  trace: string | null;
  errors: string[];
}): VerifyFinding {
  return {
    id: params.id,
    lane: params.lane,
    verification_case_id: params.verificationCaseId,
    verification_target_id: params.verificationTargetId,
    status: params.status,
    summary: params.summary,
    tla_spec_id: params.tlaSpecId,
    tlc_result_id: params.tlcResultId,
    trace: params.trace,
    errors: params.errors,
  };
}

function buildConstraint(params: {
  id: string;
  lane: "structural" | "formal";
  verificationCaseId: string;
  verificationTargetId: string;
  summary: string;
}): VerifyConstraint {
  return {
    id: params.id,
    lane: params.lane,
    verification_case_id: params.verificationCaseId,
    verification_target_id: params.verificationTargetId,
    summary: params.summary,
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

  const findings: VerifyFinding[] = [
    buildFinding({
      id: "verify-finding-001",
      lane: "formal",
      verificationCaseId: formalCases[0]!.id,
      verificationTargetId: targetOne.id,
      status: formalCases[0]!.tlcStatus,
      summary: "Formal verification passed for the ownership case.",
      tlaSpecId: formalCases[0]!.formalDetails.tlaSpecId,
      tlcResultId: formalCases[0]!.formalDetails.tlcResultId,
      trace: formalCases[0]!.formalDetails.trace,
      errors: formalCases[0]!.formalDetails.errors,
    }),
    buildFinding({
      id: "verify-finding-002",
      lane: "formal",
      verificationCaseId: formalCases[1]!.id,
      verificationTargetId: targetOne.id,
      status: formalCases[1]!.tlcStatus,
      summary: "Formal verification failed for the ownership case.",
      tlaSpecId: formalCases[1]!.formalDetails.tlaSpecId,
      tlcResultId: formalCases[1]!.formalDetails.tlcResultId,
      trace: formalCases[1]!.formalDetails.trace,
      errors: formalCases[1]!.formalDetails.errors,
    }),
    buildFinding({
      id: "verify-finding-003",
      lane: "formal",
      verificationCaseId: formalCases[2]!.id,
      verificationTargetId: targetOne.id,
      status: formalCases[2]!.tlcStatus,
      summary: "Formal verification errored for the ownership case.",
      tlaSpecId: formalCases[2]!.formalDetails.tlaSpecId,
      tlcResultId: formalCases[2]!.formalDetails.tlcResultId,
      trace: formalCases[2]!.formalDetails.trace,
      errors: formalCases[2]!.formalDetails.errors,
    }),
    buildFinding({
      id: "verify-finding-004",
      lane: "formal",
      verificationCaseId: formalCases[3]!.id,
      verificationTargetId: targetOne.id,
      status: formalCases[3]!.tlcStatus,
      summary: "Formal verification remained invalid_spec for the ownership case.",
      tlaSpecId: formalCases[3]!.formalDetails.tlaSpecId,
      tlcResultId: formalCases[3]!.formalDetails.tlcResultId,
      trace: formalCases[3]!.formalDetails.trace,
      errors: formalCases[3]!.formalDetails.errors,
    }),
    buildFinding({
      id: "verify-finding-005",
      lane: "structural",
      verificationCaseId: structuralCase.id,
      verificationTargetId: targetTwo.id,
      status: "passed",
      summary: "Structural verification passed for config_surface.",
      tlaSpecId: null,
      tlcResultId: null,
      trace: null,
      errors: [],
    }),
  ];

  const constraints: VerifyConstraint[] = [
    buildConstraint({
      id: "verify-constraint-001",
      lane: "structural",
      verificationCaseId: structuralCase.id,
      verificationTargetId: targetTwo.id,
      summary: "Keep validation visible: Config changes should keep contract validation visible.",
    }),
    buildConstraint({
      id: "verify-constraint-002",
      lane: "formal",
      verificationCaseId: formalCases[0]!.id,
      verificationTargetId: targetOne.id,
      summary: "Trace details must remain attached to failed formal cases.",
    }),
    buildConstraint({
      id: "verify-constraint-003",
      lane: "formal",
      verificationCaseId: formalCases[1]!.id,
      verificationTargetId: targetOne.id,
      summary: "Formal failure cases must keep counterexamples visible.",
    }),
    buildConstraint({
      id: "verify-constraint-004",
      lane: "formal",
      verificationCaseId: formalCases[2]!.id,
      verificationTargetId: targetOne.id,
      summary: "Formal error cases must keep TLC error details visible.",
    }),
    buildConstraint({
      id: "verify-constraint-005",
      lane: "formal",
      verificationCaseId: formalCases[3]!.id,
      verificationTargetId: targetOne.id,
      summary: "Invalid formal specs must stay explicit in the artifact.",
    }),
  ];

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
      debugArtifactPath: join(outputRoot, "debug", "verify-debug.json"),
      debugVerificationCasesPath: join(outputRoot, "debug", "verification-cases.json"),
      debugStructuralFindingsPath: join(outputRoot, "debug", "structural-findings.json"),
      debugStateModelsPath: join(outputRoot, "debug", "state-models.json"),
      debugTlaSpecsPath: join(outputRoot, "debug", "tla-specs.json"),
      debugTlcResultsPath: join(outputRoot, "debug", "tlc-results.json"),
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
          unsafeConditions: [
            "Two owners hold the resource at the same time.",
            "A stale owner keeps mutating the release path.",
          ],
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
    findings,
    constraints,
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

export function buildBatch2Part3FormalPlanArtifact(params: {
  planArtifact: PlanArtifact;
}): PlanArtifact {
  return {
    ...params.planArtifact,
    plan_items: [
      {
        id: "plan-item-workflow",
        title: "Stabilize the shared workflow surface",
        description:
          "Keep retry/reassign, ownership transitions, duplicate execution, stale writes, and migration order aligned on one shared workflow area.",
        category: "implementation",
        sourceRequirements: [
          "Preserve retry/reassign behavior while the workflow surface changes.",
          "Preserve ownership handoff, duplicate execution safety, stale write safety, and migration ordering together.",
        ],
        likelyAffectedPaths: ["src/worker.ts", "src/runtime.ts", "package.json"],
        dependencies: [],
        riskLevel: "high",
        testObligations: [
          {
            category: "contract_validation",
            reason: "The shared workflow surface needs formal contract coverage.",
          },
          {
            category: "migration_validation",
            reason: "Ordering and serialization need explicit validation.",
          },
          {
            category: "integration",
            reason: "Cross-file workflow changes need end-to-end coverage.",
          },
        ],
        verificationRelevance: {
          relevant: true,
          categories: [
            "retry_logic",
            "ownership",
            "parallel_overlap",
            "stale_write",
            "migration_order",
          ],
          notes: ["All initial Batch 2 formal categories share this workflow surface."],
        },
        parallelization: {
          signal: "risky_shared",
          reason:
            "Retries, ownership handoff, duplicate execution, stale writes, and migration ordering all touch one shared workflow area.",
        },
      },
    ],
    dependency_graph: [],
    conflict_zones: [
      {
        id: "conflict-zone-workflow",
        title: "Shared workflow coordination surface",
        reason:
          "Retries, ownership handoff, duplicate execution, stale writes, and migration order all touch the same workflow area.",
        paths: ["src/worker.ts", "src/runtime.ts", "package.json"],
        planItemIds: ["plan-item-workflow"],
        riskLevel: "high",
      },
    ],
    test_obligations: [
      {
        planItemId: "plan-item-workflow",
        category: "contract_validation",
        reason: "The shared workflow surface needs formal contract coverage.",
      },
      {
        planItemId: "plan-item-workflow",
        category: "migration_validation",
        reason: "Ordering and serialization need explicit validation.",
      },
      {
        planItemId: "plan-item-workflow",
        category: "integration",
        reason: "Cross-file workflow changes need end-to-end coverage.",
      },
    ],
    parallelization_signals: [
      {
        planItemId: "plan-item-workflow",
        signal: "risky_shared",
        reason:
          "Retries, ownership handoff, duplicate execution, stale writes, and migration ordering all touch one shared workflow area.",
      },
    ],
    carry_forward: {
      ...params.planArtifact.carry_forward,
      confidence: {
        ...params.planArtifact.carry_forward.confidence,
        level: "low",
      },
      initial_verification_targets: [
        {
          path: "src/worker.ts",
          kind: "source",
          category: "ownership",
          reason: "The shared workflow surface needs formal coverage.",
        },
      ],
      concerns: [
        {
          id: "formal-caution-note",
          source: "low_confidence",
          code: "FORMAL_CAUTION",
          message: "Formal verification should preserve caution for the shared workflow surface.",
          planItemIds: ["plan-item-workflow"],
          effects: ["planning_readiness"],
          status: "carried_forward",
        },
      ],
    },
    planning_diagnostics: {
      ...params.planArtifact.planning_diagnostics,
      usability_status: "actionable",
      warning_items: [
        {
          code: "PLAN_WARNING_CONTEXT_PRESENT",
          message: "Formal verification should preserve low-confidence caution.",
        },
      ],
      blocking_items: [],
      partial_output: null,
    },
    planning_readiness: {
      ...params.planArtifact.planning_readiness,
      ready: true,
      status: "ready_with_warnings",
      summary: "`forge verify` can proceed with caution.",
      warning_items: [
        {
          code: "PLAN_WARNING_CONTEXT_PRESENT",
          message: "Formal verification should preserve low-confidence caution.",
        },
      ],
      blocking_issues: [],
      partial_output: null,
      constraining_concern_ids: ["formal-caution-note"],
      recommended_user_actions: [],
    },
    failure: null,
  };
}
