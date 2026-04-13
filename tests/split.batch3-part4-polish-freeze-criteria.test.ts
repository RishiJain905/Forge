import assert from "node:assert/strict";
import { readdir, rm } from "node:fs/promises";
import { join } from "node:path";

import type { SplitArtifact } from "../src/split/types.js";
import {
  assertForgeSplitOutputHasNoReportHeadings,
  createTempRepo,
  disposeTempRepo,
  readJsonFile,
  readTextFile,
  runForgeBinary,
  runForgePlanBinary,
  runForgeSplitBinary,
  runForgeVerifyBinary,
  splitArtifactPath,
  splitReportPath,
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

async function seedRunnableMilestoneRepo(repoRoot: string): Promise<void> {
  await writeRepoFile(
    repoRoot,
    "task.md",
    [
      "# Stabilize the shared runtime workflow",
      "",
      "Revise `src/worker.ts`, `src/runtime.ts`, and `tests/runtime.test.ts` together.",
      "",
      "## Acceptance Criteria",
      "",
      "- `src/worker.ts` keeps ownership behavior aligned",
      "- `src/runtime.ts` preserves dependency ordering",
      "- `tests/runtime.test.ts` stays aligned with the shipped behavior",
    ].join("\n"),
  );
  await writeRepoFile(
    repoRoot,
    "src/worker.ts",
    [
      "export function claimOwnership() {",
      "  return 'claimed';",
      "}",
    ].join("\n"),
  );
  await writeRepoFile(
    repoRoot,
    "src/runtime.ts",
    [
      "export function runRuntime() {",
      "  return 'ready';",
      "}",
    ].join("\n"),
  );
  await writeRepoFile(
    repoRoot,
    "tests/runtime.test.ts",
    [
      "import assert from 'node:assert/strict';",
      "",
      "assert.equal(1, 1);",
    ].join("\n"),
  );
}

async function removeUpstreamInputs(repoRoot: string): Promise<void> {
  await rm(join(repoRoot, "task.md"), { force: true });
  await rm(join(repoRoot, "src", "app.ts"), { force: true });
  await rm(join(repoRoot, "src", "worker.ts"), { force: true });
  await rm(join(repoRoot, "src", "runtime.ts"), { force: true });
  await rm(join(repoRoot, "tests", "app.test.ts"), { force: true });
  await rm(join(repoRoot, "tests", "runtime.test.ts"), { force: true });
}

function normalizeSplitArtifact(artifact: SplitArtifact): Omit<SplitArtifact, "startedAt" | "finishedAt"> {
  const {
    startedAt,
    finishedAt,
    ...stableArtifact
  } = artifact;

  void startedAt;
  void finishedAt;

  return stableArtifact;
}

async function collectFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...await collectFiles(path));
      continue;
    }

    if (entry.isFile()) {
      files.push(path);
    }
  }

  return files;
}

async function assertNoStep4FreezeMarkers(): Promise<void> {
  const repoRoot = process.cwd();
  const runtimeFiles = await collectFiles(join(repoRoot, "src", "split"));
  const splitTestFiles = (await collectFiles(join(repoRoot, "tests"))).filter((filePath) => /split\./i.test(filePath));
  const doneDocs = await collectFiles(join(repoRoot, "docs", "S4-B3-Done"));
  const scannedFiles = [
    ...runtimeFiles,
    ...splitTestFiles,
    ...doneDocs,
    join(repoRoot, "README.md"),
    join(repoRoot, "progress.md"),
    join(repoRoot, "scripts", "smoke.mjs"),
  ];
  const offenders: string[] = [];
  const freezeMarkerPattern = new RegExp(["TO" + "DO", "FIX" + "ME", "XX" + "X"].join("|"));

  for (const filePath of scannedFiles) {
    const contents = await readTextFile(filePath);
    const lines = contents.split("\n");
    const hasUnresolvedMarker = lines.some((line) => {
      if (!freezeMarkerPattern.test(line)) {
        return false;
      }

      return !/no blocking .*TODO\/FIXME\/XXX|`TODO`|`FIXME`|`XXX`|marker sweep/i.test(line);
    });

    if (hasUnresolvedMarker) {
      offenders.push(filePath);
    }
  }

  assert.deepEqual(offenders, [], `unexpected freeze markers found in Step 4 freeze surface: ${offenders.join(", ")}`);
}

