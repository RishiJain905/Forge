import assert from "node:assert/strict";

import { buildSplitWorkstreams } from "../src/split/workstreams.js";
import type { SplitFoundationResult } from "../src/split/types.js";

function buildPlanItemEvidenceFromContext(
  context: SplitFoundationResult["splitInput"]["context"],
  concerns: SplitFoundationResult["splitInput"]["uncertainty"]["planCarryForward"]["concerns"],
): SplitFoundationResult["splitInput"]["planItemEvidence"] {
  const verificationCasePlanItemIdsById = new Map<string, string[]>();

  for (const verificationCase of context.verificationCases) {
    verificationCasePlanItemIdsById.set(verificationCase.id, verificationCase.sourcePlanItemIds);
  }

  return context.planItems.map((planItem) => ({
    planItem,
    dependencyGraphEntries: context.dependencyGraph.filter((entry) => entry.planItemId === planItem.id),
    conflictZones: context.conflictZones.filter((zone) => zone.planItemIds.includes(planItem.id)),
    testObligations: context.testObligations.filter((entry) => entry.planItemId === planItem.id),
    parallelizationSignal:
      context.parallelizationSignals.find((signal) => signal.planItemId === planItem.id) ?? null,
    verificationTargets: context.verificationTargets.filter((target) =>
      target.sourcePlanItemIds.includes(planItem.id),
    ),
    verificationCases: context.verificationCases.filter((verificationCase) =>
      verificationCase.sourcePlanItemIds.includes(planItem.id),
    ),
    findings: context.findings.filter((finding) =>
      (verificationCasePlanItemIdsById.get(finding.verification_case_id) ?? []).includes(planItem.id),
    ),
    constraints: context.constraints.filter((constraint) =>
      (verificationCasePlanItemIdsById.get(constraint.verification_case_id) ?? []).includes(planItem.id),
    ),
    concerns: concerns.filter((concern) => concern.planItemIds.includes(planItem.id)),
  }));
}

