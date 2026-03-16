import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { runIntakeCommand } from "../../src/intake/runner.js";

export interface ForgeRunResult {
  code: number;
  stdout: string;
  stderr: string;
}

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
  const result = await runIntakeCommand(options, cwd);
  const summary = result.summary ?? result.failure?.message ?? "";

  return {
    code: result.status === "failed" ? 1 : 0,
    stdout: result.status === "failed" ? "" : summary,
    stderr: result.status === "failed" ? summary : "",
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

function parseIntakeArgs(args: string[]): Record<string, string | string[] | undefined> {
  const options: Record<string, string | string[] | undefined> = {};

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
