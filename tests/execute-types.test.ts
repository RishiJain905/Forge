import assert from "node:assert/strict";
import { z } from "zod";
import {
  ExecuteWorkstreamStateSchema,
  ExecuteWorkstreamSchema,
  MergeOrderGateSchema,
  ExecuteArtifactSchema,
  StateTransitionSchema,
  validateExecuteArtifact,
} from "../src/execute/schema.js";
import type {
  ExecuteWorkstream,
  ExecuteArtifact,
  StateTransition,
  ExecuteWorkstreamState,
} from "../src/execute/types.js";

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

await runScenario("ExecuteWorkstreamStateSchema accepts valid states", () => {
  const states: ExecuteWorkstreamState[] = ["queued", "running", "completed", "failed", "blocked"];
  for (const state of states) {
    assert.equal(ExecuteWorkstreamStateSchema.parse(state), state);
  }
});

await runScenario("ExecuteWorkstreamStateSchema rejects invalid states", () => {
  assert.throws(() => ExecuteWorkstreamStateSchema.parse("invalid"), z.ZodError);
  assert.throws(() => ExecuteWorkstreamStateSchema.parse(""), z.ZodError);
});

await runScenario("ExecuteWorkstreamSchema parses a valid workstream", () => {
  const valid: ExecuteWorkstream = {
    workstreamId: "ws-1",
    title: "Auth implementation",
    state: "queued",
  };
  const result = ExecuteWorkstreamSchema.parse(valid);
  assert.equal(result.workstreamId, "ws-1");
  assert.equal(result.state, "queued");
});

await runScenario("ExecuteWorkstreamSchema parses a completed workstream with timestamps", () => {
  const completed: ExecuteWorkstream = {
    workstreamId: "ws-1",
    title: "Auth implementation",
    state: "completed",
    startedAt: "2025-01-01T10:00:00.000Z",
    completedAt: "2025-01-01T12:00:00.000Z",
  };
  const result = ExecuteWorkstreamSchema.parse(completed);
  assert.equal(result.state, "completed");
  assert.equal(result.startedAt, "2025-01-01T10:00:00.000Z");
  assert.equal(result.completedAt, "2025-01-01T12:00:00.000Z");
});

await runScenario("ExecuteWorkstreamSchema parses a failed workstream with error and violations", () => {
  const failed: ExecuteWorkstream = {
    workstreamId: "ws-2",
    title: "API layer",
    state: "failed",
    failedAt: "2025-01-01T14:00:00.000Z",
    error: "Auth module not found",
    mergeOrderViolations: ["ws-1"],
  };
  const result = ExecuteWorkstreamSchema.parse(failed);
  assert.equal(result.state, "failed");
  assert.equal(result.error, "Auth module not found");
  assert.deepEqual(result.mergeOrderViolations, ["ws-1"]);
});

await runScenario("ExecuteWorkstreamSchema rejects a workstream missing required fields", () => {
  assert.throws(
    () => ExecuteWorkstreamSchema.parse({ workstreamId: "ws-1" } as ExecuteWorkstream),
    z.ZodError
  );
  assert.throws(
    () => ExecuteWorkstreamSchema.parse({ title: "Auth", state: "running" } as ExecuteWorkstream),
    z.ZodError
  );
});

await runScenario("MergeOrderGateSchema parses a valid gate", () => {
  const gate = {
    workstreamId: "ws-2",
    prerequisites: ["ws-1"],
    prerequisitesMet: false,
  };
  const result = MergeOrderGateSchema.parse(gate);
  assert.equal(result.workstreamId, "ws-2");
  assert.deepEqual(result.prerequisites, ["ws-1"]);
  assert.equal(result.prerequisitesMet, false);
});

await runScenario("MergeOrderGateSchema rejects a gate with invalid structure", () => {
  assert.throws(
    () => MergeOrderGateSchema.parse({ workstreamId: "ws-2", prerequisites: "ws-1" } as never),
    z.ZodError
  );
});

