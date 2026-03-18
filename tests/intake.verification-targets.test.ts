import assert from "node:assert/strict";

import { buildTaskParserResult } from "../src/intake/task-parser.js";

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

await runScenario(
  "verification targets module exposes initial verification target detection",
  async () => {
    const moduleUrl = new URL("../src/intake/verification-targets.js", import.meta.url).href;
    const verificationTargetsModule = (await import(moduleUrl)) as Record<string, unknown>;

    assert.equal(
      typeof verificationTargetsModule.buildInitialVerificationTargets,
      "function",
      "expected verification-targets.ts to export buildInitialVerificationTargets",
    );
  },
);

await runScenario(
  "verification targets classify retry, ownership, and config surfaces from task and target signals",
  async () => {
    const moduleUrl = new URL("../src/intake/verification-targets.js", import.meta.url).href;
    const verificationTargetsModule = (await import(moduleUrl)) as {
      buildVerificationTargets?: (input: {
        taskParserResult: ReturnType<typeof buildTaskParserResult>;
        candidateTargets: Array<{
          path: string;
          kind: "source" | "test" | "manifest";
          matchType: "explicit" | "fallback";
          reason: string;
          sharedRisk: boolean;
          notes: string[];
        }>;
      }) => Array<{
        path: string;
        kind: "source" | "test" | "manifest";
        category: string;
        reason: string;
      }>;
    };

    assert.equal(
      typeof verificationTargetsModule.buildVerificationTargets,
      "function",
      "expected verification-targets.ts to export buildVerificationTargets",
    );

    const taskParserResult = buildTaskParserResult({
      inputMode: "prompt",
      primaryInput: {
        path: null,
        rawText:
          "Review retry ownership in src/app.ts and keep package.json aligned with the API contract.",
      },
      normalizedTaskText:
        "Review retry ownership in src/app.ts and keep package.json aligned with the API contract.",
      parserInputText:
        [
          "# Task",
          "",
          "Review retry ownership in src/app.ts and keep package.json aligned with the API contract.",
          "",
          "## Acceptance Criteria",
          "",
          "- src/app.ts handles retry ownership safely",
        ].join("\n"),
      notes: [],
      constraints: [],
      configPath: null,
      focusPaths: [],
      ambiguities: [],
      recommendedUserActions: [],
      promptDetails: {
        title: "Retry ownership review",
        goal: "Review retry ownership in src/app.ts and keep package.json aligned with the API contract.",
        summary:
          "Review retry ownership in src/app.ts and keep package.json aligned with the API contract.",
        requirementCandidates: [
          {
            text: "src/app.ts handles retry ownership safely",
            source: "acceptance-criteria",
          },
        ],
        openQuestions: [],
      },
    });

    const targets = verificationTargetsModule.buildVerificationTargets?.({
      taskParserResult,
      candidateTargets: [
        {
          path: "src/app.ts",
          kind: "source",
          matchType: "explicit",
          reason: "Matched a source file path mentioned in the task input.",
          sharedRisk: false,
          notes: ["Matched an explicit task path."],
        },
        {
          path: "package.json",
          kind: "manifest",
          matchType: "explicit",
          reason: "Matched a manifest mentioned in the task input.",
          sharedRisk: true,
          notes: ["Manifest/config surface can widen downstream impact."],
        },
      ],
    }) ?? [];

    assert.ok(targets.some((target) => target.path === "src/app.ts" && target.category === "retry_logic"));
    assert.ok(targets.some((target) => target.path === "src/app.ts" && target.category === "ownership"));
    assert.ok(targets.some((target) => target.path === "package.json" && target.category === "api_contract"));
  },
);

await runScenario(
  "verification targets classify migration, parallel overlap, and stale write surfaces from task and target signals",
  async () => {
    const moduleUrl = new URL("../src/intake/verification-targets.js", import.meta.url).href;
    const verificationTargetsModule = (await import(moduleUrl)) as {
      buildVerificationTargets?: (input: {
        taskParserResult: ReturnType<typeof buildTaskParserResult>;
        candidateTargets: Array<{
          path: string;
          kind: "source" | "test" | "manifest";
          matchType: "explicit" | "fallback";
          reason: string;
          sharedRisk: boolean;
          notes: string[];
        }>;
      }) => Array<{
        path: string;
        kind: "source" | "test" | "manifest";
        category: string;
        reason: string;
      }>;
    };

    const taskParserResult = buildTaskParserResult({
      inputMode: "prompt",
      primaryInput: {
        path: null,
        rawText:
          "Review retry ownership and migration behavior in src/app.ts while avoiding stale write bugs and keeping package.json aligned with the API contract.",
      },
      normalizedTaskText:
        "Review retry ownership and migration behavior in src/app.ts while avoiding stale write bugs and keeping package.json aligned with the API contract.",
      parserInputText:
        [
          "# Task",
          "",
          "Review retry ownership and migration behavior in src/app.ts while avoiding stale write bugs and keeping package.json aligned with the API contract.",
          "",
          "## Acceptance Criteria",
          "",
          "- src/app.ts handles retry ownership and migration safely",
          "- package.json stays aligned with the API contract",
        ].join("\n"),
      notes: [],
      constraints: [],
      configPath: null,
      focusPaths: [],
      ambiguities: [],
      recommendedUserActions: [],
      promptDetails: {
        title: "Retry ownership review",
        goal:
          "Review retry ownership and migration behavior in src/app.ts while avoiding stale write bugs and keeping package.json aligned with the API contract.",
        summary:
          "Review retry ownership and migration behavior in src/app.ts while avoiding stale write bugs and keeping package.json aligned with the API contract.",
        requirementCandidates: [
          {
            text: "src/app.ts handles retry ownership and migration safely",
            source: "acceptance-criteria",
          },
          {
            text: "package.json stays aligned with the API contract",
            source: "acceptance-criteria",
          },
        ],
        openQuestions: [],
      },
    });

    const targets = verificationTargetsModule.buildVerificationTargets?.({
      taskParserResult,
      candidateTargets: [
        {
          path: "src/app.ts",
          kind: "source",
          matchType: "explicit",
          reason: "Matched a source file path mentioned in the task input.",
          sharedRisk: true,
          notes: ["Matched an explicit task path."],
        },
        {
          path: "package.json",
          kind: "manifest",
          matchType: "explicit",
          reason: "Matched a manifest mentioned in the task input.",
          sharedRisk: true,
          notes: ["Manifest/config surface can widen downstream impact."],
        },
      ],
    }) ?? [];

    assert.ok(targets.some((target) => target.path === "src/app.ts" && target.category === "retry_logic"));
    assert.ok(targets.some((target) => target.path === "src/app.ts" && target.category === "ownership"));
    assert.ok(targets.some((target) => target.path === "src/app.ts" && target.category === "migration_order"));
    assert.ok(targets.some((target) => target.path === "src/app.ts" && target.category === "stale_write"));
    assert.ok(targets.some((target) => target.path === "src/app.ts" && target.category === "parallel_overlap"));
    assert.ok(targets.some((target) => target.path === "package.json" && target.category === "api_contract"));
  },
);

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode);
}
