import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { join } from "node:path";

import {
  SPLIT_CONSTRAINT_SOURCES,
  SPLIT_STREAM_CATEGORIES,
  SPLIT_WORKSTREAM_REQUIRED_FIELDS,
  STEP4_BOUNDARY_POLICY,
} from "../src/split/constants.js";
import { resolveSplitReadiness } from "../src/split/readiness.js";
import { buildSplitWorkstreams } from "../src/split/workstreams.js";
import type { SplitFoundationResult } from "../src/split/types.js";
import {
  createTempRepo,
  disposeTempRepo,
  fileExists,
  readJsonFile,
  readTextFile,
  runForgeBinary,
  runForgeSplitBinary,
  splitArtifactPath,
  splitReportPath,
  writeRepoFile,
} from "./support/forge-cli.js";

type SplitArtifact = {
  command: string;
  stage: string;
  status: string;
  summary: string;
  source_verify: {
    artifactPath: string;
    command: string;
    readyForSplit: boolean;
    summary: string;
    verificationReadinessStatus: string;
  };
  source_plan: {
    artifactPath: string;
    command: string;
    readyForVerification: boolean;
    summary: string;
  };
  files: {
    artifactPath: string | null;
    reportPath: string | null;
  };
  workstream_contract: {
    requiredFields: string[];
    categories: string[];
    constraintSources: string[];
  };
  workstreams: Array<{
    id: string;
    category: string;
    blockedReason: string | null;
  }>;
  dependency_edges: Array<{
    upstreamWorkstreamId: string;
    downstreamWorkstreamId: string;
    reason: string;
  }>;
  merge_order: Array<{
    id: string;
    workstreamId: string;
    order: number;
    ruleType: string;
    mustMergeAfterWorkstreamIds: string[];
    reason: string;
  }>;
  blocked_items: Array<{
    id: string;
    kind: string;
    workstreamId: string | null;
    partialMetadataAvailable: boolean;
  }>;
  carried_forward_constraints: {
    planning_readiness: {
      summary: string;
    };
    verification_readiness: {
      summary: string;
    };
    stream_constraint_details: Array<{
      workstreamId: string;
      mergeOrderRuleIds: string[];
      blockedItemIds: string[];
    }>;
  };
  split_diagnostics: {
    usability_status: string;
    warning_items: Array<{ code: string; message: string }>;
    blocking_items: Array<{ code: string; message: string }>;
    partial_output: { code: string; message: string; fallbackReason?: string } | null;
  };
  split_readiness: {
    ready: boolean;
    status: string;
    summary: string;
    warning_items: Array<{ code: string; message: string }>;
    blocking_issues: Array<{ code: string; message: string }>;
    partial_output: { code: string; message: string; fallbackReason?: string } | null;
    constraining_concern_ids: string[];
    recommended_user_actions: string[];
  };
  failure: { code: string; message: string; fallbackReason?: string } | null;
};

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

function assertExport(moduleObject: Record<string, unknown>, exportName: string): void {
  assert.equal(
    typeof moduleObject[exportName],
    "function",
    `expected ${exportName} to be exported`,
  );
}

async function seedSpecRepo(repoRoot: string): Promise<void> {
  await writeRepoFile(
    repoRoot,
    "task.md",
    [
      "# Update app behavior",
      "",
      "Revise `src/app.ts` and keep `tests/app.test.ts` aligned.",
      "",
      "## Acceptance Criteria",
      "",
      "- `src/app.ts` is updated",
      "- `tests/app.test.ts` stays aligned",
    ].join("\n"),
  );
}

async function removeUpstreamInputs(repoRoot: string): Promise<void> {
  await rm(join(repoRoot, "task.md"), { force: true });
  await rm(join(repoRoot, "src", "app.ts"), { force: true });
  await rm(join(repoRoot, "tests", "app.test.ts"), { force: true });
}

function sectionBody(report: string, heading: string): string[] {
  const lines = report.replace(/\r\n?/g, "\n").split("\n");
  const startIndex = lines.indexOf(`## ${heading}`);

  if (startIndex === -1) {
    throw new Error(`Missing report heading: ${heading}`);
  }

  let endIndex = lines.length;
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    if (lines[index].startsWith("## ")) {
      endIndex = index;
      break;
    }
  }

  return lines
    .slice(startIndex + 1, endIndex)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

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

