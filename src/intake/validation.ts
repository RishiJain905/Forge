import path from "node:path";
import { readFile, stat } from "node:fs/promises";

import type {
  BlockingIssue,
  IntakeCommandOptions,
  IntakeValidationResult,
  ValidatedIntakeInputs,
} from "./types.js";

function createBlockingIssue(code: string, message: string): BlockingIssue {
  return { code, message };
}

async function readTextInput(
  optionName: "--spec" | "--notes" | "--constraints" | "--config",
  inputPath: string,
  currentWorkingDirectory: string,
  issues: BlockingIssue[],
): Promise<{
  path: string;
  text: string | null;
}> {
  const resolvedPath = path.isAbsolute(inputPath)
    ? path.normalize(inputPath)
    : path.resolve(currentWorkingDirectory, inputPath);

  try {
    const rawText = await readFile(resolvedPath, "utf8");
    return {
      path: resolvedPath,
      text: rawText,
    };
  } catch (error) {
    const code = optionName === "--spec"
      ? "SPEC_READ_FAILED"
      : optionName === "--notes"
        ? "NOTES_READ_FAILED"
        : optionName === "--constraints"
          ? "CONSTRAINTS_READ_FAILED"
          : "CONFIG_READ_FAILED";
    const detail = error instanceof Error ? error.message : "Unknown read failure.";

    issues.push(
      createBlockingIssue(
        code,
        `Forge intake could not read ${optionName} at ${resolvedPath}: ${detail}`,
      ),
    );
    return {
      path: resolvedPath,
      text: null,
    };
  }
}

function normalizeSupplementalLines(rawText: string): string[] {
  return rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

async function validateFocusPaths(
  focusPaths: string[] | undefined,
  repoRoot: string,
  issues: BlockingIssue[],
): Promise<string[]> {
  if (!focusPaths || focusPaths.length === 0) {
    return [];
  }

  const normalizedFocusPaths: string[] = [];

  for (const rawFocusPath of focusPaths) {
    const candidatePath = path.resolve(repoRoot, rawFocusPath);
    const normalizedCandidatePath = path.normalize(candidatePath);
    const relativePath = path.relative(repoRoot, normalizedCandidatePath);

    if (
      relativePath.startsWith("..") ||
      path.isAbsolute(relativePath)
    ) {
      issues.push(
        createBlockingIssue(
          "FOCUS_OUTSIDE_REPO",
          `Forge intake could not use --focus because the path resolves outside the repo root: ${rawFocusPath}`,
        ),
      );
      continue;
    }

    try {
      await stat(normalizedCandidatePath);
      normalizedFocusPaths.push(
        relativePath === "" ? "." : relativePath.split(path.sep).join("/"),
      );
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Unknown path failure.";
      issues.push(
        createBlockingIssue(
          "FOCUS_INVALID",
          `Forge intake could not use --focus at ${normalizedCandidatePath}: ${detail}`,
        ),
      );
    }
  }

  return normalizedFocusPaths;
}

export async function validateIntakeInputs(
  options: IntakeCommandOptions,
  currentWorkingDirectory: string,
  repoRoot: string,
): Promise<IntakeValidationResult> {
  const blockingIssues: BlockingIssue[] = [];
  const warnings: string[] = [];
  const recommendedUserActions: string[] = [];
  const prompt = options.prompt?.trim();
  const spec = options.spec?.trim();

  if (!prompt && !spec) {
    blockingIssues.push(
      createBlockingIssue(
        "INPUT_REQUIRED",
        "Forge intake requires exactly one primary input: pass either --spec or --prompt.",
      ),
    );
  }

  if (prompt && spec) {
    blockingIssues.push(
      createBlockingIssue(
        "INPUT_CONFLICT",
        "Forge intake accepts either --spec or --prompt, but not both in the same run.",
      ),
    );
  }

  const specResult = spec
    ? await readTextInput("--spec", spec, currentWorkingDirectory, blockingIssues)
    : { path: null, text: null };

  if (specResult.text !== null && specResult.text.trim().length === 0) {
    blockingIssues.push(
      createBlockingIssue(
        "SPEC_EMPTY",
        `Forge intake could not use --spec because the file is empty: ${specResult.path}`,
      ),
    );
  }

  const notesResult = options.notes?.trim()
    ? await readTextInput("--notes", options.notes.trim(), currentWorkingDirectory, blockingIssues)
    : { path: null, text: null };
  const constraintsResult = options.constraints?.trim()
    ? await readTextInput(
      "--constraints",
      options.constraints.trim(),
      currentWorkingDirectory,
      blockingIssues,
    )
    : { path: null, text: null };
  const configResult = options.config?.trim()
    ? await readTextInput("--config", options.config.trim(), currentWorkingDirectory, blockingIssues)
    : { path: null, text: null };
  const normalizedFocusPaths = await validateFocusPaths(options.focus, repoRoot, blockingIssues);

  if (options.config?.trim() && configResult.path) {
    warnings.push(
      "Config input was validated and recorded, but config-driven intake behavior is not implemented yet.",
    );
    recommendedUserActions.push(
      "Do not rely on --config to change intake behavior until a later batch implements config consumption.",
    );
  }

  if (options.strictFocus && normalizedFocusPaths.length === 0) {
    blockingIssues.push(
      createBlockingIssue(
        "STRICT_FOCUS_REQUIRES_FOCUS",
        "Forge intake requires at least one valid --focus path when --strict-focus is enabled.",
      ),
    );
  }

  if (blockingIssues.length > 0) {
    if (options.notes?.trim()) {
      recommendedUserActions.push("Provide a readable file for --notes or omit the flag.");
    }

    if (options.constraints?.trim()) {
      recommendedUserActions.push("Provide a readable file for --constraints or omit the flag.");
    }

    if (options.config?.trim()) {
      recommendedUserActions.push("Provide a readable file for --config or omit the flag.");
    }

    if ((options.focus?.length ?? 0) > 0) {
      recommendedUserActions.push("Pass only existing repo-relative paths to --focus.");
    }

    if (options.strictFocus) {
      recommendedUserActions.push(
        "Pass at least one valid repo-relative path to --focus before enabling --strict-focus.",
      );
    }

    return {
      validatedInput: null,
      blockingIssues,
      warnings,
      recommendedUserActions,
    };
  }

  const validatedInput: ValidatedIntakeInputs = {
    inputMode: prompt ? "prompt" : "spec",
    primaryInput: prompt
      ? {
        path: null,
        rawText: prompt,
      }
      : {
        path: specResult.path,
        rawText: specResult.text!.trim(),
      },
    notes: notesResult.text ? normalizeSupplementalLines(notesResult.text) : [],
    constraints: constraintsResult.text ? normalizeSupplementalLines(constraintsResult.text) : [],
    configPath: configResult.path,
    focusPaths: normalizedFocusPaths,
    warnings,
    recommendedUserActions,
  };

  return {
    validatedInput,
    blockingIssues,
    warnings,
    recommendedUserActions,
  };
}
