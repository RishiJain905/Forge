import assert from "node:assert/strict";
import { join } from "node:path";

import { runIntakeCommand } from "../src/intake/runner.js";
import {
  createTempRepo,
  disposeTempRepo,
  readJsonFile,
} from "./support/forge-cli.js";

interface IntakeArtifact {
  status: "success" | "warning" | "failed";
  runtime_options?: {
    llm_mode?: "deterministic" | "assist";
  };
  task_spec?: {
    title?: string;
    goal?: string;
    summary?: string;
    implementation_necessities?: string[];
  };
  candidate_targets?: Array<{
    path?: string;
  }>;
  ambiguities?: string[];
  warnings?: string[];
  next_step_readiness?: {
    recommended_user_actions?: string[];
  };
  confidence?: {
    reasons?: string[];
  };
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

await runScenario("forge intake falls back to deterministic mode when llm assist is requested without a backend", async () => {
  const repoRoot = await createTempRepo();

  try {
    const result = await runIntakeCommand({
      repo: repoRoot,
      prompt: "Update src/app.ts for optional reasoning coverage.",
      llmAssist: true,
    }, repoRoot);

    assert.equal(result.status, "warning");

    const artifact = await readJsonFile<IntakeArtifact>(join(repoRoot, ".forge", "intake.json"));
    assert.equal(artifact.runtime_options?.llm_mode, "assist");
    assert.ok(
      artifact.warnings?.some((warning) =>
        /no optional reasoning backend|continued in deterministic mode/i.test(warning)
      ),
    );
  } finally {
    await disposeTempRepo(repoRoot);
  }
});

await runScenario("forge intake applies optional reasoning hook enrichments without replacing deterministic task outputs", async () => {
  const repoRoot = await createTempRepo();

  try {
    const result = await runIntakeCommand({
      repo: repoRoot,
      prompt: "Update src/app.ts for optional reasoning coverage.",
      llmAssist: true,
    }, repoRoot, {
      optionalReasoningHook: async () => ({
        provider: "test-hook",
        ambiguities: ["Optional reasoning suggests clarifying rollback expectations."],
        warnings: ["Optional reasoning was used to enrich ambiguity analysis."],
        recommendedUserActions: ["Clarify rollback expectations before planning."],
      }),
    });

    assert.equal(result.status, "warning");

    const artifact = await readJsonFile<IntakeArtifact>(join(repoRoot, ".forge", "intake.json"));
    assert.equal(artifact.runtime_options?.llm_mode, "assist");
    assert.match(artifact.task_spec?.goal ?? "", /src\/app\.ts/i);
    assert.ok(artifact.candidate_targets?.some((target) => target.path === "src/app.ts"));
    assert.ok(
      artifact.ambiguities?.some((value) => /rollback expectations/i.test(value)),
    );
    assert.ok(
      artifact.next_step_readiness?.recommended_user_actions?.some((value) =>
        /rollback expectations/i.test(value),
      ),
    );
  } finally {
    await disposeTempRepo(repoRoot);
  }
});

await runScenario("forge intake does not invoke optional reasoning when --no-llm is set", async () => {
  const repoRoot = await createTempRepo();
  let callCount = 0;

  try {
    const result = await runIntakeCommand({
      repo: repoRoot,
      prompt: "Update src/app.ts for optional reasoning coverage.",
      noLlm: true,
    }, repoRoot, {
      optionalReasoningHook: async () => {
        callCount += 1;
        return {
          provider: "test-hook",
          warnings: ["should not be used"],
        };
      },
    });

    assert.equal(result.status, "warning");
    assert.equal(callCount, 0);
  } finally {
    await disposeTempRepo(repoRoot);
  }
});

await runScenario("forge intake ignores conflicting optional reasoning repo suggestions and records deterministic override notes", async () => {
  const repoRoot = await createTempRepo();

  try {
    const result = await runIntakeCommand({
      repo: repoRoot,
      prompt: "Update src/app.ts for optional reasoning coverage.",
      llmAssist: true,
    }, repoRoot, {
      optionalReasoningHook: async () => ({
        provider: "test-hook",
        suggestedTargetPaths: ["src/not-real.ts"],
      }),
    });

    assert.equal(result.status, "warning");

    const artifact = await readJsonFile<IntakeArtifact>(join(repoRoot, ".forge", "intake.json"));
    assert.ok(!artifact.candidate_targets?.some((target) => target.path === "src/not-real.ts"));
    assert.ok(
      artifact.warnings?.some((warning) => /deterministic|overrode|not-real\.ts/i.test(warning)),
    );
    assert.ok(
      artifact.confidence?.reasons?.some((reason) => /deterministic|overrode/i.test(reason)),
    );
  } finally {
    await disposeTempRepo(repoRoot);
  }
});

await runScenario("forge intake applies additive optional reasoning task wording without changing deterministic targets", async () => {
  const repoRoot = await createTempRepo();

  try {
    const result = await runIntakeCommand({
      repo: repoRoot,
      prompt: "clean up retry wording in src/app.ts and keep tests aligned",
      llmAssist: true,
    }, repoRoot, {
      optionalReasoningHook: async () => ({
        provider: "test-hook",
        taskWording: {
          title: "Refine retry wording in src/app.ts",
          summary: "Clarify the retry behavior wording in src/app.ts while keeping existing tests aligned.",
          implementationNecessities: [
            "Confirm the retry wording still matches the existing test intent.",
          ],
        },
      }),
    });

    assert.equal(result.status, "warning");

    const artifact = await readJsonFile<IntakeArtifact>(join(repoRoot, ".forge", "intake.json"));
    assert.equal(artifact.runtime_options?.llm_mode, "assist");
    assert.equal(artifact.task_spec?.title, "Refine retry wording in src/app.ts");
    assert.match(artifact.task_spec?.summary ?? "", /retry behavior wording/i);
    assert.ok(
      artifact.task_spec?.implementation_necessities?.some((value) =>
        /retry wording still matches the existing test intent/i.test(value)
      ),
    );
    assert.ok(artifact.candidate_targets?.some((target) => target.path === "src/app.ts"));
    assert.ok(
      artifact.confidence?.reasons?.some((reason) =>
        /optional reasoning|assist|test-hook/i.test(reason)
      ) || artifact.warnings?.some((warning) => /optional reasoning|assist|test-hook/i.test(warning)),
      "expected optional reasoning provenance to be visible in confidence reasons or warnings",
    );
  } finally {
    await disposeTempRepo(repoRoot);
  }
});

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode);
}
