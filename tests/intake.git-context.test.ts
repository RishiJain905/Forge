import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { resolveGitContext } from "../src/intake/git-context.js";
import { resolveRepoRoot } from "../src/intake/path-policy.js";
import { runIntakeCommand } from "../src/intake/runner.js";
import type { GitCommandRunner } from "../src/intake/types.js";
import {
  createTempRepo,
  disposeTempRepo,
  gitCheckoutDetachedHead,
  gitCommitAll,
  initGitRepo,
  writeRepoFile,
} from "./support/forge-cli.js";

const STRUCTURED_PROMPT = [
  "Revise src/app.ts and tests/app.test.ts.",
  "",
  "Acceptance Criteria",
  "- src/app.ts is updated",
  "- tests/app.test.ts stays aligned",
].join("\n");

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

async function createGitRepoFixture(): Promise<{
  repoRoot: string;
  nestedCwd: string;
}> {
  const repoRoot = await createTempRepo();

  await initGitRepo(repoRoot);
  await gitCommitAll(repoRoot, "initial fixture commit");

  for (let index = 1; index <= 6; index += 1) {
    await writeRepoFile(
      repoRoot,
      `src/history/file-${index}.ts`,
      `export const history${index} = ${index};\n`,
    );
  }

  await gitCommitAll(repoRoot, "add recent history files");

  const nestedCwd = join(repoRoot, "nested", "workspace");
  await mkdir(nestedCwd, { recursive: true });

  return { repoRoot, nestedCwd };
}

function createMissingGitRunner(): GitCommandRunner {
  return async () => {
    const error = new Error("git is unavailable") as Error & { code?: string };
    error.code = "ENOENT";
    throw error;
  };
}

function createBrokenGitRunner(repoRoot: string): GitCommandRunner {
  return async (args) => {
    if (
      args[0] === "rev-parse" &&
      args[1] === "--show-toplevel"
    ) {
      return {
        code: 0,
        stdout: `${repoRoot}\n`,
        stderr: "",
      };
    }

    const error = new Error("simulated git failure") as Error & { code?: number };
    error.code = 1;
    throw error;
  };
}

function createBufferedNotRepoGitRunner(): GitCommandRunner {
  return async (args) => {
    if (
      args[0] !== "rev-parse" ||
      args[1] !== "--show-toplevel"
    ) {
      throw new Error(`Unexpected git command: ${args.join(" ")}`);
    }

    const error = new Error("Command failed") as Error & {
      code?: number;
      stdout?: Buffer;
      stderr?: Buffer;
    };
    error.code = 128;
    error.stdout = Buffer.from("");
    error.stderr = Buffer.from("fatal: not a git repository (or any of the parent directories): .git\n");
    throw error;
  };
}

async function runIntakeWithPrompt(
  cwd: string,
  gitCommandRunner?: GitCommandRunner,
): Promise<Awaited<ReturnType<typeof runIntakeCommand>>> {
  return runIntakeCommand(
    {
      prompt: STRUCTURED_PROMPT,
    },
    cwd,
    gitCommandRunner ? { gitCommandRunner } : undefined,
  );
}

