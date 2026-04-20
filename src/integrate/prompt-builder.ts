// ---------------------------------------------------------------------------
// Integrate step — AI prompt builder
// ---------------------------------------------------------------------------
// Constructs the integration test prompt that is sent to the AI model.
// Uses context from execute, plan, and verify artifacts to build a rich
// prompt that guides the AI to generate integration tests.
//
// Three exported functions:
//   detectTestFramework(repoRoot)      — detect jest/vitest/mocha/pytest
//   getChangedFileContents(exec, root)  — read changed files from disk
//   buildIntegrationTestPrompt(ctx)     — assemble the full AI prompt
// ---------------------------------------------------------------------------

import { promises as fs, Dirent } from "fs";
import path from "node:path";
import crypto from "node:crypto";

import type { ExecuteArtifact, ExecuteWorkstream } from "../execute/types.js";
import type { PlanArtifact, PlanItem } from "../plan/types.js";
import type { VerifyArtifact } from "../verify/types.js";
import type { PromptBuildContext, BuiltPrompt } from "./types.js";

// ---------------------------------------------------------------------------
// DetectedFramework — result of framework auto-detection
// ---------------------------------------------------------------------------

export interface DetectedFramework {
  /** Framework name, e.g. "jest", "vitest", "pytest". */
  name: string;
  /** Primary language of the project, e.g. "typescript", "python". */
  language: string;
  /** Command used to run the tests. */
  testCommand: string;
}

// ---------------------------------------------------------------------------
// ChangedFileContent — a single file's content read from disk
// ---------------------------------------------------------------------------

export interface ChangedFileContent {
  /** Repository-relative path of the file. */
  path: string;
  /** File content if successfully read; null if the file could not be read. */
  content: string | null;
  /** Warning if the file could not be read; null on success. */
  warning: string | null;
}

// ---------------------------------------------------------------------------
// detectTestFramework
// ---------------------------------------------------------------------------

/**
 * Auto-detect the test framework by inspecting package.json scripts and
 * dependencies, or Python configuration files.
 *
 * Detection order:
 *  1. package.json — scripts.test, devDependencies, dependencies
 *  2. pytest.ini   — existence of the file
 *  3. pyproject.toml — [tool.pytest] section
 *  4. Fallback — { name: "npm", language: "unknown", testCommand: "npm test" }
 */
export async function detectTestFramework(
  repoRoot: string
): Promise<DetectedFramework> {
  // --- JS/TS frameworks from package.json ---

  try {
    const pkgPath = path.resolve(repoRoot, "package.json");
    const raw = await fs.readFile(pkgPath, "utf-8");
    const pkg = JSON.parse(raw) as {
      scripts?: Record<string, string>;
      devDependencies?: Record<string, string>;
      dependencies?: Record<string, string>;
    };

    const testScript = pkg.scripts?.test ?? "";
    const devDeps = pkg.devDependencies ?? {};
    const deps = pkg.dependencies ?? {};

    // vitest has priority when present alongside jest
    if (
      testScript.includes("vitest") ||
      "vitest" in devDeps ||
      "vitest" in deps
    ) {
      return { name: "vitest", language: "typescript", testCommand: "npx vitest run" };
    }

    if (
      testScript.includes("jest") ||
      "jest" in devDeps ||
      "jest" in deps
    ) {
      return { name: "jest", language: "typescript", testCommand: "npx jest" };
    }

    if (
      testScript.includes("mocha") ||
      "mocha" in devDeps ||
      "mocha" in deps
    ) {
      return { name: "mocha", language: "javascript", testCommand: "npx mocha" };
    }
  } catch {
    // No package.json or invalid JSON — continue to Python detection
  }

  // --- Python frameworks ---

  try {
    await fs.access(path.resolve(repoRoot, "pytest.ini"));
    return { name: "pytest", language: "python", testCommand: "pytest" };
  } catch {
    // Not found
  }

  try {
    const pyprojectPath = path.resolve(repoRoot, "pyproject.toml");
    const content = await fs.readFile(pyprojectPath, "utf-8");
    if (content.includes("[tool.pytest")) {
      return { name: "pytest", language: "python", testCommand: "pytest" };
    }
  } catch {
    // Not found or unreadable
  }

  // --- Fallback ---

  return { name: "npm", language: "unknown", testCommand: "npm test" };
}

// ---------------------------------------------------------------------------
// deriveFrameworkFromOverride
// ---------------------------------------------------------------------------

/**
 * Derive a DetectedFramework from a user-provided framework override name.
 * Maps well-known framework names to appropriate language and testCommand
 * values. Falls back to "typescript" / "npm test" for unknown frameworks.
 */
