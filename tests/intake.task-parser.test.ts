import assert from "node:assert/strict";

import { resolveLoadedIntakeInput } from "../src/intake/input.js";
import { buildTaskParserResult } from "../src/intake/task-parser.js";
import type { NormalizedTaskInput, ValidatedIntakeInputs } from "../src/intake/types.js";

function createPromptInput(
  prompt: string,
  overrides: Partial<ValidatedIntakeInputs> = {},
): ValidatedIntakeInputs {
  const { supplementalInputs: supplementalOverrides, ...otherOverrides } = overrides;
  const supplementalInputs = {
    notes: [],
    constraints: [],
    configPath: null,
    focusPaths: [],
    ...supplementalOverrides,
  };

  return {
    inputMode: "prompt",
    primaryInput: {
      path: null,
      rawText: prompt,
    },
    supplementalInputs,
    warnings: [],
    recommendedUserActions: [],
    ...otherOverrides,
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
  "prompt mode keeps title stable when notes and constraints are appended",
  async () => {
    const taskInput = resolveLoadedIntakeInput(
      createPromptInput(
        "Refine retry telemetry for src/app.ts.",
        {
          supplementalInputs: {
            notes: ["Preserve existing CLI behavior."],
            constraints: ["Do not change the output format."],
            configPath: null,
            focusPaths: [],
          },
        },
      ),
    );

    const result = buildTaskParserResult(taskInput);

    assert.equal(result.taskSpec.title, "Refine retry telemetry for src/app.ts");
    assert.equal(result.taskSpec.goal, "Refine retry telemetry for src/app.ts.");
  },
);

await runScenario(
  "task parser surfaces heading title and separate prose goal for structured specs",
  async () => {
    const result = buildTaskParserResult(createParserInput({
      inputMode: "spec",
      primaryInput: {
        path: "/repo/spec.md",
        rawText: [
          "# Update app behavior",
          "",
          "Add retry telemetry to src/app.ts and keep tests/app.test.ts aligned.",
          "",
          "Summary",
          "This update tightens retry visibility for the app runtime and tests.",
          "",
          "Scope",
          "- src/app.ts",
          "- tests/app.test.ts",
          "",
          "Acceptance Criteria",
          "- src/app.ts emits retry telemetry",
          "- tests/app.test.ts validates the retry telemetry output",
        ].join("\n"),
      },
      normalizedTaskText: [
        "# Update app behavior",
        "",
        "Add retry telemetry to src/app.ts and keep tests/app.test.ts aligned.",
        "",
        "Summary",
        "This update tightens retry visibility for the app runtime and tests.",
        "",
        "Scope",
        "- src/app.ts",
        "- tests/app.test.ts",
        "",
        "Acceptance Criteria",
        "- src/app.ts emits retry telemetry",
        "- tests/app.test.ts validates the retry telemetry output",
      ].join("\n"),
      parserInputText: [
        "# Update app behavior",
        "",
        "Add retry telemetry to src/app.ts and keep tests/app.test.ts aligned.",
        "",
        "Summary",
        "This update tightens retry visibility for the app runtime and tests.",
        "",
        "Scope",
        "- src/app.ts",
        "- tests/app.test.ts",
        "",
        "Acceptance Criteria",
        "- src/app.ts emits retry telemetry",
        "- tests/app.test.ts validates the retry telemetry output",
      ].join("\n"),
    }));

    assert.equal(result.taskSpec.title, "Update app behavior");
    assert.equal(result.taskSpec.goal, "Add retry telemetry to src/app.ts and keep tests/app.test.ts aligned.");
    assert.match(result.taskSpec.summary ?? "", /retry visibility/i);
    assert.deepEqual(result.taskSpec.scope, ["src/app.ts", "tests/app.test.ts"]);
    assert.deepEqual(result.taskSpec.explicitRequirements, [
      "src/app.ts emits retry telemetry",
      "tests/app.test.ts validates the retry telemetry output",
    ]);
  },
);

await runScenario(
  "task parser extracts repeated sections and dedupes stable fields",
  async () => {
    const text = [
      "# Update app behavior",
      "",
      "Refine retry telemetry for src/app.ts.",
      "",
      "Summary",
      "Keep retry visibility aligned for src/app.ts.",
      "",
      "Scope",
      "- src/app.ts",
      "- tests/app.test.ts",
      "",
      "Scope",
      "- src/app.ts",
      "- tests/app.test.ts",
      "",
      "Acceptance Criteria",
      "- src/app.ts emits retry telemetry",
      "- tests/app.test.ts validates retry telemetry",
      "",
      "Acceptance Criteria",
      "- src/app.ts emits retry telemetry",
      "- tests/app.test.ts validates retry telemetry",
    ].join("\n");

    const result = buildTaskParserResult(createParserInput({
      inputMode: "spec",
      primaryInput: {
        path: "/repo/spec.md",
        rawText: text,
      },
      normalizedTaskText: text,
      parserInputText: text,
    }));

    assert.equal(result.taskSpec.title, "Update app behavior");
    assert.equal(result.taskSpec.goal, "Refine retry telemetry for src/app.ts.");
    assert.equal(result.taskSpec.summary, "Keep retry visibility aligned for src/app.ts.");
    assert.deepEqual(result.taskSpec.scope, ["src/app.ts", "tests/app.test.ts"]);
    assert.deepEqual(result.taskSpec.acceptanceCriteria, [
      "src/app.ts emits retry telemetry",
      "tests/app.test.ts validates retry telemetry",
    ]);
    assert.deepEqual(result.taskSpec.explicitRequirements, [
      "src/app.ts emits retry telemetry",
      "tests/app.test.ts validates retry telemetry",
    ]);
  },
);

await runScenario(
  "task parser extracts prose acceptance criteria from semistructured specs",
  async () => {
    const text = [
      "# Update app behavior",
      "",
      "Refine retry telemetry for src/app.ts.",
      "",
      "Acceptance Criteria",
      "The app logs retry telemetry for each retry attempt.",
      "- tests/app.test.ts validates the retry telemetry output",
    ].join("\n");

    const result = buildTaskParserResult(createParserInput({
      inputMode: "spec",
      primaryInput: {
        path: "/repo/spec.md",
        rawText: text,
      },
      normalizedTaskText: text,
      parserInputText: text,
    }));

    assert.deepEqual(result.taskSpec.acceptanceCriteria, [
      "The app logs retry telemetry for each retry attempt.",
      "tests/app.test.ts validates the retry telemetry output",
    ]);
    assert.equal(result.taskSpec.hasAcceptanceCriteria, true);
  },
);

await runScenario(
  "task parser surfaces missing scope and constraints as parser-owned open questions for specs",
  async () => {
    const text = [
      "# Update app behavior",
      "",
      "Refine retry telemetry behavior.",
      "",
      "Acceptance Criteria",
      "- retry telemetry is emitted for each retry attempt",
    ].join("\n");

    const result = buildTaskParserResult(createParserInput({
      inputMode: "spec",
      primaryInput: {
        path: "/repo/spec.md",
        rawText: text,
      },
      normalizedTaskText: text,
      parserInputText: text,
    }));

    assert.deepEqual(result.taskSpec.openQuestions?.map((question) => question.category), [
      "scope",
      "constraints",
    ]);
    assert.ok(result.ambiguityItems?.some((item) => item.type === "scope"));
    assert.ok(result.warningItems?.some((item) => item.code === "SCOPE_MISSING"));
  },
);

await runScenario(
  "headingless spec titles ignore appended supplemental sections",
  async () => {
    const rawText = "Implement retry telemetry for src/app.ts.";
    const result = buildTaskParserResult(createParserInput({
      inputMode: "spec",
      primaryInput: {
        path: "/repo/spec.md",
        rawText,
      },
      normalizedTaskText: [
        rawText,
        "",
        "## Notes",
        "",
        "Preserve current CLI output.",
        "",
        "## Constraints",
        "",
        "Do not change the output format.",
      ].join("\n"),
      parserInputText: [
        rawText,
        "",
        "## Notes",
        "",
        "Preserve current CLI output.",
        "",
        "## Constraints",
        "",
        "Do not change the output format.",
      ].join("\n"),
    }));

    assert.equal(result.taskSpec.title, "Implement retry telemetry for src/app.ts.");
    assert.equal(result.taskSpec.goal, "Implement retry telemetry for src/app.ts.");
  },
);

await runScenario(
  "task parser treats markdown acceptance criteria headings as structural signal for thin prompts",
  async () => {
    const text = "## Acceptance Criteria";

    const result = buildTaskParserResult(createParserInput({
      inputMode: "prompt",
      primaryInput: {
        path: null,
        rawText: text,
      },
      normalizedTaskText: text,
      parserInputText: text,
    }));

    assert.equal(result.signals.promptIsThin, false);
    assert.equal(
      result.warnings.some((warning) => /too short/i.test(warning)),
      false,
    );
    assert.equal(
      result.recommendedUserActions.some((action) => /expand the prompt/i.test(action)),
      false,
    );
    assert.deepEqual(result.taskSpec.acceptanceCriteria, []);
    assert.equal(result.taskSpec.hasAcceptanceCriteria, false);
  },
);

await runScenario(
  "section headings do not become spec titles when no top-level title is present",
  async () => {
    const text = [
      "## Summary",
      "",
      "Implement retry telemetry for src/app.ts.",
      "",
      "## Scope",
      "",
      "- src/app.ts",
    ].join("\n");
    const result = buildTaskParserResult(createParserInput({
      inputMode: "spec",
      primaryInput: {
        path: "/repo/spec.md",
        rawText: text,
      },
      normalizedTaskText: text,
      parserInputText: text,
    }));

    assert.equal(result.taskSpec.title, "Implement retry telemetry for src/app.ts.");
    assert.equal(result.taskSpec.goal, "Implement retry telemetry for src/app.ts.");
  },
);

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
          supplementalInputs: {
            notes: [],
            constraints: ["Avoid changing the CLI contract."],
            configPath: null,
            focusPaths: [],
          },
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
  "task parser extracts prose-only module mentions from explicit module nouns",
  async () => {
    const taskInput = resolveLoadedIntakeInput(
      createPromptInput(
        [
          "Update auth module retry handling and keep login behavior stable.",
          "",
          "Acceptance Criteria",
          "- auth module retry handling is hardened",
        ].join("\n"),
      ),
    );

    const result = buildTaskParserResult(taskInput);

    assert.deepEqual(result.taskSpec.mentionedPaths, []);
    assert.deepEqual(result.taskSpec.mentionedTests, []);
    assert.deepEqual(result.taskSpec.mentionedModules, ["auth"]);
  },
);

