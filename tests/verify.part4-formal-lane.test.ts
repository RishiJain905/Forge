import assert from "node:assert/strict";
import { chmod, rm } from "node:fs/promises";
import { delimiter, join } from "node:path";

import type { PlanArtifact } from "../src/plan/types.js";
import {
  createTempRepo,
  disposeTempRepo,
  fileExists,
  readJsonFile,
  readTextFile,
  runForgeBinary,
  runForgePlanBinary,
  runForgeVerifyBinary,
  verifyArtifactPath,
  verifyReportPath,
  writeRepoFile,
} from "./support/forge-cli.js";
import { buildFormalVerifyArtifactFixture } from "./support/verify-formal-fixtures.js";

type FormalVerifyArtifact = {
  status: "ready" | "blocked" | "failed";
  verification_targets: Array<{
    id: string;
    category: string;
    verificationCaseIds: string[];
  }>;
  verification_cases: Array<{
    id: string;
    verificationTargetId: string;
    category: string;
    lanes: string[];
    status: string;
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
  formal_verification: {
    status: "not_run" | "passed" | "failed" | "errored" | "invalid_spec";
    summary: string;
    caution_notes: string[];
    state_models: Array<{
      id: string;
      name: string;
      verification_case_id: string;
      verification_target_id: string;
      summary: string;
      actors: string[];
      entities: string[];
      states: string[];
      transitions: string[];
      unsafe_states: string[];
      invariants: string[];
      initial_conditions: string[];
    }>;
    tla_specs: Array<{
      id: string;
      name: string;
      summary: string;
      verification_case_id: string;
      state_model_id: string;
      module_name: string;
      spec_path: string;
      config_path: string;
      generation_status: string;
    }>;
    tlc_results: Array<{
      id: string;
      verification_case_id: string;
      tla_spec_id: string;
      status: "not_run" | "passed" | "failed" | "errored" | "invalid_spec";
      summary: string;
      trace: string | null;
      errors: string[];
    }>;
    findings: string[];
    constraints: string[];
  };
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

async function seedFormalRepo(repoRoot: string): Promise<void> {
  await writeRepoFile(
    repoRoot,
    "task.md",
    [
      "# Update worker ownership and config behavior",
      "",
      "Revise `src/worker.ts` ownership handling and keep `package.json` aligned.",
      "",
      "## Acceptance Criteria",
      "",
      "- `src/worker.ts` keeps ownership transitions safe",
      "- `package.json` remains structurally safe",
    ].join("\n"),
  );
  await writeRepoFile(
    repoRoot,
    "src/worker.ts",
    [
      "export function claimOwnership() {",
      "  return 'claimed';",
      "}",
    ].join("\n"),
  );
  await writeRepoFile(
    repoRoot,
    "package.json",
    JSON.stringify(
      {
        name: "forge-formal-fixture",
        private: true,
        type: "module",
      },
      null,
      2,
    ),
  );
}

async function removePlanningInputs(repoRoot: string): Promise<void> {
  await rm(join(repoRoot, "task.md"), { force: true });
  await rm(join(repoRoot, "src", "app.ts"), { force: true });
  await rm(join(repoRoot, "tests", "app.test.ts"), { force: true });
  await rm(join(repoRoot, "src", "worker.ts"), { force: true });
  await rm(join(repoRoot, "package.json"), { force: true });
}

async function prepareFormalPlanArtifact(repoRoot: string): Promise<PlanArtifact> {
  await seedFormalRepo(repoRoot);

  const intakeResult = runForgeBinary(
    ["intake", "--repo", repoRoot, "--spec", join(repoRoot, "task.md")],
    repoRoot,
  );
  assert.equal(intakeResult.code, 0, intakeResult.stderr);

  const planResult = runForgePlanBinary(["--repo", repoRoot], repoRoot);
  assert.equal(planResult.code, 0, planResult.stderr);
  await removePlanningInputs(repoRoot);

  const rawPlanArtifact = await readJsonFile<PlanArtifact>(join(repoRoot, ".forge", "plan.json"));
  const carryForward = rawPlanArtifact.carry_forward;
  const planningDiagnostics = rawPlanArtifact.planning_diagnostics;
  const planningReadiness = rawPlanArtifact.planning_readiness;
  const formalPlanArtifact: PlanArtifact = {
    ...rawPlanArtifact,
    plan_items: [
      {
        id: "plan-item-ownership",
        title: "Update worker ownership flow",
        description: "Keep ownership transitions valid while worker claim behavior changes.",
        category: "implementation",
        sourceRequirements: ["Preserve ownership transitions across claim and handoff updates."],
        likelyAffectedPaths: ["src/worker.ts"],
        dependencies: [],
        riskLevel: "high",
        testObligations: [
          {
            category: "contract_validation",
            reason: "Ownership transfer must remain valid when the worker claim path changes.",
          },
        ],
        verificationRelevance: {
          relevant: true,
          categories: ["ownership"],
          notes: ["Ownership transitions should enter the formal lane."],
        },
        parallelization: {
          signal: "safe_parallel",
          reason: "Ownership-focused work should remain isolated for this test fixture.",
        },
      },
      {
        id: "plan-item-config",
        title: "Keep package.json structurally safe",
        description: "Adjust config without introducing state-machine risk.",
        category: "config",
        sourceRequirements: ["Keep package.json aligned with the ownership change."],
        likelyAffectedPaths: ["package.json"],
        dependencies: [],
        riskLevel: "medium",
        testObligations: [
          {
            category: "contract_validation",
            reason: "Config changes should keep contract validation visible.",
          },
        ],
        verificationRelevance: {
          relevant: true,
          categories: ["config_surface"],
          notes: ["Config-only verification should stay structural."],
        },
        parallelization: {
          signal: "safe_parallel",
          reason: "Config stays structurally safe in this fixture.",
        },
      },
    ],
    dependency_graph: [],
    conflict_zones: [],
    test_obligations: [
      {
        planItemId: "plan-item-ownership",
        category: "contract_validation",
        reason: "Ownership transfer must remain valid when the worker claim path changes.",
      },
      {
        planItemId: "plan-item-config",
        category: "contract_validation",
        reason: "Config changes should keep contract validation visible.",
      },
    ],
    parallelization_signals: [
      {
        planItemId: "plan-item-ownership",
        signal: "safe_parallel",
        reason: "Ownership-focused work should remain isolated for this test fixture.",
      },
      {
        planItemId: "plan-item-config",
        signal: "safe_parallel",
        reason: "Config stays structurally safe in this fixture.",
      },
    ],
    carry_forward: {
      ...carryForward,
      confidence: {
        ...carryForward.confidence,
        level: "low",
      },
      initial_verification_targets: [],
      concerns: [
        {
          id: "formal-caution-note",
          source: "low_confidence",
          code: "FORMAL_CAUTION",
          message: "Formal verification should retain caution notes from warning-heavy Step 2 context.",
          planItemIds: ["plan-item-ownership"],
          effects: ["planning_readiness"],
          status: "carried_forward",
        },
      ],
    },
    planning_diagnostics: {
      ...planningDiagnostics,
      usability_status: "actionable",
      warning_items: [
        {
          code: "PLAN_WARNING_CONTEXT_PRESENT",
          message: "Formal verification should retain caution notes from warning-heavy Step 2 context.",
        },
      ],
      blocking_items: [],
      partial_output: null,
    },
    planning_readiness: {
      ...planningReadiness,
      ready: true,
      status: "ready_with_warnings",
      summary: "`forge verify` can proceed.",
      warning_items: [
        {
          code: "PLAN_WARNING_CONTEXT_PRESENT",
          message: "Formal verification should retain caution notes from warning-heavy Step 2 context.",
        },
      ],
      blocking_issues: [],
      partial_output: null,
      constraining_concern_ids: ["formal-caution-note"],
      recommended_user_actions: [],
    },
    failure: null,
  };

  await writeRepoFile(repoRoot, ".forge/plan.json", `${JSON.stringify(formalPlanArtifact, null, 2)}\n`);
  return formalPlanArtifact;
}

async function createTlcStubEnv(
  repoRoot: string,
  mode: "passed" | "failed" | "errored" | "invalid_spec",
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
      "if /I \"%FORGE_TLC_STUB_MODE%\"==\"errored\" (",
      "  echo Exception in thread \"main\" java.lang.RuntimeException: TLC crashed.",
      "  exit /b 2",
      ")",
      "if /I \"%FORGE_TLC_STUB_MODE%\"==\"invalid_spec\" (",
      "  echo INVALID_SPEC: generated spec could not be run.",
      "  exit /b 3",
      ")",
      "echo Model checking completed. No error has been found.",
      "exit /b 0",
    ].join("\r\n"),
  );
  await writeRepoFile(
    repoRoot,
    "tools/java",
    [
      "#!/usr/bin/env bash",
      "set -euo pipefail",
      "case \"${FORGE_TLC_STUB_MODE:-passed}\" in",
      "  passed)",
      "    echo 'Model checking completed. No error has been found.'",
      "    exit 0",
      "    ;;",
      "  failed)",
      "    echo 'Error: Invariant violation.'",
      "    echo 'Trace:'",
      "    echo '  state 1'",
      "    echo '  state 2'",
      "    exit 1",
      "    ;;",
      "  errored)",
      "    echo 'Exception in thread \"main\" java.lang.RuntimeException: TLC crashed.'",
      "    exit 2",
      "    ;;",
      "  invalid_spec)",
      "    echo 'INVALID_SPEC: generated spec could not be run.'",
      "    exit 3",
      "    ;;",
      "  *)",
      "    echo 'Model checking completed. No error has been found.'",
      "    exit 0",
      "    ;;",
      "esac",
    ].join("\n"),
  );
  await chmod(join(toolsDir, "java"), 0o755);
  await writeRepoFile(repoRoot, "tools/fake-tlc.jar", "");

  const pathValue = `${toolsDir}${delimiter}${process.env.PATH ?? ""}`;

  return {
    PATH: pathValue,
    Path: pathValue,
    FORGE_TLC_JAR_PATH: join(toolsDir, "fake-tlc.jar"),
    FORGE_TLC_STUB_MODE: mode,
  };
}

