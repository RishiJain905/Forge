import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { scanRepoResult, shouldReadManifestText } from "../src/intake/repo-context.js";

interface RichRepoScanSignals {
  sourceFileCount: number;
  testFileCount: number;
  manifestFileCount: number;
  repoLooksSparse: boolean;
  languages: string[];
  packageManager: string | null;
  frameworkHints: string[];
  testFrameworkHints: string[];
  testCommandHints: string[];
  ciHints: string[];
  keyDirectories: string[];
  entryPoints: string[];
  layoutSummary: string;
}

async function createTempRepo(prefix = "forge-intake-repo-context-"): Promise<string> {
  const repoRoot = await mkdtemp(join(tmpdir(), prefix));

  await writeFile(join(repoRoot, "README.md"), "# fixture repo\n", "utf8");
  await writeRepoFile(
    repoRoot,
    "src/app.ts",
    "export function runApp() {\n  return 'ok';\n}\n",
  );
  await writeRepoFile(
    repoRoot,
    "tests/app.test.ts",
    "import assert from 'node:assert/strict';\n\nassert.equal(1, 1);\n",
  );

  return repoRoot;
}

async function disposeTempRepo(repoRoot: string): Promise<void> {
  await rm(repoRoot, { force: true, recursive: true });
}

async function writeRepoFile(
  repoRoot: string,
  relativePath: string,
  contents: string,
): Promise<void> {
  const filePath = join(repoRoot, relativePath);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, contents, "utf8");
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
  "repo context only reads content-bearing manifest files",
  async () => {
    assert.equal(shouldReadManifestText("package.json"), true);
    assert.equal(shouldReadManifestText("services/api/package.json"), true);
    assert.equal(shouldReadManifestText("pyproject.toml"), true);
    assert.equal(shouldReadManifestText("requirements.txt"), true);
    assert.equal(shouldReadManifestText("yarn.lock"), false);
    assert.equal(shouldReadManifestText("pnpm-lock.yaml"), false);
    assert.equal(shouldReadManifestText("go.mod"), false);
    assert.equal(shouldReadManifestText(".github/workflows/ci.yml"), false);
    assert.equal(shouldReadManifestText("tsconfig.json"), false);
  },
);

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
      assert.ok(signals.testCommandHints.some((hint) => /vitest|npm test/i.test(hint)));
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

