import assert from "node:assert/strict";
import { join } from "node:path";

import { buildAmbiguityAnalysisResult } from "../src/intake/analysis.js";
import { assembleIntakeResult } from "../src/intake/assemble.js";
import { resolveLoadedIntakeInput } from "../src/intake/input.js";
import { buildInferenceResult } from "../src/intake/inference.js";
import { resolveRuntimeOptions } from "../src/intake/options.js";
import { scanRepoResult } from "../src/intake/repo-context.js";
import { buildTaskParserResult } from "../src/intake/task-parser.js";
import {
  createTempRepo,
  disposeTempRepo,
  writeRepoFile,
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
  "prompt source normalization creates synthetic prompt details from structured prompt input",
  async () => {
    const taskInput = resolveLoadedIntakeInput(
      createPromptInput(
        [
          "Add retry telemetry to src/app.ts and keep tests/app.test.ts aligned.",
          "",
          "Acceptance Criteria",
          "- src/app.ts emits retry telemetry",
          "- tests/app.test.ts validates the retry telemetry output",
        ].join("\n"),
      ),
    );

    assert.equal(taskInput.inputMode, "prompt");
    assert.ok(taskInput.promptDetails, "expected promptDetails for prompt mode");
    assert.match(taskInput.promptDetails?.title ?? "", /retry telemetry/i);
    assert.match(taskInput.promptDetails?.goal ?? "", /src\/app\.ts/i);
    assert.match(taskInput.promptDetails?.summary ?? "", /tests\/app\.test\.ts/i);
    assert.deepEqual(
      taskInput.promptDetails?.requirementCandidates.map((candidate) => candidate.text),
      [
        "src/app.ts emits retry telemetry",
        "tests/app.test.ts validates the retry telemetry output",
      ],
    );
    assert.deepEqual(taskInput.promptDetails?.openQuestions, []);
  },
);

await runScenario(
  "prompt source normalization skips markdown headings when deriving the prompt goal",
  async () => {
    const taskInput = resolveLoadedIntakeInput(
      createPromptInput(
        [
          "# Title",
          "",
          "Revise src/app.ts and tests/app.test.ts.",
          "",
          "Acceptance Criteria",
          "- src/app.ts is updated",
          "- tests/app.test.ts stays aligned",
        ].join("\n"),
      ),
    );

    const result = buildTaskParserResult(taskInput);

    assert.equal(taskInput.inputMode, "prompt");
    assert.ok(taskInput.promptDetails, "expected promptDetails for prompt mode");
    assert.match(taskInput.promptDetails?.goal ?? "", /Revise src\/app\.ts/i);
    assert.match(result.taskSpec.goal, /Revise src\/app\.ts/i);
    assert.equal(result.signals.hasGoal, true);
  },
);