await runScenario("ExecuteArtifactSchema parses a valid artifact", () => {
  const artifact: ExecuteArtifact = {
    schemaVersion: "1.0.0",
    forgeVersion: "0.1.0",
    createdAt: "2025-01-01T10:00:00.000Z",
    splitSource: ".forge/split.json",
    workstreams: [
      {
        workstreamId: "ws-1",
        title: "Auth",
        state: "completed",
        startedAt: "2025-01-01T10:00:00.000Z",
        completedAt: "2025-01-01T12:00:00.000Z",
      },
      {
        workstreamId: "ws-2",
        title: "API",
        state: "queued",
      },
    ],
    mergeOrderGates: [
      {
        workstreamId: "ws-2",
        prerequisites: ["ws-1"],
        prerequisitesMet: true,
      },
    ],
    summary: {
      total: 2,
      queued: 1,
      running: 0,
      completed: 1,
      failed: 0,
      blocked: 0,
    },
  };
  const result = ExecuteArtifactSchema.parse(artifact);
  assert.equal(result.schemaVersion, "1.0.0");
  assert.equal(result.workstreams.length, 2);
  assert.equal(result.summary.completed, 1);
});

await runScenario("ExecuteArtifactSchema rejects an artifact missing required summary fields", () => {
  const artifact = {
    schemaVersion: "1.0.0",
    forgeVersion: "0.1.0",
    createdAt: "2025-01-01T10:00:00.000Z",
    splitSource: ".forge/split.json",
    workstreams: [],
    mergeOrderGates: [],
    summary: {
      total: 0,
    },
  };
  assert.throws(() => ExecuteArtifactSchema.parse(artifact), z.ZodError);
});

await runScenario("ExecuteArtifactSchema rejects an artifact with extra unknown keys (strict mode)", () => {
  const artifact = {
    schemaVersion: "1.0.0",
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
    extraField: "not allowed",
  };
  assert.throws(() => ExecuteArtifactSchema.parse(artifact), z.ZodError);
});

await runScenario("validateExecuteArtifact returns the artifact on valid input", () => {
  const artifact: ExecuteArtifact = {
    schemaVersion: "1.0.0",
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
  };
  const result = validateExecuteArtifact(artifact);
  assert.equal(result.schemaVersion, "1.0.0");
});

await runScenario("validateExecuteArtifact throws ZodError on invalid input", () => {
  assert.throws(() => validateExecuteArtifact({}), z.ZodError);
  assert.throws(
    () =>
      validateExecuteArtifact({
        schemaVersion: 123 as unknown,
        forgeVersion: "0.1.0",
        createdAt: "2025-01-01T10:00:00.000Z",
        splitSource: ".forge/split.json",
        workstreams: [],
        mergeOrderGates: [],
        summary: { total: 0, queued: 0, running: 0, completed: 0, failed: 0, blocked: 0 },
      }),
    z.ZodError
  );
});

await runScenario("StateTransitionSchema parses a valid transition", () => {
  const transition: StateTransition = {
    workstreamId: "ws-1",
    from: "queued",
    to: "running",
    timestamp: "2025-01-01T10:00:00.000Z",
    reason: "Human started work",
  };
  const result = StateTransitionSchema.parse(transition);
  assert.equal(result.from, "queued");
  assert.equal(result.to, "running");
  assert.equal(result.reason, "Human started work");
});

await runScenario("StateTransitionSchema parses a transition without optional reason", () => {
  const transition: StateTransition = {
    workstreamId: "ws-1",
    from: "running",
    to: "completed",
    timestamp: "2025-01-01T12:00:00.000Z",
  };
  const result = StateTransitionSchema.parse(transition);
  assert.equal(result.to, "completed");
  assert.equal(result.reason, undefined);
});

await runScenario("StateTransitionSchema rejects an invalid state in from or to", () => {
  assert.throws(
    () =>
      StateTransitionSchema.parse({
        workstreamId: "ws-1",
        from: "pending",
        to: "running",
        timestamp: "2025-01-01T10:00:00.000Z",
      } as unknown as StateTransition),
    z.ZodError
  );
});
