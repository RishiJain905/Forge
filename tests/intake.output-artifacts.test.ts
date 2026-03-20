import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

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

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode);
}