function createFoundationFixture(): SplitFoundationResult {
  const foundation = {
    command: "forge split",
    stage: "step4",
    purpose: "Transform verified planning output into safe execution-ready workstreams.",
    deterministicFirst: {
      enforced: true,
      authoritativeInputs: [".forge/verify.json", "source_plan.artifactPath"],
      notes: ["deterministic-first"],
    },
    sourceVerify: {
      artifactPath: "F:/repo/.forge/verify.json",
      command: "forge verify",
      repoRoot: "F:/repo",
      status: "ready",
      summary: "Verify is ready for split.",
      readyForSplit: true,
      verificationDiagnostics: {
        usability_status: "actionable",
        warning_items: [],
        blocking_items: [],
        partial_output: null,
      },
      verificationReadinessStatus: "ready",
      verificationReadiness: {
        ready: true,
        status: "ready",
        summary: "Split can proceed.",
        warning_items: [],
        blocking_issues: [],
        partial_output: null,
        constraining_concern_ids: [],
        recommended_user_actions: [],
      },
      failure: null,
    },
    sourcePlan: {
      artifactPath: "F:/repo/.forge/plan.json",
      command: "forge plan",
      repoRoot: "F:/repo",
      status: "ready",
      summary: "Plan is ready for verification.",
      readyForVerification: true,
      planningDiagnostics: {
        usability_status: "actionable",
        warning_items: [],
        blocking_items: [],
        partial_output: null,
        planning_assist: {
          outcome: "not_attempted",
          attempted: false,
          used: false,
          provider: null,
          warnings: [],
          ignoredEdits: [],
          reportNotes: [],
        },
      },
      planningReadiness: {
        ready: true,
        status: "ready",
        summary: "Plan can proceed.",
        warning_items: [],
        blocking_issues: [],
        partial_output: null,
        constraining_concern_ids: [],
        recommended_user_actions: [],
      },
      failure: null,
    },
    splitInput: {
      context: {
        planItemContract: {
          requiredFields: [
            "id",
            "title",
            "description",
            "category",
            "sourceRequirements",
            "likelyAffectedPaths",
            "dependencies",
            "riskLevel",
            "testObligations",
            "verificationRelevance",
            "parallelization",
          ],
          categories: ["implementation", "test", "interface", "config", "documentation", "foundation"],
          dependencyTypes: ["hard", "soft", "sequencing", "interface_first"],
          riskLevels: ["low", "medium", "high"],
          testObligationCategories: [
            "unit",
            "integration",
            "regression",
            "smoke",
            "migration_validation",
            "contract_validation",
          ],
          verificationCategories: [
            "code_surface",
            "test_surface",
            "config_surface",
            "retry_logic",
            "ownership",
            "api_contract",
            "migration_order",
            "parallel_overlap",
            "stale_write",
          ],
          parallelizationSignals: [
            "serial_only",
            "safe_parallel",
            "parallel_after_dependency",
            "risky_shared",
            "protected_merge_order",
          ],
        },
        planItems: [
          {
            id: "plan-serial",
            title: "Serialize config migration",
            description: "Apply the migration in isolation.",
            category: "config",
            sourceRequirements: ["Serialize config migration"],
            likelyAffectedPaths: ["config/app.json"],
            dependencies: [],
            riskLevel: "high",
            testObligations: [{ category: "migration_validation", reason: "Migration ordering matters." }],
            verificationRelevance: {
              relevant: true,
              categories: ["migration_order"],
              notes: ["Ordering-sensitive config migration."],
            },
            parallelization: {
              signal: "serial_only",
              reason: "Migration must run in isolation.",
            },
          },
          {
            id: "plan-safe",
            title: "Update isolated helper",
            description: "Change a leaf helper safely.",
            category: "implementation",
            sourceRequirements: ["Update isolated helper"],
            likelyAffectedPaths: ["src/helper.ts"],
            dependencies: [],
            riskLevel: "low",
            testObligations: [{ category: "unit", reason: "Helper behavior should stay covered." }],
            verificationRelevance: {
              relevant: false,
              categories: [],
              notes: [],
            },
            parallelization: {
              signal: "safe_parallel",
              reason: "Leaf helper work is isolated.",
            },
          },
          {
            id: "plan-after",
            title: "Align helper tests",
            description: "Update the dependent helper test after helper changes land.",
            category: "test",
            sourceRequirements: ["Align helper tests"],
            likelyAffectedPaths: ["tests/helper.test.ts"],
            dependencies: [
              { planItemId: "plan-safe", type: "hard", reason: "Tests depend on helper updates." },
              {
                planItemId: "plan-serial",
                type: "hard",
                reason: "The helper test also waits for the config migration to settle.",
              },
            ],
            riskLevel: "medium",
            testObligations: [{ category: "regression", reason: "Regression coverage must stay aligned." }],
            verificationRelevance: {
              relevant: true,
              categories: ["test_surface"],
              notes: ["Depends on source change first."],
            },
            parallelization: {
              signal: "parallel_after_dependency",
              reason: "Only safe after the source update merges first.",
            },
          },
          {
            id: "plan-protected",
            title: "Protect shared interface change",
            description: "Update a shared interface with merge protection.",
            category: "interface",
            sourceRequirements: ["Protect shared interface change"],
            likelyAffectedPaths: ["src/contracts.ts"],
            dependencies: [],
            riskLevel: "high",
            testObligations: [{ category: "contract_validation", reason: "Contract changes need protected validation." }],
            verificationRelevance: {
              relevant: true,
              categories: ["api_contract", "parallel_overlap"],
              notes: ["Shared interface work stays merge-sensitive."],
            },
            parallelization: {
              signal: "protected_merge_order",
              reason: "Shared interface work needs protected merge sequencing.",
            },
          },
          {
            id: "plan-blocked",
            title: "Repair ownership workflow",
            description: "Fix ownership logic currently blocked by formal evidence.",
            category: "implementation",
            sourceRequirements: ["Repair ownership workflow"],
            likelyAffectedPaths: ["src/ownership.ts"],
            dependencies: [],
            riskLevel: "high",
            testObligations: [{ category: "integration", reason: "Ownership flow needs integration coverage." }],
            verificationRelevance: {
              relevant: true,
              categories: ["ownership", "stale_write"],
              notes: ["Formal evidence blocks execution until repaired."],
            },
            parallelization: {
              signal: "safe_parallel",
              reason: "Would be safe in isolation without the formal failure.",
            },
          },
          {
            id: "plan-shared-a",
            title: "Update shared alpha helper",
            description: "Refine the first helper on the shared module surface.",
            category: "implementation",
            sourceRequirements: ["Update shared alpha helper"],
            likelyAffectedPaths: ["src/shared/core/alpha.ts"],
            dependencies: [],
            riskLevel: "low",
            testObligations: [{ category: "unit", reason: "Shared alpha helper behavior should stay covered." }],
            verificationRelevance: {
              relevant: true,
              categories: ["code_surface"],
              notes: ["Shares the same module surface as the sibling helper update."],
            },
            parallelization: {
              signal: "safe_parallel",
              reason: "Shared alpha helper work is isolated on its own path.",
            },
          },
          {
            id: "plan-shared-b",
            title: "Update shared beta helper",
            description: "Refine the second helper on the shared module surface.",
            category: "implementation",
            sourceRequirements: ["Update shared beta helper"],
            likelyAffectedPaths: ["src/shared/core/beta.ts"],
            dependencies: [],
            riskLevel: "low",
            testObligations: [{ category: "regression", reason: "Shared beta helper behavior should stay covered." }],
            verificationRelevance: {
              relevant: true,
              categories: ["code_surface"],
              notes: ["Shares the same module surface as the sibling helper update."],
            },
            parallelization: {
              signal: "safe_parallel",
              reason: "Shared beta helper work is isolated on its own path.",
            },
          },
        ],
        dependencyGraph: [
          {
            planItemId: "plan-after",
            dependsOnPlanItemId: "plan-safe",
            type: "hard",
            reason: "Tests depend on helper updates.",
          },
          {
            planItemId: "plan-after",
            dependsOnPlanItemId: "plan-serial",
            type: "hard",
            reason: "The helper test also waits for the config migration to settle.",
          },
        ],
        conflictZones: [
          {
            id: "zone-interface",
            title: "Shared interface overlap",
            reason: "Shared interface work crosses central contract boundaries.",
            paths: ["src/contracts.ts"],
            planItemIds: ["plan-protected"],
            riskLevel: "high",
          },
        ],
        testObligations: [
          {
            planItemId: "plan-blocked",
            category: "integration",
            reason: "Ownership flow needs integration coverage.",
          },
          {
            planItemId: "plan-shared-a",
            category: "unit",
            reason: "Shared alpha helper behavior should stay covered.",
          },
          {
            planItemId: "plan-shared-b",
            category: "regression",
            reason: "Shared beta helper behavior should stay covered.",
          },
        ],
        parallelizationSignals: [
          { planItemId: "plan-serial", signal: "serial_only", reason: "Migration must run in isolation." },
          { planItemId: "plan-safe", signal: "safe_parallel", reason: "Leaf helper work is isolated." },
          {
            planItemId: "plan-after",
            signal: "parallel_after_dependency",
            reason: "Only safe after helper updates merge.",
          },
          {
            planItemId: "plan-protected",
            signal: "protected_merge_order",
            reason: "Shared interface work needs protected merge sequencing.",
          },
          {
            planItemId: "plan-blocked",
            signal: "safe_parallel",
            reason: "Would be safe without formal blocking evidence.",
          },
          { planItemId: "plan-shared-a", signal: "safe_parallel", reason: "Shared alpha helper work is isolated." },
          { planItemId: "plan-shared-b", signal: "safe_parallel", reason: "Shared beta helper work is isolated." },
        ],
        verificationTargetContract: {
          requiredFields: [
            "id",
            "title",
            "category",
            "sourcePlanItemIds",
            "riskSummary",
            "candidateLanes",
            "sourceRiskSources",
            "expectedFindingKinds",
            "verificationCaseIds",
            "traceabilityNotes",
          ],
          riskSources: [
            "plan_item_verification_relevance",
            "test_obligation",
            "conflict_zone",
            "parallelization_signal",
            "carry_forward_concern",
            "initial_verification_target",
          ],
          structuralFocusAreas: [
            "dependency_contradiction",
            "unsafe_sequencing",
            "unsafe_parallelization",
            "conflict_zone_hazard",
            "merge_or_serialization_contradiction",
          ],
          formalFocusAreas: [
            "retry_logic",
            "handoff_logic",
            "ownership_transition",
            "duplicate_execution_risk",
            "stale_write_risk",
            "ordering_constraint",
          ],
          supportedLanes: ["structural", "formal"],
        },
        formalLaneContract: {
          tooling: ["TLA+", "TLC"],
          scenarioKinds: [
            "ordering_serialization",
            "shared_artifact_merge_order",
            "ownership_transition",
            "multi_agent_handoff_chain",
            "duplicate_execution",
            "shared_resource_mutation_overlap",
            "retry_reassignment",
            "queue_claim_release_lifecycle",
            "failure_recovery_loop",
            "stale_write_validity",
          ],
          entryCriteria: [
            "state_machine_like",
            "multi_actor_or_interleaving",
            "retry_or_reassignment",
            "ownership_or_version_validity",
            "ordering_critical",
            "structural_check_insufficient",
          ],
          stateModelRequiredFields: [
            "actors",
            "entities",
            "states",
            "transitions",
            "unsafe_states",
            "unsafe_conditions",
            "invariants",
            "initial_conditions",
          ],
          tlcStatuses: ["not_run", "passed", "failed", "errored", "invalid_spec", "inconclusive"],
        },
        verificationTargets: [
          {
            id: "target-protected",
            title: "Protect shared interface change",
            category: "api_contract",
            sourcePlanItemIds: ["plan-protected"],
            riskSummary: "Shared interface changes require protected merge order.",
            candidateLanes: ["structural"],
            sourceRiskSources: ["parallelization_signal", "conflict_zone"],
            expectedFindingKinds: ["protected_merge"],
            verificationCaseIds: ["case-protected"],
            traceabilityNotes: ["Shared interface work stays merge-sensitive."],
          },
          {
            id: "target-blocked",
            title: "Repair ownership workflow",
            category: "ownership",
            sourcePlanItemIds: ["plan-blocked"],
            riskSummary: "Formal evidence blocks the ownership flow.",
            candidateLanes: ["formal"],
            sourceRiskSources: ["plan_item_verification_relevance"],
            expectedFindingKinds: ["blocked"],
            verificationCaseIds: ["case-blocked"],
            traceabilityNotes: ["Blocked until formal ownership failure is resolved."],
          },
          {
            id: "target-shared-surface",
            title: "Shared helper surface updates",
            category: "code_surface",
            sourcePlanItemIds: ["plan-shared-a", "plan-shared-b"],
            riskSummary: "Sibling helper updates share a stable code surface and can stay grouped.",
            candidateLanes: ["structural"],
            sourceRiskSources: ["plan_item_verification_relevance"],
            expectedFindingKinds: ["surface_overlap"],
            verificationCaseIds: ["case-shared-a", "case-shared-b"],
            traceabilityNotes: ["Shared helper work stays auditable as one surface group."],
          },
        ],
        verificationCases: [
          {
            id: "case-protected",
            verificationTargetId: "target-protected",
            title: "Shared interface merge protection",
            category: "api_contract",
            sourcePlanItemIds: ["plan-protected"],
            lanes: ["structural"],
            goal: "Keep shared interface merges protected.",
            status: "passed",
            summary: "Protected merge requirement remains in force.",
            findings: [],
            mitigations: ["Merge behind protected validation."],
            constraints: ["constraint-protected"],
            traceabilityNotes: ["Shared interface work stays merge-sensitive."],
            formalDetails: null,
          },
          {
            id: "case-blocked",
            verificationTargetId: "target-blocked",
            title: "Ownership transition failure",
            category: "ownership",
            sourcePlanItemIds: ["plan-blocked"],
            lanes: ["formal"],
            goal: "Block unsafe ownership updates until repaired.",
            status: "failed",
            summary: "Formal ownership validation failed.",
            findings: ["finding-blocked"],
            mitigations: [],
            constraints: ["constraint-blocked"],
            traceabilityNotes: ["Blocked until formal ownership failure is resolved."],
            formalDetails: {
              enteredFormalLane: true,
              entryCriteria: ["ownership_or_version_validity"],
              stateModelId: "state-blocked",
              tlaSpecId: "tla-blocked",
              tlcResultId: "tlc-blocked",
              scenarioKind: "ownership_transition",
              cautionNotes: ["Counterexample shows unsafe ownership handoff."],
              trace: "OwnerA -> OwnerB -> stale write",
              errors: [],
            },
          },
          {
            id: "case-shared-a",
            verificationTargetId: "target-shared-surface",
            title: "Shared alpha helper surface verification",
            category: "code_surface",
            sourcePlanItemIds: ["plan-shared-a"],
            lanes: ["structural"],
            goal: "Keep the shared alpha helper aligned.",
            status: "passed",
            summary: "Shared alpha helper remains aligned.",
            findings: ["finding-shared-a"],
            mitigations: ["Keep the grouped stream together."],
            constraints: ["constraint-shared-a"],
            traceabilityNotes: ["Shared alpha helper stays tied to the shared surface target."],
            formalDetails: null,
          },
          {
            id: "case-shared-b",
            verificationTargetId: "target-shared-surface",
            title: "Shared beta helper surface verification",
            category: "code_surface",
            sourcePlanItemIds: ["plan-shared-b"],
            lanes: ["structural"],
            goal: "Keep the shared beta helper aligned.",
            status: "passed",
            summary: "Shared beta helper remains aligned.",
            findings: ["finding-shared-b"],
            mitigations: ["Keep the grouped stream together."],
            constraints: ["constraint-shared-b"],
            traceabilityNotes: ["Shared beta helper stays tied to the shared surface target."],
            formalDetails: null,
          },
        ],
        findings: [
          {
            id: "finding-blocked",
            lane: "formal",
            verification_case_id: "case-blocked",
            verification_target_id: "target-blocked",
            status: "failed",
            summary: "Formal ownership failure blocks this workstream.",
            tla_spec_id: "tla-blocked",
            tlc_result_id: "tlc-blocked",
            trace: "OwnerA -> OwnerB -> stale write",
            errors: [],
          },
          {
            id: "finding-shared-a",
            lane: "structural",
            verification_case_id: "case-shared-a",
            verification_target_id: "target-shared-surface",
            status: "passed",
            summary: "Shared alpha helper remains aligned.",
            tla_spec_id: null,
            tlc_result_id: null,
            trace: null,
            errors: [],
          },
          {
            id: "finding-shared-b",
            lane: "structural",
            verification_case_id: "case-shared-b",
            verification_target_id: "target-shared-surface",
            status: "passed",
            summary: "Shared beta helper remains aligned.",
            tla_spec_id: null,
            tlc_result_id: null,
            trace: null,
            errors: [],
          },
        ],
        constraints: [
          {
            id: "constraint-protected",
            lane: "structural",
            verification_case_id: "case-protected",
            verification_target_id: "target-protected",
            summary: "Protected merge is required for the shared interface stream.",
          },
          {
            id: "constraint-blocked",
            lane: "formal",
            verification_case_id: "case-blocked",
            verification_target_id: "target-blocked",
            summary: "Ownership flow is blocked until the formal failure is repaired.",
          },
          {
            id: "constraint-shared-a",
            lane: "structural",
            verification_case_id: "case-shared-a",
            verification_target_id: "target-shared-surface",
            summary: "Shared alpha helper should stay grouped on the shared surface.",
          },
          {
            id: "constraint-shared-b",
            lane: "structural",
            verification_case_id: "case-shared-b",
            verification_target_id: "target-shared-surface",
            summary: "Shared beta helper should stay grouped on the shared surface.",
          },
        ],
      },
      uncertainty: {
        sourceIntake: {
          artifactPath: "F:/repo/.forge/intake.json",
          command: "forge intake",
          status: "success",
          summary: "Intake is ready for planning.",
          readyForPlanning: true,
        },
        planCarryForward: {
          task_spec: {} as never,
          repo_context: {} as never,
          candidate_targets: [],
          risk_analysis: {} as never,
          initial_verification_targets: [],
          ambiguities: [],
          warnings: [],
          confidence: {
            level: "medium",
            summary: "Conservative confidence remains visible.",
            reasons: ["Shared interface and ownership work remain risky."],
            component_scores: {
              parser: "strong",
              repo: "strong",
              targeting: "partial",
              ambiguity: "partial",
            },
          },
          next_step_readiness: {
            ready: true,
            status: "ready_with_warnings",
            summary: "Planning can proceed with caution.",
            recommended_actions: ["Keep conservative ownership constraints visible."],
          },
          concerns: [
            {
              id: "concern-blocked",
              source: "warning",
              code: "OWNERSHIP_CAUTION",
              message: "Ownership work stays risky until the formal issue is repaired.",
              planItemIds: ["plan-blocked"],
              effects: ["parallelization_caution"],
              status: "carried_forward",
            },
          ],
        },
        planningDiagnostics: {
          usability_status: "actionable",
          warning_items: [],
          blocking_items: [],
          partial_output: null,
          planning_assist: {
            outcome: "not_attempted",
            attempted: false,
            used: false,
            provider: null,
            warnings: [],
            ignoredEdits: [],
            reportNotes: [],
          },
        },
        planningReadiness: {
          ready: true,
          status: "ready",
          summary: "Plan can proceed.",
          warning_items: [],
          blocking_issues: [],
          partial_output: null,
          constraining_concern_ids: [],
          recommended_user_actions: [],
        },
        verifyCarryForward: {
          task_spec: {} as never,
          repo_context: {} as never,
          candidate_targets: [],
          risk_analysis: {} as never,
          initial_verification_targets: [],
          ambiguities: [],
          warnings: [],
          confidence: {
            level: "medium",
            summary: "Conservative confidence remains visible.",
            reasons: ["Shared interface and ownership work remain risky."],
            component_scores: {
              parser: "strong",
              repo: "strong",
              targeting: "partial",
              ambiguity: "partial",
            },
          },
          next_step_readiness: {
            ready: true,
            status: "ready_with_warnings",
            summary: "Planning can proceed with caution.",
            recommended_actions: ["Keep conservative ownership constraints visible."],
          },
          concerns: [
            {
              id: "concern-blocked",
              source: "warning",
              code: "OWNERSHIP_CAUTION",
              message: "Ownership work stays risky until the formal issue is repaired.",
              planItemIds: ["plan-blocked"],
              effects: ["parallelization_caution"],
              status: "carried_forward",
            },
          ],
        },
        verificationDiagnostics: {
          usability_status: "actionable",
          warning_items: [],
          blocking_items: [],
          partial_output: null,
        },
        verificationReadiness: {
          ready: true,
          status: "ready",
          summary: "Split can proceed.",
          warning_items: [],
          blocking_issues: [],
          partial_output: null,
          constraining_concern_ids: [],
          recommended_user_actions: [],
        },
      },
      usability: {
        status: "actionable",
        warningItems: [],
        blockingItems: [],
      },
    },
    carryForward: {
      sourceIntake: {
        artifactPath: "F:/repo/.forge/intake.json",
        command: "forge intake",
        status: "success",
        summary: "Intake is ready for planning.",
        readyForPlanning: true,
      },
      planCarryForward: {
        task_spec: {} as never,
        repo_context: {} as never,
        candidate_targets: [],
        risk_analysis: {} as never,
        initial_verification_targets: [],
        ambiguities: [],
        warnings: [],
        confidence: {
          level: "medium",
          summary: "Conservative confidence remains visible.",
          reasons: ["Shared interface and ownership work remain risky."],
          component_scores: {
            parser: "strong",
            repo: "strong",
            targeting: "partial",
            ambiguity: "partial",
          },
        },
        next_step_readiness: {
          ready: true,
          status: "ready_with_warnings",
          summary: "Planning can proceed with caution.",
          recommended_actions: ["Keep conservative ownership constraints visible."],
        },
        concerns: [
          {
            id: "concern-blocked",
            source: "warning",
            code: "OWNERSHIP_CAUTION",
            message: "Ownership work stays risky until the formal issue is repaired.",
            planItemIds: ["plan-blocked"],
            effects: ["parallelization_caution"],
            status: "carried_forward",
          },
        ],
      },
      planningDiagnostics: {
        usability_status: "actionable",
        warning_items: [],
        blocking_items: [],
        partial_output: null,
        planning_assist: {
          outcome: "not_attempted",
          attempted: false,
          used: false,
          provider: null,
          warnings: [],
          ignoredEdits: [],
          reportNotes: [],
        },
      },
      planningReadiness: {
        ready: true,
        status: "ready",
        summary: "Plan can proceed.",
        warning_items: [],
        blocking_issues: [],
        partial_output: null,
        constraining_concern_ids: [],
        recommended_user_actions: [],
      },
      verifyCarryForward: {
        task_spec: {} as never,
        repo_context: {} as never,
        candidate_targets: [],
        risk_analysis: {} as never,
        initial_verification_targets: [],
        ambiguities: [],
        warnings: [],
        confidence: {
          level: "medium",
          summary: "Conservative confidence remains visible.",
          reasons: ["Shared interface and ownership work remain risky."],
          component_scores: {
            parser: "strong",
            repo: "strong",
            targeting: "partial",
            ambiguity: "partial",
          },
        },
        next_step_readiness: {
          ready: true,
          status: "ready_with_warnings",
          summary: "Planning can proceed with caution.",
          recommended_actions: ["Keep conservative ownership constraints visible."],
        },
        concerns: [
          {
            id: "concern-blocked",
            source: "warning",
            code: "OWNERSHIP_CAUTION",
            message: "Ownership work stays risky until the formal issue is repaired.",
            planItemIds: ["plan-blocked"],
            effects: ["parallelization_caution"],
            status: "carried_forward",
          },
        ],
      },
      verificationDiagnostics: {
        usability_status: "actionable",
        warning_items: [],
        blocking_items: [],
        partial_output: null,
      },
      verificationReadiness: {
        ready: true,
        status: "ready",
        summary: "Split can proceed.",
        warning_items: [],
        blocking_issues: [],
        partial_output: null,
        constraining_concern_ids: [],
        recommended_user_actions: [],
      },
    },
    boundaryPolicy: {
      command: "forge split",
      stage: "step4",
      purpose: "Transform verified planning output into safe execution-ready workstreams.",
      batch2Mission: "Make forge split run through the real Step 4 pipeline and produce usable split outputs.",
      implementationPriorities: [
        "verify-artifact consumption",
        "workstream construction",
        "stream categories and safety application",
        "merge-order and blocking logic",
        "machine-readable artifact generation",
        "human-readable split report",
        "stable split orchestration",
        "real tests for implemented behavior",
      ],
      requiredImplementationTasks: [
        "align current Step 4 code with the locked split contract",
        "ensure one real orchestration path exists",
        "build workstream construction first",
        "stabilize stream categorization and safety application",
        "implement merge-order and blocking logic",
        "build real artifact/report output",
        "wire the command and harden with tests",
      ],
      requiredCodeSurfaces: [
        "Step 4 shared types/contracts",
        "Step 3 artifact consumption layer",
        "workstream construction",
        "stream-category logic",
        "merge-order logic",
        "blocking logic",
        "carried-constraint logic",
        "artifact/report builders",
        "persistence",
        "Step 4 runner/orchestrator",
        "CLI wiring",
        "Step 4 tests",
      ],
      authoritativeInputs: [".forge/verify.json", "source_plan.artifactPath"],
      deterministicFirst: true,
      conservativeRegrouping: true,
      deterministicFirstNotes: ["deterministic-first"],
      conservativeRegroupingNotes: ["one-stream-per-plan-item"],
      allowedSideEffects: ["read persisted artifacts", "write split outputs"],
      deferredCapabilities: ["forge execute"],
      disallowedCapabilities: ["modify code"],
    },
      workstreamContract: {
        requiredFields: [
          "id",
          "title",
        "description",
        "category",
        "sourcePlanItemIds",
        "sourceVerificationCaseIds",
        "sourceFindingIds",
        "likelyAffectedPaths",
        "streamDependencies",
        "mergeOrderRequirements",
        "constraints",
        "blockedReason",
      ],
      categories: ["serial", "safe_parallel", "parallel_after_dependency", "protected_merge", "blocked"],
      constraintSources: [
        "dependency_graph",
        "conflict_zone",
        "test_obligation",
        "verification_target",
        "verification_case",
        "structural_finding",
        "formal_finding",
        "verification_constraint",
        "carry_forward_concern",
        "verification_readiness",
        ],
      },
  } as unknown as SplitFoundationResult;

  return {
    ...foundation,
    splitInput: {
      ...foundation.splitInput,
      planItemEvidence: buildPlanItemEvidenceFromContext(
        foundation.splitInput.context,
        foundation.splitInput.uncertainty.planCarryForward.concerns,
      ),
    },
  };
}