async function readFormalOutputs(repoRoot: string): Promise<{
  artifact: FormalVerifyArtifact & Record<string, unknown>;
  report: string;
}> {
  return {
    artifact: (await readJsonFile<Record<string, unknown>>(verifyArtifactPath(repoRoot))) as FormalVerifyArtifact & Record<string, unknown>,
    report: await readTextFile(verifyReportPath(repoRoot)),
  };
}

await runScenario(
  "forge verify keeps formal results not_run when FORGE_TLC_JAR_PATH is absent and still writes formal artifacts",
  async () => {
    const repoRoot = await createTempRepo("forge-verify-part4-not-run-");

    try {
      await prepareFormalPlanArtifact(repoRoot);

      const result = runForgeVerifyBinary(["--repo", repoRoot], repoRoot, {
        FORGE_TLC_JAR_PATH: null,
      });

      assert.equal(result.code, 0, result.stderr);
      const { artifact, report } = await readFormalOutputs(repoRoot);

      assert.equal(artifact.status, "ready");
      assert.equal(artifact.formal_verification.status, "not_run");
      assert.ok(artifact.formal_verification.caution_notes.length > 0);
      assert.ok(artifact.formal_verification.state_models.length > 0);
      assert.ok(artifact.formal_verification.tla_specs.length > 0);
      assert.ok(artifact.formal_verification.tlc_results.length > 0);
      assert.ok(artifact.formal_verification.tlc_results.every((entry) => entry.status === "not_run"));
      assert.ok(
        artifact.verification_cases.some((verificationCase) => verificationCase.formalDetails !== null),
      );
      assert.equal(
        artifact.verification_cases.find((verificationCase) => verificationCase.category === "config_surface")
          ?.formalDetails,
        null,
      );
      assert.ok(
        artifact.formal_verification.tla_specs.every((spec) =>
          spec.spec_path.endsWith(".tla") && spec.config_path.endsWith(".cfg"),
        ),
      );
      assert.ok(
        artifact.formal_verification.tla_specs.every((spec) => spec.generation_status === "generated"),
      );
      assert.ok(
        (await Promise.all(
          artifact.formal_verification.tla_specs.map(async (spec) => await fileExists(spec.spec_path)),
        )).every(Boolean),
      );
      assert.ok(
        (await Promise.all(
          artifact.formal_verification.tla_specs.map(async (spec) => await fileExists(spec.config_path)),
        )).every(Boolean),
      );
      assert.match(report, /Formal Verification/);
      assert.match(report, /not_run/);
      assert.match(report, /Entry Criteria:/);
      assert.match(report, /State Model ID:/);
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "forge verify generates stable formal models and specs across repeated runs when TLC is stubbed as passed",
  async () => {
    const repoRoot = await createTempRepo("forge-verify-part4-passed-");

    try {
      await prepareFormalPlanArtifact(repoRoot);
      const env = await createTlcStubEnv(repoRoot, "passed");

      const firstResult = runForgeVerifyBinary(["--repo", repoRoot], repoRoot, env);
      assert.equal(firstResult.code, 0, firstResult.stderr);
      const firstOutputs = await readFormalOutputs(repoRoot);

      const secondResult = runForgeVerifyBinary(["--repo", repoRoot], repoRoot, env);
      assert.equal(secondResult.code, 0, secondResult.stderr);
      const secondOutputs = await readFormalOutputs(repoRoot);

      assert.equal(firstOutputs.artifact.formal_verification.status, "passed");
      assert.equal(secondOutputs.artifact.formal_verification.status, "passed");
      assert.deepEqual(
        firstOutputs.artifact.formal_verification.state_models,
        secondOutputs.artifact.formal_verification.state_models,
      );
      assert.deepEqual(
        firstOutputs.artifact.formal_verification.tla_specs,
        secondOutputs.artifact.formal_verification.tla_specs,
      );
      assert.deepEqual(
        firstOutputs.artifact.formal_verification.tlc_results,
        secondOutputs.artifact.formal_verification.tlc_results,
      );
      assert.ok(
        firstOutputs.artifact.verification_cases.filter((entry) => entry.lanes.includes("formal")).length > 0,
      );
      assert.ok(
        firstOutputs.artifact.verification_cases
          .filter((entry) => entry.lanes.includes("formal"))
          .every((entry) => entry.status === "passed"),
      );
      assert.ok(firstOutputs.artifact.formal_verification.tlc_results.every((entry) => entry.status === "passed"));
      assert.ok(firstOutputs.artifact.formal_verification.caution_notes.length > 0);
      assert.ok(
        firstOutputs.artifact.formal_verification.caution_notes.some((note) => /low-confidence/i.test(note)),
      );
      assert.ok(
        (await Promise.all(
          firstOutputs.artifact.formal_verification.tla_specs.map(async (spec) =>
            (await fileExists(spec.spec_path)) && (await fileExists(spec.config_path)),
          ),
        )).every(Boolean),
      );
      assert.match(firstOutputs.report, /passed/);
      assert.match(firstOutputs.report, /TLC Results/);
      assert.match(firstOutputs.report, /Spec Path:/);
      assert.match(firstOutputs.report, /Config Path:/);
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "forge verify normalizes failed TLC output from the external java seam",
  async () => {
    const repoRoot = await createTempRepo("forge-verify-part4-failed-");

    try {
      await prepareFormalPlanArtifact(repoRoot);
      const env = await createTlcStubEnv(repoRoot, "failed");

      runForgeVerifyBinary(["--repo", repoRoot], repoRoot, env);

      const { artifact, report } = await readFormalOutputs(repoRoot);

      assert.equal(artifact.formal_verification.status, "failed");
      assert.ok(artifact.verification_cases.filter((entry) => entry.lanes.includes("formal")).length > 0);
      assert.ok(
        artifact.verification_cases
          .filter((entry) => entry.lanes.includes("formal"))
          .every((entry) => entry.status === "failed"),
      );
      assert.ok(artifact.formal_verification.tlc_results.some((entry) => entry.status === "failed"));
      assert.ok(
        artifact.formal_verification.tlc_results.some((entry) =>
          entry.trace !== null && entry.trace.includes("state"),
        ),
      );
      assert.ok(
        artifact.formal_verification.tlc_results.some((entry) => entry.summary.includes("counterexample")),
      );
      assert.match(report, /failed/);
      assert.match(report, /Trace:/);
      assert.match(report, /Errors:/);
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "forge verify normalizes errored TLC output from the external java seam",
  async () => {
    const repoRoot = await createTempRepo("forge-verify-part4-errored-");

    try {
      await prepareFormalPlanArtifact(repoRoot);
      const env = await createTlcStubEnv(repoRoot, "errored");

      runForgeVerifyBinary(["--repo", repoRoot], repoRoot, env);

      const { artifact, report } = await readFormalOutputs(repoRoot);

      assert.equal(artifact.formal_verification.status, "errored");
      assert.ok(artifact.verification_cases.filter((entry) => entry.lanes.includes("formal")).length > 0);
      assert.ok(
        artifact.verification_cases
          .filter((entry) => entry.lanes.includes("formal"))
          .every((entry) => entry.status === "errored"),
      );
      assert.ok(artifact.formal_verification.tlc_results.some((entry) => entry.status === "errored"));
      assert.ok(
        artifact.formal_verification.tlc_results.some((entry) =>
          entry.errors.some((message) => /TLC crashed/i.test(message)),
        ),
      );
      assert.match(report, /errored/);
      assert.match(report, /Exception in thread/);
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "forge verify normalizes invalid_spec when the formal spec cannot be made runnable",
  async () => {
    const repoRoot = await createTempRepo("forge-verify-part4-invalid-spec-");

    try {
      await prepareFormalPlanArtifact(repoRoot);
      const env = await createTlcStubEnv(repoRoot, "invalid_spec");

      runForgeVerifyBinary(["--repo", repoRoot], repoRoot, env);

      const { artifact, report } = await readFormalOutputs(repoRoot);

      assert.equal(artifact.formal_verification.status, "invalid_spec");
      assert.ok(artifact.verification_cases.filter((entry) => entry.lanes.includes("formal")).length > 0);
      assert.ok(
        artifact.verification_cases
          .filter((entry) => entry.lanes.includes("formal"))
          .every((entry) => entry.status === "invalid_spec"),
      );
      assert.ok(artifact.formal_verification.tlc_results.some((entry) => entry.status === "invalid_spec"));
      assert.ok(
        artifact.formal_verification.tlc_results.some((entry) =>
          entry.errors.some((message) => /invalid/i.test(message)),
        ),
      );
      assert.match(report, /invalid_spec/);
      assert.match(report, /invalid/i);
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode);
}
