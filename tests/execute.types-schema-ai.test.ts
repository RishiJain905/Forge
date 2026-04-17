import assert from "node:assert/strict";
import { z } from "zod";
import {
  ExecuteWorkstreamStateSchema,
  ExecuteWorkstreamSchema,
  MergeOrderGateSchema,
  ExecuteArtifactSchema,
  StateTransitionSchema,
  validateExecuteArtifact,
  ChangeMadeSchema,
  AIModelInfoSchema,
  ExecuteArtifactSummarySchema,
} from "../src/execute/schema.js";
import type {
  ExecuteWorkstream,
  ExecuteArtifact,
  StateTransition,
  ExecuteWorkstreamState,
  ChangeMade,
  AIModelInfo,
} from "../src/execute/types.js";
import {
  createExecuteState,
  buildExecuteArtifact,
  restoreExecuteState,
  getWorkstream,
} from "../src/execute/state-machine.js";
import type { SplitArtifact } from "../src/split/types.js";

async function runScenario(name: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
    process.stdout.write(`PASS ${name}\n`);
  } catch (error) {
    process.stderr.write(`FAIL ${name}\n`);
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

// ---------------------------------------------------------------------------
// Test fixture helpers
// ---------------------------------------------------------------------------

function makeSplitWorkstream(overrides: Partial<{ id: string; title: string; mergeOrderRequirements: string[] }> & Pick<{ id: string; title: string }, "id" | "title">) {
  return {
    description: `Workstream ${overrides.id}`,
    category: "safe_parallel" as const,
    sourcePlanItemIds: [],
    sourceVerificationCaseIds: [],
    sourceFindingIds: [],
    likelyAffectedPaths: [],
    streamDependencies: [],
    mergeOrderRequirements: overrides.mergeOrderRequirements ?? [],
    constraints: [],
    blockedReason: null,
    ...overrides,
  };
}

function makeMinimalSplitArtifact(): SplitArtifact {
  return {
    schemaVersion: "2.0.0",
    command: "forge split",
    stage: "step4",
    status: "ready",
    purpose: "test",
    repoRoot: "/test/repo",
    requestedOutputRoot: null,
    outputRoot: "/test/output",
    writePolicy: {
      mode: "output-root-only",
      repoReadOnlyOutsideOutputRoot: true,
      allowedRoot: "/test/output",
      allowedSideEffects: [],
      deferredCapabilities: [],
      disallowedCapabilities: [],
    },
    files: {
      artifactPath: null,
      reportPath: null,
      debugArtifactPath: "",
      debugWorkstreamsPath: "",
      debugMergeOrderPath: "",
      debugBlockedItemsPath: "",
      debugStreamConstraintsPath: "",
      debugReadinessPath: "",
    },
    startedAt: "2025-01-01T00:00:00.000Z",
    finishedAt: "2025-01-01T00:01:00.000Z",
    summary: "test",
    boundaryNotes: [],
    source_verify: {} as any,
    source_plan: {} as any,
    workstream_contract: {
      requiredFields: ["id", "title"],
      categories: ["safe_parallel" as const],
      constraintSources: ["dependency_graph" as const],
    },
    workstreams: [],
    dependency_edges: [],
    merge_order: [],
    blocked_items: [],
    carried_forward_constraints: {} as any,
    split_diagnostics: {
      usability_status: "actionable",
      warning_items: [],
      blocking_items: [],
      partial_output: null,
    },
    split_readiness: {
      ready: true,
      status: "ready",
      summary: "",
      execution_scope: "all_streams" as const,
      blocked_workstream_count: 0,
      partially_blocked_item_count: 0,
      merge_order_rule_count: 0,
      later_step_gate: "proceed" as const,
      material_execution_limits: [],
      warning_items: [],
      blocking_issues: [],
      partial_output: null,
      constraining_concern_ids: [],
      recommended_user_actions: [],
    },
    failure: null,
  };
}

// ---------------------------------------------------------------------------
// ChangeMade interface tests
// ---------------------------------------------------------------------------

await runScenario("ChangeMadeSchema parses a valid ChangeMade for create action", () => {
  const change: ChangeMade = {
    file: "/test/output/src/auth.ts",
    action: "create",
    diffHash: "abc123def456",
    linesAdded: 150,
    linesRemoved: 0,
    beforeHash: undefined,
    afterHash: "def789",
  };
  const result = ChangeMadeSchema.parse(change);
  assert.equal(result.file, "/test/output/src/auth.ts");
  assert.equal(result.action, "create");
  assert.equal(result.diffHash, "abc123def456");
  assert.equal(result.linesAdded, 150);
  assert.equal(result.linesRemoved, 0);
});

await runScenario("ChangeMadeSchema parses a valid ChangeMade for modify action with hashes", () => {
  const change: ChangeMade = {
    file: "/test/output/src/api.ts",
    action: "modify",
    diffHash: "xyz789",
    linesAdded: 25,
    linesRemoved: 10,
    beforeHash: "oldhash123",
    afterHash: "newhash456",
  };
  const result = ChangeMadeSchema.parse(change);
  assert.equal(result.action, "modify");
  assert.equal(result.beforeHash, "oldhash123");
  assert.equal(result.afterHash, "newhash456");
});

await runScenario("ChangeMadeSchema parses a valid ChangeMade for delete action", () => {
  const change: ChangeMade = {
    file: "/test/output/src/obsolete.ts",
    action: "delete",
    diffHash: "del123",
    linesAdded: 0,
    linesRemoved: 50,
    beforeHash: "oldfilehash",
    afterHash: null,
  };
  const result = ChangeMadeSchema.parse(change);
  assert.equal(result.action, "delete");
  assert.equal(result.afterHash, null);
});

await runScenario("ChangeMadeSchema parses ChangeMade with optional error field", () => {
  const change: ChangeMade = {
    file: "/test/output/src/failed.ts",
    action: "create",
    diffHash: "fail123",
    linesAdded: 0,
    linesRemoved: 0,
    error: "ENOSPC: no space left on device",
  };
  const result = ChangeMadeSchema.parse(change);
  assert.equal(result.error, "ENOSPC: no space left on device");
});

await runScenario("ChangeMadeSchema rejects invalid action type", () => {
  assert.throws(
    () => ChangeMadeSchema.parse({
      file: "/test/output/src/auth.ts",
      action: "rename",
      diffHash: "abc123",
      linesAdded: 10,
      linesRemoved: 5,
    } as unknown as ChangeMade),
    z.ZodError
  );
});

await runScenario("ChangeMadeSchema rejects negative linesAdded", () => {
  assert.throws(
    () => ChangeMadeSchema.parse({
      file: "/test/output/src/auth.ts",
      action: "create",
      diffHash: "abc123",
      linesAdded: -10,
      linesRemoved: 0,
    }),
    z.ZodError
  );
});

await runScenario("ChangeMadeSchema rejects non-integer lines", () => {
  assert.throws(
    () => ChangeMadeSchema.parse({
      file: "/test/output/src/auth.ts",
      action: "create",
      diffHash: "abc123",
      linesAdded: 10.5,
      linesRemoved: 0,
    }),
    z.ZodError
  );
});

await runScenario("ChangeMadeSchema rejects extra unknown fields", () => {
  assert.throws(
    () => ChangeMadeSchema.parse({
      file: "/test/output/src/auth.ts",
      action: "create",
      diffHash: "abc123",
      linesAdded: 10,
      linesRemoved: 0,
      extraField: "not allowed",
    }),
    z.ZodError
  );
});

// ---------------------------------------------------------------------------
// AIModelInfo interface tests
// ---------------------------------------------------------------------------

await runScenario("AIModelInfoSchema parses a valid AIModelInfo", () => {
  const info: AIModelInfo = {
    provider: "openai",
    modelName: "gpt-4o",
  };
  const result = AIModelInfoSchema.parse(info);
  assert.equal(result.provider, "openai");
  assert.equal(result.modelName, "gpt-4o");
});

await runScenario("AIModelInfoSchema parses AIModelInfo with baseUrl", () => {
  const info: AIModelInfo = {
    provider: "openai",
    modelName: "gpt-4o",
    baseUrl: "https://api.openai.com/v1",
  };
  const result = AIModelInfoSchema.parse(info);
  assert.equal(result.baseUrl, "https://api.openai.com/v1");
});

await runScenario("AIModelInfoSchema rejects missing required fields", () => {
  assert.throws(() => AIModelInfoSchema.parse({ provider: "openai" } as AIModelInfo), z.ZodError);
  assert.throws(() => AIModelInfoSchema.parse({ modelName: "gpt-4o" } as AIModelInfo), z.ZodError);
});

await runScenario("AIModelInfoSchema rejects extra unknown fields", () => {
  assert.throws(
    () => AIModelInfoSchema.parse({
      provider: "openai",
      modelName: "gpt-4o",
      extraField: "not allowed",
    }),
    z.ZodError
  );
});

// ---------------------------------------------------------------------------
// ExecuteWorkstream extended with AI fields tests
// ---------------------------------------------------------------------------

await runScenario("ExecuteWorkstreamSchema parses workstream with all AI fields", () => {
  const ws: ExecuteWorkstream = {
    workstreamId: "ws-1",
    title: "Auth implementation",
    state: "completed",
    startedAt: "2025-01-01T10:00:00.000Z",
    completedAt: "2025-01-01T12:00:00.000Z",
    aiModelUsed: "gpt-4o",
    aiPromptHash: "abc123def456",
    aiProvider: "openai",
    aiExecutionDurationMs: 5000,
    changesMade: [
      {
        file: "/test/output/src/auth.ts",
        action: "create",
        diffHash: "diff123",
        linesAdded: 100,
        linesRemoved: 0,
        beforeHash: undefined,
        afterHash: "afterhash123",
      },
    ],
  };
  const result = ExecuteWorkstreamSchema.parse(ws);
  assert.equal(result.aiModelUsed, "gpt-4o");
  assert.equal(result.aiProvider, "openai");
  assert.equal(result.aiPromptHash, "abc123def456");
  assert.equal(result.aiExecutionDurationMs, 5000);
  assert.equal(result.changesMade!.length, 1);
  assert.equal(result.changesMade![0].file, "/test/output/src/auth.ts");
});

await runScenario("ExecuteWorkstreamSchema parses workstream with aiChangesCount/aiLinesAdded/aiLinesRemoved (legacy fields)", () => {
  const ws: ExecuteWorkstream = {
    workstreamId: "ws-1",
    title: "Legacy AI fields",
    state: "completed",
    aiModelUsed: "claude-3-5-sonnet-4",
    aiChangesCount: 5,
    aiLinesAdded: 200,
    aiLinesRemoved: 50,
  };
  const result = ExecuteWorkstreamSchema.parse(ws);
  assert.equal(result.aiChangesCount, 5);
  assert.equal(result.aiLinesAdded, 200);
  assert.equal(result.aiLinesRemoved, 50);
});

await runScenario("ExecuteWorkstreamSchema rejects extra unknown AI fields", () => {
  const ws = {
    workstreamId: "ws-1",
    title: "Test",
    state: "completed",
    unknownAiField: "not allowed",
  };
  assert.throws(() => ExecuteWorkstreamSchema.parse(ws as ExecuteWorkstream), z.ZodError);
});

// ---------------------------------------------------------------------------
// ExecuteArtifactSummary extended with AI fields tests
// ---------------------------------------------------------------------------

await runScenario("ExecuteArtifactSummarySchema parses summary with AI fields", () => {
  const summary = {
    total: 3,
    queued: 0,
    running: 0,
    completed: 3,
    failed: 0,
    blocked: 0,
    aiExecutedCount: 2,
    totalChangesMade: 15,
  };
  const result = ExecuteArtifactSummarySchema.parse(summary);
  assert.equal(result.aiExecutedCount, 2);
  assert.equal(result.totalChangesMade, 15);
});

await runScenario("ExecuteArtifactSummarySchema parses summary without AI fields (all optional)", () => {
  const summary = {
    total: 3,
    queued: 0,
    running: 0,
    completed: 3,
    failed: 0,
    blocked: 0,
  };
  const result = ExecuteArtifactSummarySchema.parse(summary);
  assert.equal(result.aiExecutedCount, undefined);
  assert.equal(result.totalChangesMade, undefined);
});

await runScenario("ExecuteArtifactSummarySchema rejects negative aiExecutedCount", () => {
  const summary = {
    total: 3,
    queued: 0,
    running: 0,
    completed: 3,
    failed: 0,
    blocked: 0,
    aiExecutedCount: -1,
  };
  assert.throws(() => ExecuteArtifactSummarySchema.parse(summary), z.ZodError);
});

// ---------------------------------------------------------------------------
// ExecuteArtifact extended with aiConfig tests
// ---------------------------------------------------------------------------

await runScenario("ExecuteArtifactSchema parses artifact with aiConfig", () => {
  const artifact: ExecuteArtifact = {
    schemaVersion: "2.0.0",
    forgeVersion: "0.1.0",
    createdAt: "2025-01-01T10:00:00.000Z",
    splitSource: ".forge/split.json",
    workstreams: [],
    mergeOrderGates: [],
    summary: {
      total: 0,
      queued: 0,
      running: 0,
      completed: 0,
      failed: 0,
      blocked: 0,
      aiExecutedCount: 0,
      totalChangesMade: 0,
    },
    transitions: [],
    aiConfig: {
      provider: "openai",
      modelName: "gpt-4o",
      baseUrl: "https://api.openai.com/v1",
    },
  };
  const result = ExecuteArtifactSchema.parse(artifact);
  assert.equal(result.aiConfig!.provider, "openai");
  assert.equal(result.aiConfig!.modelName, "gpt-4o");
  assert.equal(result.aiConfig!.baseUrl, "https://api.openai.com/v1");
});

await runScenario("ExecuteArtifactSchema parses artifact without aiConfig (optional)", () => {
  const artifact: ExecuteArtifact = {
    schemaVersion: "2.0.0",
    forgeVersion: "0.1.0",
    createdAt: "2025-01-01T10:00:00.000Z",
    splitSource: ".forge/split.json",
    workstreams: [],
    mergeOrderGates: [],
    summary: {
      total: 0,
      queued: 0,
      running: 0,
      completed: 0,
      failed: 0,
      blocked: 0,
    },
    transitions: [],
  };
  const result = ExecuteArtifactSchema.parse(artifact);
  assert.equal(result.aiConfig, undefined);
});

await runScenario("ExecuteArtifactSchema rejects artifact with invalid aiConfig", () => {
  const artifact = {
    schemaVersion: "2.0.0",
    forgeVersion: "0.1.0",
    createdAt: "2025-01-01T10:00:00.000Z",
    splitSource: ".forge/split.json",
    workstreams: [],
    mergeOrderGates: [],
    summary: {
      total: 0, queued: 0, running: 0, completed: 0, failed: 0, blocked: 0,
    },
    transitions: [],
    aiConfig: {
      provider: "openai",
      // missing modelName
    },
  };
  assert.throws(() => ExecuteArtifactSchema.parse(artifact), z.ZodError);
});

// ---------------------------------------------------------------------------
// buildExecuteArtifact computes AI summary fields
// ---------------------------------------------------------------------------

await runScenario("buildExecuteArtifact computes aiExecutedCount from workstreams with aiModelUsed", () => {
  const splitArtifact = makeMinimalSplitArtifact();
  splitArtifact.workstreams = [
    makeSplitWorkstream({ id: "ws-1", title: "Auth" }),
    makeSplitWorkstream({ id: "ws-2", title: "API" }),
    makeSplitWorkstream({ id: "ws-3", title: "UI" }),
  ];

  const state = createExecuteState(splitArtifact, ".forge/split.json");

  // Set AI-executed workstreams
  const ws1 = getWorkstream("ws-1", state)!;
  ws1.aiModelUsed = "gpt-4o";
  ws1.aiProvider = "openai";
  ws1.state = "completed";

  const ws2 = getWorkstream("ws-2", state)!;
  ws2.aiModelUsed = "gpt-4o";
  ws2.state = "completed";

  const ws3 = getWorkstream("ws-3", state)!;
  ws3.state = "queued"; // not AI-executed

  const artifact = buildExecuteArtifact(state, "2.0.0", "0.1.0");
  assert.equal(artifact.summary.aiExecutedCount, 2);
  assert.equal(artifact.summary.totalChangesMade, 0); // no changesMade array
});

await runScenario("buildExecuteArtifact computes totalChangesMade from changesMade arrays", () => {
  const splitArtifact = makeMinimalSplitArtifact();
  splitArtifact.workstreams = [
    makeSplitWorkstream({ id: "ws-1", title: "Auth" }),
    makeSplitWorkstream({ id: "ws-2", title: "API" }),
  ];

  const state = createExecuteState(splitArtifact, ".forge/split.json");

  const ws1 = getWorkstream("ws-1", state)!;
  ws1.aiModelUsed = "gpt-4o";
  ws1.state = "completed";
  ws1.changesMade = [
    { file: "/test/a.ts", action: "create", diffHash: "d1", linesAdded: 10, linesRemoved: 0 },
    { file: "/test/b.ts", action: "modify", diffHash: "d2", linesAdded: 5, linesRemoved: 2 },
  ];

  const ws2 = getWorkstream("ws-2", state)!;
  ws2.aiModelUsed = "claude-3-5-sonnet-4";
  ws2.state = "completed";
  ws2.changesMade = [
    { file: "/test/c.ts", action: "delete", diffHash: "d3", linesAdded: 0, linesRemoved: 20 },
  ];

  const artifact = buildExecuteArtifact(state, "2.0.0", "0.1.0");
  assert.equal(artifact.summary.aiExecutedCount, 2);
  assert.equal(artifact.summary.totalChangesMade, 3); // 2 + 1
});

await runScenario("buildExecuteArtifact accepts aiConfig parameter and includes it in artifact", () => {
  const splitArtifact = makeMinimalSplitArtifact();
  splitArtifact.workstreams = [
    makeSplitWorkstream({ id: "ws-1", title: "Auth" }),
  ];

  const state = createExecuteState(splitArtifact, ".forge/split.json");
  const ws1 = getWorkstream("ws-1", state)!;
  ws1.state = "completed";

  const aiConfig: AIModelInfo = {
    provider: "anthropic",
    modelName: "claude-3-5-sonnet-4",
    baseUrl: "https://api.anthropic.com",
  };

  const artifact = buildExecuteArtifact(state, "2.0.0", "0.1.0", aiConfig);
  assert.equal(artifact.aiConfig!.provider, "anthropic");
  assert.equal(artifact.aiConfig!.modelName, "claude-3-5-sonnet-4");
  assert.equal(artifact.aiConfig!.baseUrl, "https://api.anthropic.com");
});

await runScenario("buildExecuteArtifact works without aiConfig (undefined)", () => {
  const splitArtifact = makeMinimalSplitArtifact();
  splitArtifact.workstreams = [
    makeSplitWorkstream({ id: "ws-1", title: "Auth" }),
  ];

  const state = createExecuteState(splitArtifact, ".forge/split.json");
  const ws1 = getWorkstream("ws-1", state)!;
  ws1.state = "completed";

  const artifact = buildExecuteArtifact(state, "2.0.0", "0.1.0");
  assert.equal(artifact.aiConfig, undefined);
});

// ---------------------------------------------------------------------------
// restoreExecuteState restores AI fields
// ---------------------------------------------------------------------------

await runScenario("restoreExecuteState restores AI fields from artifact", () => {
  const artifact: ExecuteArtifact = {
    schemaVersion: "2.0.0",
    forgeVersion: "0.1.0",
    createdAt: "2025-01-01T10:00:00.000Z",
    splitSource: ".forge/split.json",
    workstreams: [
      {
        workstreamId: "ws-1",
        title: "Auth",
        state: "completed",
        aiModelUsed: "gpt-4o",
        aiProvider: "openai",
        aiPromptHash: "abc123",
        aiExecutionDurationMs: 3000,
        changesMade: [
          {
            file: "/test/output/src/auth.ts",
            action: "create",
            diffHash: "diff123",
            linesAdded: 100,
            linesRemoved: 0,
            afterHash: "afterhash",
          },
        ],
      },
      {
        workstreamId: "ws-2",
        title: "API",
        state: "completed",
        aiModelUsed: "claude-3-5-sonnet-4",
        aiProvider: "anthropic",
      },
    ],
    mergeOrderGates: [],
    summary: {
      total: 2,
      queued: 0,
      running: 0,
      completed: 2,
      failed: 0,
      blocked: 0,
      aiExecutedCount: 2,
      totalChangesMade: 1,
    },
    transitions: [],
    aiConfig: {
      provider: "openai",
      modelName: "gpt-4o",
    },
  };

  const state = restoreExecuteState(artifact, ".forge/split.json");

  const ws1 = getWorkstream("ws-1", state);
  assert.ok(ws1 !== undefined);
  assert.equal(ws1!.aiModelUsed, "gpt-4o");
  assert.equal(ws1!.aiProvider, "openai");
  assert.equal(ws1!.aiPromptHash, "abc123");
  assert.equal(ws1!.aiExecutionDurationMs, 3000);
  assert.equal(ws1!.changesMade!.length, 1);
  assert.equal(ws1!.changesMade![0].file, "/test/output/src/auth.ts");

  const ws2 = getWorkstream("ws-2", state);
  assert.ok(ws2 !== undefined);
  assert.equal(ws2!.aiModelUsed, "claude-3-5-sonnet-4");
  assert.equal(ws2!.aiProvider, "anthropic");
});

await runScenario("restoreExecuteState restores aiConfig from artifact", () => {
  const artifact: ExecuteArtifact = {
    schemaVersion: "2.0.0",
    forgeVersion: "0.1.0",
    createdAt: "2025-01-01T10:00:00.000Z",
    splitSource: ".forge/split.json",
    workstreams: [],
    mergeOrderGates: [],
    summary: {
      total: 0, queued: 0, running: 0, completed: 0, failed: 0, blocked: 0,
    },
    transitions: [],
    aiConfig: {
      provider: "google",
      modelName: "gemini-pro",
      baseUrl: "https://generativelanguage.googleapis.com",
    },
  };

  const state = restoreExecuteState(artifact, ".forge/split.json");

  // aiConfig is stored in artifact but not directly on ExecuteState
  // It should be preserved when building a new artifact from the restored state
  const newArtifact = buildExecuteArtifact(state, "2.0.0", "0.1.0", artifact.aiConfig!);
  assert.equal(newArtifact.aiConfig!.provider, "google");
  assert.equal(newArtifact.aiConfig!.modelName, "gemini-pro");
});

// ---------------------------------------------------------------------------
// validateExecuteArtifact with AI fields
// ---------------------------------------------------------------------------

await runScenario("validateExecuteArtifact validates artifact with full AI fields", () => {
  const artifact: ExecuteArtifact = {
    schemaVersion: "2.0.0",
    forgeVersion: "0.1.0",
    createdAt: "2025-01-01T10:00:00.000Z",
    splitSource: ".forge/split.json",
    workstreams: [
      {
        workstreamId: "ws-1",
        title: "Auth",
        state: "completed",
        aiModelUsed: "gpt-4o",
        aiProvider: "openai",
        aiPromptHash: "abc123",
        aiExecutionDurationMs: 3000,
        changesMade: [
          {
            file: "/test/output/src/auth.ts",
            action: "create",
            diffHash: "diff123",
            linesAdded: 100,
            linesRemoved: 0,
            beforeHash: undefined,
            afterHash: "afterhash",
          },
        ],
      },
    ],
    mergeOrderGates: [],
    summary: {
      total: 1,
      queued: 0,
      running: 0,
      completed: 1,
      failed: 0,
      blocked: 0,
      aiExecutedCount: 1,
      totalChangesMade: 1,
    },
    transitions: [],
    aiConfig: {
      provider: "openai",
      modelName: "gpt-4o",
    },
  };

  const result = validateExecuteArtifact(artifact);
  assert.equal(result.summary.aiExecutedCount, 1);
  assert.equal(result.summary.totalChangesMade, 1);
  assert.equal(result.workstreams[0].changesMade![0].file, "/test/output/src/auth.ts");
});

await runScenario("validateExecuteArtifact rejects artifact with invalid changesMade", () => {
  const artifact = {
    schemaVersion: "2.0.0",
    forgeVersion: "0.1.0",
    createdAt: "2025-01-01T10:00:00.000Z",
    splitSource: ".forge/split.json",
    workstreams: [
      {
        workstreamId: "ws-1",
        title: "Auth",
        state: "completed",
        changesMade: [
          {
            file: "/test/output/src/auth.ts",
            action: "invalid_action",
            diffHash: "diff123",
            linesAdded: 100,
            linesRemoved: 0,
          },
        ],
      },
    ],
    mergeOrderGates: [],
    summary: {
      total: 1, queued: 0, running: 0, completed: 1, failed: 0, blocked: 0,
    },
    transitions: [],
  };
  assert.throws(() => validateExecuteArtifact(artifact), z.ZodError);
});

console.log("All types-schema-ai tests completed.");
