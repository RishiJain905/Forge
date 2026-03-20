import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { formatIntakeCommandOutput } from "../../src/cli.js";
import { runIntakeCommand } from "../../src/intake/runner.js";
import type { GitContext, IntakeCommandOptions } from "../../src/intake/types.js";

export interface ForgeRunResult {
  code: number;
  stdout: string;
  stderr: string;
}

type TestIntakeCommandOptions = IntakeCommandOptions & {
  strictFocus?: boolean;
};

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(currentDirectory, "..", "..", "..");
const forgeEntrypointPath = resolve(projectRoot, "dist", "src", "index.js");

export async function createTempRepo(prefix = "forge-intake-"): Promise<string> {
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

export async function disposeTempRepo(repoRoot: string): Promise<void> {
  await rm(repoRoot, { force: true, recursive: true });
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function readJsonFile<T>(filePath: string): Promise<T> {
  const contents = await readFile(filePath, "utf8");
  return JSON.parse(contents) as T;
}

export async function readTextFile(filePath: string): Promise<string> {
  return readFile(filePath, "utf8");
}

export async function runForgeCli(args: string[], cwd: string): Promise<ForgeRunResult> {
  if (args[0] !== "intake") {
    throw new Error(`Unsupported test command: ${args.join(" ")}`);
  }

  const options = parseIntakeArgs(args.slice(1));
  const result = await runIntakeCommand(options as IntakeCommandOptions, cwd);
  const output = formatIntakeCommandOutput(result);

  return {
    code: result.status === "failed" ? 1 : 0,
    stdout: result.status === "failed" ? "" : output,
    stderr: result.status === "failed" ? output : "",
  };
}

export function runForgeBinary(args: string[], cwd: string): ForgeRunResult {
  const result = spawnSync(process.execPath, [forgeEntrypointPath, ...args], {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
    },
  });

  if (result.error) {
    throw result.error;
  }

  return {
    code: typeof result.status === "number" ? result.status : 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

export async function writeRepoFile(
  repoRoot: string,
  relativePath: string,
  contents: string,
): Promise<void> {
  const filePath = join(repoRoot, relativePath);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, contents, "utf8");
}

export function runGitCommand(repoRoot: string, args: string[]): string {
  return execFileSync(
    "git",
    [
      "-c",
      "core.autocrlf=false",
      "-c",
      "core.safecrlf=false",
      "-c",
      "core.eol=lf",
      ...args,
    ],
    {
    cwd: repoRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null",
    },
    },
  ).trim();
}

export function runGitCommandSilently(repoRoot: string, args: string[]): void {
  const result = spawnSync(
    "git",
    [
      "-c",
      "core.autocrlf=false",
      "-c",
      "core.safecrlf=false",
      "-c",
      "core.eol=lf",
      ...args,
    ],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        GIT_CONFIG_NOSYSTEM: "1",
        GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null",
      },
      stdio: "ignore",
    },
  );

  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed`);
  }
}

export async function initGitRepo(repoRoot: string): Promise<void> {
  runGitCommandSilently(repoRoot, ["init"]);
  runGitCommandSilently(repoRoot, ["symbolic-ref", "HEAD", "refs/heads/main"]);
  runGitCommandSilently(repoRoot, ["config", "user.name", "Forge Test"]);
  runGitCommandSilently(repoRoot, ["config", "user.email", "forge@example.com"]);
  runGitCommandSilently(repoRoot, ["config", "core.autocrlf", "false"]);
  runGitCommandSilently(repoRoot, ["config", "core.eol", "lf"]);
  runGitCommandSilently(repoRoot, ["config", "core.safecrlf", "false"]);
}

export async function gitCommitAll(repoRoot: string, message: string): Promise<void> {
  runGitCommandSilently(repoRoot, ["add", "-A"]);
  runGitCommandSilently(repoRoot, ["commit", "-m", message, "--quiet"]);
}

export async function gitCheckoutDetachedHead(repoRoot: string): Promise<void> {
  const headCommit = runGitCommand(repoRoot, ["rev-parse", "HEAD"]);
  runGitCommandSilently(repoRoot, ["checkout", "-q", "--detach", headCommit]);
}

export async function gitRenameBranch(repoRoot: string, branchName: string): Promise<void> {
  runGitCommandSilently(repoRoot, ["branch", "-M", branchName]);
}

export function createGitContext(overrides: Partial<GitContext> = {}): GitContext {
  return {
    status: "not_repo",
    repoRoot: null,
    branch: null,
    recentFiles: [],
    ...overrides,
  };
}

function parseIntakeArgs(args: string[]): TestIntakeCommandOptions {
  const options: TestIntakeCommandOptions = {};

  for (let index = 0; index < args.length; index += 1) {
    const current = args[index];
    const next = args[index + 1];

    if (current === "--repo") {
      if (!next) {
        throw new Error("Missing value for --repo");
      }

      options.repo = next;
      index += 1;
      continue;
    }

    if (current === "--output-dir") {
      if (!next) {
        throw new Error("Missing value for --output-dir");
      }

      options.outputDir = next;
      index += 1;
      continue;
    }

    if (current === "--spec") {
      if (!next) {
        throw new Error("Missing value for --spec");
      }

      options.spec = next;
      index += 1;
      continue;
    }

    if (current === "--prompt") {
      if (!next) {
        throw new Error("Missing value for --prompt");
      }

      options.prompt = next;
      index += 1;
      continue;
    }

    if (current === "--notes") {
      if (!next) {
        throw new Error("Missing value for --notes");
      }

      options.notes = next;
      index += 1;
      continue;
    }

    if (current === "--constraints") {
      if (!next) {
        throw new Error("Missing value for --constraints");
      }

      options.constraints = next;
      index += 1;
      continue;
    }

    if (current === "--config") {
      if (!next) {
        throw new Error("Missing value for --config");
      }

      options.config = next;
      index += 1;
      continue;
    }

    if (current === "--json-only") {
      options.jsonOnly = true;
      continue;
    }

    if (current === "--report-only") {
      options.reportOnly = true;
      continue;
    }

    if (current === "--llm-assist") {
      options.llmAssist = true;
      continue;
    }

    if (current === "--no-llm") {
      options.noLlm = true;
      continue;
    }

    if (current === "--fail-on-low-confidence") {
      options.failOnLowConfidence = true;
      continue;
    }

    if (current === "--strict-focus") {
      options.strictFocus = true;
      continue;
    }

    if (current === "--focus") {
      if (!next) {
        throw new Error("Missing value for --focus");
      }

      const existing = options.focus;
      const values = Array.isArray(existing)
        ? existing
        : existing
          ? [existing]
          : [];
      options.focus = [...values, next];
      index += 1;
      continue;
    }

    throw new Error(`Unsupported test flag: ${current}`);
  }

  return options;
}