export function deriveFrameworkFromOverride(
  override: string
): DetectedFramework {
  const name = override.trim();

  // Python frameworks
  if (name === "pytest") {
    return { name: "pytest", language: "python", testCommand: "pytest" };
  }
  if (name === "unittest") {
    return { name: "unittest", language: "python", testCommand: "python -m unittest" };
  }

  // JavaScript/TypeScript frameworks
  if (name === "vitest") {
    return { name: "vitest", language: "typescript", testCommand: "npx vitest run" };
  }
  if (name === "jest") {
    return { name: "jest", language: "typescript", testCommand: "npx jest" };
  }
  if (name === "mocha") {
    return { name: "mocha", language: "javascript", testCommand: "npx mocha" };
  }

  // Catch-all: derive language from name heuristics
  const language = name.toLowerCase().includes("python") || name.toLowerCase().includes("py")
    ? "python"
    : "typescript";
  const testCommand = language === "python" ? "pytest" : "npm test";

  return { name, language, testCommand };
}

// ---------------------------------------------------------------------------
// getChangedFileContents
// ---------------------------------------------------------------------------

/**
 * Read the contents of every file that was changed (created/modified) across
 * all workstreams in the execute artifact. Deduplicates by path so that files
 * changed by multiple workstreams are read only once.
 *
 * Files are read in parallel using Promise.all for performance.
 * Missing files produce a warning rather than crashing.
 */
export async function getChangedFileContents(
  executeArtifact: ExecuteArtifact,
  repoRoot: string
): Promise<ChangedFileContent[]> {
  // Phase A: Collect file entries first (deduplication + path traversal guards)
  const seenPaths = new Set<string>();
  const entriesToRead: { filePath: string; absolutePath: string }[] = [];
  const pathTraversalResults: ChangedFileContent[] = [];

  for (const workstream of executeArtifact.workstreams) {
    if (!workstream.changesMade) continue;
    for (const change of workstream.changesMade) {
      if (change.action === "delete") continue; // skip deleted files
      if (seenPaths.has(change.file)) continue;
      seenPaths.add(change.file);

      // Reject absolute paths before resolving — path traversal guard
      if (path.isAbsolute(change.file)) {
        pathTraversalResults.push({
          path: change.file,
          content: null,
          warning: "Absolute path rejected — path traversal detected",
        });
        continue;
      }

      const absolutePath = path.resolve(repoRoot, change.file);

      // Verify resolved path stays within repoRoot — path traversal guard
      const relativeFromRoot = path.relative(repoRoot, absolutePath);
      if (relativeFromRoot.startsWith("..") || path.isAbsolute(relativeFromRoot)) {
        pathTraversalResults.push({
          path: change.file,
          content: null,
          warning: "Path traversal detected — resolves outside repo root",
        });
        continue;
      }

      entriesToRead.push({ filePath: change.file, absolutePath });
    }
  }

  // Phase A: Read all files in parallel using Promise.all
  const readResults = await Promise.all(
    entriesToRead.map(async ({ filePath, absolutePath }) => {
      try {
        const content = await fs.readFile(absolutePath, "utf-8");
        return { path: filePath, content, warning: null } as ChangedFileContent;
      } catch {
        return {
          path: filePath,
          content: null,
          warning: `Could not read file ${filePath} — file may not exist`,
        } as ChangedFileContent;
      }
    })
  );

  return [...pathTraversalResults, ...readResults];
}

// ---------------------------------------------------------------------------
// discoverExistingTests
// ---------------------------------------------------------------------------

/** Test file patterns to match. */
const TEST_FILE_PATTERNS = [
  /\.test\.ts$/,
  /\.spec\.ts$/,
  /\.test\.js$/,
  /\.spec\.js$/,
  /_test\.py$/,
  /_spec\.rb$/,
];

/** Directories to exclude when walking the test tree. */
const EXCLUDED_DIRS = new Set(["node_modules", "dist"]);

/**
 * Discover existing test files under the `tests/` directory of the repo.
 * Returns a deduplicated list of repo-relative paths (relative to repoRoot).
 * If no `tests/` directory exists, returns an empty array.
 */
export async function discoverExistingTests(repoRoot: string): Promise<string[]> {
  const testsDir = path.join(repoRoot, "tests");

  try {
    await fs.access(testsDir);
  } catch {
    return [];
  }

  const results: string[] = [];

  async function walkDir(dir: string): Promise<void> {
    let entries: Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (EXCLUDED_DIRS.has(entry.name)) {
          continue;
        }
        await walkDir(path.join(dir, entry.name));
      } else if (entry.isFile()) {
        const relativePath = path.relative(repoRoot, path.join(dir, entry.name));
        if (TEST_FILE_PATTERNS.some((pattern) => pattern.test(entry.name))) {
          results.push(relativePath);
        }
      }
    }
  }

  await walkDir(testsDir);

  // Deduplicate
  return [...new Set(results)];
}

