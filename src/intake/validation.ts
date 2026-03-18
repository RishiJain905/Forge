import type { BlockingIssue, LoadedIntakeInput, ResolvedIntakeInput } from "./types.js";

function createBlockingIssue(code: string, message: string): BlockingIssue {
  return { code, message };
}

function pushUnique(values: string[], value: string): void {
  if (!values.includes(value)) {
    values.push(value);
  }
}

export function validateLoadedIntakeInput(
  input: LoadedIntakeInput,
): Pick<ResolvedIntakeInput, "blockingIssues" | "warnings" | "recommendedUserActions"> {
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
