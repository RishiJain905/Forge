import path from "node:path";
import { readFile, readdir } from "node:fs/promises";

import { resolveGitContext } from "./git-context.js";
import type {
  GitCommandRunner,
  GitContext,
  RepoContext,
  RepoScanResult,
  RepoScanSignals,
} from "./types.js";
import type { GitContextResolution } from "./git-context.js";

const ignoredDirectoryNames = new Set([
  ".git",
  ".forge",
  ".idea",
  ".mypy_cache",
  ".nox",
  ".pytest_cache",
  ".ruff_cache",
  ".tox",
  ".venv",
  ".vscode",
  "__pycache__",
  "build",
  "coverage",
  "dist",
  "dist-tests",
  "env",
  "node_modules",
  "site-packages",
  "venv",
]);

const manifestFileNames = new Set([
  "bun.lock",
  "bun.lockb",
  "cargo.toml",
  "go.mod",
  "package-lock.json",
  "package.json",
  "pnpm-lock.yaml",
  "pyproject.toml",
  "pytest.ini",
  "requirements-dev.txt",
  "requirements-prod.txt",
  "requirements.txt",
  "setup.cfg",
  "tsconfig.json",
  "yarn.lock",
]);

const codeFileExtensions = [
  ".cjs",
  ".js",
  ".jsx",
  ".mjs",
  ".py",
  ".pyi",
  ".ts",
  ".tsx",
];

const languagePriority = [
  "typescript",
  "javascript",
  "python",
  "go",
  "rust",
  "java",
  "json",
  "markdown",
];

function normalizeRelativePath(repoRoot: string, filePath: string): string {
  return path.relative(repoRoot, filePath).split(path.sep).join("/");
}

function normalizePathForComparison(value: string): string {
  return value.replace(/\\/g, "/").toLowerCase();
}

function dedupeStable(values: string[]): string[] {
  const seen = new Set<string>();
  const deduped: string[] = [];

  for (const value of values) {
    if (seen.has(value)) {
      continue;
    }

    seen.add(value);
    deduped.push(value);
  }

  return deduped;
}

function getBasename(relativePath: string): string {
  return path.posix.basename(normalizePathForComparison(relativePath));
}

function isManifestFile(relativePath: string): boolean {
  const normalizedPath = normalizePathForComparison(relativePath);
  const baseName = getBasename(relativePath);

  return (
    manifestFileNames.has(baseName) ||
    normalizedPath.startsWith(".github/workflows/")
  );
}

function isTestFile(relativePath: string): boolean {
  const normalizedPath = normalizePathForComparison(relativePath);
  const baseName = getBasename(relativePath);

  return (
    normalizedPath.includes("/tests/") ||
    normalizedPath.includes("/__tests__/") ||
    normalizedPath.includes("/test/") ||
    baseName.startsWith("test_") ||
    baseName.endsWith("_test.ts") ||
    baseName.endsWith("_test.tsx") ||
    baseName.endsWith("_test.js") ||
    baseName.endsWith("_test.jsx") ||
    baseName.endsWith("_test.py") ||
    /\.test\./i.test(normalizedPath) ||
    /\.spec\./i.test(normalizedPath)
  );
}

function isSourceFile(relativePath: string): boolean {
  const normalizedPath = normalizePathForComparison(relativePath);

  return (
    codeFileExtensions.some((extension) => normalizedPath.endsWith(extension)) &&
    !isTestFile(relativePath) &&
    !isManifestFile(relativePath)
  );
}

function hasExtension(relativePath: string, extensions: string[]): boolean {
  const normalizedPath = normalizePathForComparison(relativePath);
  return extensions.some((extension) => normalizedPath.endsWith(extension));
}

