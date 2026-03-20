import assert from "node:assert/strict";

import {
  buildSummary,
  evaluateSuccessModel,
  resolveIntakeStatus,
} from "../src/intake/confidence.js";
import { createGitContext } from "./support/forge-cli.js";

function createRepoContext(
  overrides: Partial<Parameters<typeof evaluateSuccessModel>[0]["repoContext"]> = {},
) {
  return {
    grounded: true,
    sourceFiles: ["src/app.ts"],
    testFiles: ["tests/app.test.ts"],
    manifestFiles: ["package.json"],
    allFiles: ["src/app.ts", "tests/app.test.ts", "package.json"],
    gitContext: createGitContext(),
    ...overrides,
  };
}

function createTaskSpec(
  overrides: Partial<Parameters<typeof evaluateSuccessModel>[0]["taskSpec"]> = {},
) {
  return {
    goal: "Revise src/app.ts.",
    acceptanceCriteria: ["src/app.ts is updated"],
    hasAcceptanceCriteria: true,
    ...overrides,
  };
}

function createCandidateTargets() {
  return [
    {
      path: "src/app.ts",
      kind: "source" as const,
      matchType: "explicit" as const,
      reason: "Direct prompt match.",
    },
  ];
}

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

async function loadConfidenceModule(): Promise<Record<string, unknown>> {
  return import("../src/intake/confidence.js") as Promise<Record<string, unknown>>;
}

await runScenario("status resolver returns success for a fully ready high-confidence result", () => {
  const evaluation = evaluateSuccessModel({
    taskSpec: createTaskSpec(),
    repoContext: createRepoContext(),
    candidateTargets: createCandidateTargets(),
    failure: null,
    confidenceLevel: "high",
    failOnLowConfidence: false,
    validationBlockingIssues: [],
    inputWarnings: [],
    inputAmbiguities: [],
    inputRecommendedUserActions: [],
  });

  assert.equal(evaluation.nextStepReadiness.ready, true);
  assert.deepEqual(evaluation.nextStepReadiness.blockingIssues, []);

  const status = resolveIntakeStatus({
    failure: null,
    nextStepReadiness: evaluation.nextStepReadiness,
    warnings: evaluation.warnings,
    ambiguities: evaluation.ambiguities,
    confidenceLevel: "high",
  });

  assert.equal(status, "success");
  assert.equal(buildSummary(status, evaluation.nextStepReadiness), "Forge intake is ready for forge plan.");
});

await runScenario("status resolver keeps low-confidence usable output as warning when escalation is off", () => {
  const evaluation = evaluateSuccessModel({
    taskSpec: createTaskSpec({
      acceptanceCriteria: [],
      hasAcceptanceCriteria: false,
    }),
    repoContext: createRepoContext(),
    candidateTargets: [{
      path: "src/app.ts",
      kind: "source" as const,
      matchType: "fallback" as const,
      reason: "Fallback repo mapping.",
    }],
    failure: null,
    confidenceLevel: "low",
    failOnLowConfidence: false,
    validationBlockingIssues: [],
    inputWarnings: [
      "Overall intake confidence is low because the prompt is too thin to resolve confidently.",
    ],
    inputAmbiguities: ["The prompt is too short to identify a precise change."],
    inputRecommendedUserActions: [],
  });

  assert.equal(evaluation.nextStepReadiness.ready, true);

  const status = resolveIntakeStatus({
    failure: null,
    nextStepReadiness: evaluation.nextStepReadiness,
    warnings: evaluation.warnings,
    ambiguities: evaluation.ambiguities,
    confidenceLevel: "low",
  });

  assert.equal(status, "warning");
  assert.equal(buildSummary(status, evaluation.nextStepReadiness), "Forge intake is ready for forge plan with warnings.");
});

await runScenario("status resolver blocks readiness for high-severity repo-alignment ambiguity", () => {
  const evaluation = evaluateSuccessModel({
    taskSpec: createTaskSpec(),
    repoContext: createRepoContext(),
    candidateTargets: createCandidateTargets(),
    failure: null,
    confidenceLevel: "medium",
    failOnLowConfidence: false,
    validationBlockingIssues: [],
    inputWarnings: [],
    inputAmbiguities: ["Prompt references repo paths that were not found during grounding."],
    inputAmbiguityItems: [
      {
        type: "repo_alignment",
        severity: "high",
        message: "Prompt references repo paths that were not found during grounding.",
      },
    ],
    inputRecommendedUserActions: ["Fix the missing repo reference before planning."],
  });

  assert.equal(evaluation.nextStepReadiness.ready, false);
  assert.ok(evaluation.nextStepReadiness.blockingIssues.some((issue) => issue.code === "AMBIGUITY_REPO_ALIGNMENT"));

  const status = resolveIntakeStatus({
    failure: null,
    nextStepReadiness: evaluation.nextStepReadiness,
    warnings: evaluation.warnings,
    ambiguities: evaluation.ambiguities,
    confidenceLevel: "medium",
  });

  assert.equal(status, "failed");
});

await runScenario("status resolver blocks readiness for high-severity input ambiguity", () => {
  const evaluation = evaluateSuccessModel({
    taskSpec: createTaskSpec(),
    repoContext: createRepoContext(),
    candidateTargets: createCandidateTargets(),
    failure: null,
    confidenceLevel: "medium",
    failOnLowConfidence: false,
    validationBlockingIssues: [],
    inputWarnings: [],
    inputAmbiguities: ["The task input could not be interpreted safely."],
    inputAmbiguityItems: [
      {
        type: "input",
        severity: "high",
        message: "The task input could not be interpreted safely.",
      },
    ],
    inputRecommendedUserActions: ["Clarify the task input before planning."],
  });

  assert.equal(evaluation.nextStepReadiness.ready, false);
  assert.ok(evaluation.nextStepReadiness.blockingIssues.some((issue) => issue.code === "AMBIGUITY_INPUT"));
});