function createReadinessFoundationFixture(): SplitFoundationResult {
  const foundation = {
    command: "forge split",
    stage: "step4",
    purpose: STEP4_BOUNDARY_POLICY.purpose,
    deterministicFirst: {
      enforced: true,
      authoritativeInputs: [...STEP4_BOUNDARY_POLICY.authoritativeInputs],
      notes: ["deterministic-first"],
    },
    sourceVerify: {
      verificationReadiness: {
        status: "ready",
        recommended_user_actions: [],
      },
    } as never,
    sourcePlan: {
      planningReadiness: {
        status: "ready",
        recommended_user_actions: [],
      },
    } as never,
    splitInput: {
      context: {
        planItemContract: {} as never,
        planItems: [],
        dependencyGraph: [],
        conflictZones: [],
        testObligations: [],
        parallelizationSignals: [],
        verificationTargetContract: {} as never,
        formalLaneContract: {} as never,
        verificationTargets: [],
        verificationCases: [],
        findings: [],
        constraints: [],
      },
      uncertainty: {
        sourceIntake: {} as never,
        planCarryForward: {
          concerns: [],
        } as never,
        planningDiagnostics: {} as never,
        planningReadiness: {} as never,
        verifyCarryForward: {} as never,
        verificationDiagnostics: {} as never,
        verificationReadiness: {} as never,
      },
      usability: {
        status: "actionable",
        warningItems: [],
        blockingItems: [],
      },
    },
    carryForward: {
      sourceIntake: {} as never,
      planCarryForward: {
        concerns: [],
      } as never,
      planningDiagnostics: {} as never,
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
      verifyCarryForward: {} as never,
      verificationDiagnostics: {} as never,
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
    boundaryPolicy: STEP4_BOUNDARY_POLICY,
    workstreamContract: {
      requiredFields: [...SPLIT_WORKSTREAM_REQUIRED_FIELDS],
      categories: [...SPLIT_STREAM_CATEGORIES],
      constraintSources: [...SPLIT_CONSTRAINT_SOURCES],
    },
  } as unknown as SplitFoundationResult;

  foundation.splitInput.planItemEvidence = buildPlanItemEvidenceFromContext(
    foundation.splitInput.context,
    foundation.splitInput.uncertainty.planCarryForward.concerns,
  );

  return foundation;
}

function createWorkstreamFoundationFixture(): SplitFoundationResult {
  const blockedConcern = {
    id: "concern-blocked",
    source: "warning",
    code: "OWNERSHIP_CAUTION",
    message: "Ownership work stays risky until the formal issue is repaired.",
    planItemIds: ["plan-blocked"],
    effects: ["parallelization_caution"],
    status: "carried_forward",
  };

  const foundation = {
    command: "forge split",
    stage: "step4",
    purpose: STEP4_BOUNDARY_POLICY.purpose,
    deterministicFirst: {
      enforced: true,
      authoritativeInputs: [...STEP4_BOUNDARY_POLICY.authoritativeInputs],
      notes: ["deterministic-first"],
    },
    sourceVerify: {
      verificationReadiness: {
        status: "ready",
        recommended_user_actions: [],
      },
    } as never,
    sourcePlan: {
      planningReadiness: {
        status: "ready",
        recommended_user_actions: [],
      },
    } as never,
    splitInput: {
      context: {
        planItemContract: {} as never,
        planItems: [
          {
            id: "plan-safe",
            title: "Update isolated helper",
            description: "Change a leaf helper safely.",
            category: "implementation",
            sourceRequirements: ["Update isolated helper"],
            likelyAffectedPaths: ["src/helper.ts"],
            dependencies: [],
            riskLevel: "low",
            testObligations: [
              {
                category: "unit",
                reason: "Helper behavior should stay covered.",
              },
            ],
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
              {
                planItemId: "plan-safe",
                type: "hard",
                reason: "Tests depend on helper updates.",
              },
            ],
            riskLevel: "medium",
            testObligations: [
              {
                category: "regression",
                reason: "Regression coverage must stay aligned.",
              },
            ],
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
            id: "plan-blocked",
            title: "Repair ownership workflow",
            description: "Fix ownership logic currently blocked by formal evidence.",
            category: "implementation",
            sourceRequirements: ["Repair ownership workflow"],
            likelyAffectedPaths: ["src/ownership.ts"],
            dependencies: [],
            riskLevel: "high",
            testObligations: [
              {
                category: "integration",
                reason: "Ownership flow needs integration coverage.",
              },
            ],
            verificationRelevance: {
              relevant: true,
              categories: ["ownership"],
              notes: ["Formal evidence blocks the ownership flow."],
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
        conflictZones: [],
        testObligations: [
          {
            planItemId: "plan-safe",
            category: "unit",
            reason: "Helper behavior should stay covered.",
          },
          {
            planItemId: "plan-after",
            category: "regression",
            reason: "Regression coverage must stay aligned.",
          },
          {
            planItemId: "plan-blocked",
            category: "integration",
            reason: "Ownership flow needs integration coverage.",
          },
        ],
        parallelizationSignals: [
          {
            planItemId: "plan-safe",
            signal: "safe_parallel",
            reason: "Leaf helper work is isolated.",
          },
          {
            planItemId: "plan-after",
            signal: "parallel_after_dependency",
            reason: "Only safe after the source update merges first.",
          },
          {
            planItemId: "plan-blocked",
            signal: "safe_parallel",
            reason: "Would be safe in isolation without the formal failure.",
          },
        ],
        verificationTargetContract: {} as never,
        formalLaneContract: {} as never,
        verificationTargets: [
          {
            id: "target-safe",
            title: "Update isolated helper",
            category: "code_surface",
            sourcePlanItemIds: ["plan-safe"],
            candidateLanes: ["structural"],
            sourceRiskSources: ["plan_item_verification_relevance"],
            verificationCaseIds: ["case-safe"],
          },
          {
            id: "target-after",
            title: "Align helper tests",
            category: "test_surface",
            sourcePlanItemIds: ["plan-after"],
            candidateLanes: ["structural"],
            sourceRiskSources: ["dependency_graph"],
            verificationCaseIds: ["case-after"],
          },
          {
            id: "target-blocked",
            title: "Repair ownership workflow",
            category: "ownership",
            sourcePlanItemIds: ["plan-blocked"],
            candidateLanes: ["formal"],
            sourceRiskSources: ["carry_forward_concern"],
            verificationCaseIds: ["case-blocked"],
          },
        ],
        verificationCases: [
          {
            id: "case-safe",
            verificationTargetId: "target-safe",
            title: "Helper behavior stays covered",
            category: "code_surface",
            sourcePlanItemIds: ["plan-safe"],
            lanes: ["structural"],
            status: "passed",
            summary: "Helper work stays safe.",
            formalDetails: null,
          },
          {
            id: "case-after",
            verificationTargetId: "target-after",
            title: "Dependent helper test",
            category: "test_surface",
            sourcePlanItemIds: ["plan-after"],
            lanes: ["structural"],
            status: "passed",
            summary: "Dependent test stays aligned.",
            formalDetails: null,
          },
          {
            id: "case-blocked",
            verificationTargetId: "target-blocked",
            title: "Ownership flow failure",
            category: "ownership",
            sourcePlanItemIds: ["plan-blocked"],
            lanes: ["formal"],
            status: "failed",
            summary: "Formal ownership validation failed.",
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
            tla_spec_id: null,
            tlc_result_id: null,
            trace: null,
            errors: [],
          },
        ],
        constraints: [
          {
            id: "constraint-safe",
            lane: "structural",
            verification_case_id: "case-safe",
            verification_target_id: "target-safe",
            summary: "Safe helper work stays covered.",
          },
          {
            id: "constraint-after",
            lane: "structural",
            verification_case_id: "case-after",
            verification_target_id: "target-after",
            summary: "Tests must wait for source updates.",
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
        sourceIntake: {} as never,
        planCarryForward: {
          concerns: [blockedConcern],
        } as never,
        planningDiagnostics: {} as never,
        planningReadiness: {} as never,
        verifyCarryForward: {} as never,
        verificationDiagnostics: {} as never,
        verificationReadiness: {} as never,
      },
      usability: {
        status: "actionable",
        warningItems: [],
        blockingItems: [],
      },
    },
    carryForward: {
      sourceIntake: {} as never,
      planCarryForward: {
        concerns: [blockedConcern],
      } as never,
      planningDiagnostics: {} as never,
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
      verifyCarryForward: {} as never,
      verificationDiagnostics: {} as never,
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
    boundaryPolicy: STEP4_BOUNDARY_POLICY,
    workstreamContract: {
      requiredFields: [...SPLIT_WORKSTREAM_REQUIRED_FIELDS],
      categories: [...SPLIT_STREAM_CATEGORIES],
      constraintSources: [...SPLIT_CONSTRAINT_SOURCES],
    },
  } as unknown as SplitFoundationResult;

  foundation.splitInput.planItemEvidence = buildPlanItemEvidenceFromContext(
    foundation.splitInput.context,
    foundation.splitInput.uncertainty.planCarryForward.concerns,
  );

  return foundation;
}

async function readSplitArtifact(repoRoot: string, outputDir = ".forge"): Promise<SplitArtifact> {
  return readJsonFile<SplitArtifact>(splitArtifactPath(repoRoot, outputDir));
}

async function runHealthySplit(repoRoot: string): Promise<{ artifact: SplitArtifact; report: string }> {
  await seedSpecRepo(repoRoot);

  const intakeResult = runForgeBinary(
    ["intake", "--repo", repoRoot, "--spec", join(repoRoot, "task.md")],
    repoRoot,
  );
  assert.equal(intakeResult.code, 0, intakeResult.stderr);

  const planResult = runForgeBinary(["plan", "--repo", repoRoot], repoRoot);
  assert.equal(planResult.code, 0, planResult.stderr);

  const verifyResult = runForgeBinary(["verify", "--repo", repoRoot], repoRoot);
  assert.equal(verifyResult.code, 0, verifyResult.stderr);

  await removeUpstreamInputs(repoRoot);

  const splitResult = runForgeSplitBinary(["--repo", repoRoot], repoRoot);
  assert.equal(splitResult.code, 0, splitResult.stderr);
  assert.equal(await fileExists(splitArtifactPath(repoRoot)), true);
  assert.equal(await fileExists(splitReportPath(repoRoot)), true);

  return {
    artifact: await readSplitArtifact(repoRoot),
    report: await readTextFile(splitReportPath(repoRoot)),
  };
}

await runScenario(
  "Gate 1 - split exports stay frozen and the packaged CLI still writes split outputs from persisted Step 3 data",
  async () => {
    const [inputModule, runnerModule, workstreamsModule, artifactModule, reportModule, schemaModule] =
      await Promise.all([
        import("../src/split/input.js"),
        import("../src/split/runner.js"),
        import("../src/split/workstreams.js"),
        import("../src/split/artifact.js"),
        import("../src/split/report.js"),
        import("../src/split/schema.js"),
      ]);

    assertExport(inputModule, "SplitInputResolutionError");
    assertExport(inputModule, "resolveSplitFoundationInput");
    assertExport(inputModule, "resolveSplitOutputPaths");
    assertExport(runnerModule, "buildSplitFoundation");
    assertExport(runnerModule, "runSplitFoundation");
    assertExport(runnerModule, "runSplitCommand");
    assertExport(workstreamsModule, "buildSplitWorkstreams");
    assertExport(artifactModule, "buildSplitCommandFailureObject");
    assertExport(artifactModule, "buildSplitCommandResult");
    assertExport(artifactModule, "createSplitArtifact");
    assertExport(artifactModule, "toSplitArtifactJson");
    assertExport(reportModule, "createSplitReport");
    assertExport(schemaModule, "validateSplitFoundationResult");
    assertExport(schemaModule, "validateSplitArtifact");

    const repoRoot = await createTempRepo("forge-split-part5-gate1-");

    try {
      const { artifact, report } = await runHealthySplit(repoRoot);

      assert.equal(artifact.command, "forge split");
      assert.equal(artifact.stage, "step4");
      assert.equal(artifact.source_verify.command, "forge verify");
      assert.equal(artifact.source_plan.command, "forge plan");
      assert.equal(artifact.files.artifactPath, splitArtifactPath(repoRoot));
      assert.equal(artifact.files.reportPath, splitReportPath(repoRoot));
      assert.ok(artifact.workstream_contract.requiredFields.includes("blockedReason"));
      assert.ok(artifact.workstream_contract.categories.includes("blocked"));
      assert.ok(artifact.workstream_contract.constraintSources.includes("verification_readiness"));
      assert.ok(artifact.workstreams.length > 0);
      assert.ok(artifact.dependency_edges.length > 0);
      assert.ok(artifact.merge_order.length > 0);
      assert.ok(artifact.blocked_items.every((item) => item.id.length > 0));
      assert.ok(artifact.carried_forward_constraints.stream_constraint_details.length > 0);
      assert.ok(report.includes(artifact.summary));
      assert.ok(report.includes(artifact.source_verify.summary));
      assert.ok(report.includes(artifact.source_plan.summary));
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "Gate 2 - blocked workstreams stay explicit and linked to merge-order detail",
  () => {
    const workstreamBuild = buildSplitWorkstreams({ foundation: createWorkstreamFoundationFixture() });
    const readiness = resolveSplitReadiness({
      foundation: createReadinessFoundationFixture(),
      failure: null,
      additionalWarningItems: workstreamBuild.warningItems,
      additionalRecommendedActions: [
        "Honor the explicit merge_order rules before execution and integration.",
      ],
    });

    assert.ok(
      workstreamBuild.warningItems.some((item) => item.code === "BLOCKED_WORKSTREAMS_PRESENT"),
      "expected blocked workstreams to surface a warning",
    );
    assert.ok(
      workstreamBuild.workstreams.some((workstream) => workstream.category === "blocked"),
      "expected at least one blocked workstream",
    );
    assert.ok(
      workstreamBuild.blockedItems.some(
        (item) =>
          item.kind === "blocked_workstream" &&
          item.workstreamId === "ws-plan-blocked" &&
          item.partialMetadataAvailable === true,
      ),
      "expected blocked workstreams to remain explicit",
    );
    assert.ok(
      workstreamBuild.mergeOrder.some(
        (entry) =>
          entry.workstreamId === "ws-plan-safe__plan-after" &&
          entry.ruleType === "dependency" &&
          entry.mustMergeAfterWorkstreamIds.length === 0,
      ),
      "expected dependency-driven merge order to remain explicit",
    );
    assert.ok(
      workstreamBuild.streamConstraintDetails.some(
        (detail) =>
          detail.workstreamId === "ws-plan-safe__plan-after" &&
          detail.mergeOrderRuleIds.length > 0 &&
          detail.blockedItemIds.length === 0,
      ),
      "expected merge-order detail to stay linked to the dependent stream",
    );
    assert.ok(
      workstreamBuild.streamConstraintDetails.some(
        (detail) =>
          detail.workstreamId === "ws-plan-blocked" &&
          detail.blockedItemIds.length > 0 &&
          detail.mergeOrderRuleIds.length === 0,
      ),
      "expected blocked-stream detail to stay linked to the blocked stream",
    );
    assert.equal(readiness.splitReadiness.status, "ready_with_warnings");
    assert.match(readiness.splitReadiness.summary, /blocked streams/i);
  },
);

await runScenario(
  "Gate 3 - fully ready split states the all-clear explicitly",
  () => {
    const readiness = resolveSplitReadiness({
      foundation: createReadinessFoundationFixture(),
      failure: null,
    });

    assert.equal(readiness.splitReadiness.ready, true);
    assert.equal(readiness.splitReadiness.status, "ready");
    assert.equal(readiness.splitReadiness.warning_items.length, 0);
    assert.equal(readiness.splitReadiness.blocking_issues.length, 0);
    assert.equal(readiness.splitReadiness.recommended_user_actions.length, 0);
    assert.match(readiness.splitReadiness.summary, /all items were safely assigned/i);
    assert.match(readiness.splitReadiness.summary, /no blocked streams/i);
  },
);

await runScenario(
  "Gate 3 - report and readiness language name merge-order constraints and later execution obligations",
  async () => {
    const repoRoot = await createTempRepo("forge-split-part5-gate3-");

    try {
      const { artifact, report } = await runHealthySplit(repoRoot);
      const readinessBody = sectionBody(report, "Split Readiness").join("\n");

      assert.ok(["ready", "ready_with_warnings"].includes(artifact.split_readiness.status));
      assert.match(artifact.split_readiness.summary, /all items were safely assigned/i);
      assert.match(artifact.split_readiness.summary, /merge-order constraints/i);
      assert.match(readinessBody, /Can Proceed:/i);
      assert.match(readinessBody, /All Items Safely Assigned:/i);
      assert.match(readinessBody, /Blocked Streams:/i);
      assert.match(readinessBody, /Merge-Order Constraints:/i);
      assert.match(readinessBody, /Later Execution Must Honor:/i);
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "Gate 4 - blocked Step 3 readiness still writes durable split outputs",
  async () => {
    const repoRoot = await createTempRepo("forge-split-part5-gate4-blocked-");

    try {
      const intakeResult = runForgeBinary(
        ["intake", "--repo", repoRoot, "--prompt", "fix", "--fail-on-low-confidence"],
        repoRoot,
      );
      assert.equal(intakeResult.code, 1);

      const planResult = runForgeBinary(["plan", "--repo", repoRoot], repoRoot);
      assert.notEqual(planResult.code, 0);

      const verifyResult = runForgeBinary(["verify", "--repo", repoRoot], repoRoot);
      assert.notEqual(verifyResult.code, 0);

      const splitResult = runForgeSplitBinary(["--repo", repoRoot], repoRoot);
      assert.notEqual(splitResult.code, 0);
      assert.equal(await fileExists(splitArtifactPath(repoRoot)), true);
      assert.equal(await fileExists(splitReportPath(repoRoot)), true);

      const artifact = await readSplitArtifact(repoRoot);
      const report = await readTextFile(splitReportPath(repoRoot));
      const readinessBody = sectionBody(report, "Split Readiness").join("\n");

      assert.equal(artifact.status, "blocked");
      assert.equal(artifact.split_diagnostics.usability_status, "upstream_blocked");
      assert.ok(
        artifact.blocked_items.some((item) => item.kind === "input_blocker"),
        "expected input blockers to stay explicit",
      );
      assert.match(artifact.split_readiness.summary, /persisted Step 3 handoff is unblocked/i);
      assert.match(readinessBody, /Can Proceed:/i);
      assert.match(readinessBody, /Blocked Streams:/i);
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "Gate 4 - missing or invalid upstream inputs do not create durable split outputs",
  async () => {
    const missingRepoRoot = await createTempRepo("forge-split-part5-missing-");
    const invalidRepoRoot = await createTempRepo("forge-split-part5-invalid-");

    try {
      const missingResult = runForgeSplitBinary(["--repo", missingRepoRoot], missingRepoRoot);
      assert.notEqual(missingResult.code, 0);
      assert.match(missingResult.stderr, /SPLIT_INPUT_MISSING|verify\.json/i);
      assert.equal(await fileExists(splitArtifactPath(missingRepoRoot)), false);
      assert.equal(await fileExists(splitReportPath(missingRepoRoot)), false);

      await writeRepoFile(
        invalidRepoRoot,
        ".forge/verify.json",
        JSON.stringify(
          {
            schemaVersion: "2.0.0",
            command: "forge verify",
          },
          null,
          2,
        ),
      );

      const invalidResult = runForgeSplitBinary(["--repo", invalidRepoRoot], invalidRepoRoot);
      assert.notEqual(invalidResult.code, 0);
      assert.match(invalidResult.stderr, /VERIFY_ARTIFACT_INVALID|invalid/i);
      assert.equal(await fileExists(splitArtifactPath(invalidRepoRoot)), false);
      assert.equal(await fileExists(splitReportPath(invalidRepoRoot)), false);
    } finally {
      await disposeTempRepo(missingRepoRoot);
      await disposeTempRepo(invalidRepoRoot);
    }
  },
);

await runScenario(
  "Gate 4 - split can be rerun from persisted Step 3 output after a healthy handoff",
  async () => {
    const repoRoot = await createTempRepo("forge-split-part5-rerun-");

    try {
      const firstRun = await runHealthySplit(repoRoot);
      const secondRun = runForgeSplitBinary(["--repo", repoRoot], repoRoot);
      assert.equal(secondRun.code, 0, secondRun.stderr);

      const artifact = await readSplitArtifact(repoRoot);
      assert.equal(await fileExists(splitArtifactPath(repoRoot)), true);
      assert.equal(await fileExists(splitReportPath(repoRoot)), true);
      assert.equal(artifact.files.artifactPath, splitArtifactPath(repoRoot));
      assert.equal(artifact.files.reportPath, splitReportPath(repoRoot));
      assert.equal(firstRun.artifact.command, artifact.command);
      assert.equal(firstRun.report.length > 0, true);
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode);
}