await runScenario(
  "task parser does not infer modules from generic prose nouns alone",
  async () => {
    const taskInput = resolveLoadedIntakeInput(
      createPromptInput("Improve rollout flow and plan the next step for the service."),
    );

    const result = buildTaskParserResult(taskInput);

    assert.deepEqual(result.taskSpec.mentionedModules, []);
  },
);

await runScenario(
  "task parser keeps casual risk phrase mentions out of risky phrases",
  async () => {
    const text = [
      "Background: the API contract is documented elsewhere and migration history is preserved for reference.",
      "",
      "Implementation: update src/app.ts and keep tests/app.test.ts aligned.",
    ].join("\n");

    const result = buildTaskParserResult(createParserInput({
      inputMode: "spec",
      primaryInput: {
        path: "/repo/spec.md",
        rawText: text,
      },
      normalizedTaskText: text,
      parserInputText: text,
    }));

    assert.deepEqual(result.taskSpec.riskyPhrases, []);
  },
);

await runScenario(
  "task parser infers conservative implementation necessities from implementation-scoped task text",
  async () => {
    const text = [
      "# Update app behavior",
      "",
      "Migrate src/app.ts and keep tests/app.test.ts aligned while reviewing package.json and the API contract.",
      "",
      "Acceptance Criteria",
      "- src/app.ts keeps retry behavior stable",
      "- tests/app.test.ts covers stale write handling",
    ].join("\n");

    const result = buildTaskParserResult(createParserInput({
      inputMode: "spec",
      primaryInput: {
        path: "/repo/spec.md",
        rawText: text,
      },
      normalizedTaskText: text,
      parserInputText: text,
    }));

    assert.deepEqual(result.taskSpec.implementationNecessities, [
      "Update or add tests for the impacted behavior.",
      "Review manifest or configuration impact before implementation.",
      "Plan migration sequencing before implementation.",
      "Coordinate ownership and parallelization before implementation.",
      "Verify retry behavior before implementation.",
      "Verify stale write handling before implementation.",
      "Verify API contract impact before implementation.",
    ]);
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
      result.taskSpec.openQuestions?.map((question) => question.category),
      ["acceptance_criteria", "scope", "constraints"],
    );
    assert.deepEqual(
      result.signals.promptOpenQuestionCategories,
      ["acceptance_criteria", "scope", "constraints"],
    );
    assert.ok(result.ambiguityItems?.some((item) => item.type === "acceptance_criteria"));
    assert.ok(result.warningItems?.some((item) => item.code === "ACCEPTANCE_CRITERIA_MISSING"));
  },
);

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode);
}
