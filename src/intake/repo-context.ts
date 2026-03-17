import path from "node:path";
import { readdir } from "node:fs/promises";

import { resolveGitContext } from "./git-context.js";
import type {
  GitCommandRunner,
  GitContext,
  RepoContext,
  RepoScanResult,
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
  const files: string[] = [];
  await collectRepoFiles(repoRoot, repoRoot, outputRoot, files);

  const manifestFiles = files.filter((filePath) =>
    manifestFileNames.has(path.basename(filePath).toLowerCase()),
  );
  const testFiles = files.filter((filePath) => isTestFile(filePath));
  const sourceFiles = files.filter((filePath) => isSourceFile(filePath) && !isTestFile(filePath));

  return {
    grounded:
      sourceFiles.length > 0 || testFiles.length > 0 || manifestFiles.length > 0,
    sourceFiles,
    testFiles,
    manifestFiles,
    allFiles: files,
    gitContext,
  };
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
  const repoContext = await scanRepoContext(
    repoRoot,
    outputRoot,
    gitContextResult.gitContext,
  );

  return {
    repoContext,
    signals: {
      sourceFileCount: repoContext.sourceFiles.length,
      testFileCount: repoContext.testFiles.length,
      manifestFileCount: repoContext.manifestFiles.length,
      repoLooksSparse:
        repoContext.sourceFiles.length + repoContext.testFiles.length + repoContext.manifestFiles.length <= 1,
    },
    warnings: gitContextResult.warning ? [gitContextResult.warning] : [],
  };
}
