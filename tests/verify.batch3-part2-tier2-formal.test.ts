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

type Tier2VerifyArtifact = {
  schemaVersion: string;
  command: string;
  stage: string;
  status: string;
  purpose: string;
  repoRoot: string;
  requestedOutputRoot: string | null;
  outputRoot: string;
  writePolicy: Record<string, unknown>;
  files: Record<string, string>;
  startedAt: string;
  finishedAt: string;
  summary: string;
  boundaryNotes: string[];
  source_plan: Record<string, unknown>;
  verification_target_contract: Record<string, unknown>;
  formal_lane_contract: {
    tooling: string[];
    entryCriteria: string[];
    stateModelRequiredFields: string[];
    tlcStatuses: string[];
  };
  verification_targets: Array<{
    id: string;
    title: string;
    category: string;
    sourcePlanItemIds: string[];
    candidateLanes: string[];
    sourceRiskSources: string[];
    expectedFindingKinds: string[];
    verificationCaseIds: string[];
    traceabilityNotes: string[];
  }>;
  verification_cases: Array<{
    id: string;
    verificationTargetId: string;
    title: string;
    category: string;
    sourcePlanItemIds: string[];
    lanes: string[];
    goal: string;
    status: string;
    summary: string;
    findings: string[];
    mitigations: string[];
    constraints: string[];
    traceabilityNotes: string[];
    formalDetails: {
      enteredFormalLane: true;
      entryCriteria: string[];
      stateModelId: string | null;
      tlaSpecId: string | null;
      tlcResultId: string | null;
      scenarioKind: string | null;
      cautionNotes: string[];
      trace: string | null;
      errors: string[];
    } | null;
  }>;
  structural_verification: {
    status: string;
    summary: string;
    findings: string[];
    constraints: string[];
  };
  formal_verification: {
    status: "not_run" | "passed" | "failed" | "errored" | "invalid_spec" | "inconclusive";
    summary: string;
    caution_notes: string[];
    state_models: Array<{
      id: string;
      verification_case_id: string;
      verification_target_id: string;
      name: string;
      summary: string;
      scenario_kind: string | null;
      actors: string[];
      entities: string[];
      states: string[];
      transitions: string[];
      unsafe_states: string[];
      unsafe_conditions: string[];
      invariants: string[];
      initial_conditions: string[];
    }>;
    tla_specs: Array<{
      id: string;
      verification_case_id: string;
      state_model_id: string;
      name: string;
      summary: string;
      scenario_kind: string | null;
      module_name: string;
      spec_path: string;
      config_path: string;
      generation_status: string;
    }>;
    tlc_results: Array<{
      id: string;
      verification_case_id: string;
      tla_spec_id: string;
      scenario_kind: string | null;
      status: "not_run" | "passed" | "failed" | "errored" | "invalid_spec" | "inconclusive";
      summary: string;
      trace: string | null;
      errors: string[];
    }>;
    findings: string[];
    constraints: string[];
  };
  findings: Array<{
    id: string;
    lane: "structural" | "formal";
    verification_case_id: string;
    verification_target_id: string;
    status: string;
    summary: string;
    tla_spec_id: string | null;
    tlc_result_id: string | null;
    trace: string | null;
    errors: string[];
  }>;
  constraints: Array<{
    id: string;
    lane: "structural" | "formal";
    verification_case_id: string;
    verification_target_id: string;
    summary: string;
  }>;
  carry_forward: Record<string, unknown>;
  verification_diagnostics: Record<string, unknown>;
  verification_readiness: {
    ready: boolean;
    status: string;
    summary: string;
    warning_items: Array<{ code: string; message: string }>;
    blocking_issues: Array<{ code: string; message: string }>;
    partial_output: Record<string, unknown> | null;
    constraining_concern_ids: string[];
    recommended_user_actions: string[];
  };
  failure: Record<string, unknown> | null;
};

const EXPECTED_TOP_LEVEL_KEYS = [
  "schemaVersion",
  "command",
  "stage",
  "status",
  "purpose",
  "repoRoot",
  "requestedOutputRoot",
  "outputRoot",
  "writePolicy",
  "files",
  "startedAt",
  "finishedAt",
  "summary",
  "boundaryNotes",
  "source_plan",
  "verification_target_contract",
  "formal_lane_contract",
  "verification_targets",
  "verification_cases",
  "structural_verification",
  "formal_verification",
  "findings",
  "constraints",
  "carry_forward",
  "verification_diagnostics",
  "verification_readiness",
  "failure",
] as const;