async function runScenario(name: string, scenario: () => Promise<void> | void): Promise<void> {
  try {
    await scenario();
    process.stdout.write(`PASS ${name}\n`);
  } catch (error) {
    process.stderr.write(`FAIL ${name}\n`);
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

await runScenario(
  "buildSplitWorkstreams groups the helper/test pair and same-surface siblings while preserving blocked workstreams",
  () => {
    const result = buildSplitWorkstreams({ foundation: createFoundationFixture() });

    assert.equal(result.workstreams.length, 5);
    assert.deepEqual(
      result.workstreams.map((workstream: { id: string; category: string }) => [workstream.id, workstream.category]),
      [
        ["ws-plan-serial", "serial"],
        ["ws-plan-safe__plan-after", "parallel_after_dependency"],
        ["ws-plan-protected", "protected_merge"],
        ["ws-plan-blocked", "blocked"],
        ["ws-plan-shared-a__plan-shared-b", "protected_merge"],
      ],
    );

    const groupedTestStream = result.workstreams.find(
      (workstream: { id: string }) => workstream.id === "ws-plan-safe__plan-after",
    );
    assert.ok(groupedTestStream);
    assert.deepEqual(groupedTestStream.sourcePlanItemIds, ["plan-safe", "plan-after"]);
    assert.match(groupedTestStream.description, /grouped/i);

    const groupedSharedStream = result.workstreams.find(
      (workstream: { id: string }) => workstream.id === "ws-plan-shared-a__plan-shared-b",
    );
    assert.ok(groupedSharedStream);
    assert.deepEqual(groupedSharedStream.sourcePlanItemIds, ["plan-shared-a", "plan-shared-b"]);
    assert.match(groupedSharedStream.description, /grouped/i);

    const blockedStream = result.workstreams.find(
      (workstream: { id: string }) => workstream.id === "ws-plan-blocked",
    );
    assert.ok(blockedStream);
    assert.deepEqual(blockedStream.sourcePlanItemIds, ["plan-blocked"]);
    assert.deepEqual(blockedStream.sourceVerificationCaseIds, ["case-blocked"]);
    assert.deepEqual(blockedStream.sourceFindingIds, ["finding-blocked"]);
    assert.match(blockedStream.blockedReason ?? "", /formal ownership failure/i);
    assert.ok(
      result.workstreams.every((workstream) => !/Batch 1/i.test(workstream.description)),
      "expected Batch 2 workstream descriptions to avoid stale Batch 1 wording",
    );
  },
);

await runScenario(
  "buildSplitWorkstreams keeps migration-order source/test pairs separate instead of regrouping them",
  () => {
    const foundation = createFoundationFixture();
    const planAfter = foundation.splitInput.context.planItems.find((item) => item.id === "plan-after");

    if (!planAfter) {
      throw new Error("Expected the fixture to include plan-after work items.");
    }

    planAfter.verificationRelevance.categories = [
      ...planAfter.verificationRelevance.categories,
      "migration_order",
    ];
    foundation.splitInput.planItemEvidence = buildPlanItemEvidenceFromContext(
      foundation.splitInput.context,
      foundation.splitInput.uncertainty.planCarryForward.concerns,
    );

    const result = buildSplitWorkstreams({ foundation });

    assert.ok(result.workstreams.some((workstream) => workstream.id === "ws-plan-safe"));
    assert.ok(result.workstreams.some((workstream) => workstream.id === "ws-plan-after"));
    assert.ok(
      result.workstreams.every((workstream) => workstream.id !== "ws-plan-safe__plan-after"),
      "expected migration-order source/test pairs to stay separate",
    );
  },
);

await runScenario(
  "buildSplitWorkstreams keeps sequencing source/test pairs separate instead of regrouping them",
  () => {
    const foundation = createFoundationFixture();
    const planAfter = foundation.splitInput.context.planItems.find((item) => item.id === "plan-after");
    const dependencyGraphEntry = foundation.splitInput.context.dependencyGraph.find(
      (entry) =>
        entry.planItemId === "plan-after" &&
        entry.dependsOnPlanItemId === "plan-safe",
    );

    if (!planAfter || !dependencyGraphEntry) {
      throw new Error("Expected the fixture to include plan-after source/test work items.");
    }

    planAfter.dependencies = [
      {
        planItemId: "plan-safe",
        type: "sequencing",
        reason: "Dependency ordering should not qualify as a direct pair for regrouping.",
      },
      ...planAfter.dependencies.slice(1),
    ];
    dependencyGraphEntry.type = "sequencing";
    foundation.splitInput.planItemEvidence = buildPlanItemEvidenceFromContext(
      foundation.splitInput.context,
      foundation.splitInput.uncertainty.planCarryForward.concerns,
    );

    const result = buildSplitWorkstreams({ foundation });

    assert.ok(result.workstreams.some((workstream) => workstream.id === "ws-plan-safe"));
    assert.ok(result.workstreams.some((workstream) => workstream.id === "ws-plan-after"));
    assert.ok(
      result.workstreams.every((workstream) => workstream.id !== "ws-plan-safe__plan-after"),
      "expected sequencing source/test pairs to stay separate",
    );
  },
);

await runScenario(
  "buildSplitWorkstreams prefers the more specific nested helper test when multiple direct candidates are eligible",
  () => {
    const foundation = createFoundationFixture();
    const planAfter = foundation.splitInput.context.planItems.find((item) => item.id === "plan-after");

    if (!planAfter) {
      throw new Error("Expected the fixture to include plan-after work items.");
    }

    const nestedTestItem = {
      ...planAfter,
      id: "plan-after-nested",
      title: "Align nested helper tests",
      description: "Update the nested dependent helper test after helper changes land.",
      likelyAffectedPaths: ["tests/unit/helper.test.ts"],
      verificationRelevance: {
        ...planAfter.verificationRelevance,
        notes: [
          "Depends on source change first.",
          "Nested test path should still resolve to the helper surface.",
        ],
      },
    };

    foundation.splitInput.context.planItems = [
      ...foundation.splitInput.context.planItems,
      nestedTestItem,
    ];
    foundation.splitInput.context.dependencyGraph = [
      ...foundation.splitInput.context.dependencyGraph,
      {
        planItemId: "plan-after-nested",
        dependsOnPlanItemId: "plan-safe",
        type: "hard",
        reason: "Nested helper tests depend on helper updates.",
      },
    ];
    foundation.splitInput.context.parallelizationSignals = [
      ...foundation.splitInput.context.parallelizationSignals,
      {
        planItemId: "plan-after-nested",
        signal: "parallel_after_dependency",
        reason: "Only safe after the source update merges first.",
      },
    ];
    foundation.splitInput.planItemEvidence = buildPlanItemEvidenceFromContext(
      foundation.splitInput.context,
      foundation.splitInput.uncertainty.planCarryForward.concerns,
    );

    const result = buildSplitWorkstreams({ foundation });

    assert.ok(result.workstreams.some((workstream) => workstream.id === "ws-plan-safe__plan-after-nested"));
    assert.ok(result.workstreams.some((workstream) => workstream.id === "ws-plan-after"));
    assert.ok(
      result.workstreams.every((workstream) => workstream.id !== "ws-plan-safe__plan-after"),
      "expected the more specific nested helper path to win the direct pairing tie-break",
    );
  },
);

await runScenario(
  "buildSplitWorkstreams derives dependency edges and deterministic merge order for grouped constrained streams",
  () => {
    const result = buildSplitWorkstreams({ foundation: createFoundationFixture() });

    assert.deepEqual(result.dependencyEdges, [
      {
        upstreamWorkstreamId: "ws-plan-serial",
        downstreamWorkstreamId: "ws-plan-safe__plan-after",
        reason: "The helper test also waits for the config migration to settle.",
      },
    ]);

    assert.deepEqual(
      result.mergeOrder.map((entry: { workstreamId: string; order: number }) => [entry.workstreamId, entry.order]),
      [
        ["ws-plan-serial", 1],
        ["ws-plan-protected", 2],
        ["ws-plan-shared-a__plan-shared-b", 3],
        ["ws-plan-safe__plan-after", 4],
      ],
    );
  },
);

await runScenario(
  "buildSplitWorkstreams keeps cyclic source/test pairs separate instead of regrouping them",
  () => {
    const foundation = createFoundationFixture();
    const safeItem = foundation.splitInput.context.planItems.find((item) => item.id === "plan-safe");
    const afterItem = foundation.splitInput.context.planItems.find((item) => item.id === "plan-after");

    if (!safeItem || !afterItem) {
      throw new Error("Expected the fixture to include plan-safe and plan-after work items.");
    }

    safeItem.dependencies = [
      {
        planItemId: "plan-after",
        type: "hard",
        reason: "Introduce a cycle for regression coverage.",
      },
    ];
    afterItem.dependencies = [
      {
        planItemId: "plan-safe",
        type: "hard",
        reason: "Introduce a cycle for regression coverage.",
      },
    ];
    foundation.splitInput.context.dependencyGraph = [
      {
        planItemId: "plan-safe",
        dependsOnPlanItemId: "plan-after",
        type: "hard",
        reason: "Introduce a cycle for regression coverage.",
      },
      {
        planItemId: "plan-after",
        dependsOnPlanItemId: "plan-safe",
        type: "hard",
        reason: "Introduce a cycle for regression coverage.",
      },
    ];
    foundation.splitInput.planItemEvidence = buildPlanItemEvidenceFromContext(
      foundation.splitInput.context,
      foundation.splitInput.uncertainty.planCarryForward.concerns,
    );

    const result = buildSplitWorkstreams({ foundation });

    assert.equal(result.workstreams.length, 6);
    assert.ok(result.workstreams.some((workstream) => workstream.id === "ws-plan-safe"));
    assert.ok(result.workstreams.some((workstream) => workstream.id === "ws-plan-after"));
    assert.ok(
      result.workstreams.every((workstream) => workstream.id !== "ws-plan-safe__plan-after"),
      "expected cyclic source/test pairs to stay separate",
    );
    assert.deepEqual(
      result.mergeOrder.map((entry: { workstreamId: string }) => entry.workstreamId),
      ["ws-plan-serial", "ws-plan-protected", "ws-plan-shared-a__plan-shared-b", "ws-plan-after"],
    );
  },
);

await runScenario(
  "buildSplitWorkstreams emits explicit Part 4 merge-order rule objects and blocked-item records",
  () => {
    const result = buildSplitWorkstreams({ foundation: createFoundationFixture() }) as unknown as {
      mergeOrder: Array<{
        id: string;
        workstreamId: string;
        order: number;
        ruleType: string;
        mustMergeAfterWorkstreamIds: string[];
        sourceConstraintIds: string[];
      }>;
      blockedItems: Array<{
        id: string;
        kind: string;
        workstreamId: string | null;
        partialMetadataAvailable: boolean;
        sourceFindingIds: string[];
        sourceConstraintIds: string[];
      }>;
      streamConstraintDetails: Array<{
        workstreamId: string;
        appliedRules: string[];
        sourceDependencyIds: string[];
        sourceConflictZoneIds: string[];
        sourceTestObligationIds: string[];
        sourceVerificationTargetIds: string[];
        sourceReadinessIds: string[];
        mergeOrderRuleIds: string[];
        blockedItemIds: string[];
      }>;
    };

    assert.ok(
      result.mergeOrder.every((entry) => entry.id.length > 0),
      "expected merge-order rules to have stable ids",
    );
    assert.ok(
      result.mergeOrder.some((entry) =>
        entry.workstreamId === "ws-plan-safe__plan-after" &&
        entry.ruleType === "dependency" &&
        entry.mustMergeAfterWorkstreamIds.includes("ws-plan-serial"),
      ),
      "expected dependency-driven merge order to be explicit",
    );
    assert.ok(
      result.mergeOrder.some((entry) =>
        entry.workstreamId === "ws-plan-protected" &&
        entry.ruleType === "protected_merge" &&
        entry.sourceConstraintIds.includes("constraint-protected"),
      ),
      "expected protected-merge rules to stay source-traceable",
    );
    assert.ok(
      result.mergeOrder.some((entry) =>
        entry.workstreamId === "ws-plan-shared-a__plan-shared-b" &&
        entry.ruleType === "protected_merge" &&
        entry.sourceConstraintIds.includes("constraint-shared-a") &&
        entry.sourceConstraintIds.includes("constraint-shared-b"),
      ),
      "expected same-surface grouped workstreams to keep both constraint sources visible",
    );

    assert.ok(
      result.blockedItems.some((item) =>
        item.kind === "blocked_workstream" &&
        item.workstreamId === "ws-plan-blocked" &&
        item.partialMetadataAvailable === true &&
        item.sourceFindingIds.includes("finding-blocked") &&
        item.sourceConstraintIds.includes("constraint-blocked"),
      ),
      "expected blocked workstreams to become explicit blocked-item records with partial metadata",
    );

    assert.ok(
      result.streamConstraintDetails.some((detail) =>
        detail.workstreamId === "ws-plan-safe__plan-after" &&
        detail.sourceDependencyIds.length > 0 &&
        detail.mergeOrderRuleIds.length > 0 &&
        detail.appliedRules.some((rule) => rule.includes("grouping:direct_dependency_test_pair")),
      ),
      "expected dependency-driven streams to keep dependency ids and merge-rule ids visible",
    );
    assert.ok(
      result.streamConstraintDetails.some((detail) =>
        detail.workstreamId === "ws-plan-protected" &&
        detail.sourceConflictZoneIds.includes("zone-interface") &&
        detail.sourceVerificationTargetIds.includes("target-protected"),
      ),
      "expected protected streams to retain conflict-zone and verification-target traceability",
    );
    assert.ok(
      result.streamConstraintDetails.some((detail) =>
        detail.workstreamId === "ws-plan-shared-a__plan-shared-b" &&
        detail.sourceVerificationTargetIds.includes("target-shared-surface") &&
        detail.appliedRules.some((rule) => rule.includes("grouping:same_surface_siblings")),
      ),
      "expected same-surface grouped workstreams to keep verification-target context visible",
    );
    assert.ok(
      result.streamConstraintDetails.some((detail) =>
        detail.workstreamId === "ws-plan-blocked" &&
        detail.sourceTestObligationIds.includes("test:plan-blocked:integration") &&
        detail.sourceReadinessIds.length === 0 &&
        detail.blockedItemIds.length > 0,
      ),
      "expected blocked streams to retain test-obligation traceability and blocked-item linkage",
    );
  },
);

await runScenario(
  "buildSplitWorkstreams surfaces blocked-workstream warning context and stream-constraint detail on actionable input",
  () => {
    const result = buildSplitWorkstreams({ foundation: createFoundationFixture() });

    assert.ok(
      result.warningItems.some((item: { code: string }) => item.code === "BLOCKED_WORKSTREAMS_PRESENT"),
      "expected blocked workstreams to surface warning visibility on actionable split input",
    );
    assert.ok(
      result.streamConstraintDetails.some(
        (detail: {
          workstreamId: string;
          sourceFindingIds: string[];
          sourceConstraintIds: string[];
          sourceConcernIds: string[];
        }) =>
          detail.workstreamId === "ws-plan-blocked" &&
          detail.sourceFindingIds.includes("finding-blocked") &&
          detail.sourceConstraintIds.includes("constraint-blocked") &&
          detail.sourceConcernIds.includes("concern-blocked"),
      ),
      "expected stream constraint details to keep blocked evidence traceable for debug output",
    );
  },
);

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode);
}
