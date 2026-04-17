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

import { promises as fs } from "fs";
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
 * Missing files produce a warning rather than crashing.
 */
export async function getChangedFileContents(
  executeArtifact: ExecuteArtifact,
  repoRoot: string
): Promise<ChangedFileContent[]> {
  const results: ChangedFileContent[] = [];
  const seenPaths = new Set<string>();

  for (const workstream of executeArtifact.workstreams) {
    if (!workstream.changesMade) continue;
    for (const change of workstream.changesMade) {
      if (change.action === "delete") continue; // skip deleted files
      if (seenPaths.has(change.file)) continue;
      seenPaths.add(change.file);

      try {
        const absolutePath = path.resolve(repoRoot, change.file);
        const content = await fs.readFile(absolutePath, "utf-8");
        results.push({ path: change.file, content, warning: null });
      } catch {
        results.push({
          path: change.file,
          content: null,
          warning: `Could not read file ${change.file} — file may not exist`,
        });
      }
    }
  }

  return results;
}

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

  // 3. Derive the goal
  const goal = extractGoal(ctx.planArtifact);

  // 4. Build each section
  const workstreamSection = buildWorkstreamSection(ctx.executeArtifact);
  const planSection = buildPlanSection(ctx.planArtifact);
  const constraintSection = buildConstraintSection(ctx.verifyArtifact);
  const fileSection = buildFileSection(changedFiles);

  // 5. Assemble the final prompt
  const prompt = assemblePrompt(
    goal,
    workstreamSection,
    planSection,
    constraintSection,
    fileSection,
    framework
  );

  // 6. Compute deterministic hash
  const promptHash = crypto.createHash("sha256").update(prompt).digest("hex");

  return {
    prompt,
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
 */
function buildFileSection(files: ChangedFileContent[]): string {
  if (files.length === 0) {
    return "No changed files to include.";
  }

  return files
    .map((fc) => {
      if (fc.content !== null) {
        return `FILE: ${fc.path}\n---\n${fc.content}\n---`;
      }
      return `FILE: ${fc.path}\n---\n[FILE NOT FOUND — may need to be created]\n---`;
    })
    .join("\n\n");
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
  framework: DetectedFramework
): string {
  return `# System Role
You are a skilled software engineer writing integration tests for a codebase.

# Goal
${goal}

# Workstream Execution Results
${workstreamSection}

# Plan Items
${planSection}

# Verification Constraints
${constraintSection}

# Changed Files
Below are the current contents of files that were changed by the AI execution:

${fileSection}

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