const EXPECTED_REPORT_HEADINGS = [
  "## Overview",
  "## Purpose",
  "## Source Plan",
  "## Verification Target Contract",
  "## Formal Lane Contract",
  "## Verification Targets",
  "## Verification Cases",
  "## Structural Verification",
  "## Formal Verification",
  "## Findings",
  "## Constraints",
  "## Carry-Forward Context",
  "## Verification Readiness",
  "## Boundary Notes",
  "## Deferred Capabilities",
  "## Allowed Side Effects",
  "## Disallowed Capabilities",
  "## Output Files",
  "## Failure",
  "## Summary",
] as const;

const EXPECTED_SCENARIO_KINDS_IN_ORDER = [
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
] as const;

const EXPECTED_SCENARIO_SEMANTICS = [
  {
    scenarioKind: "multi_agent_handoff_chain",
    pattern: /chained transfer|dropped ownership/i,
  },
  {
    scenarioKind: "queue_claim_release_lifecycle",
    pattern: /double[- ]claim|lost[- ]claim/i,
  },
  {
    scenarioKind: "shared_artifact_merge_order",
    pattern: /merge order|merge-order|shared artifact merge/i,
  },
  {
    scenarioKind: "shared_resource_mutation_overlap",
    pattern: /shared resource mutation|conflicting update/i,
  },
  {
    scenarioKind: "failure_recovery_loop",
    pattern: /rollback|recovery loop|reassignment loop/i,
  },
] as const;

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

async function seedTier2Repo(repoRoot: string): Promise<void> {
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
        name: "forge-part3-tier2-formal-fixture",
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
  await rm(join(repoRoot, "src", "worker.ts"), { force: true });
  await rm(join(repoRoot, "src", "runtime.ts"), { force: true });
  await rm(join(repoRoot, "src", "app.ts"), { force: true });
  await rm(join(repoRoot, "tests", "app.test.ts"), { force: true });
  await rm(join(repoRoot, "package.json"), { force: true });
}

async function prepareTier2PlanArtifact(repoRoot: string): Promise<PlanArtifact> {
  await seedTier2Repo(repoRoot);

  const intakeResult = runForgeBinary(
    ["intake", "--repo", repoRoot, "--spec", join(repoRoot, "task.md")],
    repoRoot,
  );
  assert.equal(intakeResult.code, 0, intakeResult.stderr);

  const planResult = runForgePlanBinary(["--repo", repoRoot], repoRoot);
  assert.equal(planResult.code, 0, planResult.stderr);

  await removePlanningInputs(repoRoot);

  const rawPlanArtifact = await readJsonFile<PlanArtifact>(join(repoRoot, ".forge", "plan.json"));
  const tier2PlanArtifact = buildBatch2Part3FormalPlanArtifact({ planArtifact: rawPlanArtifact });
  await writeRepoFile(repoRoot, ".forge/plan.json", `${JSON.stringify(tier2PlanArtifact, null, 2)}\n`);

  return tier2PlanArtifact;
}

