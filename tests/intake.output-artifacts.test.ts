import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import { runIntakeCommand } from "../src/intake/runner.js";
import type { IntakeArtifact } from "../src/intake/types.js";
import {
  createTempRepo,
  disposeTempRepo,
  fileExists,
  readJsonFile,
  readTextFile,
  runForgeCli,
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

await runScenario(
  "forge intake cleans configured-root partial writes before falling back to .forge",
  async () => {
    const repoRoot = await createTempRepo();
    const prompt = "Inspect src/app.ts and tests/app.test.ts for output artifact persistence.";

    try {
      await writeRepoFile(repoRoot, "broken-output/reports", "not a directory\n");

      const result = await runForgeCli(
        [
          "intake",
          "--repo",
          repoRoot,
          "--output-dir",
          "broken-output",
          "--prompt",
          prompt,
        ],
        repoRoot,
      );

      assert.equal(result.code, 1);
      assert.equal(await fileExists(join(repoRoot, "broken-output", "intake.json")), false);
      assert.equal(await fileExists(join(repoRoot, ".forge", "intake.json")), true);
      assert.equal(await fileExists(join(repoRoot, ".forge", "reports", "intake-report.md")), true);
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "forge intake writes an internal debug artifact when FORGE_INTAKE_DEBUG=1",
  async () => {
    const repoRoot = await createTempRepo();
    const originalDebugEnv = process.env.FORGE_INTAKE_DEBUG;

    try {
      process.env.FORGE_INTAKE_DEBUG = "1";

      const result = await runForgeCli(
        [
          "intake",
          "--repo",
          repoRoot,
          "--prompt",
          "Inspect retry ownership in src/app.ts and keep package.json aligned with the API contract.",
        ],
        repoRoot,
      );

      assert.equal(result.code, 0, result.stderr);

      const debugArtifactPath = join(repoRoot, ".forge", "debug", "intake-debug.json");
      const debugArtifact = await readJsonFile<{
        runtimeOptions?: { outputMode?: string };
        responsibilities?: { taskParser?: unknown };
        assembledResult?: {
          riskAnalysis?: {
            typedRiskZones?: Array<{ code?: string }>;
          };
          verificationTargets?: Array<{ category?: string; path?: string }>;
        };
        boundarySafeResult?: {
          initialVerificationTargets?: Array<{
            path: string;
            category?: string;
          }>;
        };
      }>(debugArtifactPath);

      assert.equal(await fileExists(debugArtifactPath), true);
      assert.equal(debugArtifact.runtimeOptions?.outputMode, "default");
      assert.ok(debugArtifact.responsibilities?.taskParser);
      assert.ok(
        debugArtifact.assembledResult?.riskAnalysis?.typedRiskZones?.some((zone) =>
          zone.code === "api_compatibility_risk"
        ),
      );
      assert.ok(
        debugArtifact.assembledResult?.verificationTargets?.some((target) =>
          target.path === "src/app.ts" && target.category === "retry_logic"
        ),
      );
      assert.ok(
        debugArtifact.boundarySafeResult?.initialVerificationTargets?.some((target) =>
          target.path === "src/app.ts" && target.category === "retry_logic"
        ),
      );
      const specParsePath = join(repoRoot, ".forge", "debug", "spec-parse.json");
      const repoScanPath = join(repoRoot, ".forge", "debug", "repo-scan.json");
      const candidateFilesPath = join(repoRoot, ".forge", "debug", "candidate-files.json");
      const warningsPath = join(repoRoot, ".forge", "debug", "warnings.json");

      assert.equal(await fileExists(specParsePath), true);
      assert.equal(await fileExists(repoScanPath), true);
      assert.equal(await fileExists(candidateFilesPath), true);
      assert.equal(await fileExists(warningsPath), true);

      const specParse = await readJsonFile<{
        taskInput?: { inputMode?: string };
        taskParserResult?: { taskSpec?: { goal?: string } };
      }>(specParsePath);
      const repoScan = await readJsonFile<{
        repoContext?: { grounded?: boolean };
        warnings?: string[];
      }>(repoScanPath);
      const candidateFiles = await readJsonFile<{
        candidateTargets?: Array<{ path?: string }>;
        verificationTargets?: Array<{ path?: string; category?: string }>;
      }>(candidateFilesPath);
      const warningsDebug = await readJsonFile<{
        warnings?: string[];
        confidence?: { level?: string };
        nextStepReadiness?: { ready?: boolean };
      }>(warningsPath);

      assert.equal(specParse.taskInput?.inputMode, "prompt");
      assert.match(specParse.taskParserResult?.taskSpec?.goal ?? "", /src\/app\.ts/i);
      assert.equal(repoScan.repoContext?.grounded, true);
      assert.ok(Array.isArray(repoScan.warnings));
      assert.ok(candidateFiles.candidateTargets?.some((target) => target.path === "src/app.ts"));
      assert.ok(
        candidateFiles.verificationTargets?.some((target) =>
          target.path === "src/app.ts" && target.category === "retry_logic"
        ),
      );
      assert.ok(Array.isArray(warningsDebug.warnings));
      assert.ok(warningsDebug.confidence?.level);
      assert.equal(typeof warningsDebug.nextStepReadiness?.ready, "boolean");
    } finally {
      if (originalDebugEnv === undefined) {
        delete process.env.FORGE_INTAKE_DEBUG;
      } else {
        process.env.FORGE_INTAKE_DEBUG = originalDebugEnv;
      }

      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "forge intake includes optional reasoning summary and structured warning items in debug warnings output",
  async () => {
    const repoRoot = await createTempRepo();
    const originalDebugEnv = process.env.FORGE_INTAKE_DEBUG;

    try {
      process.env.FORGE_INTAKE_DEBUG = "1";

      const result = await runIntakeCommand(
        {
          repo: repoRoot,
          prompt: "Inspect src/app.ts for the retry ownership pattern.",
          llmAssist: true,
        },
        repoRoot,
        {
          optionalReasoningHook: async () => ({
            provider: "test-hook",
            taskWording: {
              summary: "Clarify retry wording in src/app.ts while keeping tests aligned.",
            },
          }),
        },
      );

      assert.equal(result.status, "warning");

      const warningsPath = join(repoRoot, ".forge", "debug", "warnings.json");
      const warningsDebug = await readJsonFile<{
        warningItems?: Array<{ code?: string; message?: string }>;
        nextStepReadiness?: { ready?: boolean; blockingIssues?: Array<{ code?: string }> };
        failure?: { code?: string | null; message?: string | null } | null;
        optionalReasoning?: {
          requested?: boolean;
          attempted?: boolean;
          used?: boolean;
          provider?: string | null;
        };
      }>(warningsPath);

      assert.ok(
        warningsDebug.warningItems?.some((item) => item.code === "ACCEPTANCE_CRITERIA_MISSING"),
        "expected structured warning items in debug output",
      );
      assert.equal(typeof warningsDebug.nextStepReadiness?.ready, "boolean");
      assert.equal(warningsDebug.failure, null);
      assert.deepEqual(
        warningsDebug.optionalReasoning,
        {
          requested: true,
          attempted: true,
          used: true,
          provider: "test-hook",
        },
        "expected optional reasoning usage summary in debug warnings output",
      );
    } finally {
      process.env.FORGE_INTAKE_DEBUG = originalDebugEnv ?? "";
      if (originalDebugEnv === undefined) {
        delete process.env.FORGE_INTAKE_DEBUG;
      }

      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "forge intake surfaces the Batch 3 runnable milestone through the real spec-mode pipeline",
  async () => {
    const repoRoot = await createTempRepo();
    const specPath = join(repoRoot, "task.md");

    try {
      await writeRepoFile(
        repoRoot,
        "package.json",
        [
          "{",
          '  "name": "batch3-fixture",',
          '  "private": true,',
          '  "type": "module",',
          '  "scripts": {',
          '    "test": "vitest run"',
          "  },",
          '  "devDependencies": {',
          '    "vitest": "^1.0.0"',
          "  }",
          "}",
        ].join("\n"),
      );
      await writeRepoFile(
        repoRoot,
        "tsconfig.json",
        [
          "{",
          '  "compilerOptions": {',
          '    "target": "ES2022",',
          '    "module": "NodeNext"',
          "  }",
          "}",
        ].join("\n"),
      );
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

      const result = await runForgeCli(
        ["intake", "--repo", repoRoot, "--spec", specPath],
        repoRoot,
      );

      assert.equal(result.code, 0, result.stderr);

      const artifactPath = join(repoRoot, ".forge", "intake.json");
      const reportPath = join(repoRoot, ".forge", "reports", "intake-report.md");
      const artifact = await readJsonFile<{
        status: "success" | "warning" | "failed";
        input_mode?: "spec" | "prompt";
        task_spec?: {
          title?: string;
          summary?: string;
          goal?: string;
          scope?: string[];
          acceptance_criteria?: string[];
        };
        repo_context?: {
          grounded?: boolean;
          languages?: string[];
          framework_hints?: string[];
          package_manager?: string | null;
          key_directories?: string[];
          entry_points?: string[];
          test_framework_hints?: string[];
          layout_summary?: string | null;
        };
        candidate_targets?: Array<{
          path?: string;
          kind?: string;
          notes?: string[];
          shared_risk?: boolean;
        }>;
        risk_analysis?: {
          derived_risk_zones?: Array<{ code?: string }>;
          supporting_analysis?: {
            ambiguity_items?: Array<{ type?: string; severity?: string; message?: string }>;
            warning_items?: Array<{ code?: string; message?: string }>;
          };
        };
        initial_verification_targets?: Array<{ path?: string; kind?: string; category?: string }>;
      }>(artifactPath);
      const report = await readTextFile(reportPath);

      assert.equal(artifact.status, "success");
      assert.equal(artifact.input_mode, "spec");
      assert.equal(artifact.task_spec?.title, "Update app behavior");
      assert.match(artifact.task_spec?.summary ?? "", /Revise `?src\/app\.ts`?/i);
      assert.ok(artifact.task_spec?.scope?.includes("src/app.ts"));
      assert.ok(artifact.task_spec?.scope?.includes("tests/app.test.ts"));
      assert.equal(artifact.repo_context?.grounded, true);
      assert.ok(artifact.repo_context?.languages?.includes("typescript"));
      assert.ok(artifact.repo_context?.languages?.includes("json"));
      assert.ok(artifact.repo_context?.framework_hints?.some((hint) => /Node\.js/i.test(hint)));
      assert.equal(artifact.repo_context?.package_manager, "npm");
      assert.ok(artifact.repo_context?.key_directories?.includes("src"));
      assert.ok(artifact.repo_context?.entry_points?.includes("src/app.ts"));
      assert.ok(artifact.repo_context?.test_framework_hints?.includes("Vitest"));
      assert.match(artifact.repo_context?.layout_summary ?? "", /languages: typescript/i);
      assert.ok(
        artifact.candidate_targets?.some((candidate) => candidate.path === "src/app.ts"),
        "expected src/app.ts candidate target",
      );
      assert.ok(
        artifact.candidate_targets?.some((candidate) =>
          candidate.path === "src/app.ts"
            && Array.isArray(candidate.notes)
            && typeof candidate.shared_risk === "boolean"
        ),
        "expected src/app.ts candidate target detail",
      );
      assert.ok(Array.isArray(artifact.risk_analysis?.derived_risk_zones));
      assert.ok(Array.isArray(artifact.risk_analysis?.supporting_analysis?.ambiguity_items));
      assert.ok(Array.isArray(artifact.risk_analysis?.supporting_analysis?.warning_items));
      assert.ok(
        artifact.initial_verification_targets?.some((target) =>
          target.path === "tests/app.test.ts" && target.category === "test_surface"
        ),
        "expected tests/app.test.ts initial verification target",
      );
      assert.match(report, /## Task Spec/);
      assert.match(report, /Title:\s+Update app behavior/);
      assert.match(report, /## Repo Context/);
      assert.match(report, /Package Manager:\s+npm/);
      assert.match(report, /## Candidate Targets[\s\S]*shared risk: (yes|no)/i);
      assert.match(report, /## Risk Analysis[\s\S]*Derived Risk Zones/);
      assert.match(report, /## Risk Analysis[\s\S]*Supporting Analysis/);
      assert.match(report, /Initial Verification Targets/);
      assert.match(report, /tests\/app\.test\.ts/);
      assert.match(report, /test_surface/);
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "forge intake persists artifact and report with parity on a success or warning prompt-mode run",
  async () => {
    const repoRoot = await createTempRepo();

    try {
      const result = await runForgeCli(
        [
          "intake",
          "--repo",
          repoRoot,
          "--prompt",
          "Inspect src/app.ts for the app entry point.",
        ],
        repoRoot,
      );

      assert.equal(result.code, 0, result.stderr);

      const artifactPath = join(repoRoot, ".forge", "intake.json");
      const reportPath = join(repoRoot, ".forge", "reports", "intake-report.md");

      assert.equal(await fileExists(artifactPath), true);
      assert.equal(await fileExists(reportPath), true);

      const artifact = await readJsonFile<{
        status: IntakeArtifact["status"];
        input_mode: IntakeArtifact["input_mode"];
        task_spec?: { title?: string; goal?: string; scope?: string[] };
        repo_context?: { grounded?: boolean; languages?: string[] };
        candidate_targets?: Array<{ path?: string }>;
        confidence?: { level?: string };
        next_step_readiness?: { ready?: boolean };
      }>(artifactPath);
      const report = await readTextFile(reportPath);

      assert.ok(
        artifact.status === "success" || artifact.status === "warning",
        `expected success or warning, got: ${artifact.status}`,
      );
      assert.equal(artifact.input_mode, "prompt");
      assert.ok(artifact.task_spec?.goal, "artifact must have task_spec.goal");
      assert.equal(artifact.repo_context?.grounded, true);
      assert.ok((artifact.candidate_targets?.length ?? 0) > 0, "expected candidate targets");
      assert.ok(artifact.confidence?.level, "artifact must have confidence.level");
      assert.equal(artifact.next_step_readiness?.ready, true);

      assert.match(report, /## Overview/);
      assert.match(report, /## Task Spec/);
      assert.match(report, /## Repo Context/);
      assert.match(report, /## Candidate Targets/);
      assert.match(report, /## Confidence/);
      assert.match(report, /## Next Step Readiness/);
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "forge intake persists artifact and report with visible required sections on failed persistence",
  async () => {
    const repoRoot = await createTempRepo();
    const blockedOutputPath = join(repoRoot, "blocked-output");

    try {
      await writeFile(blockedOutputPath, "not a directory\n", "utf8");

      const result = await runForgeCli(
        [
          "intake",
          "--repo",
          repoRoot,
          "--output-dir",
          "blocked-output",
          "--prompt",
          "Inspect src/app.ts for output artifact persistence.",
        ],
        repoRoot,
      );

      assert.notEqual(result.code, 0, "blocked output root should cause failure");

      const fallbackArtifactPath = join(repoRoot, ".forge", "intake.json");
      const fallbackReportPath = join(repoRoot, ".forge", "reports", "intake-report.md");

      assert.equal(await fileExists(fallbackArtifactPath), true);
      assert.equal(await fileExists(fallbackReportPath), true);

      const artifact = await readJsonFile<IntakeArtifact>(fallbackArtifactPath);
      const report = await readTextFile(fallbackReportPath);

      assert.equal(artifact.status, "failed");
      assert.match(artifact.outputRoot ?? "", /\.forge$/);
      assert.ok(
        artifact.failure?.code || artifact.failure?.message || result.stderr,
        "artifact must have failure details",
      );

      assert.match(report, /## Overview/);
      assert.match(report, /## Next Step Readiness/);
      assert.match(report, /failed|error|persistence/i);
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "forge intake includes failure details in CLI output when persistence leaves no durable artifact",
  async () => {
    const repoRoot = await createTempRepo();
    const prompt = "Inspect src/app.ts and tests/app.test.ts for output artifact persistence.";

    try {
      await writeFile(join(repoRoot, ".forge"), "not a directory\n", "utf8");

      const result = await runForgeCli(
        ["intake", "--repo", repoRoot, "--prompt", prompt],
        repoRoot,
      );

      assert.equal(result.code, 1);
      assert.match(result.stderr, /Failure:/);
      assert.match(result.stderr, /PERSISTENCE_FAILED|write|directory|output/i);
      assert.equal(await fileExists(join(repoRoot, ".forge", "intake.json")), false);
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "forge intake prompt mode with supplemental inputs surfaces meaningful Step 1 content in artifact and report",
  async () => {
    const repoRoot = await createTempRepo();
    const notesPath = join(repoRoot, "notes.md");
    const constraintsPath = join(repoRoot, "constraints.md");

    try {
      await writeRepoFile(
        repoRoot,
        "notes.md",
        ["Keep focus on the retry logic only.", "Do not refactor unrelated code."].join("\n"),
      );
      await writeRepoFile(
        repoRoot,
        "constraints.md",
        ["Do not change public API.", "Maintain backward compatibility."].join("\n"),
      );

      const result = await runForgeCli(
        [
          "intake",
          "--repo",
          repoRoot,
          "--prompt",
          "Inspect src/app.ts for the retry ownership pattern.",
          "--notes",
          notesPath,
          "--constraints",
          constraintsPath,
          "--focus",
          "src",
        ],
        repoRoot,
      );

      assert.equal(result.code, 0, result.stderr);

      const artifactPath = join(repoRoot, ".forge", "intake.json");
      const reportPath = join(repoRoot, ".forge", "reports", "intake-report.md");
      const artifact = await readJsonFile<{
        status: IntakeArtifact["status"];
        input_mode: IntakeArtifact["input_mode"];
        source_inputs?: {
          notes?: string[];
          constraints?: string[];
          focus_paths?: string[];
          normalized_task_text?: string;
        };
        task_spec?: { goal?: string; scope?: string[] };
        candidate_targets?: Array<{ path?: string }>;
        confidence?: { level?: string };
        next_step_readiness?: { ready?: boolean };
      }>(artifactPath);
      const report = await readTextFile(reportPath);

      assert.ok(
        artifact.status === "success" || artifact.status === "warning",
        `expected success or warning, got: ${artifact.status}`,
      );
      assert.equal(artifact.input_mode, "prompt");
      assert.deepEqual(artifact.source_inputs?.notes, [
        "Keep focus on the retry logic only.",
        "Do not refactor unrelated code.",
      ]);
      assert.deepEqual(artifact.source_inputs?.constraints, [
        "Do not change public API.",
        "Maintain backward compatibility.",
      ]);
      assert.deepEqual(artifact.source_inputs?.focus_paths, ["src"]);

      // Validate meaningful Step 1 content in artifact
      assert.ok(artifact.task_spec?.goal, "artifact must have task_spec.goal");
      assert.ok(
        (artifact.candidate_targets?.length ?? 0) > 0,
        "prompt mode should produce candidate targets",
      );
      assert.ok(artifact.confidence?.level, "artifact must have confidence.level");
      assert.equal(artifact.next_step_readiness?.ready, true);

      // Validate report reflects key Step 1 sections and supplemental counts
      assert.match(report, /## Source Inputs/);
      assert.match(report, /Notes count:\s+2/);
      assert.match(report, /Constraints count:\s+2/);
      assert.match(report, /Focus paths:\s+src/);
      assert.match(report, /## Task Spec/);
      assert.match(report, /## Candidate Targets/);
      assert.match(report, /## Confidence/);
      assert.match(report, /## Next Step Readiness/);
      assert.match(report, /## Risk Analysis/);

      // Tie report content to artifact values using safe string checks
      assert.ok(report.includes(`status \`${artifact.status}\``), "report should contain artifact status");
      assert.ok(report.includes(artifact.task_spec?.goal ?? ""), "report should contain artifact goal");
      assert.ok(report.includes(`Level: \`${artifact.confidence?.level}\``), "report should contain confidence level");
      assert.ok(
        report.includes(`Ready for \`forge plan\`: \`${artifact.next_step_readiness?.ready}\``),
        "report should contain readiness value",
      );
      // Candidate target paths appear in report (use string includes, not regex, for safety)
      for (const target of artifact.candidate_targets ?? []) {
        if (target.path) {
          assert.ok(report.includes(target.path), `report should contain target path: ${target.path}`);
        }
      }
      // Note content appears in artifact normalized_task_text
      assert.ok(
        artifact.source_inputs?.normalized_task_text?.includes("Keep focus on the retry logic only"),
        "normalized_task_text should include note content",
      );
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode);
}
