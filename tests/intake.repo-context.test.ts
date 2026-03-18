import assert from "node:assert/strict";
import { join } from "node:path";

import { scanRepoResult } from "../src/intake/repo-context.js";
import {
  createTempRepo,
  disposeTempRepo,
  writeRepoFile,
} from "./support/forge-cli.js";

interface RichRepoScanSignals {
  sourceFileCount: number;
  testFileCount: number;
  manifestFileCount: number;
  repoLooksSparse: boolean;
  languages: string[];
  packageManager: string | null;
  frameworkHints: string[];
  testFrameworkHints: string[];
  keyDirectories: string[];
  entryPoints: string[];
  layoutSummary: string;
}

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
  "repo scan result exposes richer repo layout signals without losing grounding",
  async () => {
    const repoRoot = await createTempRepo();

    try {
      await writeRepoFile(
        repoRoot,
        "package.json",
        [
          "{",
          '  "name": "fixture-repo",',
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
        "src/server.ts",
        "export function startServer() {\n  return true;\n}\n",
      );

      const result = await scanRepoResult(repoRoot, join(repoRoot, ".forge"));
      const signals = result.signals as unknown as RichRepoScanSignals;

      assert.equal(result.repoContext.grounded, true);
      assert.ok(Array.isArray(result.repoContext.languages), "expected repoContext.languages");
      assert.ok(Array.isArray(result.repoContext.frameworkHints), "expected repoContext.frameworkHints");
      assert.equal(result.repoContext.packageManager, "npm");
      assert.ok(Array.isArray(result.repoContext.keyDirectories), "expected repoContext.keyDirectories");
      assert.ok(Array.isArray(result.repoContext.entryPoints), "expected repoContext.entryPoints");
      assert.ok(Array.isArray(result.repoContext.testFrameworkHints), "expected repoContext.testFrameworkHints");
      assert.equal((result.repoContext.layoutSummary ?? "").length > 0, true);
      assert.equal(signals.sourceFileCount >= 2, true);
      assert.equal(signals.testFileCount >= 1, true);
      assert.equal(signals.manifestFileCount >= 2, true);
      assert.ok(Array.isArray(signals.languages), "expected repo scan to expose detected languages");
      assert.ok(signals.languages.includes("typescript"));
      assert.equal(signals.packageManager, "npm");
      assert.ok(signals.frameworkHints.length > 0);
      assert.ok(signals.testFrameworkHints.some((hint) => /vitest/i.test(hint)));
      assert.ok(signals.keyDirectories.includes("src"));
      assert.ok(signals.keyDirectories.includes("tests"));
      assert.ok(
        signals.entryPoints.some((entry) => entry === "src/app.ts" || entry === "src/server.ts"),
      );
      assert.match(signals.layoutSummary, /src/i);
      assert.match(signals.layoutSummary, /tests/i);
      assert.match(signals.layoutSummary, /package\.json/i);
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode);
}
