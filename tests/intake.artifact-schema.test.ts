import assert from "node:assert/strict";

import { createIntakeArtifact } from "../src/intake/artifact.js";
import {
  INTAKE_ARTIFACT_TOP_LEVEL_KEYS,
  validateIntakeArtifact,
} from "../src/intake/artifact-schema.js";
import { FORGE_SCHEMA_VERSION, STEP1_BOUNDARY_POLICY } from "../src/intake/constants.js";
import { resolveRuntimeOptions } from "../src/intake/options.js";
import type {
  IntakeArtifact,
  IntakeExecutionContext,
  NextStepReadiness,
} from "../src/intake/types.js";

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

function createContext(): IntakeExecutionContext {
  return {
    command: "intake",
    repoRoot: "C:/repo",
    startedAt: "2026-03-17T00:00:00.000Z",
    boundaryPolicy: STEP1_BOUNDARY_POLICY,
    paths: {
      requestedOutputRoot: null,
      outputRoot: "C:/repo/.forge",
      usedFallbackRoot: false,
      fallbackReason: null,
      artifactPath: "C:/repo/.forge/intake.json",
      reportPath: "C:/repo/.forge/reports/intake-report.md",
      debugArtifactPath: "C:/repo/.forge/debug/intake-debug.json",
    },
  };
}

function createNextStepReadiness(): NextStepReadiness {
  return {
    ready: true,
    blockingIssues: [],
    recommendedUserActions: [],
  };
}

function createValidArtifact(): IntakeArtifact {
  return createIntakeArtifact({
    context: createContext(),
    finishedAt: "2026-03-17T00:01:00.000Z",
    sourceInputs: {
      input_mode: "prompt",
      primary_input: {
        path: null,
        raw_text: "Update src/app.ts",
      },
      normalized_task_text: "Update src/app.ts",
      notes: [],
      constraints: [],
      config_path: null,
      focus_paths: [],
    },
    runtimeOptions: resolveRuntimeOptions({}),
    taskSpec: {
      goal: "Update src/app.ts",
      acceptanceCriteria: [],
      hasAcceptanceCriteria: false,
    },
    repoContext: {
      grounded: true,
      sourceFiles: ["src/app.ts"],
      testFiles: ["tests/app.test.ts"],
      manifestFiles: ["package.json"],
    },
    candidateTargets: [
      {
        path: "src/app.ts",
        kind: "source",
        matchType: "explicit",
        reason: "Explicitly mentioned in task input.",
      },
    ],
    initialVerificationTargets: [
      {
        path: "src/app.ts",
        kind: "source",
        reason: "Initial verification surface.",
      },
    ],
    ambiguities: [],
    nextStepReadiness: createNextStepReadiness(),
    boundaryNotes: ["Step 1 writes only intake outputs."],
    warnings: [],
    failure: null,
  });
}

await runScenario("intake artifact exposes the exact expected top-level keys", () => {
  const artifact = createValidArtifact();

  assert.deepEqual(
    Object.keys(artifact).sort(),
    [...INTAKE_ARTIFACT_TOP_LEVEL_KEYS].sort(),
  );
});

await runScenario("intake artifact preserves schema, command, and stage metadata", () => {
  const artifact = createValidArtifact();

  assert.equal(artifact.schemaVersion, FORGE_SCHEMA_VERSION);
  assert.equal(artifact.command, "forge intake");
  assert.equal(artifact.stage, STEP1_BOUNDARY_POLICY.stage);
});

await runScenario("artifact schema rejects a missing schemaVersion", () => {
  const artifact = createValidArtifact() as unknown as Record<string, unknown>;
  delete artifact.schemaVersion;

  assert.throws(() => validateIntakeArtifact(artifact), /schemaVersion/i);
});

await runScenario("artifact schema rejects a missing top-level sub-result", () => {
  const artifact = createValidArtifact() as unknown as Record<string, unknown>;
  delete artifact.taskSpec;

  assert.throws(() => validateIntakeArtifact(artifact), /taskSpec/i);
});

await runScenario("artifact schema rejects an invalid status value", () => {
  const artifact = {
    ...createValidArtifact(),
    status: "pending",
  };

  assert.throws(() => validateIntakeArtifact(artifact), /status/i);
});

await runScenario("artifact schema rejects extra top-level fields", () => {
  const artifact = {
    ...createValidArtifact(),
    unexpected_top_level_field: true,
  };

  assert.throws(() => validateIntakeArtifact(artifact), /unrecognized|unexpected/i);
});

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode);
}