await runScenario(
  "task parser result includes task spec and parse signals",
  async () => {
    const taskInput = resolveLoadedIntakeInput(
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
  "task parser captures structured requirements, mentions, constraints, and risky phrases",
  async () => {
    const taskInput = resolveLoadedIntakeInput({
      inputMode: "prompt",
      primaryInput: {
        path: null,
        rawText: [
          "Plan a migration for src/app.ts, keep tests/app.test.ts aligned, and review API contract ownership.",
          "",
          "Acceptance Criteria",
          "- src/app.ts handles retry writes safely",
          "- tests/app.test.ts covers migration order",
        ].join("\n"),
      },
      notes: [],
      constraints: ["Avoid changing the CLI contract."],
      configPath: null,
      focusPaths: [],
      warnings: [],
      recommendedUserActions: [],
    });

    const result = buildTaskParserResult(taskInput);

    assert.deepEqual(result.taskSpec.explicitRequirements, [
      "src/app.ts handles retry writes safely",
      "tests/app.test.ts covers migration order",
    ]);
    assert.deepEqual(result.taskSpec.constraints, [
      "Avoid changing the CLI contract.",
    ]);
    assert.deepEqual(result.taskSpec.mentionedPaths, [
      "src/app.ts",
      "tests/app.test.ts",
    ]);
    assert.deepEqual(result.taskSpec.mentionedTests, ["tests/app.test.ts"]);
    assert.ok((result.taskSpec.riskyPhrases ?? []).includes("migration"));
    assert.ok((result.taskSpec.riskyPhrases ?? []).includes("retry"));
    assert.ok((result.taskSpec.riskyPhrases ?? []).includes("api contract"));
    assert.ok((result.taskSpec.riskyPhrases ?? []).includes("ownership"));
  },
);

await runScenario(
  "repo scan result includes repo context and scan signals",
  async () => {
    const repoRoot = await createTempRepo();

    try {
      const result = await scanRepoResult(repoRoot, join(repoRoot, ".forge"));

      assert.equal(result.repoContext.grounded, true);
      assert.equal(result.repoContext.gitContext.status, "not_repo");
      assert.equal(result.repoContext.gitContext.repoRoot, null);
      assert.deepEqual(result.warnings, []);
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
      const taskInput = resolveLoadedIntakeInput(
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
      const taskInput = resolveLoadedIntakeInput(createPromptInput("fix"));
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
      assert.ok(
        (result.ambiguityItems ?? []).some((item) => item.type === "acceptance_criteria" && item.severity !== "low"),
      );
      assert.ok(
        (result.warningItems ?? []).some((item) => item.code === "FALLBACK_TARGETING"),
      );
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "ambiguity analysis generates scope and constraints open questions for a broad prompt with no repo anchors",
  async () => {
    const repoRoot = await createTempRepo();

    try {
      const taskInput = resolveLoadedIntakeInput(
        createPromptInput("Build a customer support dashboard for the product."),
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

      assert.deepEqual(
        taskInput.promptDetails?.openQuestions.map((question) => question.category),
        ["acceptance_criteria", "scope", "constraints"],
      );
      assert.ok(result.ambiguities.some((value: string) => /scope/i.test(value)));
      assert.ok(result.ambiguities.some((value: string) => /constraint/i.test(value)));
      assert.equal(result.confidence.level, "low");
      assert.ok(result.confidence.reasons.some((value: string) => /scope|constraint/i.test(value)));
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "ambiguity analysis flags repo-alignment conflicts when prompt references paths missing from the repo",
  async () => {
    const repoRoot = await createTempRepo();

    try {
      const taskInput = resolveLoadedIntakeInput(
        createPromptInput(
          [
            "Update src/missing.ts and keep tests/missing.test.ts aligned.",
            "",
            "Acceptance Criteria",
            "- src/missing.ts is updated",
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

      assert.ok(result.ambiguities.some((value: string) => /repo|missing\.ts|not found/i.test(value)));
      assert.equal(result.confidence.level, "low");
      assert.ok(result.confidence.reasons.some((value: string) => /unresolved|repo/i.test(value)));
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
      const taskInput = resolveLoadedIntakeInput(
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
      const taskInput = resolveLoadedIntakeInput(
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
      const taskInput = resolveLoadedIntakeInput(
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

await runScenario(
  "input module resolves loaded sources into a normalized intake input",
  async () => {
    const inputModule = (await import("../src/intake/input.js")) as Record<string, unknown>;
    const resolveLoadedIntakeInput = inputModule.resolveLoadedIntakeInput;

    assert.equal(
      typeof resolveLoadedIntakeInput,
      "function",
      "expected input.ts to export resolveLoadedIntakeInput",
    );

    const loadedSources = {
      inputMode: "prompt" as const,
      primaryInput: {
        path: null,
        rawText: "Update src/app.ts and tests/app.test.ts for intake readiness.",
      },
      notes: ["Keep CLI output stable."],
      constraints: ["Avoid changing public artifacts."],
      configPath: null,
      focusPaths: ["src"],
      warnings: [],
      recommendedUserActions: [],
    };

    const resolvedInput = (resolveLoadedIntakeInput as (value: typeof loadedSources) => {
      inputMode: "prompt" | "spec";
      primaryInput: {
        path: string | null;
        rawText: string;
      };
      normalizedTaskText: string;
      parserInputText: string;
      notes: string[];
      constraints: string[];
      configPath: string | null;
      focusPaths: string[];
      ambiguities: string[];
      recommendedUserActions: string[];
      promptDetails?: {
        title: string;
        goal: string;
        summary: string;
        requirementCandidates: Array<{
          text: string;
          source: "acceptance-criteria" | "prompt-clause";
        }>;
        openQuestions: Array<{
          category: "acceptance_criteria" | "scope" | "constraints" | "repo_alignment";
          text: string;
        }>;
      };
    })(loadedSources);

    assert.equal(resolvedInput.inputMode, "prompt");
    assert.equal(resolvedInput.primaryInput.rawText, loadedSources.primaryInput.rawText);
    assert.match(resolvedInput.normalizedTaskText, /Keep CLI output stable/i);
    assert.match(resolvedInput.parserInputText, /Acceptance Criteria/i);
    assert.deepEqual(resolvedInput.notes, loadedSources.notes);
    assert.deepEqual(resolvedInput.constraints, loadedSources.constraints);
    assert.deepEqual(resolvedInput.focusPaths, loadedSources.focusPaths);
    assert.ok(resolvedInput.promptDetails, "expected prompt details on prompt mode input");
  },
);

await runScenario(
  "input module exposes one runner-facing resolver for loading, validation, and normalization",
  async () => {
    const repoRoot = await createTempRepo();

    try {
      await writeRepoFile(repoRoot, "notes.md", "- Keep CLI output stable.\n");
      await writeRepoFile(repoRoot, "constraints.md", "- Avoid output contract drift.\n");

      const inputModule = (await import("../src/intake/input.js")) as Record<string, unknown>;
      const resolveIntakeInput = inputModule.resolveIntakeInput;

      assert.equal(
        typeof resolveIntakeInput,
        "function",
        "expected input.ts to export resolveIntakeInput",
      );

      const resolvedInput = await (resolveIntakeInput as (params: {
        options: {
          prompt?: string;
          notes?: string;
          constraints?: string;
          focus?: string[];
        };
        currentWorkingDirectory: string;
        repoRoot: string;
      }) => Promise<{
        taskInput: null | {
          inputMode: "prompt" | "spec";
          notes: string[];
          constraints: string[];
          focusPaths: string[];
        };
        blockingIssues: Array<{ code: string; message: string }>;
        warnings: string[];
        recommendedUserActions: string[];
      }>)({
        options: {
          prompt: "Update src/app.ts and tests/app.test.ts for intake readiness.",
          notes: join(repoRoot, "notes.md"),
          constraints: join(repoRoot, "constraints.md"),
          focus: ["src"],
        },
        currentWorkingDirectory: repoRoot,
        repoRoot,
      });

      assert.ok(resolvedInput.taskInput, "expected a normalized task input");
      assert.equal(resolvedInput.taskInput?.inputMode, "prompt");
      assert.deepEqual(resolvedInput.taskInput?.notes, ["- Keep CLI output stable."]);
      assert.deepEqual(resolvedInput.taskInput?.constraints, ["- Avoid output contract drift."]);
      assert.deepEqual(resolvedInput.taskInput?.focusPaths, ["src"]);
      assert.deepEqual(resolvedInput.blockingIssues, []);
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "task parser exposes direct task-spec normalization",
  async () => {
    const taskParserModule = (await import("../src/intake/task-parser.js")) as Record<string, unknown>;
    const normalizeTaskSpec = taskParserModule.normalizeTaskSpec;

    assert.equal(
      typeof normalizeTaskSpec,
      "function",
      "expected task-parser.ts to export normalizeTaskSpec",
    );

    const taskInput = resolveLoadedIntakeInput(
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

    const taskSpec = (normalizeTaskSpec as (value: typeof taskInput) => {
      goal: string;
      acceptanceCriteria: string[];
      hasAcceptanceCriteria: boolean;
    })(taskInput);

    assert.match(taskSpec.goal, /Revise src\/app\.ts/i);
    assert.deepEqual(taskSpec.acceptanceCriteria, [
      "src/app.ts is updated",
      "tests/app.test.ts is updated",
    ]);
    assert.equal(taskSpec.hasAcceptanceCriteria, true);
  },
);

await runScenario(
  "analysis module exposes direct risk analysis construction",
  async () => {
    const analysisModule = (await import("../src/intake/analysis.js")) as Record<string, unknown>;

    assert.equal(
      typeof analysisModule.buildRiskAnalysisResult,
      "function",
      "expected analysis.ts to export buildRiskAnalysisResult",
    );
  },
);

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode);
}
