import assert from "node:assert/strict";

import { resolveLoadedIntakeInput } from "../src/intake/input.js";
import { buildTaskParserResult } from "../src/intake/task-parser.js";
import type { NormalizedTaskInput, ValidatedIntakeInputs } from "../src/intake/types.js";

function createPromptInput(
  prompt: string,
  overrides: Partial<ValidatedIntakeInputs> = {},
): ValidatedIntakeInputs {
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
    ...overrides,
  };
}

function createParserInput(
  overrides: Partial<NormalizedTaskInput> = {},
): NormalizedTaskInput {
  return {
    inputMode: "prompt",
    primaryInput: {
      path: null,
      rawText: "",
    },
    normalizedTaskText: "",
    parserInputText: "",
    notes: [],
    constraints: [],
    configPath: null,
    focusPaths: [],
    ambiguities: [],
    recommendedUserActions: [],
    ...overrides,
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
  "prompt normalization creates synthetic prompt details from structured prompt input",
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
  "task parser skips markdown headings and list clutter when deriving the goal",
  async () => {
    const result = buildTaskParserResult(createParserInput({
      inputMode: "prompt",
      primaryInput: {
        path: null,
        rawText: [
          "Update src/app.ts and tests/app.test.ts.",
          "",
          "Acceptance Criteria",
          "- src/app.ts is updated",
          "- tests/app.test.ts stays aligned",
        ].join("\n"),
      },
      normalizedTaskText: [
        "# Task",
        "",
        "Update src/app.ts and tests/app.test.ts.",
        "",
        "## Acceptance Criteria",
        "",
        "- src/app.ts is updated",
        "- tests/app.test.ts stays aligned",
      ].join("\n"),
      parserInputText: [
        "# Task",
        "",
        "Update src/app.ts and tests/app.test.ts.",
        "",
        "## Acceptance Criteria",
        "",
        "- src/app.ts is updated",
        "- tests/app.test.ts stays aligned",
      ].join("\n"),
    }));

    assert.match(result.taskSpec.goal, /Update src\/app\.ts/i);
    assert.equal(result.signals.hasGoal, true);
    assert.equal(result.signals.hasAcceptanceCriteria, true);
    assert.deepEqual(result.taskSpec.acceptanceCriteria, [
      "src/app.ts is updated",
      "tests/app.test.ts stays aligned",
    ]);
  },
);

await runScenario(
  "task parser captures paths, tests, modules, constraints, and risky phrases",
  async () => {
    const taskInput = resolveLoadedIntakeInput(
      createPromptInput(
        [
          "Plan a migration for src/app.ts, keep tests/app.test.ts aligned, and review API contract ownership.",
          "",
          "Acceptance Criteria",
          "- src/app.ts handles retry writes safely",
          "- tests/app.test.ts covers migration order",
        ].join("\n"),
        {
          constraints: ["Avoid changing the CLI contract."],
        },
      ),
    );

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
    assert.deepEqual(result.taskSpec.mentionedModules, ["app"]);
    assert.ok((result.taskSpec.riskyPhrases ?? []).includes("migration"));
    assert.ok((result.taskSpec.riskyPhrases ?? []).includes("retry"));
    assert.ok((result.taskSpec.riskyPhrases ?? []).includes("api contract"));
    assert.ok((result.taskSpec.riskyPhrases ?? []).includes("ownership"));
  },
);

await runScenario(
  "vague prompts surface open questions in the normalized task parser output",
  async () => {
    const taskInput = resolveLoadedIntakeInput(
      createPromptInput("Build a customer support dashboard for the product."),
    );
    const result = buildTaskParserResult(taskInput);

    assert.deepEqual(
      taskInput.promptDetails?.openQuestions.map((question) => question.category),
      ["acceptance_criteria", "scope", "constraints"],
    );
    assert.deepEqual(
      result.taskSpec.openQuestions?.map((question) => question.category),
      ["acceptance_criteria", "scope", "constraints"],
    );
    assert.deepEqual(
      result.signals.promptOpenQuestionCategories,
      ["acceptance_criteria", "scope", "constraints"],
    );
    assert.equal(result.ambiguities.length, 0);
  },
);

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode);
}