// ---------------------------------------------------------------------------
// Context warning threshold
// ---------------------------------------------------------------------------

/** Estimated-token threshold above which a context warning is appended. */
export const CONTEXT_WARNING_THRESHOLD = 100_000;

// ---------------------------------------------------------------------------
// buildIntegrationTestPrompt
// ---------------------------------------------------------------------------

/**
 * Assemble the full integration-test prompt from execute, plan, and verify
 * context. The prompt instructs the AI to generate integration tests that
 * cover the combined result of all workstreams.
 *
 * Returns a BuiltPrompt containing the prompt text, a SHA-256 hash for
 * deterministic tracking, and the detected framework name.
 */
export async function buildIntegrationTestPrompt(
  ctx: PromptBuildContext
): Promise<BuiltPrompt> {
  // 1. Detect or use overridden framework
  const hasOverride = ctx.testFramework != null && ctx.testFramework.length > 0;

  const framework: DetectedFramework = hasOverride
    ? deriveFrameworkFromOverride(ctx.testFramework!)
    : await detectTestFramework(ctx.repoRoot);

  // 2. Collect changed file contents
  const changedFiles = await getChangedFileContents(
    ctx.executeArtifact,
    ctx.repoRoot
  );

  // 3. Discover existing tests (Phase B)
  const existingTests = await discoverExistingTests(ctx.repoRoot);

  // 4. Derive the goal
  const goal = extractGoal(ctx.planArtifact);

  // 5. Build each section
  const workstreamSection = buildWorkstreamSection(ctx.executeArtifact);
  const planSection = buildPlanSection(ctx.planArtifact);
  const constraintSection = buildConstraintSection(ctx.verifyArtifact);
  const fileSection = buildFileSection(changedFiles);
  const existingTestsSection = buildExistingTestsSection(existingTests);
  const healthSection = ctx.workstreamHealthContext
    ? `\n${ctx.workstreamHealthContext}\n`
    : "";

  // 6. Assemble the final prompt
  const prompt = assemblePrompt(
    goal,
    workstreamSection,
    planSection,
    constraintSection,
    fileSection,
    existingTestsSection,
    framework,
    healthSection,
    changedFiles.length
  );

  // Phase C: Context size warning
  const estimatedTokens = Math.ceil(prompt.length / 4);
  let contextWarning = "";
  if (estimatedTokens > CONTEXT_WARNING_THRESHOLD) {
    contextWarning = `\n\n⚠️ WARNING: Prompt is estimated at ~${estimatedTokens.toLocaleString()} tokens, which may approach context limits. Consider using --focus to narrow scope.`;
  }

  const finalPrompt = prompt + contextWarning;

  // 7. Compute deterministic hash (must hash finalPrompt, not prompt, so hashes are deterministic)
  const promptHash = crypto.createHash("sha256").update(finalPrompt).digest("hex");

  return {
    prompt: finalPrompt,
    promptHash,
    detectedFramework: framework.name,
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Extract the goal from the plan artifact.
 * Tries carry_forward.task_spec.goal, then purpose, then summary, then fallback.
 */
function extractGoal(planArtifact: PlanArtifact): string {
  const cf = planArtifact.carry_forward as
    | { task_spec?: { goal?: string } }
    | undefined;

  if (cf?.task_spec?.goal) {
    return cf.task_spec.goal;
  }

  if ((planArtifact as { purpose?: string }).purpose) {
    return (planArtifact as { purpose: string }).purpose;
  }

  return planArtifact.summary || "Unknown goal";
}

/**
 * Build a section summarising workstream execution outcomes.
 */
function buildWorkstreamSection(
  executeArtifact: ExecuteArtifact
): string {
  const workstreams = executeArtifact.workstreams;

  if (workstreams.length === 0) {
    return "No workstreams were executed.";
  }

  const lines: string[] = [];
  const completed = workstreams.filter((w) => w.state === "completed").length;
  const failed = workstreams.filter((w) => w.state === "failed").length;
  const other = workstreams.length - completed - failed;

  lines.push(
    `Total: ${workstreams.length} workstreams — ${completed} completed, ${failed} failed, ${other} other`
  );
  lines.push("");

  for (const ws of workstreams) {
    const changesCount = ws.changesMade?.length ?? 0;
    lines.push(
      `- [${ws.state}] ${ws.title} (${ws.workstreamId}): ${changesCount} file change(s)`
    );

    if (ws.error) {
      lines.push(`  Error: ${ws.error}`);
    }
  }

  return lines.join("\n");
}

/**
 * Build a section summarising relevant plan items.
 */
function buildPlanSection(planArtifact: PlanArtifact): string {
  const items = planArtifact.plan_items;

  if (items.length === 0) {
    return "No plan items found.";
  }

  const lines: string[] = [];
  lines.push(`${items.length} plan item(s):`);
  lines.push("");

  for (const item of items) {
    lines.push(
      `- ${item.title}: category=${item.category}, risk=${item.riskLevel}`
    );
    if (item.likelyAffectedPaths.length > 0) {
      lines.push(`  Affected paths: ${item.likelyAffectedPaths.join(", ")}`);
    }
  }

  return lines.join("\n");
}

/**
 * Build a section listing verification findings and constraints.
 */
function buildConstraintSection(verifyArtifact: VerifyArtifact): string {
  const lines: string[] = [];

  const findings = verifyArtifact.findings ?? [];
  const constraints = verifyArtifact.constraints ?? [];

  if (findings.length > 0) {
    lines.push("FINDINGS:");
    for (const f of findings) {
      lines.push(`  - [${f.status}] ${f.summary}`);
    }
  }

  if (constraints.length > 0) {
    lines.push("CONSTRAINTS:");
    for (const c of constraints) {
      lines.push(`  - ${c.summary}`);
    }
  }

  if (lines.length === 0) {
    return "No specific constraints detected.";
  }

  return lines.join("\n");
}

/**
 * Build a section showing the current content of changed files.
 * Phase D: Caps output at 20 files with overflow note when there are more.
 */
function buildFileSection(files: ChangedFileContent[]): string {
  if (files.length === 0) {
    return "No changed files to include.";
  }

  const FILE_CAP = 20;
  const capped = files.length > FILE_CAP ? files.slice(0, FILE_CAP) : files;
  const overflow = files.length - FILE_CAP;

  const contentParts = capped
    .map((fc) => {
      if (fc.content !== null) {
        return `FILE: ${fc.path}\n---\n${fc.content}\n---`;
      }
      return `FILE: ${fc.path}\n---\n[FILE NOT FOUND — may need to be created]\n---`;
    })
    .join("\n\n");

  if (overflow > 0) {
    return `${contentParts}\n\n... and ${overflow} more file${overflow === 1 ? "" : "s"}`;
  }

  return contentParts;
}

/**
 * Build a section listing existing test files (Phase B).
 */
function buildExistingTestsSection(existingTests: string[]): string {
  if (existingTests.length === 0) {
    return "(no existing tests found)";
  }
  return existingTests.map((p) => `- ${p}`).join("\n");
}

/**
 * Assemble all sections into the final prompt string.
 */
function assemblePrompt(
  goal: string,
  workstreamSection: string,
  planSection: string,
  constraintSection: string,
  fileSection: string,
  existingTestsSection: string,
  framework: DetectedFramework,
  healthSection: string = "",
  changedFileCount: number = 0
): string {
  // Phase D: Dynamic header for changed files section
  const fileHeader = changedFileCount > 20
    ? `# CHANGED FILES (${changedFileCount} files — showing first 20)`
    : `# Changed Files`;

  return `# System Role
You are a skilled software engineer writing integration tests for a codebase.

# Goal
${goal}

# Workstream Execution Results
${workstreamSection}
${healthSection}# Plan Items
${planSection}

# Verification Constraints
${constraintSection}

${fileHeader}
Below are the current contents of files that were changed by the AI execution:

${fileSection}

# Existing Tests
${existingTestsSection}

# Test Framework
Detected framework: ${framework.name}
Language: ${framework.language}
Test command: ${framework.testCommand}

# Your Task
Write integration tests that verify the combined result of all workstreams works correctly together.
The tests should cover the goal described above and validate the implementation against the constraints listed.

Produce a JSON array of test file objects with this shape:
[
  {
    "path": "path/to/test.file.ext",
    "content": "full test file content",
    "language": "typescript" | "python" | "javascript",
    "framework": "${framework.name}",
    "testCount": <number of test cases in the file>
  }
]

# Rules
1. Write tests that exercise the goal described above
2. Respect all constraints from the Verify step
3. Use the detected test framework (${framework.name})
4. Test the combined behavior of all workstreams together
5. Include both happy-path and error-case tests
6. Each test file must be self-contained and runnable`;
}
