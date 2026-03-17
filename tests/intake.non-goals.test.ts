import assert from "node:assert/strict";
import { join } from "node:path";

import {
  createTempRepo,
  disposeTempRepo,
  readJsonFile,
  readTextFile,
  runForgeCli,
} from "./support/forge-cli.js";

interface InitialVerificationTarget {
  path: string;
  kind: "source" | "test" | "manifest";
  reason: string;
}

interface IntakeArtifact {
  initialVerificationTargets: InitialVerificationTarget[];
  boundaryNotes: string[];
}

function assertNoFutureStepPayloads(artifact: IntakeArtifact): void {
  const artifactRecord = artifact as unknown as Record<string, unknown>;

  assert.equal("planItems" in artifactRecord, false);
  assert.equal("workstreams" in artifactRecord, false);
  assert.equal("executionPackets" in artifactRecord, false);
}

function assertPointerOnlyTargets(targets: InitialVerificationTarget[]): void {
  assert.ok(targets.length > 0, "expected initial verification targets");

  for (const target of targets) {
    assert.match(target.path, /\S/);
    assert.ok(["source", "test", "manifest"].includes(target.kind));
    assert.match(target.reason, /\S/);
    assert.doesNotMatch(
      target.reason,
      /\b(run|execute|owner|step\s+\d|checklist|packet|workstream)\b/i,
    );
  }
}

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

await runScenario(
  "forge intake keeps direct implementation requests inside the Step 1 boundary",
  async () => {
    const repoRoot = await createTempRepo();

    try {
      const result = await runForgeCli(
        [
          "intake",
          "--repo",
          repoRoot,
          "--prompt",
          "Implement the login flow in src/app.ts and update tests/app.test.ts.",
        ],
        repoRoot,
      );

      assert.equal(result.code, 0, result.stderr);

      const artifact = await readJsonFile<IntakeArtifact>(join(repoRoot, ".forge", "intake.json"));
      const report = await readTextFile(join(repoRoot, ".forge", "reports", "intake-report.md"));

      assertPointerOnlyTargets(artifact.initialVerificationTargets);
      assertNoFutureStepPayloads(artifact);
      assert.ok(
        artifact.boundaryNotes.some((note) => /code edits|implementation work|later step|deferred/i.test(note)),
        "expected a boundary note that defers direct implementation",
      );
      assert.match(report, /## Initial Verification Targets/);
      assert.match(report, /deferred|later step|forge plan|forge verify|forge split/i);
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "forge intake defers work splitting and formal verification requests",
  async () => {
    const repoRoot = await createTempRepo();

    try {
      const result = await runForgeCli(
        [
          "intake",
          "--repo",
          repoRoot,
          "--prompt",
          "Inspect src/app.ts, split the work into workstreams, and use formal verification before implementation.",
        ],
        repoRoot,
      );

      assert.equal(result.code, 0, result.stderr);

      const artifact = await readJsonFile<IntakeArtifact>(join(repoRoot, ".forge", "intake.json"));
      const report = await readTextFile(join(repoRoot, ".forge", "reports", "intake-report.md"));

      assertPointerOnlyTargets(artifact.initialVerificationTargets);
      assertNoFutureStepPayloads(artifact);
      assert.ok(
        artifact.boundaryNotes.some((note) => /workstream|split/i.test(note)),
        "expected a boundary note for deferred work splitting",
      );
      assert.ok(
        artifact.boundaryNotes.some((note) => /formal verification|tla|tlc|model/i.test(note)),
        "expected a boundary note for deferred formal verification",
      );
      assert.match(report, /Initial Verification Targets/);
      assert.match(report, /workstream|formal verification|deferred/i);
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "forge intake keeps failed runs boundary-safe when required task input is missing",
  async () => {
    const repoRoot = await createTempRepo();

    try {
      const result = await runForgeCli(["intake", "--repo", repoRoot], repoRoot);

      assert.notEqual(result.code, 0, "expected the run to fail without --spec or --prompt");

      const artifact = await readJsonFile<IntakeArtifact>(join(repoRoot, ".forge", "intake.json"));

      assert.deepEqual(artifact.initialVerificationTargets, []);
      assertNoFutureStepPayloads(artifact);
      assert.ok(
        artifact.boundaryNotes.some((note) => /deferred|later step|forge plan/i.test(note)),
        "expected boundary notes on failed output",
      );
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode);
}
