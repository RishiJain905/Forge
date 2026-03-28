import assert from "node:assert/strict";
import { chmod, rm } from "node:fs/promises";
import { delimiter, join } from "node:path";

import type { PlanArtifact } from "../src/plan/types.js";
import {
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
import { buildBatch2Part3FormalPlanArtifact } from "./support/verify-formal-fixtures.js";

type Part3VerifyArtifact = {
  status: "ready" | "blocked" | "failed";
  verification_targets: Array<{
    id: string;
    category: string;
    sourcePlanItemIds: string[];
    candidateLanes: string[];
    verificationCaseIds: string[];
  }>;
  verification_cases: Array<{
    id: string;
    verificationTargetId: string;
    category: string;
    sourcePlanItemIds: string[];
    lanes: string[];
    status: string;
    formalDetails: {
      enteredFormalLane: boolean;
      entryCriteria: string[];
      stateModelId: string | null;
      tlaSpecId: string | null;
      tlcResultId: string | null;
      cautionNotes: string[];
      trace: string | null;
      errors: string[];
    } | null;
  }>;
  formal_verification: {
    status: "not_run" | "passed" | "failed" | "errored" | "invalid_spec";
    summary: string;
    caution_notes: string[];
    state_models: Array<{
      id: string;
      verification_case_id: string;
      verification_target_id: string;
      name: string;
      summary: string;
      actors: string[];
      entities: string[];
      states: string[];
      transitions: string[];
      unsafe_states: string[];
      invariants: string[];
      initial_conditions: string[];
      [key: string]: unknown;
    }>;
    tla_specs: Array<{
      id: string;
      verification_case_id: string;
      state_model_id: string;
      name: string;
      summary: string;
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
  report?: string;
};

const EXPECTED_ACTION_LABELS: Record<string, string> = {
  retry_logic: "RetryOrReassign",
  ownership: "OwnershipTransition",
  parallel_overlap: "DuplicateExecution",
  stale_write: "StaleWriteValidity",
  migration_order: "OrderingSerialization",
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

async function seedPart3FormalRepo(repoRoot: string): Promise<void> {
  await writeRepoFile(
    repoRoot,
    "task.md",
    [
      "# Stabilize the shared workflow surface",
      "",
      "Revise `src/worker.ts`, `src/runtime.ts`, and `package.json` together.",
      "",
      "## Acceptance Criteria",
      "",
      "- `src/worker.ts` preserves ownership transitions and retry behavior",
      "- `src/runtime.ts` avoids duplicate execution and stale writes",
      "- `package.json` keeps migration order stable",
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
    "src/runtime.ts",
    [
      "export function runRuntime() {",
      "  return 'ready';",
      "}",
    ].join("\n"),
  );
  await writeRepoFile(
    repoRoot,
    "package.json",
    JSON.stringify(
      {
        name: "forge-part3-formal-fixture",
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
  await rm(join(repoRoot, "src", "runtime.ts"), { force: true });
  await rm(join(repoRoot, "package.json"), { force: true });
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

async function prepareBasePlanArtifact(repoRoot: string): Promise<PlanArtifact> {
  await seedPart3FormalRepo(repoRoot);

  const intakeResult = runForgeBinary(
    ["intake", "--repo", repoRoot, "--spec", join(repoRoot, "task.md")],
    repoRoot,
  );
  assert.equal(intakeResult.code, 0, intakeResult.stderr);

  const planResult = runForgePlanBinary(["--repo", repoRoot], repoRoot);
  assert.equal(planResult.code, 0, planResult.stderr);

  await removePlanningInputs(repoRoot);

  return readJsonFile<PlanArtifact>(join(repoRoot, ".forge", "plan.json"));
}

async function prepareSupportedPart3PlanArtifact(repoRoot: string): Promise<PlanArtifact> {
  const rawPlanArtifact = await prepareBasePlanArtifact(repoRoot);
  const supportedPlanArtifact = buildBatch2Part3FormalPlanArtifact({
    planArtifact: rawPlanArtifact,
  });

  await writeRepoFile(repoRoot, ".forge/plan.json", `${JSON.stringify(supportedPlanArtifact, null, 2)}\n`);
  return supportedPlanArtifact;
}

async function prepareUnsupportedPlanArtifact(repoRoot: string): Promise<PlanArtifact> {
  const rawPlanArtifact = await prepareBasePlanArtifact(repoRoot);
  const unsupportedPlanArtifact: PlanArtifact = {
    ...rawPlanArtifact,
    plan_items: [
      {
        id: "plan-item-api-contract",
        title: "Keep the API contract explicit",
        description: "Preserve the public API contract without selecting the initial Part 3 formal subset.",
        category: "interface",
        sourceRequirements: ["Keep the public API contract stable."],
        likelyAffectedPaths: ["src/worker.ts"],
        dependencies: [],
        riskLevel: "high",
        testObligations: [
          {
            category: "contract_validation",
            reason: "API contract changes need explicit validation.",
          },
        ],
        verificationRelevance: {
          relevant: true,
          categories: ["api_contract"],
          notes: ["This intentionally stays outside the initial supported formal subset."],
        },
        parallelization: {
          signal: "safe_parallel",
          reason: "API contract work stays structurally safe in this fixture.",
        },
      },
    ],
    dependency_graph: [],
    conflict_zones: [],
    test_obligations: [
      {
        planItemId: "plan-item-api-contract",
        category: "contract_validation",
        reason: "API contract changes need explicit validation.",
      },
    ],
    parallelization_signals: [
      {
        planItemId: "plan-item-api-contract",
        signal: "safe_parallel",
        reason: "API contract work stays structurally safe in this fixture.",
      },
    ],
    carry_forward: {
      ...rawPlanArtifact.carry_forward,
      concerns: [
        {
          id: "formal-caution-note",
          source: "warning",
          code: "FORMAL_CAUTION",
          message: "Unsupported formal categories should stay structural-only.",
          planItemIds: ["plan-item-api-contract"],
          effects: ["planning_readiness"],
          status: "carried_forward",
        },
      ],
    },
    planning_diagnostics: {
      ...rawPlanArtifact.planning_diagnostics,
    },
    planning_readiness: {
      ...rawPlanArtifact.planning_readiness,
      constraining_concern_ids: ["formal-caution-note"],
    },
    failure: rawPlanArtifact.failure,
  };

  await writeRepoFile(repoRoot, ".forge/plan.json", `${JSON.stringify(unsupportedPlanArtifact, null, 2)}\n`);
  return unsupportedPlanArtifact;
}

async function readPart3Outputs(repoRoot: string): Promise<Part3VerifyArtifact> {
  return readJsonFile<Part3VerifyArtifact>(verifyArtifactPath(repoRoot));
}

await runScenario(
  "forge verify exposes unsafe_conditions metadata for the initial Part 3 formal subset",
  async () => {
    const repoRoot = await createTempRepo("forge-verify-part3-state-models-");

    try {
      await prepareSupportedPart3PlanArtifact(repoRoot);
      const env = await createTlcStubEnv(repoRoot, "passed");

      const verifyResult = runForgeVerifyBinary(["--repo", repoRoot], repoRoot, env);
      assert.equal(verifyResult.code, 0, verifyResult.stderr);

      const artifact = await readPart3Outputs(repoRoot);
      const formalCases = artifact.verification_cases.filter((entry) => entry.lanes.includes("formal"));

      assert.equal(artifact.formal_verification.status, "passed");
      assert.equal(formalCases.length, 5);
      assert.equal(artifact.formal_verification.state_models.length, 5);

      for (const stateModel of artifact.formal_verification.state_models) {
        assert.ok(
          "unsafe_conditions" in stateModel,
          `expected ${stateModel.name} to expose unsafe_conditions`,
        );
        assert.ok(
          Array.isArray(stateModel.unsafe_conditions),
          `expected ${stateModel.name} unsafe_conditions to be an array`,
        );
      }
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "forge verify emits category-specific TLA action labels for the initial Part 3 formal subset",
  async () => {
    const repoRoot = await createTempRepo("forge-verify-part3-tla-actions-");

    try {
      await prepareSupportedPart3PlanArtifact(repoRoot);
      const env = await createTlcStubEnv(repoRoot, "passed");

      const verifyResult = runForgeVerifyBinary(["--repo", repoRoot], repoRoot, env);
      assert.equal(verifyResult.code, 0, verifyResult.stderr);

      const artifact = await readPart3Outputs(repoRoot);

      for (const spec of artifact.formal_verification.tla_specs) {
        const verificationCase = artifact.verification_cases.find(
          (entry) => entry.id === spec.verification_case_id,
        );
        assert.ok(verificationCase, `expected a verification case for ${spec.name}`);

        const expectedActionLabel = EXPECTED_ACTION_LABELS[verificationCase.category];
        assert.ok(
          expectedActionLabel,
          `expected a category-specific action label for ${verificationCase.category}`,
        );

        const specText = await readTextFile(spec.spec_path);
        assert.match(
          specText,
          new RegExp(expectedActionLabel, "i"),
          `expected ${spec.name} to declare ${expectedActionLabel}`,
        );
      }
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "forge verify keeps warning-heavy caution notes visible while modeling one risky area with multiple formal cases",
  async () => {
    const repoRoot = await createTempRepo("forge-verify-part3-caution-");

    try {
      await prepareSupportedPart3PlanArtifact(repoRoot);
      const env = await createTlcStubEnv(repoRoot, "passed");

      const verifyResult = runForgeVerifyBinary(["--repo", repoRoot], repoRoot, env);
      assert.equal(verifyResult.code, 0, verifyResult.stderr);

      const artifact = await readPart3Outputs(repoRoot);
      const report = await readTextFile(verifyReportPath(repoRoot));
      const formalCases = artifact.verification_cases.filter((entry) => entry.lanes.includes("formal"));

      assert.equal(artifact.formal_verification.status, "passed");
      assert.equal(formalCases.length, 5);
      assert.ok(
        artifact.formal_verification.caution_notes.some((note) => /low-confidence/i.test(note)),
        "expected formal caution notes to retain the low-confidence warning",
      );
      assert.ok(
        artifact.formal_verification.caution_notes.some((note) =>
          /PLAN_WARNING_CONTEXT_PRESENT/i.test(note),
        ),
        "expected formal caution notes to retain the planning warning context",
      );
      assert.ok(
        formalCases.every(
          (entry) => entry.formalDetails !== null && entry.formalDetails.cautionNotes.length > 0,
        ),
        "expected each formal case to keep caution notes",
      );
      assert.match(report, /Verification Readiness/);
      assert.match(report, /PLAN_WARNING_CONTEXT_PRESENT/);
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "forge verify keeps unsupported formal categories structural-only instead of validating them",
  async () => {
    const repoRoot = await createTempRepo("forge-verify-part3-unsupported-");

    try {
      const rawPlanArtifact = await prepareBasePlanArtifact(repoRoot);
      const unsupportedPlanArtifact = await prepareUnsupportedPlanArtifact(repoRoot);
      assert.equal(unsupportedPlanArtifact.plan_items.length, 1);
      assert.equal(rawPlanArtifact.plan_items.length > 0, true);

      const verifyResult = runForgeVerifyBinary(["--repo", repoRoot], repoRoot);
      assert.equal(verifyResult.code, 0, verifyResult.stderr);

      const artifact = await readPart3Outputs(repoRoot);
      assert.equal(artifact.formal_verification.status, "not_run");
      assert.equal(artifact.formal_verification.state_models.length, 0);
      assert.ok(artifact.verification_cases.every((entry) => !entry.lanes.includes("formal")));
      assert.ok(
        artifact.verification_targets.every((target) => target.candidateLanes.length === 1),
      );
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode);
}
