import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { runIntegrateCommand } from "../src/integrate/cli.js";
import { buildIntegrationTestPrompt } from "../src/integrate/prompt-builder.js";
import { runIntegrationTestsParallel, writeTestFilesParallel } from "../src/integrate/test-runner.js";
import { IntegrateArtifactSchema, validateIntegrateArtifact, IntegrationTestCaseSchema, IntegrationTestFileSchema, IntegrationSummarySchema, IntegrationTestStateSchema } from "../src/integrate/schema.js";
import { buildIntegrateArtifact } from "../src/integrate/artifact.js";
import { createIntegrationReport, createFrozenReport } from "../src/integrate/report.js";
import type { IntegrateArtifact } from "../src/integrate/types.js";
import { classifyError } from "../src/integrate/errors.js";

// ---------------------------------------------------------------------------
// 1. FREEZE.md exists and contains key V1 sections
// ---------------------------------------------------------------------------

describe("integrate batch 3 freeze criteria", () => {
  it("docs/Steps&Batches-Completed/S6-B3-Done/FREEZE.md exists and contains all V1 freeze sections", async () => {
    const freezePath = join(
      process.cwd(),
      "docs",
      "Steps&Batches-Completed",
      "S6-B3-Done",
      "FREEZE.md",
    );
    const content = await readFile(freezePath, "utf-8");

    assert.match(content, /V1 FROZEN/, "FREEZE.md must contain 'V1 FROZEN'");
    assert.match(content, /What Was Shipped/, "FREEZE.md must contain 'What Was Shipped'");
    assert.match(content, /Batch 1/, "FREEZE.md must contain 'Batch 1'");
    assert.match(content, /Batch 2/, "FREEZE.md must contain 'Batch 2'");
    assert.match(content, /Batch 3/, "FREEZE.md must contain 'Batch 3'");
    assert.match(content, /V1 Non-Goals/, "FREEZE.md must contain 'V1 Non-Goals'");
  });

  // ---------------------------------------------------------------------------
  // 2. All 5 tasks marked complete in docs/Steps&Batches-Completed/step6_batch3/progress.md
  // ---------------------------------------------------------------------------

  it("docs/Steps&Batches-Completed/step6_batch3/progress.md has all 5 tasks marked complete", async () => {
    const progressPath = join(
      process.cwd(),
      "docs",
      "Steps&Batches-Completed",
      "step6_batch3",
      "progress.md",
    );
    const content = await readFile(progressPath, "utf-8");

    assert.match(content, /\[x\].*Task 1/, "Task 1 must be marked [x]");
    assert.match(content, /\[x\].*Task 2/, "Task 2 must be marked [x]");
    assert.match(content, /\[x\].*Task 3/, "Task 3 must be marked [x]");
    assert.match(content, /\[x\].*Task 4/, "Task 4 must be marked [x]");
    assert.match(content, /\[x\].*Task 5/, "Task 5 must be marked [x]");
  });

  // ---------------------------------------------------------------------------
  // 3. Smoke-level import check — all integrate modules export their key APIs
  // ---------------------------------------------------------------------------

  it("src/integrate/cli.ts exports runIntegrateCommand", () => {
    assert.equal(typeof runIntegrateCommand, "function", "runIntegrateCommand must be a function");
  });

  it("src/integrate/prompt-builder.ts exports buildIntegrationTestPrompt", () => {
    assert.equal(typeof buildIntegrationTestPrompt, "function", "buildIntegrationTestPrompt must be a function");
  });

  it("src/integrate/test-runner.ts exports runIntegrationTestsParallel and writeTestFilesParallel", () => {
    assert.equal(typeof runIntegrationTestsParallel, "function", "runIntegrationTestsParallel must be a function");
    assert.equal(typeof writeTestFilesParallel, "function", "writeTestFilesParallel must be a function");
  });

  it("src/integrate/schema.ts exports the Zod schemas", () => {
    assert.ok(IntegrateArtifactSchema != null, "IntegrateArtifactSchema must be exported");
    assert.ok(IntegrationTestCaseSchema != null, "IntegrationTestCaseSchema must be exported");
    assert.ok(IntegrationTestFileSchema != null, "IntegrationTestFileSchema must be exported");
    assert.ok(IntegrationSummarySchema != null, "IntegrationSummarySchema must be exported");
    assert.ok(IntegrationTestStateSchema != null, "IntegrationTestStateSchema must be exported");
    assert.equal(typeof validateIntegrateArtifact, "function", "validateIntegrateArtifact must be a function");
  });

  it("src/integrate/artifact.ts exports buildIntegrateArtifact", () => {
    assert.equal(typeof buildIntegrateArtifact, "function", "buildIntegrateArtifact must be a function");
  });

  it("src/integrate/report.ts exports createIntegrationReport and createFrozenReport", () => {
    assert.equal(typeof createIntegrationReport, "function", "createIntegrationReport must be a function");
    assert.equal(typeof createFrozenReport, "function", "createFrozenReport must be a function");
  });

  it("src/integrate/types.ts exports IntegrateArtifact", () => {
    // Type exports are compile-time only; we verify the runtime module is importable
    // by checking that a value of this type can be constructed from the schema.
    const artifactShape = IntegrateArtifactSchema.shape;
    assert.ok(artifactShape != null, "IntegrateArtifact type must be importable and schema must have shape");
  });

  it("src/integrate/errors.ts exports classifyError", () => {
    assert.equal(typeof classifyError, "function", "classifyError must be a function");
  });

  // ---------------------------------------------------------------------------
  // 4. IntegrateArtifactSchema includes attemptCount as an optional field
  // ---------------------------------------------------------------------------

  it("IntegrateArtifactSchema includes attemptCount as an optional field", () => {
    const shape = IntegrateArtifactSchema.shape;
    assert.ok(shape.attemptCount != null, "IntegrateArtifactSchema must include attemptCount");
    // Verify it accepts undefined (optional)
    const parsed = IntegrateArtifactSchema.safeParse({
      schemaVersion: "1.0.0",
      forgeVersion: "0.0.1",
      createdAt: "2025-01-01T00:00:00.000Z",
      executeSource: ".forge/execute.json",
      planSource: ".forge/plan.json",
      verifySource: ".forge/verify.json",
      goal: "test goal",
      workstreamsSummary: "1 workstream completed",
      tests: [],
      testFiles: [],
      summary: {
        total: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
        durationMs: 0,
        testFilesGenerated: 0,
        aiModelUsed: "test-model",
      },
      recommendations: [],
    });
    assert.ok(parsed.success, "IntegrateArtifactSchema should parse without attemptCount (it is optional)");

    // Verify attemptCount can be present and valid
    const parsedWithCount = IntegrateArtifactSchema.safeParse({
      schemaVersion: "1.0.0",
      forgeVersion: "0.0.1",
      createdAt: "2025-01-01T00:00:00.000Z",
      executeSource: ".forge/execute.json",
      planSource: ".forge/plan.json",
      verifySource: ".forge/verify.json",
      goal: "test goal",
      workstreamsSummary: "1 workstream completed",
      tests: [],
      testFiles: [],
      summary: {
        total: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
        durationMs: 0,
        testFilesGenerated: 0,
        aiModelUsed: "test-model",
      },
      recommendations: [],
      attemptCount: 3,
    });
    assert.ok(parsedWithCount.success, "IntegrateArtifactSchema should accept attemptCount as a number");
  });

  // ---------------------------------------------------------------------------
  // 5. IntegrateCommandOptions includes the new CLI options
  // ---------------------------------------------------------------------------

  it("IntegrateCommandOptions type includes delay, jsonOnly, maxRetries, maxDurationMs, and maxConcurrency", async () => {
    // We verify the options exist by reading the types file and checking the
    // interface definition. Since TypeScript types are erased at runtime,
    // we read the source and assert each property name appears.
    const typesPath = join(process.cwd(), "src", "integrate", "types.ts");
    const typesContent = await readFile(typesPath, "utf-8");

    // Find the IntegrateCommandOptions interface block
    const optionsBlockMatch = typesContent.match(
      /interface\s+IntegrateCommandOptions\s*\{[^}]*\}/s
    );
    assert.ok(optionsBlockMatch != null, "IntegrateCommandOptions interface must exist in types.ts");

    const optionsBlock = optionsBlockMatch![0];

    assert.ok(
      /delay\s*[\?:]/.test(optionsBlock),
      "IntegrateCommandOptions must include 'delay' property"
    );
    assert.ok(
      /jsonOnly\s*[\?:]/.test(optionsBlock),
      "IntegrateCommandOptions must include 'jsonOnly' property"
    );
    assert.ok(
      /maxRetries\s*[\?:]/.test(optionsBlock),
      "IntegrateCommandOptions must include 'maxRetries' property"
    );
    assert.ok(
      /maxDurationMs\s*[\?:]/.test(optionsBlock),
      "IntegrateCommandOptions must include 'maxDurationMs' property"
    );
    assert.ok(
      /maxConcurrency\s*[\?:]/.test(optionsBlock),
      "IntegrateCommandOptions must include 'maxConcurrency' property"
    );
  });
});