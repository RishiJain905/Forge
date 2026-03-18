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
  "node_modules",
  "dist",
  "dist-tests",
]);

const manifestFileNames = new Set([
  "package.json",
  "tsconfig.json",
  "pyproject.toml",
  "go.mod",
  "cargo.toml",
]);

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

function isTestFile(relativePath: string): boolean {
  return (
    relativePath.includes("/tests/") ||
    relativePath.includes("/__tests__/") ||
    /\.test\./i.test(relativePath) ||
    /\.spec\./i.test(relativePath)
  );
}

function isSourceFile(relativePath: string): boolean {
  return (
    relativePath.startsWith("src/") ||
    relativePath.startsWith("app/") ||
    relativePath.startsWith("lib/")
  );
}

function hasExtension(relativePath: string, extensions: string[]): boolean {
  return extensions.some((extension) => relativePath.toLowerCase().endsWith(extension));
}

function detectLanguages(files: string[]): string[] {
  const languages = new Set<string>();

  for (const filePath of files) {
    const normalizedPath = filePath.toLowerCase();

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

function detectPackageManager(files: string[]): string | null {
  if (files.some((filePath) => path.posix.basename(filePath).toLowerCase() === "bun.lockb")) {
    return "bun";
  }

  if (files.some((filePath) => path.posix.basename(filePath).toLowerCase() === "bun.lock")) {
    return "bun";
  }

  if (files.some((filePath) => path.posix.basename(filePath).toLowerCase() === "pnpm-lock.yaml")) {
    return "pnpm";
  }

  if (files.some((filePath) => path.posix.basename(filePath).toLowerCase() === "yarn.lock")) {
    return "yarn";
  }

  if (files.some((filePath) => path.posix.basename(filePath).toLowerCase() === "package-lock.json")) {
    return "npm";
  }

  if (files.some((filePath) => path.posix.basename(filePath).toLowerCase() === "package.json")) {
    return "npm";
  }

  return null;
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
    /(^|\/)(app|index|main|server|cli)\.(ts|tsx|js|jsx|mjs|cjs)$/i.test(filePath),
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

function collectFrameworkHints(params: {
  manifestFiles: string[];
  sourceFiles: string[];
  packageJsonText: string | null;
}): { frameworkHints: string[]; testFrameworkHints: string[] } {
  const frameworkHints = new Set<string>();
  const testFrameworkHints = new Set<string>();

  if (params.manifestFiles.some((filePath) => path.posix.basename(filePath).toLowerCase() === "package.json")) {
    frameworkHints.add("Node.js");
  }

  if (
    params.sourceFiles.some((filePath) => hasExtension(filePath, [".ts", ".tsx"])) ||
    params.manifestFiles.some((filePath) => path.posix.basename(filePath).toLowerCase() === "tsconfig.json")
  ) {
    frameworkHints.add("TypeScript");
  }

  if (params.sourceFiles.some((filePath) => hasExtension(filePath, [".js", ".jsx", ".mjs", ".cjs"]))) {
    frameworkHints.add("JavaScript");
  }

  if (params.packageJsonText) {
    if (/vitest/i.test(params.packageJsonText)) {
      frameworkHints.add("Vite");
      testFrameworkHints.add("Vitest");
    }

    if (/jest/i.test(params.packageJsonText)) {
      testFrameworkHints.add("Jest");
    }

    if (/mocha/i.test(params.packageJsonText)) {
      testFrameworkHints.add("Mocha");
    }

    if (/node:test|--test/i.test(params.packageJsonText)) {
      testFrameworkHints.add("node:test");
    }

    if (/express/i.test(params.packageJsonText)) {
      frameworkHints.add("Express");
    }

    if (/fastify/i.test(params.packageJsonText)) {
      frameworkHints.add("Fastify");
    }
  }

  return {
    frameworkHints: [...frameworkHints],
    testFrameworkHints: [...testFrameworkHints],
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
): Promise<RepoScanSignals> {
  const languages = detectLanguages(files);
  const packageManager = detectPackageManager(files);
  const packageJsonText = manifestFiles.includes("package.json")
    ? await readManifestText(repoRoot, "package.json")
    : null;
  const { frameworkHints, testFrameworkHints } = collectFrameworkHints({
    manifestFiles,
    sourceFiles,
    packageJsonText,
  });
  const keyDirectories = collectKeyDirectories(files);
  const entryPoints = collectEntryPoints(sourceFiles);

  return {
    sourceFileCount: sourceFiles.length,
    testFileCount: testFiles.length,
    manifestFileCount: manifestFiles.length,
    repoLooksSparse: sourceFiles.length + testFiles.length + manifestFiles.length <= 1,
    languages,
    packageManager,
    frameworkHints,
    testFrameworkHints,
    keyDirectories,
    entryPoints,
    layoutSummary: buildLayoutSummary({
      languages,
      packageManager,
      keyDirectories,
      entryPoints,
      manifestFiles,
    }),
  };
}

async function buildRepoScanData(params: {
  repoRoot: string;
  outputRoot: string;
  gitContext: GitContext;
}): Promise<{
  repoContext: RepoContext;
  signals: RepoScanSignals;
}> {
  const files: string[] = [];
  await collectRepoFiles(params.repoRoot, params.repoRoot, params.outputRoot, files);

  const allFiles = [...files].sort((left, right) => left.localeCompare(right));
  const manifestFiles = allFiles.filter((filePath) =>
    manifestFileNames.has(path.posix.basename(filePath).toLowerCase()),
  );
  const testFiles = allFiles.filter((filePath) => isTestFile(filePath));
  const sourceFiles = allFiles.filter((filePath) => isSourceFile(filePath) && !isTestFile(filePath));
  const signals = await buildRepoSignals(
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
      languages: signals.languages,
      frameworkHints: signals.frameworkHints,
      packageManager: signals.packageManager,
      keyDirectories: signals.keyDirectories,
      entryPoints: signals.entryPoints,
      testFrameworkHints: signals.testFrameworkHints,
      layoutSummary: signals.layoutSummary,
    },
    signals,
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

    if (entry.isDirectory()) {
      if (
        ignoredDirectoryNames.has(entry.name) ||
        fullPath === outputRoot ||
        relativePath === path.relative(repoRoot, outputRoot).split(path.sep).join("/")
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
    warnings: gitContextResult.warning ? [gitContextResult.warning] : [],
  };
}