await runScenario(
  "repo scan result recognizes monorepo-style JS and TS layouts with focused entry points",
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
          '    "vitest": "^1.0.0",',
          '    "typescript": "^5.0.0"',
          "  }",
          "}",
        ].join("\n"),
      );
      await writeRepoFile(repoRoot, "pnpm-lock.yaml", "lockfileVersion: '9.0'\n");
      await writeRepoFile(repoRoot, ".github/workflows/ci.yml", "name: CI\n");
      await writeRepoFile(
        repoRoot,
        "packages/web/src/index.ts",
        "export const webEntry = true;\n",
      );
      await writeRepoFile(
        repoRoot,
        "packages/web/tests/widget.spec.ts",
        "export const widgetTest = true;\n",
      );
      await writeRepoFile(
        repoRoot,
        "apps/cli/src/main.ts",
        "export const cliEntry = true;\n",
      );
      await writeRepoFile(
        repoRoot,
        "tools/build.ts",
        "export const buildTool = true;\n",
      );

      const result = await scanRepoResult(repoRoot, join(repoRoot, ".forge"));
      const signals = result.signals as unknown as RichRepoScanSignals;

      assert.equal(result.repoContext.grounded, true);
      assert.ok(result.repoContext.sourceFiles.includes("packages/web/src/index.ts"));
      assert.ok(result.repoContext.sourceFiles.includes("apps/cli/src/main.ts"));
      assert.ok(result.repoContext.testFiles.includes("packages/web/tests/widget.spec.ts"));
      assert.ok(result.repoContext.languages?.includes("typescript"));
      assert.equal(result.repoContext.packageManager, "pnpm");
      assert.ok(result.repoContext.frameworkHints?.some((hint) => /node\.js|typescript/i.test(hint)));
      assert.ok(result.repoContext.testFrameworkHints?.some((hint) => /vitest/i.test(hint)));
      assert.ok(result.repoContext.testCommandHints?.some((hint) => /pnpm test|vitest/i.test(hint)));
      assert.ok(result.repoContext.ciHints?.some((hint) => /github actions/i.test(hint)));
      assert.ok(result.repoContext.keyDirectories?.includes("packages"));
      assert.ok(result.repoContext.keyDirectories?.includes("apps"));
      assert.ok(result.repoContext.entryPoints?.includes("packages/web/src/index.ts"));
      assert.ok(result.repoContext.entryPoints?.includes("apps/cli/src/main.ts"));
      assert.match(result.repoContext.layoutSummary ?? "", /packages/i);
      assert.match(result.repoContext.layoutSummary ?? "", /apps/i);
      assert.match(signals.layoutSummary, /packages/i);
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "repo scan result best-effort detects Python tooling and nonstandard test locations",
  async () => {
    const repoRoot = await createTempRepo();

    try {
      await writeRepoFile(
        repoRoot,
        "pyproject.toml",
        [
          "[build-system]",
          'requires = ["setuptools>=61"]',
          'build-backend = "setuptools.build_meta"',
          "",
          "[tool.pytest.ini_options]",
          'testpaths = ["tests", "integration"]',
        ].join("\n"),
      );
      await writeRepoFile(
        repoRoot,
        "requirements.txt",
        [
          "pytest>=8.0",
          "requests>=2.0",
        ].join("\n"),
      );
      await writeRepoFile(
        repoRoot,
        "setup.cfg",
        [
          "[tool:pytest]",
          "addopts = -q",
        ].join("\n"),
      );
      await writeRepoFile(repoRoot, "pytest.ini", "[pytest]\n");
      await writeRepoFile(repoRoot, "src/app.py", "def main():\n    return True\n");
      await writeRepoFile(repoRoot, "tests/unit/test_app.py", "def test_main():\n    assert True\n");
      await writeRepoFile(repoRoot, "integration/test_cli.py", "def test_cli():\n    assert True\n");
      await writeRepoFile(repoRoot, ".github/workflows/test.yml", "name: test\n");

      const result = await scanRepoResult(repoRoot, join(repoRoot, ".forge"));
      const signals = result.signals as unknown as RichRepoScanSignals;

      assert.equal(result.repoContext.grounded, true);
      assert.ok(result.repoContext.sourceFiles.includes("src/app.py"));
      assert.ok(result.repoContext.testFiles.includes("tests/unit/test_app.py"));
      assert.ok(result.repoContext.testFiles.includes("integration/test_cli.py"));
      assert.ok(result.repoContext.languages?.includes("python"));
      assert.equal(result.repoContext.packageManager, "pip");
      assert.ok(result.repoContext.frameworkHints?.some((hint) => /python/i.test(hint)));
      assert.ok(result.repoContext.testFrameworkHints?.some((hint) => /pytest/i.test(hint)));
      assert.ok(result.repoContext.testCommandHints?.some((hint) => /pytest/i.test(hint)));
      assert.ok(result.repoContext.ciHints?.some((hint) => /github actions/i.test(hint)));
      assert.ok(result.repoContext.keyDirectories?.includes("src"));
      assert.ok(result.repoContext.keyDirectories?.includes("tests"));
      assert.ok(result.repoContext.entryPoints?.includes("src/app.py"));
      assert.match(result.repoContext.layoutSummary ?? "", /python/i);
      assert.match(signals.layoutSummary, /pytest/i);
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "repo scan result reports mixed package-manager clues and no-git warnings without blocking",
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
          '  "type": "module"',
          "}",
        ].join("\n"),
      );
      await writeRepoFile(
        repoRoot,
        "pyproject.toml",
        [
          "[build-system]",
          'requires = ["setuptools>=61"]',
          'build-backend = "setuptools.build_meta"',
        ].join("\n"),
      );
      await writeRepoFile(repoRoot, "src/index.ts", "export const index = true;\n");
      await rm(join(repoRoot, "tests"), { force: true, recursive: true });

      const result = await scanRepoResult(repoRoot, join(repoRoot, ".forge"));
      const warnings = result.warnings.join(" ");

      assert.equal(result.repoContext.gitContext.status, "not_repo");
      assert.ok(result.repoContext.packageManager === "npm" || result.repoContext.packageManager === "pip");
      assert.match(warnings, /mixed package-manager clues/i);
      assert.match(warnings, /no tests were detected/i);
      assert.match(warnings, /test framework hint/i);
      assert.match(warnings, /manifest inspection/i);
      assert.equal(new Set(result.warnings).size, result.warnings.length);
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode);
}
