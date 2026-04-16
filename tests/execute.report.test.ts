import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createExecuteReport } from "../src/execute/report.js";
import type { ExecuteArtifact } from "../src/execute/types.js";

function makeArtifact(overrides?: Partial<ExecuteArtifact>): ExecuteArtifact {
  const now = new Date().toISOString();
  return {
    schemaVersion: "2.0.0",
    forgeVersion: "0.0.1",
    createdAt: now,
    splitSource: "/test/.forge/split.json",
    workstreams: [],
    mergeOrderGates: [],
    summary: { total: 0, queued: 0, running: 0, completed: 0, failed: 0, blocked: 0 },
    transitions: [],
    ...overrides,
  };
}

function makeWorkstream(overrides: {
  id: string;
  title: string;
  state: "queued" | "running" | "completed" | "failed";
  startedAt?: string;
  completedAt?: string;
  failedAt?: string;
  error?: string;
  mergeOrderViolations?: string[];
}) {
  return {
    workstreamId: overrides.id,
    title: overrides.title,
    state: overrides.state,
    startedAt: overrides.startedAt,
    completedAt: overrides.completedAt,
    failedAt: overrides.failedAt,
    error: overrides.error,
    mergeOrderViolations: overrides.mergeOrderViolations,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Required heading order
// ──────────────────────────────────────────────────────────────────────────────

const REQUIRED_HEADINGS = [
  "Overview",
  "Execution Summary",
  "Workstream Details",
  "Merge Order Gates",
  "Errors",
  "Recommendations",
  "Output Files",
];

it("report has required headings in order", () => {
  const artifact = makeArtifact();
  const report = createExecuteReport(artifact);
  const headingLines = report
    .split("\n")
    .filter((line) => line.startsWith("## "))
    .map((line) => line.replace("## ", ""));

  const joined = headingLines.join("|");
  for (let i = 0; i < REQUIRED_HEADINGS.length - 1; i++) {
    const current = REQUIRED_HEADINGS[i];
    const next = REQUIRED_HEADINGS[i + 1];
    const currentIdx = headingLines.indexOf(current);
    const nextIdx = headingLines.indexOf(next);
    assert.ok(
      currentIdx < nextIdx && currentIdx !== -1 && nextIdx !== -1,
      `Heading order mismatch: "${current}" (index ${currentIdx}) should come before "${next}" (index ${nextIdx}). Got headings: ${headingLines.join(", ")}`
    );
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// Overview section
// ──────────────────────────────────────────────────────────────────────────────

it("overview section contains split source", () => {
  const artifact = makeArtifact({ splitSource: "/custom/path/split.json" });
  const report = createExecuteReport(artifact);
  assert.ok(report.includes("/custom/path/split.json"));
});

it("overview section contains forge version", () => {
  const artifact = makeArtifact({ forgeVersion: "99.0.0" });
  const report = createExecuteReport(artifact);
  assert.ok(report.includes("99.0.0"));
});

it("overview section contains schema version", () => {
  const artifact = makeArtifact({ schemaVersion: "2.0.0" });
  const report = createExecuteReport(artifact);
  assert.ok(report.includes("2.0.0"));
});

it("overview section contains workstream summary", () => {
  const artifact = makeArtifact({
    workstreams: [
      makeWorkstream({ id: "ws-1", title: "Test WS", state: "completed" }),
      makeWorkstream({ id: "ws-2", title: "Test WS2", state: "failed" }),
    ],
    summary: { total: 2, queued: 0, running: 0, completed: 1, failed: 1, blocked: 0 },
  });
  const report = createExecuteReport(artifact);
  // Report uses **markdown** bold for numbers
  assert.ok(report.includes("**2** total"), `Expected "**2** total" in report`);
  assert.ok(report.includes("**1** completed"), `Expected "**1** completed" in report`);
  assert.ok(report.includes("**1** failed"), `Expected "**1** failed" in report`);
});

// ──────────────────────────────────────────────────────────────────────────────
// Workstream Details — Duration
// ──────────────────────────────────────────────────────────────────────────────

it("computes duration from startedAt to completedAt", () => {
  const start = "2025-01-01T10:00:00.000Z";
  const end = "2025-01-01T10:05:23.000Z"; // 5m 23s
  const artifact = makeArtifact({
    workstreams: [
      makeWorkstream({ id: "ws-1", title: "Fast", state: "completed", startedAt: start, completedAt: end }),
    ],
    summary: { total: 1, queued: 0, running: 0, completed: 1, failed: 0, blocked: 0 },
  });
  const report = createExecuteReport(artifact);
  assert.ok(report.includes("5m 23s"), `Expected "5m 23s" in report. Got:\n${report}`);
});

it("shows — for missing completed timestamp on running workstream", () => {
  const start = "2025-01-01T10:00:00.000Z";
  const artifact = makeArtifact({
    workstreams: [
      makeWorkstream({ id: "ws-1", title: "Running", state: "running", startedAt: start }),
    ],
    summary: { total: 1, queued: 0, running: 1, completed: 0, failed: 0, blocked: 0 },
  });
  const report = createExecuteReport(artifact);
  assert.ok(report.includes("—"), "Running workstream should show — for missing completion time");
});

it("shows — for missing started timestamp on queued workstream", () => {
  const artifact = makeArtifact({
    workstreams: [
      makeWorkstream({ id: "ws-1", title: "Queued", state: "queued" }),
    ],
    summary: { total: 1, queued: 1, running: 0, completed: 0, failed: 0, blocked: 0 },
  });
  const report = createExecuteReport(artifact);
  assert.ok(report.includes("queued"), "Should show queued state");
  assert.ok(report.includes("—"), "Queued workstream should show — for missing started time");
});

// ──────────────────────────────────────────────────────────────────────────────
// Merge Order Gates
// ──────────────────────────────────────────────────────────────────────────────

it("merge order gate shows satisfied when prerequisites met", () => {
  const artifact = makeArtifact({
    workstreams: [
      makeWorkstream({ id: "ws-1", title: "WS1", state: "completed" }),
      makeWorkstream({ id: "ws-2", title: "WS2", state: "completed" }),
    ],
    mergeOrderGates: [
      { workstreamId: "ws-2", prerequisites: ["ws-1"], prerequisitesMet: true },
    ],
    summary: { total: 2, queued: 0, running: 0, completed: 2, failed: 0, blocked: 0 },
  });
  const report = createExecuteReport(artifact);
  assert.ok(report.includes("satisfied"));
});

it("merge order gate shows pending when prerequisites not met", () => {
  const artifact = makeArtifact({
    workstreams: [
      makeWorkstream({ id: "ws-1", title: "WS1", state: "queued" }),
      makeWorkstream({ id: "ws-2", title: "WS2", state: "queued" }),
    ],
    mergeOrderGates: [
      { workstreamId: "ws-2", prerequisites: ["ws-1"], prerequisitesMet: false },
    ],
    summary: { total: 2, queued: 2, running: 0, completed: 0, failed: 0, blocked: 0 },
  });
  const report = createExecuteReport(artifact);
  assert.ok(report.includes("pending"));
});

// ──────────────────────────────────────────────────────────────────────────────
// Errors section
// ──────────────────────────────────────────────────────────────────────────────

it("errors section is empty when no failures", () => {
  const artifact = makeArtifact({
    workstreams: [
      makeWorkstream({ id: "ws-1", title: "Good", state: "completed" }),
    ],
    summary: { total: 1, queued: 0, running: 0, completed: 1, failed: 0, blocked: 0 },
  });
  const report = createExecuteReport(artifact);
  assert.ok(report.includes("Errors"));
  // Should have "Errors" section with "- none"
  const errorsIdx = report.indexOf("## Errors");
  const nextHeadingIdx = report.indexOf("## Recommendations");
  const errorsSection = report.slice(errorsIdx, nextHeadingIdx);
  assert.ok(errorsSection.includes("- none"), `Errors section should contain "- none". Got:\n${errorsSection}`);
});

it("errors section lists failed workstreams with reasons", () => {
  const artifact = makeArtifact({
    workstreams: [
      makeWorkstream({ id: "ws-1", title: "Good", state: "completed" }),
      makeWorkstream({ id: "ws-2", title: "Broken", state: "failed", error: "Build script exited with code 1" }),
    ],
    summary: { total: 2, queued: 0, running: 0, completed: 1, failed: 1, blocked: 0 },
  });
  const report = createExecuteReport(artifact);
  assert.ok(report.includes("Broken"));
  assert.ok(report.includes("Build script exited with code 1"));
});

// ──────────────────────────────────────────────────────────────────────────────
// Recommendations section
// ──────────────────────────────────────────────────────────────────────────────

it("recommendations are present and actionable", () => {
  const artifact = makeArtifact({
    workstreams: [
      makeWorkstream({ id: "ws-1", title: "Good", state: "completed" }),
      makeWorkstream({ id: "ws-2", title: "Broken", state: "failed", error: "Exit 1" }),
    ],
    summary: { total: 2, queued: 0, running: 0, completed: 1, failed: 1, blocked: 0 },
  });
  const report = createExecuteReport(artifact);
  assert.ok(report.includes("Recommendations"));
  assert.ok(report.includes("Rerun failed"));
});

it("recommendation says all workstreams succeeded when all completed", () => {
  const artifact = makeArtifact({
    workstreams: [
      makeWorkstream({ id: "ws-1", title: "A", state: "completed" }),
      makeWorkstream({ id: "ws-2", title: "B", state: "completed" }),
    ],
    summary: { total: 2, queued: 0, running: 0, completed: 2, failed: 0, blocked: 0 },
  });
  const report = createExecuteReport(artifact);
  assert.ok(report.includes("Recommendations"));
  assert.ok(report.includes("Step 6"));
});

// ──────────────────────────────────────────────────────────────────────────────
// Output Files section
// ──────────────────────────────────────────────────────────────────────────────

it("output files section lists execute.json and execute-report.md", () => {
  const artifact = makeArtifact();
  const report = createExecuteReport(artifact);
  assert.ok(report.includes("execute.json"));
  assert.ok(report.includes("execute-report.md"));
});

// ──────────────────────────────────────────────────────────────────────────────
// Edge cases
// ──────────────────────────────────────────────────────────────────────────────

it("handles empty workstream list gracefully", () => {
  const artifact = makeArtifact({
    workstreams: [],
    summary: { total: 0, queued: 0, running: 0, completed: 0, failed: 0, blocked: 0 },
  });
  const report = createExecuteReport(artifact);
  assert.ok(report.includes("Overview"));
  assert.ok(report.includes("**0** total"), `Expected "**0** total" in report`);
});

it("handles all-blocked workstream list", () => {
  const artifact = makeArtifact({
    workstreams: [
      makeWorkstream({ id: "ws-1", title: "Blocked", state: "queued" }),
    ],
    mergeOrderGates: [
      { workstreamId: "ws-1", prerequisites: ["ws-99"], prerequisitesMet: false },
    ],
    summary: { total: 1, queued: 1, running: 0, completed: 0, failed: 0, blocked: 0 },
  });
  const report = createExecuteReport(artifact);
  assert.ok(report.includes("pending"));
});
