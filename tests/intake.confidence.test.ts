import assert from "node:assert/strict";

interface ConfidenceResolutionInput {
  taskParsing: {
    hasGoal: boolean;
    hasAcceptanceCriteria: boolean;
    promptIsThin: boolean;
    ambiguityCount: number;
    promptOpenQuestionCategories: Array<"acceptance_criteria" | "scope" | "constraints" | "repo_alignment">;
  };
  repoInspection: {
    grounded: boolean;
    repoLooksSparse: boolean;
    sourceFileCount: number;
    testFileCount: number;
    missingExplicitTestReference: boolean;
  };
  targeting: {
    candidateTargetCount: number;
    explicitTargetCount: number;
    usedFallbackTargets: boolean;
    unresolvedReferencedPathCount: number;
  };
}

interface ConfidenceResolutionResult {
  level: "high" | "medium" | "low";
  signals: {
    taskParsing: "strong" | "partial" | "weak";
    repoInspection: "strong" | "partial" | "weak";
    targeting: "strong" | "partial" | "weak";
  };
  reasons: string[];
}

async function loadResolver(): Promise<{
  buildConfidenceResolution: (input: ConfidenceResolutionInput) => ConfidenceResolutionResult;
}> {
  const modulePath = "../src/intake/confidence.js";
  return import(modulePath) as Promise<{
    buildConfidenceResolution: (input: ConfidenceResolutionInput) => ConfidenceResolutionResult;
  }>;
}

function createStrongInput(): ConfidenceResolutionInput {
  return {
    taskParsing: {
      hasGoal: true,
      hasAcceptanceCriteria: true,
      promptIsThin: false,
      ambiguityCount: 0,
      promptOpenQuestionCategories: [],
    },
    repoInspection: {
      grounded: true,
      repoLooksSparse: false,
      sourceFileCount: 4,
      testFileCount: 4,
      missingExplicitTestReference: false,
    },
    targeting: {
      candidateTargetCount: 2,
      explicitTargetCount: 2,
      usedFallbackTargets: false,
      unresolvedReferencedPathCount: 0,
    },
  };
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

await runScenario("confidence resolver returns high confidence for explicit grounded inputs", async () => {
  const { buildConfidenceResolution } = await loadResolver();

  const result = buildConfidenceResolution(createStrongInput());

  assert.equal(result.level, "high");
  assert.deepEqual(result.signals, {
    taskParsing: "strong",
    repoInspection: "strong",
    targeting: "strong",
  });
  assert.deepEqual(result.reasons, []);
});

await runScenario("confidence resolver returns medium confidence for fallback-only targeting", async () => {
  const { buildConfidenceResolution } = await loadResolver();

  const result = buildConfidenceResolution({
    ...createStrongInput(),
    targeting: {
      candidateTargetCount: 2,
      explicitTargetCount: 0,
      usedFallbackTargets: true,
      unresolvedReferencedPathCount: 0,
    },
  });

  assert.equal(result.level, "medium");
  assert.equal(result.signals.targeting, "partial");
  assert.ok(result.reasons.some((reason) => /fallback/i.test(reason)));
});

await runScenario("confidence resolver returns low confidence for a thin prompt even with good repo evidence", async () => {
  const { buildConfidenceResolution } = await loadResolver();

  const result = buildConfidenceResolution({
    ...createStrongInput(),
    taskParsing: {
      hasGoal: true,
      hasAcceptanceCriteria: false,
      promptIsThin: true,
      ambiguityCount: 2,
      promptOpenQuestionCategories: ["acceptance_criteria", "scope", "constraints"],
    },
  });

  assert.equal(result.level, "low");
  assert.equal(result.signals.taskParsing, "weak");
  assert.ok(result.reasons.some((reason) => /thin prompt|task goal|ambigu/i.test(reason)));
});

await runScenario("confidence resolver returns low confidence for weak repo grounding", async () => {
  const { buildConfidenceResolution } = await loadResolver();

  const result = buildConfidenceResolution({
    ...createStrongInput(),
    repoInspection: {
      grounded: true,
      repoLooksSparse: true,
      sourceFileCount: 1,
      testFileCount: 0,
      missingExplicitTestReference: false,
    },
  });

  assert.equal(result.level, "low");
  assert.equal(result.signals.repoInspection, "weak");
  assert.ok(result.reasons.some((reason) => /repo grounding|sparse/i.test(reason)));
});

await runScenario("confidence resolver treats missing explicit test references as weak repo inspection", async () => {
  const { buildConfidenceResolution } = await loadResolver();

  const result = buildConfidenceResolution({
    ...createStrongInput(),
    repoInspection: {
      grounded: true,
      repoLooksSparse: false,
      sourceFileCount: 3,
      testFileCount: 0,
      missingExplicitTestReference: true,
    },
  });

  assert.equal(result.level, "low");
  assert.equal(result.signals.repoInspection, "weak");
  assert.ok(result.reasons.some((reason) => /test/i.test(reason)));
});

await runScenario("confidence resolver treats unresolved referenced paths as weak targeting", async () => {
  const { buildConfidenceResolution } = await loadResolver();

  const result = buildConfidenceResolution({
    ...createStrongInput(),
    targeting: {
      candidateTargetCount: 1,
      explicitTargetCount: 1,
      usedFallbackTargets: false,
      unresolvedReferencedPathCount: 2,
    },
  });

  assert.equal(result.level, "low");
  assert.equal(result.signals.targeting, "weak");
  assert.ok(result.reasons.some((reason) => /unresolved/i.test(reason)));
});

await runScenario("confidence resolver is reproducible for the same inputs", async () => {
  const { buildConfidenceResolution } = await loadResolver();
  const input: ConfidenceResolutionInput = {
    ...createStrongInput(),
    taskParsing: {
      hasGoal: true,
      hasAcceptanceCriteria: false,
      promptIsThin: false,
      ambiguityCount: 1,
      promptOpenQuestionCategories: ["acceptance_criteria"],
    },
  };

  assert.deepEqual(
    buildConfidenceResolution(input),
    buildConfidenceResolution(input),
  );
});

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode);
}