async function createTlcStubEnv(
  repoRoot: string,
  mode: "passed" | "failed" | "errored" | "invalid_spec" | "inconclusive",
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
      "if /I \"%FORGE_TLC_STUB_MODE%\"==\"inconclusive\" (",
      "  echo TLC completed with partial evidence and no trustworthy verdict.",
      "  exit /b 0",
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
      "  inconclusive)",
      "    echo 'TLC completed with partial evidence and no trustworthy verdict.'",
      "    exit 0",
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

function extractReportHeadings(report: string): string[] {
  return report
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .filter((line) => line.startsWith("## "));
}

function assertStableShell(artifact: Tier2VerifyArtifact, report: string): void {
  assert.deepEqual(Object.keys(artifact), [...EXPECTED_TOP_LEVEL_KEYS]);
  assert.deepEqual(extractReportHeadings(report), [...EXPECTED_REPORT_HEADINGS]);
}

await runScenario(
  "forge verify expands Tier 2 formal scenarios into deterministic multi-case coverage",
  async () => {
    const repoRoot = await createTempRepo("forge-verify-b3-p2-tier2-cases-");

    try {
      await prepareTier2PlanArtifact(repoRoot);
      const env = await createTlcStubEnv(repoRoot, "passed");

      const verifyResult = runForgeVerifyBinary(["--repo", repoRoot], repoRoot, env);
      assert.equal(verifyResult.code, 0, verifyResult.stderr);

      const artifact = await readJsonFile<Tier2VerifyArtifact>(verifyArtifactPath(repoRoot));
      const report = await readTextFile(verifyReportPath(repoRoot));
      const formalCases = artifact.verification_cases.filter((entry) => entry.lanes.includes("formal"));

      assertStableShell(artifact, report);
      assert.equal(formalCases.length, 10);
      assert.deepEqual(
        formalCases.map((entry) => entry.formalDetails?.scenarioKind),
        [...EXPECTED_SCENARIO_KINDS_IN_ORDER],
      );
      assert.deepEqual(
        artifact.formal_verification.state_models.map((entry) => entry.scenario_kind),
        [...EXPECTED_SCENARIO_KINDS_IN_ORDER],
      );
      assert.deepEqual(
        artifact.formal_verification.tla_specs.map((entry) => entry.scenario_kind),
        [...EXPECTED_SCENARIO_KINDS_IN_ORDER],
      );
      assert.deepEqual(
        artifact.formal_verification.tlc_results.map((entry) => entry.scenario_kind),
        [...EXPECTED_SCENARIO_KINDS_IN_ORDER],
      );
      assert.match(artifact.formal_verification.summary, /10 formal verification case/i);
      assert.match(report, /multi_agent_handoff_chain/);
      assert.match(report, /queue_claim_release_lifecycle/);
      assert.match(report, /shared_artifact_merge_order/);
      assert.match(report, /shared_resource_mutation_overlap/);
      assert.match(report, /failure_recovery_loop/);

      for (const expectation of EXPECTED_SCENARIO_SEMANTICS) {
        const stateModel = artifact.formal_verification.state_models.find(
          (entry) => entry.scenario_kind === expectation.scenarioKind,
        );
        assert.ok(stateModel, `expected a state model for ${expectation.scenarioKind}`);
        const stateModelText = [
          stateModel?.summary,
          stateModel?.states.join(" "),
          stateModel?.unsafe_conditions.join(" "),
          stateModel?.invariants.join(" "),
        ].join(" ");
        assert.match(
          stateModelText,
          expectation.pattern,
          `expected ${expectation.scenarioKind} to carry scenario-specific semantics in the state model`,
        );

        const tlaSpec = artifact.formal_verification.tla_specs.find(
          (entry) => entry.scenario_kind === expectation.scenarioKind,
        );
        assert.ok(tlaSpec, `expected a TLA spec for ${expectation.scenarioKind}`);
        const specText = await readTextFile(tlaSpec.spec_path);
        assert.match(
          specText,
          expectation.pattern,
          `expected ${expectation.scenarioKind} to carry scenario-specific semantics in the TLA spec`,
        );
      }
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "forge verify preserves an inconclusive TLC verdict distinctly from pass/fail/error",
  async () => {
    const repoRoot = await createTempRepo("forge-verify-b3-p2-inconclusive-");

    try {
      await prepareTier2PlanArtifact(repoRoot);
      const env = await createTlcStubEnv(repoRoot, "inconclusive");

      const verifyResult = runForgeVerifyBinary(["--repo", repoRoot], repoRoot, env);
      assert.equal(verifyResult.code, 0, verifyResult.stderr);

      const artifact = await readJsonFile<Tier2VerifyArtifact>(verifyArtifactPath(repoRoot));
      const report = await readTextFile(verifyReportPath(repoRoot));

      assertStableShell(artifact, report);
      assert.equal(artifact.formal_verification.status, "inconclusive");
      assert.ok(
        artifact.formal_verification.tlc_results.every((entry) => entry.status === "inconclusive"),
      );
      assert.ok(
        artifact.formal_verification.tlc_results.every((entry) => entry.trace !== null),
      );
      assert.ok(
        artifact.formal_verification.caution_notes.some((note) => /inconclusive/i.test(note)),
      );
      assert.match(artifact.formal_verification.summary, /inconclusive/i);
      assert.match(report, /inconclusive/i);
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode);
}