function detectLanguages(files: string[]): string[] {
  const languages = new Set<string>();

  for (const filePath of files) {
    const normalizedPath = normalizePathForComparison(filePath);

    if (hasExtension(normalizedPath, [".ts", ".tsx"])) {
      languages.add("typescript");
    }

    if (hasExtension(normalizedPath, [".js", ".jsx", ".mjs", ".cjs"])) {
      languages.add("javascript");
    }

    if (hasExtension(normalizedPath, [".py", ".pyi"]) || normalizedPath.endsWith("pyproject.toml")) {
      languages.add("python");
    }

    if (hasExtension(normalizedPath, [".go"]) || normalizedPath.endsWith("go.mod")) {
      languages.add("go");
    }

    if (hasExtension(normalizedPath, [".rs"]) || normalizedPath.endsWith("cargo.toml")) {
      languages.add("rust");
    }

    if (hasExtension(normalizedPath, [".java", ".kt", ".kts"])) {
      languages.add("java");
    }

    if (hasExtension(normalizedPath, [".json"])) {
      languages.add("json");
    }

    if (hasExtension(normalizedPath, [".md", ".markdown"])) {
      languages.add("markdown");
    }
  }

  return languagePriority.filter((language) => languages.has(language));
}

interface PackageManagerDetection {
  packageManager: string | null;
  clues: string[];
  ecosystems: Set<string>;
}

function detectPackageManager(params: {
  files: string[];
  manifestTexts: Map<string, string | null>;
}): PackageManagerDetection {
  const clues: string[] = [];
  const ecosystems = new Set<string>();

  const hasFile = (name: string): boolean =>
    params.files.some((filePath) => getBasename(filePath) === name);

  const hasText = (name: string): boolean => {
    const text = params.manifestTexts.get(name);
    return Boolean(text && text.trim().length > 0);
  };

  if (hasFile("bun.lockb") || hasFile("bun.lock")) {
    ecosystems.add("node");
    clues.push("bun");
  }

  if (hasFile("pnpm-lock.yaml")) {
    ecosystems.add("node");
    clues.push("pnpm");
  }

  if (hasFile("yarn.lock")) {
    ecosystems.add("node");
    clues.push("yarn");
  }

  if (hasFile("package-lock.json") || hasFile("package.json")) {
    ecosystems.add("node");
    clues.push("npm");
  }

  if (hasFile("go.mod")) {
    ecosystems.add("go");
    clues.push("go");
  }

  if (hasFile("cargo.toml")) {
    ecosystems.add("rust");
    clues.push("cargo");
  }

  const pythonManifestPresent =
    hasFile("pyproject.toml") ||
    hasFile("requirements.txt") ||
    hasFile("requirements-dev.txt") ||
    hasFile("requirements-prod.txt") ||
    hasFile("pytest.ini") ||
    hasFile("setup.cfg");

  if (pythonManifestPresent) {
    ecosystems.add("python");

    if (hasText("pyproject.toml") && /\[tool\.poetry\]/i.test(params.manifestTexts.get("pyproject.toml") ?? "")) {
      clues.push("poetry");
    } else {
      clues.push("pip");
    }
  }

  const packageManager = clues.includes("bun")
    ? "bun"
    : clues.includes("pnpm")
      ? "pnpm"
      : clues.includes("yarn")
        ? "yarn"
        : clues.includes("npm")
          ? "npm"
          : clues.includes("poetry")
            ? "poetry"
            : clues.includes("pip")
              ? "pip"
              : clues.includes("cargo")
                ? "cargo"
                : clues.includes("go")
                  ? "go"
                  : null;

  return {
    packageManager,
    clues: [...new Set(clues)],
    ecosystems,
  };
}

function collectKeyDirectories(files: string[]): string[] {
  const directoryCounts = new Map<string, number>();

  for (const filePath of files) {
    const segments = filePath.split("/");

    if (segments.length <= 1) {
      continue;
    }

    const topLevelDirectory = segments[0];

    if (!topLevelDirectory || topLevelDirectory.includes(".")) {
      continue;
    }

    directoryCounts.set(topLevelDirectory, (directoryCounts.get(topLevelDirectory) ?? 0) + 1);
  }

  return [...directoryCounts.entries()]
    .sort((left, right) => {
      if (right[1] !== left[1]) {
        return right[1] - left[1];
      }

      return left[0].localeCompare(right[0]);
    })
    .map(([directory]) => directory);
}

