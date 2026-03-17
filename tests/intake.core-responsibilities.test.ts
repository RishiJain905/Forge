import assert from "node:assert/strict";
import { join } from "node:path";

import { buildAmbiguityAnalysisResult } from "../src/intake/analysis.js";
import { assembleIntakeResult } from "../src/intake/assemble.js";
import { resolveTaskSource } from "../src/intake/input.js";
import { buildInferenceResult } from "../src/intake/inference.js";
import { resolveRuntimeOptions } from "../src/intake/options.js";
import { scanRepoResult } from "../src/intake/repo-context.js";
import { buildTaskParserResult } from "../src/intake/task-parser.js";
import {
  createTempRepo,
  disposeTempRepo,
} from "./support/forge-cli.js";
import type { ValidatedIntakeInputs } from "../src/intake/types.js";

function createPromptInput(prompt: string): ValidatedIntakeInputs {
  return {
    inputMode: "prompt",
    primaryInput: {
      path: null,
      rawText: prompt,
    },
    notes: [],
    constraints: [],
    configPath: null,
    focusPaths: [],
    warnings: [],
    recommendedUserActions: [],
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

await runScenario(
  "task parser result includes task spec and parse signals",
  async () => {
    const taskInput = resolveTaskSource(
      createPromptInput(
        [
          "Revise src/app.ts and tests/app.test.ts.",
          "",
          "Acceptance Criteria",
          "- src/app.ts is updated",
          "- tests/app.test.ts is updated",
        ].join("\n"),
      ),
    );

    const result = buildTaskParserResult(taskInput);

    assert.match(result.taskSpec.goal, /Revise src\/app\.ts/i);
    assert.equal(result.signals.hasGoal, true);
    assert.equal(result.signals.hasAcceptanceCriteria, true);
    assert.deepEqual(result.signals.referencedPaths, ["src/app.ts", "tests/app.test.ts"]);
  },
);

await runScenario(
  "repo scan result includes repo context and scan signals",
  async () => {
    const repoRoot = await createTempRepo();

    try {
      const result = await scanRepoResult(repoRoot, join(repoRoot, ".forge"));

      assert.equal(result.repoContext.grounded, true);
      assert.ok(result.signals.sourceFileCount >= 1);
      assert.ok(result.signals.testFileCount >= 1);
      assert.equal(result.signals.repoLooksSparse, false);
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "inference adds engineering requirements without inventing product scope",
  async () => {
    const repoRoot = await createTempRepo();

    try {
      const taskInput = resolveTaskSource(
        createPromptInput("Update src/app.ts for the new login flow."),
      );
      const taskParserResult = buildTaskParserResult(taskInput);
      const repoScanResult = await scanRepoResult(repoRoot, join(repoRoot, ".forge"));

      const result = buildInferenceResult({
        taskInput,
        taskParserResult,
        repoScanResult,
      });

      assert.ok(result.candidateTargets.some((target: { path: string }) => target.path === "src/app.ts"));
      assert.ok(
        result.inferredRequirements.some((requirement: string) => /test/i.test(requirement)),
      );
      assert.ok(
        result.inferredRequirements.every((requirement: string) =>
          !/dashboard|landing page|new feature/i.test(requirement)
        ),
      );
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "ambiguity analysis lowers confidence for a vague prompt with fallback targeting",
  async () => {
    const repoRoot = await createTempRepo();

    try {
      const taskInput = resolveTaskSource(createPromptInput("fix"));
      const taskParserResult = buildTaskParserResult(taskInput);
      const repoScanResult = await scanRepoResult(repoRoot, join(repoRoot, ".forge"));
      const inferenceResult = buildInferenceResult({
        taskInput,
        taskParserResult,
        repoScanResult,
      });

      const result = buildAmbiguityAnalysisResult({
        taskInput,
        taskParserResult,
        repoScanResult,
        inferenceResult,
        runtimeOptions: resolveRuntimeOptions({}),
        failure: null,
        validationBlockingIssues: [],
        validationWarnings: [],
        validationRecommendedUserActions: [],
      });

      assert.equal(result.confidence.level, "low");
      assert.ok(result.ambiguities.some((value: string) => /too short|acceptance criteria/i.test(value)));
      assert.ok(result.warnings.some((value: string) => /confidence|fallback|partial/i.test(value)));
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "ambiguity analysis treats missing explicit test references as weak repo inspection",
  async () => {
    const repoRoot = await createTempRepo();

    try {
      const taskInput = resolveTaskSource(
        createPromptInput(
          [
            "Update src/app.ts and keep tests/missing.test.ts aligned.",
            "",
            "Acceptance Criteria",
            "- src/app.ts is updated",
            "- tests/missing.test.ts is added or updated",
          ].join("\n"),
        ),
      );
      const taskParserResult = buildTaskParserResult(taskInput);
      const repoScanResult = await scanRepoResult(repoRoot, join(repoRoot, ".forge"));
      const inferenceResult = buildInferenceResult({
        taskInput,
        taskParserResult,
        repoScanResult,
      });

      const result = buildAmbiguityAnalysisResult({
        taskInput,
        taskParserResult,
        repoScanResult,
        inferenceResult,
        runtimeOptions: resolveRuntimeOptions({}),
        failure: null,
        validationBlockingIssues: [],
        validationWarnings: [],
        validationRecommendedUserActions: [],
      });

      assert.equal(result.confidence.level, "low");
      assert.equal(result.confidence.signals.repoInspection, "weak");
      assert.ok(
        result.confidence.reasons.some((value: string) => /test paths were not found/i.test(value)),
      );
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "ambiguity analysis treats differently cased referenced paths as grounded when the repo match exists",
  async () => {
    const repoRoot = await createTempRepo();

    try {
      const taskInput = resolveTaskSource(
        createPromptInput(
          [
            "Update SRC/APP.TS and keep TESTS/APP.TEST.TS aligned.",
            "",
            "Acceptance Criteria",
            "- SRC/APP.TS is updated",
            "- TESTS/APP.TEST.TS stays aligned",
          ].join("\n"),
        ),
      );
      const taskParserResult = buildTaskParserResult(taskInput);
      const repoScanResult = await scanRepoResult(repoRoot, join(repoRoot, ".forge"));
      const inferenceResult = buildInferenceResult({
        taskInput,
        taskParserResult,
        repoScanResult,
      });

      const result = buildAmbiguityAnalysisResult({
        taskInput,
        taskParserResult,
        repoScanResult,
        inferenceResult,
        runtimeOptions: resolveRuntimeOptions({}),
        failure: null,
        validationBlockingIssues: [],
        validationWarnings: [],
        validationRecommendedUserActions: [],
      });

      assert.equal(result.confidence.level, "high");
      assert.equal(result.confidence.signals.repoInspection, "strong");
      assert.equal(result.confidence.signals.targeting, "strong");
      assert.ok(
        !result.confidence.reasons.some((value: string) => /test paths were not found|referenced paths remain unresolved/i.test(value)),
      );
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "assembled intake result keeps all four responsibility outputs on the final path",
  async () => {
    const repoRoot = await createTempRepo();

    try {
      const taskInput = resolveTaskSource(
        createPromptInput(
          [
            "Revise src/app.ts and tests/app.test.ts.",
            "",
            "Acceptance Criteria",
            "- src/app.ts is updated",
            "- tests/app.test.ts is updated",
          ].join("\n"),
        ),
      );
      const taskParserResult = buildTaskParserResult(taskInput);
      const repoScanResult = await scanRepoResult(repoRoot, join(repoRoot, ".forge"));
      const inferenceResult = buildInferenceResult({
        taskInput,
        taskParserResult,
        repoScanResult,
      });
      const ambiguityAnalysisResult = buildAmbiguityAnalysisResult({
        taskInput,
        taskParserResult,
        repoScanResult,
        inferenceResult,
        runtimeOptions: resolveRuntimeOptions({}),
        failure: null,
        validationBlockingIssues: [],
        validationWarnings: [],
        validationRecommendedUserActions: [],
      });

      const assembled = assembleIntakeResult({
        taskInput,
        taskParserResult,
        repoScanResult,
        inferenceResult,
        ambiguityAnalysisResult,
      });

      assert.ok(assembled.responsibilities.taskParser);
      assert.ok(assembled.responsibilities.repoScan);
      assert.ok(assembled.responsibilities.inference);
      assert.ok(assembled.responsibilities.analysis);
      assert.match(assembled.taskSpec.goal, /Revise src\/app\.ts/i);
      assert.equal(assembled.repoContext.grounded, true);
      assert.ok(assembled.candidateTargets.length > 0);
      assert.ok(Array.isArray(assembled.ambiguities));
      assert.ok(Array.isArray(assembled.warnings));
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode);
}