await runScenario("status resolver keeps missing acceptance criteria as warnings by default", () => {
  const evaluation = evaluateSuccessModel({
    taskSpec: createTaskSpec({
      acceptanceCriteria: [],
      hasAcceptanceCriteria: false,
    }),
    repoContext: createRepoContext(),
    candidateTargets: createCandidateTargets(),
    failure: null,
    confidenceLevel: "medium",
    failOnLowConfidence: false,
    validationBlockingIssues: [],
    inputWarnings: ["Acceptance criteria are missing, so Step 2 planning may need user follow-up."],
    inputAmbiguities: ["Acceptance criteria are missing from the task input."],
    inputAmbiguityItems: [
      {
        type: "acceptance_criteria",
        severity: "high",
        message: "Acceptance criteria are missing from the task input.",
      },
    ],
    inputRecommendedUserActions: ["Add explicit acceptance criteria to the task input before planning."],
  });

  assert.equal(evaluation.nextStepReadiness.ready, true);
  assert.equal(
    evaluation.nextStepReadiness.blockingIssues.some((issue) => issue.code === "AMBIGUITY_ACCEPTANCE_CRITERIA"),
    false,
  );
});

await runScenario("status resolver keeps fallback-only targeting and strict-focus exclusion as warnings by default", () => {
  const evaluation = evaluateSuccessModel({
    taskSpec: createTaskSpec(),
    repoContext: createRepoContext(),
    candidateTargets: [{
      path: "src/app.ts",
      kind: "source" as const,
      matchType: "fallback" as const,
      reason: "Fallback repo mapping.",
    }],
    failure: null,
    confidenceLevel: "medium",
    failOnLowConfidence: false,
    validationBlockingIssues: [],
    inputWarnings: [
      "Repo mapping is partial but still usable because candidate targets were inferred from repo structure.",
      "Strict focus excluded likely relevant candidate targets.",
    ],
    inputAmbiguities: [],
    inputAmbiguityItems: [],
    inputRecommendedUserActions: [],
  });

  assert.equal(evaluation.nextStepReadiness.ready, true);
  assert.deepEqual(evaluation.nextStepReadiness.blockingIssues, []);
});

await runScenario("status resolver escalates low confidence to failed when requested", () => {
  const evaluation = evaluateSuccessModel({
    taskSpec: createTaskSpec(),
    repoContext: createRepoContext(),
    candidateTargets: createCandidateTargets(),
    failure: null,
    confidenceLevel: "low",
    failOnLowConfidence: true,
    validationBlockingIssues: [],
    inputWarnings: [
      "Overall intake confidence is low because the prompt is too thin to resolve confidently.",
    ],
    inputAmbiguities: [],
    inputRecommendedUserActions: [],
  });

  assert.equal(evaluation.nextStepReadiness.ready, false);
  assert.ok(
    evaluation.nextStepReadiness.blockingIssues.some((issue) => issue.code === "LOW_CONFIDENCE_ESCALATED"),
  );

  const status = resolveIntakeStatus({
    failure: null,
    nextStepReadiness: evaluation.nextStepReadiness,
    warnings: evaluation.warnings,
    ambiguities: evaluation.ambiguities,
    confidenceLevel: "low",
  });

  assert.equal(status, "failed");
  assert.match(buildSummary(status, evaluation.nextStepReadiness), /low confidence/i);
});

await runScenario("status resolver keeps the generic failed summary when other blockers are also present", () => {
  const evaluation = evaluateSuccessModel({
    taskSpec: createTaskSpec(),
    repoContext: createRepoContext(),
    candidateTargets: createCandidateTargets(),
    failure: null,
    confidenceLevel: "low",
    failOnLowConfidence: true,
    validationBlockingIssues: [
      {
        code: "INPUT_VALIDATION_FAILED",
        message: "Input validation failed before intake could continue.",
      },
    ],
    inputWarnings: [
      "Overall intake confidence is low because the prompt is too thin to resolve confidently.",
    ],
    inputAmbiguities: [],
    inputRecommendedUserActions: [],
  });

  const status = resolveIntakeStatus({
    failure: null,
    nextStepReadiness: evaluation.nextStepReadiness,
    warnings: evaluation.warnings,
    ambiguities: evaluation.ambiguities,
    confidenceLevel: "low",
  });

  assert.equal(status, "failed");
  assert.equal(
    buildSummary(status, evaluation.nextStepReadiness),
    "Forge intake is not ready for forge plan because blocking issues remain.",
  );
});

await runScenario("confidence module exposes readiness, status, and summary helpers directly", async () => {
  const confidenceModule = await loadConfidenceModule();

  assert.equal(
    typeof confidenceModule.evaluateSuccessModel,
    "function",
    "expected confidence.ts to export evaluateSuccessModel",
  );
  assert.equal(
    typeof confidenceModule.resolveIntakeStatus,
    "function",
    "expected confidence.ts to export resolveIntakeStatus",
  );
  assert.equal(
    typeof confidenceModule.buildSummary,
    "function",
    "expected confidence.ts to export buildSummary",
  );
});

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode);
}