await runScenario(
  "forge intake resolves git context once per run",
  async () => {
    const repoRoot = await createTempRepo();
    let showTopLevelCount = 0;
    let branchCount = 0;
    let logCount = 0;

    try {
      const result = await runIntakeCommand(
        {
          prompt: STRUCTURED_PROMPT,
        },
        repoRoot,
        {
          gitCommandRunner: async (args) => {
            if (args[0] === "rev-parse" && args[1] === "--show-toplevel") {
              showTopLevelCount += 1;
              return {
                code: 0,
                stdout: `${repoRoot}\n`,
                stderr: "",
              };
            }

            if (args[0] === "rev-parse" && args[1] === "--abbrev-ref") {
              branchCount += 1;
              return {
                code: 0,
                stdout: "main\n",
                stderr: "",
              };
            }

            if (args[0] === "log") {
              logCount += 1;
              return {
                code: 0,
                stdout: "src/app.ts\n",
                stderr: "",
              };
            }

            throw new Error(`Unexpected git command: ${args.join(" ")}`);
          },
        },
      );

      assert.notEqual(result.status, "failed");
      assert.equal(showTopLevelCount, 1);
      assert.equal(branchCount, 1);
      assert.equal(logCount, 1);
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "git-aware intake resolves nested worktree paths to the git top-level and records bounded recent files",
  async () => {
    const fixture = await createGitRepoFixture();

    try {
      const resolvedRepoRoot = await resolveRepoRoot(fixture.nestedCwd);
      assert.equal(resolvedRepoRoot, fixture.repoRoot);

      const result = await runIntakeWithPrompt(fixture.nestedCwd);
      assert.notEqual(result.status, "failed");
      assert.ok(result.artifact);
      assert.equal(result.artifact?.repoRoot, fixture.repoRoot);
      assert.equal(result.artifact?.repo_context.git_context.status, "available");
      assert.equal(result.artifact?.repo_context.git_context.repo_root, fixture.repoRoot);
      assert.match(result.artifact?.repo_context.git_context.branch ?? "", /\S/);
      assert.ok((result.artifact?.repo_context.git_context.recent_files.length ?? 0) > 0);
      assert.ok((result.artifact?.repo_context.git_context.recent_files.length ?? 0) <= 5);
      assert.ok(
        result.artifact?.repo_context.git_context.recent_files.some((file) =>
          file.startsWith("src/history/"),
        ),
      );
    } finally {
      await disposeTempRepo(fixture.repoRoot);
    }
  },
);

await runScenario(
  "git-context preserves buffered stderr when identifying not_repo failures",
  async () => {
    const repoRoot = await createTempRepo();

    try {
      const result = await resolveGitContext(repoRoot, createBufferedNotRepoGitRunner());

      assert.equal(result.gitContext.status, "not_repo");
      assert.equal(result.warning, null);
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "plain folders keep filesystem grounding and report git status not_repo",
  async () => {
    const repoRoot = await createTempRepo();

    try {
      const result = await runIntakeWithPrompt(repoRoot);

      assert.equal(result.status, "success");
      assert.ok(result.artifact);
      assert.equal(result.artifact?.repo_context.git_context.status, "not_repo");
      assert.equal(result.artifact?.repo_context.git_context.repo_root, null);
      assert.equal(result.artifact?.repo_context.git_context.branch, null);
      assert.deepEqual(result.artifact?.warnings ?? [], []);
      assert.deepEqual(result.artifact?.risk_analysis.supporting_analysis.warning_items ?? [], []);
    } finally {
      await disposeTempRepo(repoRoot);
    }
  },
);

await runScenario(
  "injected missing git keeps intake running and records git status unavailable",
  async () => {
    const fixture = await createGitRepoFixture();

    try {
      const result = await runIntakeWithPrompt(
        fixture.repoRoot,
        createMissingGitRunner(),
      );

      assert.notEqual(result.status, "failed");
      assert.ok(result.artifact);
      assert.equal(result.artifact?.repoRoot, fixture.repoRoot);
      assert.equal(result.artifact?.repo_context.git_context.status, "unavailable");
      assert.equal(result.artifact?.repo_context.git_context.repo_root, null);
      assert.equal(
        (result.artifact?.warnings ?? []).filter((value) => /filesystem grounding/i.test(value)).length,
        0,
      );
    } finally {
      await disposeTempRepo(fixture.repoRoot);
    }
  },
);

await runScenario(
  "injected git command failure records status error and warns that filesystem grounding was used instead",
  async () => {
    const fixture = await createGitRepoFixture();

    try {
      const result = await runIntakeWithPrompt(
        fixture.repoRoot,
        createBrokenGitRunner(fixture.repoRoot),
      );

      assert.equal(result.status, "warning");
      assert.ok(result.artifact);
      assert.equal(result.artifact?.repoRoot, fixture.repoRoot);
      assert.equal(result.artifact?.repo_context.git_context.status, "error");
      assert.equal(result.artifact?.repo_context.git_context.repo_root, null);
      assert.ok(
        result.artifact?.warnings.some((value) =>
          /filesystem grounding/i.test(value),
        ),
        "expected a warning that filesystem grounding was used instead",
      );
      assert.ok(
        result.artifact?.risk_analysis.supporting_analysis.warning_items.some((item) =>
          item.code === "GIT_CONTEXT_FAILED",
        ),
        "expected a structured git-context failure warning item",
      );
    } finally {
      await disposeTempRepo(fixture.repoRoot);
    }
  },
);

await runScenario(
  "detached HEAD still reports available git context with no branch name",
  async () => {
    const fixture = await createGitRepoFixture();

    try {
      await gitCheckoutDetachedHead(fixture.repoRoot);

      const result = await runIntakeWithPrompt(fixture.repoRoot);

      assert.notEqual(result.status, "failed");
      assert.ok(result.artifact);
      assert.equal(result.artifact?.repo_context.git_context.status, "available");
      assert.equal(result.artifact?.repo_context.git_context.branch, null);
      assert.equal(result.artifact?.repo_context.git_context.repo_root, fixture.repoRoot);
    } finally {
      await disposeTempRepo(fixture.repoRoot);
    }
  },
);

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode);
}