function collectEntryPoints(sourceFiles: string[]): string[] {
  const prioritized = sourceFiles.filter((filePath) =>
    /(^|\/)(app|index|main|server|cli)\.(ts|tsx|js|jsx|mjs|cjs|py)$/i.test(filePath),
  );
  const ordered = [...prioritized, ...sourceFiles];
  const seen = new Set<string>();
  const entryPoints: string[] = [];

  for (const filePath of ordered) {
    if (seen.has(filePath)) {
      continue;
    }

    seen.add(filePath);
    entryPoints.push(filePath);

    if (entryPoints.length >= 5) {
      break;
    }
  }

  return entryPoints;
}

async function readManifestText(repoRoot: string, relativePath: string): Promise<string | null> {
  try {
    return await readFile(path.join(repoRoot, relativePath), "utf8");
  } catch {
    return null;
  }
}

function collectFrameworkSignals(params: {
  manifestFiles: string[];
  sourceFiles: string[];
  allFiles: string[];
  manifestTexts: Map<string, string | null>;
}): {
  frameworkHints: string[];
  testFrameworkHints: string[];
  testCommandHints: string[];
  ciHints: string[];
  warnings: string[];
} {
  const frameworkHints = new Set<string>();
  const testFrameworkHints = new Set<string>();
  const testCommandHints = new Set<string>();
  const ciHints = new Set<string>();
  const warnings = new Set<string>();

  const packageJsonText = params.manifestTexts.get("package.json") ?? null;
  const pyprojectText = params.manifestTexts.get("pyproject.toml") ?? null;
  const setupCfgText = params.manifestTexts.get("setup.cfg") ?? null;
  const pytestIniText = params.manifestTexts.get("pytest.ini") ?? null;
  const requirementsText = [
    params.manifestTexts.get("requirements.txt"),
    params.manifestTexts.get("requirements-dev.txt"),
    params.manifestTexts.get("requirements-prod.txt"),
  ]
    .filter((value): value is string => Boolean(value))
    .join("\n");

  if (params.manifestFiles.some((filePath) => getBasename(filePath) === "package.json")) {
    frameworkHints.add("Node.js");
  }

  if (
    params.sourceFiles.some((filePath) => hasExtension(filePath, [".ts", ".tsx"])) ||
    params.manifestFiles.some((filePath) => getBasename(filePath) === "tsconfig.json")
  ) {
    frameworkHints.add("TypeScript");
  }

  if (params.sourceFiles.some((filePath) => hasExtension(filePath, [".js", ".jsx", ".mjs", ".cjs"]))) {
    frameworkHints.add("JavaScript");
  }

  if (params.sourceFiles.some((filePath) => hasExtension(filePath, [".py", ".pyi"]))) {
    frameworkHints.add("Python");
  }

  if (packageJsonText) {
    if (/vitest/i.test(packageJsonText)) {
      frameworkHints.add("Vite");
      testFrameworkHints.add("Vitest");
      testCommandHints.add("vitest run");
    }

    if (/jest/i.test(packageJsonText)) {
      testFrameworkHints.add("Jest");
      testCommandHints.add("jest");
    }

    if (/mocha/i.test(packageJsonText)) {
      testFrameworkHints.add("Mocha");
      testCommandHints.add("mocha");
    }

    if (/node:test|--test/i.test(packageJsonText)) {
      testFrameworkHints.add("node:test");
      testCommandHints.add("node --test");
    }

    if (/express/i.test(packageJsonText)) {
      frameworkHints.add("Express");
    }

    if (/fastify/i.test(packageJsonText)) {
      frameworkHints.add("Fastify");
    }
  }

  const pythonTestSignal =
    /pytest/i.test(requirementsText) ||
    /pytest/i.test(pyprojectText ?? "") ||
    /pytest/i.test(setupCfgText ?? "") ||
    /pytest/i.test(pytestIniText ?? "") ||
    params.sourceFiles.some((filePath) => isTestFile(filePath) && hasExtension(filePath, [".py", ".pyi"]));

  if (pythonTestSignal) {
    testFrameworkHints.add("Pytest");
    testCommandHints.add("pytest");
    testCommandHints.add("python -m pytest");
  }

  if (pyprojectText && /\[tool\.poetry\]/i.test(pyprojectText)) {
    frameworkHints.add("Poetry");
  }

  if (testFrameworkHints.has("Pytest") && /poetry/i.test(pyprojectText ?? "")) {
    testCommandHints.add("poetry run pytest");
  }

  if (packageJsonText && /["']test["']\s*:\s*["'][^"']+/i.test(packageJsonText)) {
    testCommandHints.add("npm test");
  }

  if (params.allFiles.some((filePath) => normalizePathForComparison(filePath).startsWith(".github/workflows/"))) {
    ciHints.add("GitHub Actions");
  }

  if (params.allFiles.some((filePath) => normalizePathForComparison(filePath).startsWith(".gitlab-ci"))) {
    ciHints.add("GitLab CI");
  }

  if (params.allFiles.some((filePath) => normalizePathForComparison(filePath).includes("azure-pipelines"))) {
    ciHints.add("Azure Pipelines");
  }

  if (params.allFiles.some((filePath) => normalizePathForComparison(filePath).includes(".circleci/"))) {
    ciHints.add("CircleCI");
  }

  if (params.manifestFiles.length > 0 && testFrameworkHints.size === 0) {
    warnings.add("No test framework hint was detected during repo grounding.");
  }

  if (params.manifestFiles.length > 0 && testCommandHints.size === 0) {
    warnings.add("Manifest inspection did not reveal a test command, so tooling inference remains partial.");
  }

  return {
    frameworkHints: [...frameworkHints],
    testFrameworkHints: [...testFrameworkHints],
    testCommandHints: [...testCommandHints],
    ciHints: [...ciHints],
    warnings: [...warnings],
  };
}

function buildLayoutSummary(params: {
  languages: string[];
  packageManager: string | null;
  keyDirectories: string[];
  entryPoints: string[];
  manifestFiles: string[];
}): string {
  const parts: string[] = [];

  if (params.languages.length > 0) {
    parts.push(`languages: ${params.languages.join(", ")}`);
  }

  if (params.packageManager) {
    parts.push(`package manager: ${params.packageManager}`);
  }

  if (params.keyDirectories.length > 0) {
    parts.push(`key directories: ${params.keyDirectories.join(", ")}`);
  }

  if (params.entryPoints.length > 0) {
    parts.push(`entry points: ${params.entryPoints.join(", ")}`);
  }

  if (params.manifestFiles.length > 0) {
    parts.push(`manifests: ${params.manifestFiles.join(", ")}`);
  }

  return parts.length > 0
    ? parts.join("; ")
    : "No repository layout signals were detected.";
}

async function buildRepoSignals(
  repoRoot: string,
  files: string[],
  sourceFiles: string[],
  testFiles: string[],
  manifestFiles: string[],
): Promise<{
  signals: RepoScanSignals;
  warnings: string[];
}> {
  const languages = detectLanguages(files);
  const manifestTexts = new Map<string, string | null>();

  for (const manifestFile of manifestFiles) {
    manifestTexts.set(manifestFile, await readManifestText(repoRoot, manifestFile));
  }

  const packageManagerDetection = detectPackageManager({
    files,
    manifestTexts,
  });
  const frameworkSignals = collectFrameworkSignals({
    manifestFiles,
    sourceFiles,
    allFiles: files,
    manifestTexts,
  });
  const keyDirectories = collectKeyDirectories(files);
  const entryPoints = collectEntryPoints(sourceFiles);
  const warnings = [...frameworkSignals.warnings];

  if (packageManagerDetection.ecosystems.size > 1) {
    warnings.unshift(
      `Mixed package-manager clues were detected (${packageManagerDetection.clues.join(", ")}), so repo context kept the first strong match.`,
    );
  }

  if (testFiles.length === 0) {
    warnings.push("No tests were detected during repo grounding.");
  }

  return {
    signals: {
      sourceFileCount: sourceFiles.length,
      testFileCount: testFiles.length,
      manifestFileCount: manifestFiles.length,
      repoLooksSparse: sourceFiles.length + testFiles.length + manifestFiles.length <= 1,
      languages,
      packageManager: packageManagerDetection.packageManager,
      frameworkHints: frameworkSignals.frameworkHints,
      testFrameworkHints: frameworkSignals.testFrameworkHints,
      keyDirectories,
      entryPoints,
      testCommandHints: frameworkSignals.testCommandHints,
      ciHints: frameworkSignals.ciHints,
      layoutSummary: buildLayoutSummary({
        languages,
        packageManager: packageManagerDetection.packageManager,
        keyDirectories,
        entryPoints,
        manifestFiles,
      }),
    },
    warnings,
  };
}

async function buildRepoScanData(params: {
  repoRoot: string;
  outputRoot: string;
  gitContext: GitContext;
}): Promise<{
  repoContext: RepoContext;
  signals: RepoScanSignals;
  warnings: string[];
}> {
  const files: string[] = [];
  await collectRepoFiles(params.repoRoot, params.repoRoot, params.outputRoot, files);

  const allFiles = [...files].sort((left, right) => left.localeCompare(right));
  const manifestFiles = allFiles.filter((filePath) => isManifestFile(filePath));
  const testFiles = allFiles.filter((filePath) => isTestFile(filePath));
  const sourceFiles = allFiles.filter((filePath) => isSourceFile(filePath));
  const signalResult = await buildRepoSignals(
    params.repoRoot,
    allFiles,
    sourceFiles,
    testFiles,
    manifestFiles,
  );

  return {
    repoContext: {
      grounded:
        sourceFiles.length > 0 || testFiles.length > 0 || manifestFiles.length > 0,
      sourceFiles,
      testFiles,
      manifestFiles,
      allFiles,
      gitContext: params.gitContext,
      languages: signalResult.signals.languages,
      frameworkHints: signalResult.signals.frameworkHints,
      packageManager: signalResult.signals.packageManager,
      keyDirectories: signalResult.signals.keyDirectories,
      entryPoints: signalResult.signals.entryPoints,
      testFrameworkHints: signalResult.signals.testFrameworkHints,
      testCommandHints: signalResult.signals.testCommandHints,
      ciHints: signalResult.signals.ciHints,
      layoutSummary: signalResult.signals.layoutSummary,
    },
    signals: signalResult.signals,
    warnings: dedupeStable(signalResult.warnings),
  };
}

async function collectRepoFiles(
  repoRoot: string,
  currentPath: string,
  outputRoot: string,
  collected: string[],
): Promise<void> {
  const entries = await readdir(currentPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(currentPath, entry.name);
    const relativePath = normalizeRelativePath(repoRoot, fullPath);
    const outputRootRelative = path.relative(repoRoot, outputRoot).split(path.sep).join("/");

    if (entry.isDirectory()) {
      if (
        ignoredDirectoryNames.has(entry.name) ||
        fullPath === outputRoot ||
        relativePath === outputRootRelative
      ) {
        continue;
      }

      await collectRepoFiles(repoRoot, fullPath, outputRoot, collected);
      continue;
    }

    if (entry.isFile()) {
      collected.push(relativePath);
    }
  }
}

export async function scanRepoContext(
  repoRoot: string,
  outputRoot: string,
  gitContext: GitContext,
): Promise<RepoContext> {
  const scanData = await buildRepoScanData({
    repoRoot,
    outputRoot,
    gitContext,
  });

  return scanData.repoContext;
}

export async function scanRepoResult(
  repoRoot: string,
  outputRoot: string,
  gitContextResolutionOrRunner?: GitContextResolution | GitCommandRunner,
  gitCommandRunner?: GitCommandRunner,
): Promise<RepoScanResult> {
  const gitContextResult =
    gitContextResolutionOrRunner &&
    typeof gitContextResolutionOrRunner === "object" &&
    "gitContext" in gitContextResolutionOrRunner
      ? gitContextResolutionOrRunner
      : await resolveGitContext(
          repoRoot,
          typeof gitContextResolutionOrRunner === "function"
            ? gitContextResolutionOrRunner
            : gitCommandRunner,
        );
  const scanData = await buildRepoScanData({
    repoRoot,
    outputRoot,
    gitContext: gitContextResult.gitContext,
  });

  return {
    repoContext: scanData.repoContext,
    signals: scanData.signals,
    warnings: dedupeStable([
      ...(gitContextResult.warning ? [gitContextResult.warning] : []),
      ...scanData.warnings,
    ]),
  };
}