await runScenario(
  "forge split Part 4 keeps grounded ready runs polished, deterministic, and explicitly frozen for V1",
  async () => {
    const repoRoot = await createTempRepo("forge-split-b3-part4-ready-");

    try {
      await seedRunnableMilestoneRepo(repoRoot);

      assert.equal(
        runForgeBinary(["intake", "--repo", repoRoot, "--spec", join(repoRoot, "task.md")], repoRoot).code,
        0,
      );
      assert.equal(runForgePlanBinary(["--repo", repoRoot], repoRoot).code, 0);
      assert.equal(runForgeVerifyBinary(["--repo", repoRoot], repoRoot).code, 0);

      await removeUpstreamInputs(repoRoot);

      const firstRun = runForgeSplitBinary(["--repo", repoRoot], repoRoot);
      assert.equal(firstRun.code, 0, firstRun.stderr);
      assertForgeSplitOutputHasNoReportHeadings(firstRun);
      const firstArtifact = await readJsonFile<SplitArtifact>(splitArtifactPath(repoRoot));
      const firstReport = await readTextFile(splitReportPath(repoRoot));

      const secondRun = runForgeSplitBinary(["--repo", repoRoot], repoRoot);
      assert.equal(secondRun.code, 0, secondRun.stderr);
      assertForgeSplitOutputHasNoReportHeadings(secondRun);
      const secondArtifact = await readJsonFile<SplitArtifact>(splitArtifactPath(repoRoot));
      const secondReport = await readTextFile(splitReportPath(repoRoot));

      assert.deepEqual(normalizeSplitArtifact(firstArtifact), normalizeSplitArtifact(secondArtifact));
      assert.equal(firstReport, secondReport);
      assert.ok(firstArtifact.boundaryNotes.some((entry) => /Step 4 is frozen for V1 except for future bug fixes/i.test(entry)));
      assert.ok(firstArtifact.boundaryNotes.some((entry) => /Only bug-fix work should remain in Step 4/i.test(entry)));
      assert.match(firstReport, /Step 4 is frozen for V1 except for future bug fixes/i);
      assert.match(firstReport, /Only bug-fix work should remain in Step 4/i);
      assert.match(firstReport, /split\.json and reports\/split-report\.md remain the authoritative Step 4 outputs\./i);
      assert.match(firstReport, /Debug files are optional internal mirrors and never replace the durable Step 4 outputs\./i);
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "Step 4 Part 4 updates repo docs, closeout tracking, and freeze-marker coverage",
  async () => {
    const readme = await readTextFile(join(process.cwd(), "README.md"));
    const progress = await readTextFile(join(process.cwd(), "progress.md"));
    const doneDocPath = join(process.cwd(), "docs", "S4-B3-Done", "p4-done.md");
    const doneDoc = await readTextFile(doneDocPath);

    assert.match(readme, /Step 4 Batch 3 Part 4/i);
    assert.match(readme, /frozen for V1 except for future bug fixes/i);
    assert.match(readme, /bug-fix-only maintenance mode/i);
    assert.match(progress, /Batch 3\.04: `part-4-step4-polish-test-hardening-and-freeze-criteria\.md` \(Step 4\)/i);
    assert.match(progress, /Step 4 Batch 3 Part 4 is complete/i);
    assert.match(progress, /Step 4 Batch 3 is complete/i);
    assert.match(progress, /Step 4 is complete for V1 and frozen except for future bug fixes/i);
    assert.match(progress, /Next major target: Step 5 execute implementation work/i);
    assert.match(doneDoc, /Step 4 Batch 3 Part 4 Done Summary/i);
    assert.match(doneDoc, /frozen for V1 except for future bug fixes/i);
    assert.match(doneDoc, /bug-fix-only maintenance mode/i);

    await assertNoStep4FreezeMarkers();
  },
);

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode);
}
