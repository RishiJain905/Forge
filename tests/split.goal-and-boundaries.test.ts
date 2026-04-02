import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { join } from "node:path";

import { STEP4_BOUNDARY_POLICY } from "../src/split/constants.js";
import { buildSplitFoundation, runSplitFoundation } from "../src/split/runner.js";
import type { PlanArtifact } from "../src/plan/types.js";
import type { VerifyArtifact } from "../src/verify/types.js";
import {
  createTempRepo,
  disposeTempRepo,
  readJsonFile,
  runForgeBinary,
  runForgePlanBinary,
  runForgeVerifyBinary,
  verifyArtifactPath,
  writeRepoFile,
} from "./support/forge-cli.js";

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

await runScenario(
  "split foundation consumes persisted Step 3 output plus the referenced Step 2 plan artifact without re-verifying",
  async () => {
    const repoRoot = await createTempRepo("forge-split-ready-");

    try {
      await seedSpecRepo(repoRoot);

      const intakeResult = runForgeBinary(
        ["intake", "--repo", repoRoot, "--spec", join(repoRoot, "task.md")],
        repoRoot,
      );
      assert.equal(intakeResult.code, 0, intakeResult.stderr);

      const planResult = runForgePlanBinary(["--repo", repoRoot], repoRoot);
      assert.equal(planResult.code, 0, planResult.stderr);

      const verifyResult = runForgeVerifyBinary(["--repo", repoRoot], repoRoot);
      assert.equal(verifyResult.code, 0, verifyResult.stderr);

      const verifyArtifact = await readJsonFile<VerifyArtifact>(verifyArtifactPath(repoRoot));
      const planArtifact = await readJsonFile<PlanArtifact>(join(repoRoot, ".forge", "plan.json"));

      await rm(join(repoRoot, "task.md"), { force: true });
      await rm(join(repoRoot, "src", "app.ts"), { force: true });
      await rm(join(repoRoot, "tests", "app.test.ts"), { force: true });

      const result = await runSplitFoundation({ repo: repoRoot }, repoRoot);

      assert.equal(result.status, "ready");
      assert.equal(result.failure, null);
      assert.ok(result.foundation);

      const foundation = result.foundation;
      assert.equal(foundation.sourceVerify.artifactPath, verifyArtifactPath(repoRoot));
      assert.equal(foundation.sourceVerify.status, verifyArtifact.status);
      assert.equal(foundation.sourceVerify.readyForSplit, true);
      assert.equal(
        foundation.sourceVerify.verificationReadinessStatus,
        verifyArtifact.verification_readiness.status,
      );
      assert.deepEqual(foundation.splitInput.context.planItems, planArtifact.plan_items);
      assert.deepEqual(
        foundation.splitInput.context.verificationTargets,
        verifyArtifact.verification_targets,
      );
      assert.deepEqual(
        foundation.splitInput.context.verificationCases,
        verifyArtifact.verification_cases,
      );
      assert.deepEqual(foundation.carryForward.sourceIntake, planArtifact.source_intake);
      assert.deepEqual(foundation.carryForward.planCarryForward, planArtifact.carry_forward);
      assert.deepEqual(foundation.carryForward.verifyCarryForward, verifyArtifact.carry_forward);
      assert.deepEqual(foundation.workstreamContract.categories, [
        "serial",
        "safe_parallel",
        "parallel_after_dependency",
        "protected_merge",
        "blocked",
      ]);
      assert.ok(foundation.workstreamContract.requiredFields.includes("blockedReason"));

      const rebuilt = buildSplitFoundation({
        repoRoot,
        paths: {
          requestedOutputRoot: null,
          outputRoot: join(repoRoot, ".forge"),
          usedFallbackRoot: false,
          fallbackReason: null,
          verifyArtifactPath: verifyArtifactPath(repoRoot),
          planArtifactPath: join(repoRoot, ".forge", "plan.json"),
        },
        sourceVerify: foundation.sourceVerify,
        sourcePlan: foundation.sourcePlan,
        sourceIntake: planArtifact.source_intake,
        splitInput: foundation.splitInput,
      });

      assert.equal(rebuilt.carryForward.sourceIntake.command, planArtifact.source_intake.command);
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "split foundation preserves warning-heavy Step 3 context for a split-ready run",
  async () => {
    const repoRoot = await createTempRepo("forge-split-warning-");

    try {
      const intakeResult = runForgeBinary(["intake", "--repo", repoRoot, "--prompt", "fix"], repoRoot);
      assert.equal(intakeResult.code, 0, intakeResult.stderr);

      const planResult = runForgePlanBinary(["--repo", repoRoot], repoRoot);
      assert.equal(planResult.code, 0, planResult.stderr);

      const verifyResult = runForgeVerifyBinary(["--repo", repoRoot], repoRoot);
      assert.equal(verifyResult.code, 0, verifyResult.stderr);

      const result = await runSplitFoundation({ repo: repoRoot }, repoRoot);

      assert.equal(result.status, "ready");
      assert.equal(result.failure, null);
      assert.ok(result.foundation);
      assert.equal(result.foundation.splitInput.usability.status, "actionable");
      assert.ok(
        result.foundation.splitInput.usability.warningItems.some(
          (item) => item.code === "LOW_CONFIDENCE_SPLIT_INPUT",
        ),
      );
      assert.ok(
        result.foundation.splitInput.usability.warningItems.some(
          (item) => item.code === "VERIFY_WARNING_CONTEXT_PRESENT",
        ),
      );
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "split foundation keeps blocked Step 3 readiness visible for diagnosis",
  async () => {
    const repoRoot = await createTempRepo("forge-split-blocked-");

    try {
      const intakeResult = runForgeBinary(
        ["intake", "--repo", repoRoot, "--prompt", "fix", "--fail-on-low-confidence"],
        repoRoot,
      );
      assert.equal(intakeResult.code, 1);

      const planResult = runForgePlanBinary(["--repo", repoRoot], repoRoot);
      assert.notEqual(planResult.code, 0);

      const verifyResult = runForgeVerifyBinary(["--repo", repoRoot], repoRoot);
      assert.notEqual(verifyResult.code, 0);

      const result = await runSplitFoundation({ repo: repoRoot }, repoRoot);

      assert.equal(result.status, "blocked");
      assert.equal(result.failure, null);
      assert.ok(result.foundation);
      assert.equal(result.foundation.splitInput.usability.status, "upstream_blocked");
      assert.ok(
        result.foundation.splitInput.usability.blockingItems.some(
          (item) => item.code === "LOW_CONFIDENCE_ESCALATED",
        ),
      );
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "split foundation returns a deterministic failure when verify.json is missing",
  async () => {
    const repoRoot = await createTempRepo("forge-split-missing-");

    try {
      const result = await runSplitFoundation({ repo: repoRoot }, repoRoot);

      assert.equal(result.status, "failed");
      assert.equal(result.foundation, null);
      assert.equal(result.failure?.code, "SPLIT_INPUT_MISSING");
      assert.match(result.failure?.message ?? "", /verify\.json/i);
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "split foundation returns a deterministic failure when verify.json is schema-invalid",
  async () => {
    const repoRoot = await createTempRepo("forge-split-invalid-");

    try {
      await writeRepoFile(
        repoRoot,
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

      const result = await runSplitFoundation({ repo: repoRoot }, repoRoot);

      assert.equal(result.status, "failed");
      assert.equal(result.foundation, null);
      assert.equal(result.failure?.code, "VERIFY_ARTIFACT_INVALID");
      assert.match(result.failure?.message ?? "", /invalid/i);
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "split foundation returns a deterministic failure when the referenced plan artifact is missing",
  async () => {
    const repoRoot = await createTempRepo("forge-split-plan-missing-");

    try {
      await seedSpecRepo(repoRoot);

      const intakeResult = runForgeBinary(
        ["intake", "--repo", repoRoot, "--spec", join(repoRoot, "task.md")],
        repoRoot,
      );
      assert.equal(intakeResult.code, 0, intakeResult.stderr);

      const planResult = runForgePlanBinary(["--repo", repoRoot], repoRoot);
      assert.equal(planResult.code, 0, planResult.stderr);

      const verifyResult = runForgeVerifyBinary(["--repo", repoRoot], repoRoot);
      assert.equal(verifyResult.code, 0, verifyResult.stderr);

      await rm(join(repoRoot, ".forge", "plan.json"), { force: true });

      const result = await runSplitFoundation({ repo: repoRoot }, repoRoot);

      assert.equal(result.status, "failed");
      assert.equal(result.foundation, null);
      assert.equal(result.failure?.code, "SPLIT_SOURCE_PLAN_MISSING");
      assert.match(result.failure?.message ?? "", /plan artifact/i);
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "split foundation returns a deterministic failure when the referenced plan artifact is schema-invalid",
  async () => {
    const repoRoot = await createTempRepo("forge-split-plan-invalid-");

    try {
      await seedSpecRepo(repoRoot);

      const intakeResult = runForgeBinary(
        ["intake", "--repo", repoRoot, "--spec", join(repoRoot, "task.md")],
        repoRoot,
      );
      assert.equal(intakeResult.code, 0, intakeResult.stderr);

      const planResult = runForgePlanBinary(["--repo", repoRoot], repoRoot);
      assert.equal(planResult.code, 0, planResult.stderr);

      const verifyResult = runForgeVerifyBinary(["--repo", repoRoot], repoRoot);
      assert.equal(verifyResult.code, 0, verifyResult.stderr);

      await writeRepoFile(
        repoRoot,
        ".forge/plan.json",
        JSON.stringify(
          {
            schemaVersion: "2.0.0",
            command: "forge plan",
          },
          null,
          2,
        ),
      );

      const result = await runSplitFoundation({ repo: repoRoot }, repoRoot);

      assert.equal(result.status, "failed");
      assert.equal(result.foundation, null);
      assert.equal(result.failure?.code, "SPLIT_SOURCE_PLAN_INVALID");
      assert.match(result.failure?.message ?? "", /invalid/i);
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "step 4 boundary policy explicitly prohibits later-step drift and keeps regrouping conservative",
  async () => {
    assert.match(STEP4_BOUNDARY_POLICY.purpose, /execution-ready workstreams/i);
    assert.ok(STEP4_BOUNDARY_POLICY.authoritativeInputs.includes(".forge/verify.json"));
    assert.match(
      STEP4_BOUNDARY_POLICY.batch2Mission,
      /real Step 4 pipeline and produce usable split outputs/i,
    );
    assert.deepEqual(STEP4_BOUNDARY_POLICY.implementationPriorities, [
      "verify-artifact consumption",
      "workstream construction",
      "stream categories and safety application",
      "merge-order and blocking logic",
      "machine-readable artifact generation",
      "human-readable split report",
      "stable split orchestration",
      "real tests for implemented behavior",
    ]);
    assert.deepEqual(STEP4_BOUNDARY_POLICY.requiredImplementationTasks, [
      "align current Step 4 code with the locked split contract",
      "ensure one real orchestration path exists",
      "build workstream construction first",
      "stabilize stream categorization and safety application",
      "implement merge-order and blocking logic",
      "build real artifact/report output",
      "wire the command and harden with tests",
    ]);
    assert.ok(STEP4_BOUNDARY_POLICY.requiredCodeSurfaces.includes("Step 4 runner/orchestrator"));
    assert.ok(STEP4_BOUNDARY_POLICY.requiredCodeSurfaces.includes("CLI wiring"));
    assert.ok(STEP4_BOUNDARY_POLICY.requiredCodeSurfaces.includes("Step 4 tests"));
    assert.equal(STEP4_BOUNDARY_POLICY.deterministicFirst, true);
    assert.equal(STEP4_BOUNDARY_POLICY.conservativeRegrouping, true);
    assert.ok(STEP4_BOUNDARY_POLICY.disallowedCapabilities.includes("execute code"));
    assert.ok(STEP4_BOUNDARY_POLICY.disallowedCapabilities.includes("rewrite planning logic"));
    assert.ok(STEP4_BOUNDARY_POLICY.disallowedCapabilities.includes("redo verification"));
    assert.ok(STEP4_BOUNDARY_POLICY.disallowedCapabilities.includes("hide blocked work"));
    assert.ok(STEP4_BOUNDARY_POLICY.disallowedCapabilities.includes("implement actual execution logic"));
    assert.ok(STEP4_BOUNDARY_POLICY.disallowedCapabilities.includes("create code-edit prompts or packets"));
    assert.ok(STEP4_BOUNDARY_POLICY.disallowedCapabilities.includes("modify code as part of splitting"));
    assert.ok(STEP4_BOUNDARY_POLICY.disallowedCapabilities.includes("ignore verification constraints"));
    assert.ok(
      STEP4_BOUNDARY_POLICY.disallowedCapabilities.includes(
        "redesign Step 4 architecture without strong reason",
      ),
    );
    assert.ok(STEP4_BOUNDARY_POLICY.deferredCapabilities.includes("forge execute"));
    assert.ok(STEP4_BOUNDARY_POLICY.deferredCapabilities.includes("forge integrate"));
    assert.ok(STEP4_BOUNDARY_POLICY.conservativeRegroupingNotes.length > 0);
    assert.ok(STEP4_BOUNDARY_POLICY.deterministicFirstNotes.length > 0);
  },
);

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode);
}
