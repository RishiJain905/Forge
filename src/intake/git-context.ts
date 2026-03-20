import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import type {
  GitCommandResult,
  GitCommandRunner,
  GitContext,
} from "./types.js";

import { hasErrorCode, extractErrorCode } from "./errors.js";

const execFileAsync = promisify(execFile);
const RECENT_COMMIT_COUNT = 3;
const RECENT_FILE_LIMIT = 5;
const GIT_FILESYSTEM_WARNING =
  "Git enrichment failed, so filesystem grounding was used instead.";

interface GitCommandOutcome {
  kind: "success" | "missing" | "not_repo" | "other_error";
  result: GitCommandResult;
}

function createUnavailableGitContext(): GitContext {
  return {
    status: "unavailable",
    repoRoot: null,
    branch: null,
    recentFiles: [],
  };
}

function createNotRepoGitContext(): GitContext {
  return {
    status: "not_repo",
    repoRoot: null,
    branch: null,
    recentFiles: [],
  };
}

function createErrorGitContext(): GitContext {
  return {
    status: "error",
    repoRoot: null,
    branch: null,
    recentFiles: [],
  };
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : typeof error === "string"
      ? error
      : "";
}

function toGitCommandResult(error: unknown): GitCommandResult {
  const code = extractErrorCode(error) ?? null;
  const stdout = typeof error === "object" && error !== null && "stdout" in error
    ? (error as { stdout: unknown }).stdout
    : "";
  const stderr = typeof error === "object" && error !== null && "stderr" in error
    ? (error as { stderr: unknown }).stderr
    : "";

  return {
    code: typeof code === "number"
      ? code
      : typeof code === "string" && Number.isFinite(Number(code))
        ? Number(code)
        : 1,
    stdout: typeof stdout === "string" ? stdout : String(stdout ?? ""),
    stderr: typeof stderr === "string" ? stderr : String(stderr ?? getErrorMessage(error)),
  };
}

function isMissingGitError(error: unknown): boolean {
  return hasErrorCode(error, "ENOENT") || /ENOENT|spawn git/i.test(getErrorMessage(error));
}

function isMissingGitResult(result: GitCommandResult): boolean {
  return result.code === -1 || /ENOENT|spawn git/i.test(result.stderr);
}

function isNotRepoResult(result: GitCommandResult): boolean {
  return /not a git repository/i.test(result.stderr);
}

function normalizeGitRoot(stdout: string): string {
  return path.resolve(stdout.trim());
}

function normalizeRecentFiles(stdout: string): string[] {
  const files: string[] = [];

  for (const line of stdout.split(/\r?\n/)) {
    const filePath = line.trim();

    if (!filePath || files.includes(filePath)) {
      continue;
    }

    files.push(filePath);

    if (files.length >= RECENT_FILE_LIMIT) {
      break;
    }
  }

  return files;
}

async function defaultGitCommandRunner(
  args: string[],
  cwd: string,
): Promise<GitCommandResult> {
  const result = await execFileAsync("git", args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
  });

  return {
    code: 0,
    stdout: typeof result.stdout === "string" ? result.stdout : String(result.stdout ?? ""),
    stderr: typeof result.stderr === "string" ? result.stderr : String(result.stderr ?? ""),
  };
}

async function executeGitCommand(
  args: string[],
  cwd: string,
  gitCommandRunner: GitCommandRunner = defaultGitCommandRunner,
): Promise<GitCommandOutcome> {
  try {
    const result = await gitCommandRunner(args, cwd);

    if (isMissingGitResult(result)) {
      return {
        kind: "missing",
        result,
      };
    }

    if (result.code === 0) {
      return {
        kind: "success",
        result,
      };
    }

    if (isNotRepoResult(result)) {
      return {
        kind: "not_repo",
        result,
      };
    }

    return {
      kind: "other_error",
      result,
    };
  } catch (error) {
    const result = toGitCommandResult(error);

    if (isMissingGitError(error) || isMissingGitResult(result)) {
      return {
        kind: "missing",
        result,
      };
    }

    if (isNotRepoResult(result)) {
      return {
        kind: "not_repo",
        result,
      };
    }

    return {
      kind: "other_error",
      result,
    };
  }
}

export interface GitContextResolution {
  gitContext: GitContext;
  warning: string | null;
}

export async function resolveGitContext(
  repoRoot: string,
  gitCommandRunner?: GitCommandRunner,
): Promise<GitContextResolution> {
  const topLevelOutcome = await executeGitCommand(
    ["rev-parse", "--show-toplevel"],
    repoRoot,
    gitCommandRunner,
  );

  if (topLevelOutcome.kind === "missing") {
    return {
      gitContext: createUnavailableGitContext(),
      warning: null,
    };
  }

  if (topLevelOutcome.kind === "not_repo") {
    return {
      gitContext: createNotRepoGitContext(),
      warning: null,
    };
  }

  if (topLevelOutcome.kind === "other_error") {
    return {
      gitContext: createErrorGitContext(),
      warning: GIT_FILESYSTEM_WARNING,
    };
  }

  const gitRoot = normalizeGitRoot(topLevelOutcome.result.stdout);

  const branchOutcome = await executeGitCommand(
    ["rev-parse", "--abbrev-ref", "HEAD"],
    gitRoot,
    gitCommandRunner,
  );

  if (branchOutcome.kind === "missing") {
    return {
      gitContext: createUnavailableGitContext(),
      warning: null,
    };
  }

  if (branchOutcome.kind === "other_error") {
    return {
      gitContext: createErrorGitContext(),
      warning: GIT_FILESYSTEM_WARNING,
    };
  }

  const branchText = branchOutcome.result.stdout.trim();
  const branch = branchText.length > 0 && branchText !== "HEAD"
    ? branchText
    : null;

  const recentFilesOutcome = await executeGitCommand(
    ["log", `--max-count=${RECENT_COMMIT_COUNT}`, "--name-only", "--pretty=format:", "--no-renames"],
    gitRoot,
    gitCommandRunner,
  );

  const recentFiles = recentFilesOutcome.kind === "success"
    ? normalizeRecentFiles(recentFilesOutcome.result.stdout)
    : [];

  return {
    gitContext: {
      status: "available",
      repoRoot: gitRoot,
      branch,
      recentFiles,
    },
    warning: null,
  };
}
