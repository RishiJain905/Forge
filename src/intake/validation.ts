import path from "node:path";
import { readFile, stat } from "node:fs/promises";

import type {
  BlockingIssue,
  IntakeCommandOptions,
  IntakeValidationResult,
  LoadedIntakeInput,
  ValidatedIntakeInputs,
} from "./types.js";

function createBlockingIssue(code: string, message: string): BlockingIssue {
  return { code, message };
}

function pushUnique(values: string[], value: string): void {
  if (!values.includes(value)) {
    values.push(value);
  }
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

export function validateLoadedIntakeInput(
  input: LoadedIntakeInput,
): Pick<IntakeValidationResult, "blockingIssues" | "warnings" | "recommendedUserActions"> {
  const blockingIssues: BlockingIssue[] = [];
  const warnings: string[] = [];
  const recommendedUserActions: string[] = [];

  if (!input.sourceSelection.promptProvided && !input.sourceSelection.specProvided) {
    blockingIssues.push(
      createBlockingIssue(
        "INPUT_REQUIRED",
        "Forge intake requires exactly one primary input: pass either --spec or --prompt.",
      ),
    );
  }

  if (input.sourceSelection.promptProvided && input.sourceSelection.specProvided) {
    blockingIssues.push(
      createBlockingIssue(
        "INPUT_CONFLICT",
        "Forge intake accepts either --spec or --prompt, but not both in the same run.",
      ),
    );
  }

  if (
    input.primaryInputLoaded !== false &&
    input.inputMode === "spec" &&
    input.primaryInput.rawText.trim().length === 0
  ) {
    blockingIssues.push(
      createBlockingIssue(
        "SPEC_EMPTY",
        `Forge intake could not use --spec because the file is empty: ${input.primaryInput.path}`,
      ),
    );
  }

  if (input.configPath) {
    pushUnique(
      warnings,
      "Config input was validated and recorded, but config-driven intake behavior is not implemented yet.",
    );
    pushUnique(
      recommendedUserActions,
      "Do not rely on --config to change intake behavior until a later batch implements config consumption.",
    );
  }

  if (input.strictFocus && input.focusPaths.length === 0) {
    blockingIssues.push(
      createBlockingIssue(
        "STRICT_FOCUS_REQUIRES_FOCUS",
        "Forge intake requires at least one valid --focus path when --strict-focus is enabled.",
      ),
    );
    pushUnique(
      recommendedUserActions,
      "Pass at least one valid repo-relative path to --focus before enabling --strict-focus.",
    );
  }

  if (blockingIssues.length > 0) {
    if (input.configPath) {
      pushUnique(recommendedUserActions, "Provide a readable file for --config or omit the flag.");
    }

    if (
      (input.sourceSelection.promptProvided || input.sourceSelection.specProvided) &&
      input.focusPaths.length > 0
    ) {
      pushUnique(recommendedUserActions, "Pass only existing repo-relative paths to --focus.");
    }
  }

  return {
    blockingIssues,
    warnings,
    recommendedUserActions,
  };
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
  if (blockingIssues.length > 0) {
    if (options.notes?.trim()) {
      pushUnique(recommendedUserActions, "Provide a readable file for --notes or omit the flag.");
    }

    if (options.constraints?.trim()) {
      pushUnique(recommendedUserActions, "Provide a readable file for --constraints or omit the flag.");
    }

    if (options.config?.trim()) {
      pushUnique(recommendedUserActions, "Provide a readable file for --config or omit the flag.");
    }

    if ((options.focus?.length ?? 0) > 0) {
      pushUnique(recommendedUserActions, "Pass only existing repo-relative paths to --focus.");
    }

    if (options.strictFocus) {
      pushUnique(
        recommendedUserActions,
        "Pass at least one valid repo-relative path to --focus before enabling --strict-focus.",
      );
    }
  }
  const loadedInput: LoadedIntakeInput = {
    inputMode: prompt ? "prompt" : "spec",
    primaryInput: prompt
      ? {
        path: null,
        rawText: prompt,
      }
      : {
        path: specResult.path,
        rawText: specResult.text?.trim() ?? "",
      },
    primaryInputLoaded: prompt ? true : (specResult.text !== null && specResult.text.trim().length > 0),
    notes: notesResult.text ? normalizeSupplementalLines(notesResult.text) : [],
    constraints: constraintsResult.text ? normalizeSupplementalLines(constraintsResult.text) : [],
    configPath: configResult.path,
    focusPaths: normalizedFocusPaths,
    strictFocus: options.strictFocus === true,
    sourceSelection: {
      specProvided: Boolean(spec),
      promptProvided: Boolean(prompt),
    },
  };

  const policyResult = validateLoadedIntakeInput(loadedInput);
  for (const warning of policyResult.warnings) {
    pushUnique(warnings, warning);
  }

  for (const action of policyResult.recommendedUserActions) {
    pushUnique(recommendedUserActions, action);
  }

  if (blockingIssues.length === 0 && policyResult.blockingIssues.length === 0) {
    const validatedInput: ValidatedIntakeInputs = {
      inputMode: loadedInput.inputMode,
      primaryInput: loadedInput.primaryInput,
      notes: loadedInput.notes,
      constraints: loadedInput.constraints,
      configPath: loadedInput.configPath,
      focusPaths: loadedInput.focusPaths,
      warnings,
      recommendedUserActions,
    };

    return {
      validatedInput,
      blockingIssues: [],
      warnings,
      recommendedUserActions,
    };
  }

  blockingIssues.push(...policyResult.blockingIssues);

  return {
    validatedInput: null,
    blockingIssues,
    warnings,
    recommendedUserActions,
  };
}
