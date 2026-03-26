import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { join } from "node:path";

import type { PlanArtifact } from "../src/plan/types.js";
import {
  assertForgeVerifyOutputHasNoReportHeadings,
  createTempRepo,
  disposeTempRepo,
  readJsonFile,
  readTextFile,
  runForgeBinary,
  runForgePlanBinary,
  runForgeVerifyBinary,
  verifyArtifactPath,
  verifyReportPath,
  writeRepoFile,
} from "./support/forge-cli.js";

type MutableArtifact = Record<string, any>;

type InitialVerificationTarget = {
  path: string;
  kind: "source" | "test" | "manifest";
  category: string | null;
  reason: string;
};

type VerifyArtifact = {
  status: "ready" | "blocked" | "failed";
  source_plan: {
    artifactPath: string;
    command: string;
    repoRoot: string;
    status: string;
    summary: string;
    readyForVerification: boolean;
    planningReadinessStatus: "ready" | "ready_with_warnings" | "blocked";
    failure: { code: string; message: string; fallbackReason?: string } | null;
  };
  verification_target_contract: {
    requiredFields: string[];
    riskSources: string[];
    supportedLanes: string[];
    structuralFocusAreas: string[];
    formalFocusAreas: string[];
  };
  formal_lane_contract: {
    tooling: string[];
    entryCriteria: string[];
    stateModelRequiredFields: string[];
    tlcStatuses: string[];
  };
  verification_readiness: {
    ready: boolean;
    status: "ready" | "ready_with_warnings" | "blocked";
    summary: string;
    warning_items: Array<{ code: string; message: string }>;
    blocking_issues: Array<{ code: string; message: string }>;
    partial_output: { code: string; message: string; fallbackReason?: string } | null;
    constraining_concern_ids: string[];
    recommended_user_actions: string[];
  };
  verification_diagnostics: {
    usability_status: "actionable" | "non_actionable" | "upstream_blocked";
    warning_items: Array<{ code: string; message: string }>;
    blocking_items: Array<{ code: string; message: string }>;
    partial_output: { code: string; message: string; fallbackReason?: string } | null;
  };
  carry_forward: {
    initial_verification_targets: InitialVerificationTarget[];
    concerns: Array<{
      id: string;
      source: string;
      code: string | null;
      message: string;
      planItemIds: string[];
      effects: string[];
      status: string;
    }>;
  };
  verification_targets: Array<{
    id: string;
    title: string;
    category: string;
    sourcePlanItemIds: string[];
    candidateLanes: string[];
    sourceRiskSources: string[];
    verificationCaseIds: string[];
  }>;
  verification_cases: Array<{
    id: string;
    verificationTargetId: string;
    title: string;
    category: string;
    sourcePlanItemIds: string[];
    lanes: string[];
    status: string;
    summary: string;
    formalDetails: {
      enteredFormalLane: boolean;
      entryCriteria: string[];
      stateModelId: string | null;
      tlaSpecId: string | null;
      tlcResultId: string | null;
      trace: string | null;
      errors: string[];
      cautionNotes: string[];
    } | null;
  }>;
  structural_verification: {
    status: string;
    summary: string;
    findings: string[];
    constraints: string[];
  };
  formal_verification: {
    status: string;
    summary: string;
    caution_notes: string[];
    state_models: Array<{
      id: string;
      verification_case_id: string;
      verification_target_id: string;
    }>;
    tla_specs: Array<{
      id: string;
      verification_case_id: string;
      state_model_id: string;
    }>;
    tlc_results: Array<{
      id: string;
      verification_case_id: string;
      tla_spec_id: string;
      status: string;
      trace: string | null;
      errors: string[];
    }>;
    findings: string[];
    constraints: string[];
  };
  findings: string[];
  constraints: string[];
  failure: { code: string; message: string; fallbackReason?: string } | null;
};

