import assert from "node:assert/strict";
import { rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { IntakeArtifact } from "../src/intake/types.js";
import {
  createTempRepo,
  disposeTempRepo,
  fileExists,
  readJsonFile,
  readTextFile,
  runForgeBinary,
  runForgePlanBinary,
  writeRepoFile,
} from "./support/forge-cli.js";

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

const REQUIRED_TOP_LEVEL_KEYS = [
  "schemaVersion",
  "command",
  "stage",
  "status",
  "purpose",
  "repoRoot",
  "requestedOutputRoot",
  "outputRoot",
  "writePolicy",
  "files",
  "startedAt",
  "finishedAt",
  "summary",
  "boundaryNotes",
  "source_intake",
  "plan_item_contract",
  "plan_items",
  "dependency_graph",
  "conflict_zones",
  "test_obligations",
  "parallelization_signals",
  "carry_forward",
  "planning_diagnostics",
  "planning_readiness",
  "failure",
] as const;

type PlanReadiness = {
  ready: boolean;
  status: "ready" | "ready_with_warnings" | "blocked";
  summary: string;
  warning_items: Array<{ code: string; message: string }>;
  blocking_issues: Array<{ code: string; message: string }>;
  partial_output: { code: string; message: string; fallbackReason?: string } | null;
  constraining_concern_ids: string[];
  recommended_user_actions: string[];
};

type PlanReadinessDebugArtifact = {
  planning_readiness: PlanReadiness;
};

type PlanArtifact = {
  status: "ready" | "blocked" | "failed";
  summary: string;
  files: { artifactPath: string | null; reportPath: string | null };
  source_intake: {
    artifactPath: string;
    status: string;
    summary: string;
    readyForPlanning: boolean;
  };
  carry_forward: {
    next_step_readiness: IntakeArtifact["next_step_readiness"];
    concerns: Array<{ id: string }>;
  };
  plan_items: Array<{ id: string }>;
  dependency_graph: Array<{ planItemId: string; dependsOnPlanItemId: string }>;
  conflict_zones: Array<{ id: string; planItemIds: string[] }>;
  test_obligations: Array<{ planItemId: string; category: string }>;
  parallelization_signals: Array<{ planItemId: string; signal: string }>;
  planning_diagnostics: {
    usability_status: "actionable" | "non_actionable" | "upstream_blocked";
    warning_items: Array<{ code: string; message: string }>;
    blocking_items: Array<{ code: string; message: string }>;
    partial_output: { code: string; message: string; fallbackReason?: string } | null;
    planning_assist: {
      outcome: "not_attempted" | "no_suggestion" | "applied" | "ignored_only" | "failed";
      provider: string | null;
      warnings: string[];
      ignoredEdits: string[];
      reportNotes: string[];
    };
  };
  planning_readiness: PlanReadiness;
  failure: { code: string; message: string; fallbackReason?: string } | null;
};

function planArtifactPath(repoRoot: string, outputDir = ".forge"): string {
  return join(repoRoot, outputDir, "plan.json");
}

function planReportPath(repoRoot: string, outputDir = ".forge"): string {
  return join(repoRoot, outputDir, "reports", "plan-report.md");
}

function planDebugPath(repoRoot: string, fileName: string, outputDir = ".forge"): string {
  return join(repoRoot, outputDir, "debug", fileName);
}

async function seedSpecRepo(repoRoot: string): Promise<void> {
  await writeRepoFile(
    repoRoot,
    "task.md",
    [
      "# Update app behavior",
      "",
      "Revise `src/app.ts` and keep `tests/app.test.ts` aligned.",
      "",
      "## Acceptance Criteria",
      "",
      "- `src/app.ts` is updated",
      "- `tests/app.test.ts` stays aligned",
    ].join("\n"),
  );
}

async function removePlanningInputs(repoRoot: string): Promise<void> {
  await rm(join(repoRoot, "task.md"), { force: true });
  await rm(join(repoRoot, "src", "app.ts"), { force: true });
  await rm(join(repoRoot, "tests", "app.test.ts"), { force: true });
}

function sectionBody(report: string, heading: string): string[] {
  const lines = report.split("\n");
  const startIndex = lines.indexOf(`## ${heading}`);

  if (startIndex === -1) {
    throw new Error(`Missing report heading: ${heading}`);
  }

  let endIndex = lines.length;

  for (let index = startIndex + 1; index < lines.length; index += 1) {
    if (lines[index].startsWith("## ")) {
      endIndex = index;
      break;
    }
  }

  return lines
    .slice(startIndex + 1, endIndex)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function assertReadinessMirrorsConcerns(artifact: PlanArtifact): void {
  const concernIds = new Set(artifact.carry_forward.concerns.map((concern) => concern.id));

  assert.ok(
    artifact.planning_readiness.constraining_concern_ids.every((id) => concernIds.has(id)),
    "expected constraining concern ids to reference carried-forward concerns",
  );
}

await runScenario(
  "forge plan exposes Step 2-owned planning readiness across artifact, report, and debug output on a ready run",
  async () => {
    const repoRoot = await createTempRepo("forge-plan-part3-ready-");
    const originalDebugEnv = process.env.FORGE_PLAN_DEBUG;

    try {
      await seedSpecRepo(repoRoot);

      const intakeResult = runForgeBinary(["intake", "--repo", repoRoot, "--spec", join(repoRoot, "task.md")], repoRoot);
      assert.equal(intakeResult.code, 0, intakeResult.stderr);
      await removePlanningInputs(repoRoot);

      process.env.FORGE_PLAN_DEBUG = "1";
      const planResult = runForgePlanBinary(["--repo", repoRoot], repoRoot);

      assert.equal(planResult.code, 0, planResult.stderr);

      const artifact = await readJsonFile<PlanArtifact>(planArtifactPath(repoRoot));
      const report = await readTextFile(planReportPath(repoRoot));
      const debugArtifact = await readJsonFile<PlanReadinessDebugArtifact>(planDebugPath(repoRoot, "plan-debug.json"));
      const readinessDebug = await readJsonFile<PlanReadinessDebugArtifact>(
        planDebugPath(repoRoot, "planning-readiness.json"),
      );

      assert.deepEqual(Object.keys(artifact).sort(), [...REQUIRED_TOP_LEVEL_KEYS].sort());
      assert.equal(artifact.status, "ready");
      assert.equal(artifact.planning_readiness.ready, true);
      assert.equal(artifact.planning_readiness.status, "ready");
      assert.ok(artifact.planning_readiness.summary.length > 0);
      assert.ok(Array.isArray(artifact.planning_readiness.warning_items));
      assert.deepEqual(artifact.planning_readiness.warning_items, []);
      assert.ok(Array.isArray(artifact.planning_readiness.blocking_issues));
      assert.deepEqual(artifact.planning_readiness.blocking_issues, []);
      assert.equal(artifact.planning_readiness.partial_output, null);
      assert.ok(Array.isArray(artifact.planning_readiness.constraining_concern_ids));
      assert.ok(Array.isArray(artifact.planning_readiness.recommended_user_actions));
      assert.deepEqual(artifact.carry_forward.next_step_readiness, (await readJsonFile<IntakeArtifact>(join(repoRoot, ".forge", "intake.json"))).next_step_readiness);
      assert.ok(
        sectionBody(report, "Planning Readiness").includes(artifact.planning_readiness.summary),
        "expected the report to render the readiness summary",
      );
      assert.equal(await fileExists(planDebugPath(repoRoot, "planning-readiness.json")), true);
      assert.deepEqual(debugArtifact.planning_readiness, artifact.planning_readiness);
      assert.deepEqual(readinessDebug.planning_readiness, artifact.planning_readiness);
      assertReadinessMirrorsConcerns(artifact);
    } finally {
      if (originalDebugEnv === undefined) {
        delete process.env.FORGE_PLAN_DEBUG;
      } else {
        process.env.FORGE_PLAN_DEBUG = originalDebugEnv;
      }

      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "forge plan marks warning-heavy handoffs as ready_with_warnings and keeps the constraining concerns visible",
  async () => {
    const repoRoot = await createTempRepo("forge-plan-part3-warning-");

    try {
      const intakeResult = runForgeBinary(["intake", "--repo", repoRoot, "--prompt", "fix"], repoRoot);
      assert.equal(intakeResult.code, 0, intakeResult.stderr);

      const planResult = runForgePlanBinary(["--repo", repoRoot], repoRoot);
      assert.equal(planResult.code, 0, planResult.stderr);

      const artifact = await readJsonFile<PlanArtifact>(planArtifactPath(repoRoot));
      const report = await readTextFile(planReportPath(repoRoot));

      assert.equal(artifact.status, "ready");
      assert.equal(artifact.planning_readiness.ready, true);
      assert.equal(artifact.planning_readiness.status, "ready_with_warnings");
      assert.ok(artifact.planning_readiness.warning_items.length > 0);
      assert.equal(artifact.planning_readiness.blocking_issues.length, 0);
      assert.ok(artifact.planning_readiness.constraining_concern_ids.length > 0);
      assert.ok(artifact.planning_readiness.recommended_user_actions.length > 0);
      assert.ok(
        sectionBody(report, "Planning Readiness").includes(artifact.planning_readiness.summary),
        "expected the report to render the warning-heavy readiness summary",
      );
      assertReadinessMirrorsConcerns(artifact);
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "forge plan blocks readiness when the Step 1 handoff was escalated and keeps the blocking story visible",
  async () => {
    const repoRoot = await createTempRepo("forge-plan-part3-blocked-");

    try {
      const intakeResult = runForgeBinary(
        ["intake", "--repo", repoRoot, "--prompt", "fix", "--fail-on-low-confidence"],
        repoRoot,
      );
      assert.equal(intakeResult.code, 1);

      const planResult = runForgePlanBinary(["--repo", repoRoot], repoRoot);
      assert.notEqual(planResult.code, 0);

      const artifact = await readJsonFile<PlanArtifact>(planArtifactPath(repoRoot));
      const report = await readTextFile(planReportPath(repoRoot));

      assert.equal(artifact.status, "blocked");
      assert.equal(artifact.planning_readiness.ready, false);
      assert.equal(artifact.planning_readiness.status, "blocked");
      assert.ok(artifact.planning_readiness.blocking_issues.length > 0);
      assert.ok(artifact.planning_readiness.recommended_user_actions.length > 0);
      assert.ok(
        sectionBody(report, "Planning Readiness").includes(artifact.planning_readiness.summary),
        "expected the report to render the blocked readiness summary",
      );
      assertReadinessMirrorsConcerns(artifact);
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "forge plan keeps fallback-root partial failures visible through planning readiness and debug output",
  async () => {
    const repoRoot = await createTempRepo("forge-plan-part3-fallback-");
    const originalDebugEnv = process.env.FORGE_PLAN_DEBUG;
    const blockedOutputDir = join("..", "forge-plan-part3-fallback-output");

    try {
      await seedSpecRepo(repoRoot);

      const intakeResult = runForgeBinary(["intake", "--repo", repoRoot, "--spec", join(repoRoot, "task.md")], repoRoot);
      assert.equal(intakeResult.code, 0, intakeResult.stderr);
      await removePlanningInputs(repoRoot);

      process.env.FORGE_PLAN_DEBUG = "1";
      const planResult = runForgePlanBinary(["--repo", repoRoot, "--output-dir", blockedOutputDir], repoRoot);

      assert.notEqual(planResult.code, 0);

      const artifact = await readJsonFile<PlanArtifact>(planArtifactPath(repoRoot));
      const report = await readTextFile(planReportPath(repoRoot));
      const debugArtifact = await readJsonFile<PlanReadinessDebugArtifact>(planDebugPath(repoRoot, "plan-debug.json"));
      const readinessDebug = await readJsonFile<PlanReadinessDebugArtifact>(
        planDebugPath(repoRoot, "planning-readiness.json"),
      );

      assert.equal(artifact.status, "failed");
      assert.equal(artifact.planning_readiness.ready, true);
      assert.equal(artifact.planning_readiness.status, "ready_with_warnings");
      assert.equal(artifact.planning_readiness.partial_output?.code, "OUTPUT_ROOT_FALLBACK");
      assert.ok(artifact.planning_readiness.summary.length > 0);
      assert.ok(
        sectionBody(report, "Planning Readiness").includes(artifact.planning_readiness.summary),
        "expected the report to render the fallback readiness summary",
      );
      assert.equal(await fileExists(planDebugPath(repoRoot, "planning-readiness.json")), true);
      assert.deepEqual(debugArtifact.planning_readiness, artifact.planning_readiness);
      assert.deepEqual(readinessDebug.planning_readiness, artifact.planning_readiness);
      assertReadinessMirrorsConcerns(artifact);
    } finally {
      if (originalDebugEnv === undefined) {
        delete process.env.FORGE_PLAN_DEBUG;
      } else {
        process.env.FORGE_PLAN_DEBUG = originalDebugEnv;
      }

      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "forge plan keeps blocked handoffs with persisted fallback failures coherent across artifact, report, and debug output",
  async () => {
    const repoRoot = await createTempRepo("forge-plan-part3-blocked-failure-");
    const originalDebugEnv = process.env.FORGE_PLAN_DEBUG;
    const blockedOutputDir = join("..", "forge-plan-part3-blocked-failure-output");

    try {
      await seedSpecRepo(repoRoot);

      const intakeResult = runForgeBinary(["intake", "--repo", repoRoot, "--spec", join(repoRoot, "task.md")], repoRoot);
      assert.equal(intakeResult.code, 0, intakeResult.stderr);

      const intakeArtifactPath = join(repoRoot, ".forge", "intake.json");
      const intakeArtifact = await readJsonFile<Record<string, unknown>>(intakeArtifactPath);
      const taskSpec = {
        ...(intakeArtifact.task_spec as Record<string, unknown>),
        explicit_requirements: [],
        acceptance_criteria: [],
        implementation_necessities: [],
      };

      await writeFile(
        intakeArtifactPath,
        `${JSON.stringify(
          {
            ...intakeArtifact,
            task_spec: taskSpec,
            candidate_targets: [],
            initial_verification_targets: [],
            next_step_readiness: {
              ...(intakeArtifact.next_step_readiness as Record<string, unknown>),
              ready: true,
              blocking_issues: [],
            },
          },
          null,
          2,
        )}\n`,
        "utf8",
      );
      await removePlanningInputs(repoRoot);

      process.env.FORGE_PLAN_DEBUG = "1";
      const planResult = runForgePlanBinary(
        ["--repo", repoRoot, "--output-dir", blockedOutputDir],
        repoRoot,
      );

      assert.notEqual(planResult.code, 0);

      const artifact = await readJsonFile<PlanArtifact>(planArtifactPath(repoRoot));
      const report = await readTextFile(planReportPath(repoRoot));
      const debugArtifact = await readJsonFile<PlanReadinessDebugArtifact>(planDebugPath(repoRoot, "plan-debug.json"));
      const readinessDebug = await readJsonFile<PlanReadinessDebugArtifact>(
        planDebugPath(repoRoot, "planning-readiness.json"),
      );

      assert.equal(artifact.status, "failed");
      assert.equal(artifact.planning_readiness.ready, false);
      assert.equal(artifact.planning_readiness.status, "blocked");
      assert.ok(artifact.planning_readiness.blocking_issues.some((issue) => issue.code === "PLAN_INPUT_TOO_WEAK"));
      assert.equal(artifact.planning_readiness.partial_output?.code, "OUTPUT_ROOT_FALLBACK");
      assert.equal(artifact.failure?.code, "OUTPUT_ROOT_FALLBACK");
      assert.ok(artifact.planning_readiness.summary.length > 0);
      assert.ok(
        sectionBody(report, "Planning Readiness").includes(artifact.planning_readiness.summary),
        "expected the report to render the blocked-plus-fallback readiness summary",
      );
      assert.equal(await fileExists(planDebugPath(repoRoot, "planning-readiness.json")), true);
      assert.deepEqual(debugArtifact.planning_readiness, artifact.planning_readiness);
      assert.deepEqual(readinessDebug.planning_readiness, artifact.planning_readiness);
      assertReadinessMirrorsConcerns(artifact);
    } finally {
      if (originalDebugEnv === undefined) {
        delete process.env.FORGE_PLAN_DEBUG;
      } else {
        process.env.FORGE_PLAN_DEBUG = originalDebugEnv;
      }

      await disposeTempRepo(repoRoot);
    }
  },
);

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode);
}
