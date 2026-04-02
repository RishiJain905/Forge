import assert from "node:assert/strict";

import { buildSplitWorkstreams } from "../src/split/workstreams.js";
import type { SplitFoundationResult } from "../src/split/types.js";

function createFoundationFixture(): SplitFoundationResult {
  return {
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
            dependencies: [{ planItemId: "plan-safe", type: "hard", reason: "Tests depend on helper updates." }],
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
        ],
        dependencyGraph: [
          {
            planItemId: "plan-after",
            dependsOnPlanItemId: "plan-safe",
            type: "hard",
            reason: "Tests depend on helper updates.",
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
  "buildSplitWorkstreams maps one plan item to one workstream and resolves all Part 3 categories",
  () => {
    const result = buildSplitWorkstreams({ foundation: createFoundationFixture() });

    assert.equal(result.workstreams.length, 5);
    assert.deepEqual(
      result.workstreams.map((workstream: { id: string; category: string }) => [workstream.id, workstream.category]),
      [
        ["ws-plan-serial", "serial"],
        ["ws-plan-safe", "safe_parallel"],
        ["ws-plan-after", "parallel_after_dependency"],
        ["ws-plan-protected", "protected_merge"],
        ["ws-plan-blocked", "blocked"],
      ],
    );

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
  "buildSplitWorkstreams derives dependency edges and deterministic merge order for constrained streams",
  () => {
    const result = buildSplitWorkstreams({ foundation: createFoundationFixture() });

    assert.deepEqual(result.dependencyEdges, [
      {
        upstreamWorkstreamId: "ws-plan-safe",
        downstreamWorkstreamId: "ws-plan-after",
        reason: "Tests depend on helper updates.",
      },
    ]);

    assert.deepEqual(
      result.mergeOrder.map((entry: { workstreamId: string; order: number }) => [entry.workstreamId, entry.order]),
      [
        ["ws-plan-serial", 1],
        ["ws-plan-protected", 2],
        ["ws-plan-after", 3],
      ],
    );
  },
);

await runScenario(
  "buildSplitWorkstreams tolerates cyclic dependency graphs without recursing forever",
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

    const result = buildSplitWorkstreams({ foundation });

    assert.equal(result.mergeOrder.length, 3);
    assert.deepEqual(
      result.mergeOrder.map((entry: { workstreamId: string }) => entry.workstreamId),
      ["ws-plan-serial", "ws-plan-protected", "ws-plan-after"],
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
        entry.workstreamId === "ws-plan-after" &&
        entry.ruleType === "dependency" &&
        entry.mustMergeAfterWorkstreamIds.includes("ws-plan-safe"),
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
        detail.workstreamId === "ws-plan-after" &&
        detail.sourceDependencyIds.length > 0 &&
        detail.mergeOrderRuleIds.length > 0,
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