async function runScenario(name: string, scenario: () => Promise<void>): Promise<void> {
  try {
    await scenario();
    process.stdout.write(`PASS ${name}\n`);
  } catch (error) {
    process.stderr.write(`FAIL ${name}\n`);
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
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

async function removePlanningInputs(repoRoot: string): Promise<void> {
  await rm(join(repoRoot, "task.md"), { force: true });
  await rm(join(repoRoot, "src", "app.ts"), { force: true });
  await rm(join(repoRoot, "tests", "app.test.ts"), { force: true });
  await rm(join(repoRoot, "src", "worker.ts"), { force: true });
  await rm(join(repoRoot, "package.json"), { force: true });
}

function cloneArtifact(artifact: PlanArtifact): MutableArtifact {
  return JSON.parse(JSON.stringify(artifact)) as MutableArtifact;
}

async function prepareWarningHeavyPlanArtifact(
  repoRoot: string,
  seed: (repoRoot: string) => Promise<void>,
): Promise<PlanArtifact> {
  await seed(repoRoot);

  const intakeResult = runForgeBinary(
    ["intake", "--repo", repoRoot, "--prompt", "fix"],
    repoRoot,
  );
  assert.equal(intakeResult.code, 0, intakeResult.stderr);

  const planResult = runForgePlanBinary(["--repo", repoRoot], repoRoot);
  assert.equal(planResult.code, 0, planResult.stderr);

  await removePlanningInputs(repoRoot);

  return readJsonFile<PlanArtifact>(join(repoRoot, ".forge", "plan.json"));
}

function makeStructuralOnlyPlanArtifact(planArtifact: PlanArtifact): MutableArtifact {
  const artifact = cloneArtifact(planArtifact);

  artifact.carry_forward = {
    ...artifact.carry_forward,
    initial_verification_targets: [
      {
        path: "src/app.ts",
        kind: "source",
        category: "code_surface",
        reason: "Keep src/app.ts structurally safe.",
      },
      {
        path: "tests/app.test.ts",
        kind: "test",
        category: "test_surface",
        reason: "Keep tests/app.test.ts structurally safe.",
      },
    ],
  };

  artifact.plan_items = artifact.plan_items.map((item: MutableArtifact) => {
    if (item.id === "plan-interface-1") {
      return {
        ...item,
        verificationRelevance: {
          ...item.verificationRelevance,
          categories: ["api_contract"],
        },
      };
    }

    if (item.id === "plan-implementation-1") {
      return {
        ...item,
        verificationRelevance: {
          ...item.verificationRelevance,
          categories: ["code_surface"],
        },
      };
    }

    if (item.id === "plan-test-1") {
      return {
        ...item,
        verificationRelevance: {
          ...item.verificationRelevance,
          categories: ["test_surface"],
        },
      };
    }

    return item;
  });

  return artifact;
}

function assertPart5Contract(artifact: VerifyArtifact): void {
  assert.equal(artifact.source_plan.readyForVerification, true);
  assert.equal(artifact.source_plan.planningReadinessStatus, "ready_with_warnings");
  assert.deepEqual(artifact.verification_target_contract.requiredFields, [
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
  ]);
  assert.deepEqual(artifact.verification_target_contract.riskSources, [
    "plan_item_verification_relevance",
    "test_obligation",
    "conflict_zone",
    "parallelization_signal",
    "carry_forward_concern",
    "initial_verification_target",
  ]);
  assert.deepEqual(artifact.verification_target_contract.supportedLanes, ["structural", "formal"]);
  assert.deepEqual(artifact.verification_target_contract.structuralFocusAreas, [
    "dependency_contradiction",
    "unsafe_sequencing",
    "unsafe_parallelization",
    "conflict_zone_hazard",
    "merge_or_serialization_contradiction",
  ]);
  assert.deepEqual(artifact.verification_target_contract.formalFocusAreas, [
    "retry_logic",
    "handoff_logic",
    "ownership_transition",
    "duplicate_execution_risk",
    "stale_write_risk",
    "ordering_constraint",
  ]);
  assert.deepEqual(artifact.formal_lane_contract.tooling, ["TLA+", "TLC"]);
  assert.deepEqual(artifact.formal_lane_contract.entryCriteria, [
    "state_machine_like",
    "multi_actor_or_interleaving",
    "retry_or_reassignment",
    "ownership_or_version_validity",
    "ordering_critical",
    "structural_check_insufficient",
  ]);
  assert.deepEqual(artifact.formal_lane_contract.stateModelRequiredFields, [
    "actors",
    "entities",
    "states",
    "transitions",
    "unsafe_states",
    "invariants",
    "initial_conditions",
  ]);
  assert.deepEqual(artifact.formal_lane_contract.tlcStatuses, [
    "not_run",
    "passed",
    "failed",
    "errored",
    "invalid_spec",
  ]);
  assert.ok(artifact.verification_targets.some((target) => target.candidateLanes.includes("formal")));
  assert.ok(artifact.verification_cases.some((verificationCase) => verificationCase.lanes.includes("formal")));
}

function assertStructuralOnlyContract(
  artifact: VerifyArtifact,
  params: {
    targetCategory: string;
    expectedInitialVerificationTargets: InitialVerificationTarget[];
    initialVerificationTargetPath: string;
  },
): void {
  assert.deepEqual(artifact.carry_forward.initial_verification_targets, params.expectedInitialVerificationTargets);
  assert.equal(artifact.verification_readiness.ready, true);
  assert.equal(artifact.verification_readiness.status, "ready_with_warnings");
  assert.ok(artifact.verification_readiness.warning_items.length > 0);
  assert.ok(artifact.verification_readiness.constraining_concern_ids.length > 0);
  assert.ok(
    artifact.verification_readiness.warning_items.some(
      (item) => item.code === "LOW_CONFIDENCE_VERIFY_INPUT" || item.code === "PLAN_WARNING_CONTEXT_PRESENT",
    ),
  );
  assert.ok(
    artifact.carry_forward.concerns.some(
      (concern) => concern.source === "low_confidence" || concern.source === "candidate_target_uncertainty",
    ),
  );
  assert.equal(
    artifact.verification_targets.every(
      (target) => target.candidateLanes.length === 1 && target.candidateLanes[0] === "structural",
    ),
    true,
  );
  assert.equal(
    artifact.verification_cases.every(
      (verificationCase) => verificationCase.lanes.length === 1 && verificationCase.lanes[0] === "structural",
    ),
    true,
  );

  const target = artifact.verification_targets.find((entry) => entry.category === params.targetCategory);
  assert.ok(target, `expected a verification target for ${params.targetCategory}`);
  assert.equal(
    artifact.carry_forward.initial_verification_targets.some((entry) => entry.path === params.initialVerificationTargetPath),
    true,
  );
  assert.deepEqual(target?.candidateLanes, ["structural"]);
  assert.equal(target?.verificationCaseIds.length, 1);

  const verificationCase = artifact.verification_cases.find((entry) => entry.id === target?.verificationCaseIds[0]);
  assert.ok(verificationCase, `expected a verification case for ${params.targetCategory}`);
  assert.equal(verificationCase?.verificationTargetId, target?.id);
  assert.deepEqual(verificationCase?.lanes, ["structural"]);
  assert.equal(verificationCase?.formalDetails, null);
  assert.equal(artifact.formal_verification.status, "not_run");
  assert.equal(artifact.formal_verification.state_models.length, 0);
  assert.equal(artifact.formal_verification.tla_specs.length, 0);
  assert.equal(artifact.formal_verification.tlc_results.length, 0);
}

function assertFormalTraceability(
  artifact: VerifyArtifact,
  params: {
    targetCategory: string;
  },
): void {
  const target = artifact.verification_targets.find((entry) => entry.category === params.targetCategory);
  assert.ok(target, `expected a verification target for ${params.targetCategory}`);
  assert.deepEqual(target?.candidateLanes, ["structural", "formal"]);
  assert.equal(target?.verificationCaseIds.length, 2);

  const structuralCase = artifact.verification_cases.find(
    (entry) => entry.verificationTargetId === target?.id && entry.lanes.includes("structural"),
  );
  const formalCase = artifact.verification_cases.find(
    (entry) => entry.verificationTargetId === target?.id && entry.lanes.includes("formal"),
  );

  assert.ok(structuralCase, `expected a structural case for ${params.targetCategory}`);
  assert.ok(formalCase, `expected a formal case for ${params.targetCategory}`);
  assert.equal(formalCase?.formalDetails?.enteredFormalLane, true);
  assert.deepEqual(formalCase?.formalDetails?.entryCriteria, [
    "state_machine_like",
    "multi_actor_or_interleaving",
    "structural_check_insufficient",
  ]);
  assert.ok(formalCase?.formalDetails?.stateModelId);
  assert.ok(formalCase?.formalDetails?.tlaSpecId);
  assert.ok(formalCase?.formalDetails?.tlcResultId);
  assert.equal(artifact.formal_verification.state_models.length, 1);
  assert.equal(artifact.formal_verification.tla_specs.length, 1);
  assert.equal(artifact.formal_verification.tlc_results.length, 1);
  assert.equal(artifact.formal_verification.state_models[0]?.id, formalCase?.formalDetails?.stateModelId);
  assert.equal(artifact.formal_verification.tla_specs[0]?.id, formalCase?.formalDetails?.tlaSpecId);
  assert.equal(artifact.formal_verification.tlc_results[0]?.id, formalCase?.formalDetails?.tlcResultId);
  assert.equal(artifact.formal_verification.state_models[0]?.verification_case_id, formalCase?.id);
  assert.equal(artifact.formal_verification.tla_specs[0]?.verification_case_id, formalCase?.id);
  assert.equal(artifact.formal_verification.tlc_results[0]?.verification_case_id, formalCase?.id);
}

async function readVerifyArtifact(repoRoot: string): Promise<VerifyArtifact> {
  return readJsonFile<VerifyArtifact>(verifyArtifactPath(repoRoot));
}

async function createTlcStubEnv(
  repoRoot: string,
  mode: "passed" | "failed",
): Promise<Record<string, string>> {
  const toolsDir = join(repoRoot, "tools");
  await writeRepoFile(
    repoRoot,
    "tools/java.cmd",
    [
      "@echo off",
      "setlocal",
      "if /I \"%FORGE_TLC_STUB_MODE%\"==\"passed\" (",
      "  echo Model checking completed. No error has been found.",
      "  exit /b 0",
      ")",
      "if /I \"%FORGE_TLC_STUB_MODE%\"==\"failed\" (",
      "  echo Error: Invariant violation.",
      "  echo Trace:",
      "  echo   state 1",
      "  echo   state 2",
      "  exit /b 1",
      ")",
      "echo Model checking completed. No error has been found.",
      "exit /b 0",
    ].join("\r\n"),
  );
  await writeRepoFile(repoRoot, "tools/fake-tlc.jar", "");

  const pathValue = `${toolsDir};${process.env.PATH ?? ""}`;

  return {
    PATH: pathValue,
    Path: pathValue,
    FORGE_TLC_JAR_PATH: join(toolsDir, "fake-tlc.jar"),
    FORGE_TLC_STUB_MODE: mode,
  };
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

await runScenario(
  "Gate 1 and Gate 5 - packaged forge verify should emit real structural output instead of the placeholder not_run summary",
  async () => {
    const repoRoot = await createTempRepo("forge-verify-part5-structural-only-");

    try {
      const rawPlanArtifact = await prepareWarningHeavyPlanArtifact(repoRoot, seedSpecRepo);
      await writeRepoFile(
        repoRoot,
        ".forge/plan.json",
        `${JSON.stringify(cloneArtifact(rawPlanArtifact), null, 2)}\n`,
      );

      const verifyResult = runForgeVerifyBinary(["--repo", repoRoot], repoRoot);
      assert.equal(verifyResult.code, 0, verifyResult.stderr);
      assertForgeVerifyOutputHasNoReportHeadings(verifyResult);

      const artifact = await readVerifyArtifact(repoRoot);
      const report = await readTextFile(verifyReportPath(repoRoot));

      assertPart5Contract(artifact);
      assert.ok(artifact.verification_targets.some((target) => target.candidateLanes.includes("formal")));
      assert.ok(artifact.verification_cases.some((verificationCase) => verificationCase.lanes.includes("formal")));
      const formalTarget = artifact.verification_targets.find((entry) => entry.category === "parallel_overlap");
      assert.ok(formalTarget, "expected a parallel_overlap verification target");
      assert.deepEqual(formalTarget?.candidateLanes, ["structural", "formal"]);
      assert.equal(formalTarget?.verificationCaseIds.length, 2);
      const formalCase = artifact.verification_cases.find(
        (entry) => entry.verificationTargetId === formalTarget?.id && entry.lanes.includes("formal"),
      );
      assert.ok(formalCase, "expected a formal verification case");
      assert.equal(formalCase?.formalDetails?.enteredFormalLane, true);
      assert.ok(formalCase?.formalDetails?.stateModelId);
      assert.ok(formalCase?.formalDetails?.tlaSpecId);
      assert.ok(formalCase?.formalDetails?.tlcResultId);
      assert.equal(artifact.structural_verification.status, "passed");
      assert.doesNotMatch(artifact.structural_verification.summary, /execution has not run yet/i);
      assert.match(artifact.structural_verification.summary, /structural/i);
      assert.ok(artifact.verification_diagnostics.warning_items.length > 0);
      assert.ok(artifact.verification_readiness.warning_items.length > 0);
      assert.equal(artifact.verification_readiness.status, "ready_with_warnings");
      assert.ok(artifact.verification_readiness.constraining_concern_ids.length > 0);
      assert.match(sectionBody(report, "Structural Verification").join("\n"), /passed/i);
      assert.match(sectionBody(report, "Verification Readiness").join("\n"), /ready_with_warnings/i);
      assert.match(sectionBody(report, "Verification Readiness").join("\n"), /warnings|concern/i);
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "Gate 3 - structural-only readiness should say only structural checks ran and formal checks were not run",
  async () => {
    const repoRoot = await createTempRepo("forge-verify-part5-structural-readiness-");

    try {
      const rawPlanArtifact = await prepareWarningHeavyPlanArtifact(repoRoot, seedSpecRepo);
      await writeRepoFile(
        repoRoot,
        ".forge/plan.json",
        `${JSON.stringify(makeStructuralOnlyPlanArtifact(rawPlanArtifact), null, 2)}\n`,
      );

      const verifyResult = runForgeVerifyBinary(["--repo", repoRoot], repoRoot);
      assert.equal(verifyResult.code, 0, verifyResult.stderr);
      assertForgeVerifyOutputHasNoReportHeadings(verifyResult);

      const artifact = await readVerifyArtifact(repoRoot);
      const report = await readTextFile(verifyReportPath(repoRoot));

      assertStructuralOnlyContract(artifact, {
        targetCategory: "test_surface",
        initialVerificationTargetPath: "tests/app.test.ts",
        expectedInitialVerificationTargets: [
          {
            path: "src/app.ts",
            kind: "source",
            category: "code_surface",
            reason: "Keep src/app.ts structurally safe.",
          },
          {
            path: "tests/app.test.ts",
            kind: "test",
            category: "test_surface",
            reason: "Keep tests/app.test.ts structurally safe.",
          },
        ],
      });
      assert.equal(artifact.structural_verification.status, "passed");
      assert.doesNotMatch(artifact.structural_verification.summary, /execution has not run yet/i);
      assert.match(artifact.structural_verification.summary, /structural/i);
      assert.match(sectionBody(report, "Verification Readiness").join("\n"), /ready_with_warnings/i);
      assert.match(sectionBody(report, "Verification Readiness").join("\n"), /warning/i);
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "Gate 3 - formal-not-run readiness should warn that TLC was not run",
  async () => {
    const repoRoot = await createTempRepo("forge-verify-part5-formal-not-run-");

    try {
      const rawPlanArtifact = await prepareWarningHeavyPlanArtifact(repoRoot, seedSpecRepo);
      await writeRepoFile(
        repoRoot,
        ".forge/plan.json",
        `${JSON.stringify(cloneArtifact(rawPlanArtifact), null, 2)}\n`,
      );

      const verifyResult = runForgeVerifyBinary(["--repo", repoRoot], repoRoot, {
        FORGE_TLC_JAR_PATH: null,
      });
      assert.equal(verifyResult.code, 0, verifyResult.stderr);
      assertForgeVerifyOutputHasNoReportHeadings(verifyResult);

      const artifact = await readVerifyArtifact(repoRoot);
      const report = await readTextFile(verifyReportPath(repoRoot));

      assertFormalTraceability(artifact, {
        targetCategory: "parallel_overlap",
      });
      assert.equal(artifact.formal_verification.status, "not_run");
      assert.equal(artifact.formal_verification.tlc_results[0]?.status, "not_run");
      assert.equal(artifact.formal_verification.tlc_results[0]?.trace, null);
      assert.equal(artifact.formal_verification.state_models.length, 1);
      assert.equal(artifact.formal_verification.tla_specs.length, 1);
      assert.equal(artifact.formal_verification.tlc_results.length, 1);
      assert.equal(artifact.verification_readiness.ready, true);
      assert.equal(artifact.verification_readiness.status, "ready_with_warnings");
      assert.match(artifact.verification_readiness.summary, /TLC was not run/i);
      assert.ok(artifact.verification_readiness.warning_items.length > 0);
      assert.ok(artifact.verification_readiness.constraining_concern_ids.length > 0);
      assert.match(sectionBody(report, "Verification Readiness").join("\n"), /TLC was not run/i);
      assert.match(sectionBody(report, "Formal Verification").join("\n"), /not_run/i);
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "Gate 3 and Gate 4 - formal TLC failure should block readiness and keep artifact/report constraints coherent",
  async () => {
    const repoRoot = await createTempRepo("forge-verify-part5-formal-failure-");

    try {
      const rawPlanArtifact = await prepareWarningHeavyPlanArtifact(repoRoot, seedSpecRepo);
      await writeRepoFile(
        repoRoot,
        ".forge/plan.json",
        `${JSON.stringify(cloneArtifact(rawPlanArtifact), null, 2)}\n`,
      );

      const env = await createTlcStubEnv(repoRoot, "failed");
      const verifyResult = runForgeVerifyBinary(["--repo", repoRoot], repoRoot, env);
      assert.notEqual(verifyResult.code, 0);
      assert.match(verifyResult.stderr, /Status:\s+(failed|blocked)/i);
      assert.match(verifyResult.stderr, /TLC|counterexample|failed/i);
      assertForgeVerifyOutputHasNoReportHeadings(verifyResult);

      const artifact = await readVerifyArtifact(repoRoot);
      const report = await readTextFile(verifyReportPath(repoRoot));

      assertFormalTraceability(artifact, {
        targetCategory: "parallel_overlap",
      });
      assert.equal(artifact.formal_verification.status, "failed");
      assert.equal(artifact.formal_verification.tlc_results[0]?.status, "failed");
      assert.ok(artifact.formal_verification.tlc_results[0]?.trace);
      assert.ok(artifact.formal_verification.constraints.length > 0);
      assert.ok(artifact.constraints.length > 0);
      assert.equal(artifact.verification_readiness.ready, false);
      assert.equal(artifact.verification_readiness.status, "blocked");
      assert.ok(
        artifact.verification_readiness.blocking_issues.some((issue) => issue.code === "FORMAL_TLC_FAILED"),
      );
      assert.match(sectionBody(report, "Verification Readiness").join("\n"), /blocked/i);
      assert.match(sectionBody(report, "Constraints").join("\n"), /FORMAL_TLC_FAILED|TLC|counterexample/i);
      assert.match(sectionBody(report, "Formal Verification").join("\n"), /failed/i);
      assert.ok(artifact.findings.length > 0);
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode);
}
