import path from "node:path";
import { readFile } from "node:fs/promises";

import type { IntakeCommandOptions, NormalizedTaskInput } from "./types.js";

interface TaskSourceResolutionFailure {
  code: string;
  message: string;
}

export interface TaskSourceResolutionResult {
  taskInput: NormalizedTaskInput | null;
  failure: TaskSourceResolutionFailure | null;
}

const acceptanceCriteriaHeading = /^(?:#{1,6}\s*)?acceptance criteria\b:?/im;
const explicitPathToken = /\b(?:[\w.-]+\/)+[\w.-]+\b/;

function hasAcceptanceCriteriaSection(value: string): boolean {
  return acceptanceCriteriaHeading.test(value);
}

function hasExplicitPathToken(value: string): boolean {
  return explicitPathToken.test(value);
}

function isPromptTooShortToBeActionable(prompt: string): boolean {
  const nonWhitespaceLength = prompt.replace(/\s+/g, "").length;
  const wordCount = prompt.trim().split(/\s+/).filter(Boolean).length;
  const hasStructuralSignal =
    hasExplicitPathToken(prompt) || hasAcceptanceCriteriaSection(prompt);

  return (nonWhitespaceLength < 20 || wordCount < 4) && !hasStructuralSignal;
}

function createSyntheticPromptSpec(prompt: string): string {
  return [
    "# Task",
    "",
    prompt,
  ].join("\n");
}

function createNormalizedTaskInput(params: {
  inputMode: "spec" | "prompt";
  path: string | null;
  rawText: string;
  normalizedTaskText: string;
  parserInputText: string;
  ambiguities?: string[];
  recommendedUserActions?: string[];
}): NormalizedTaskInput {
  return {
    inputMode: params.inputMode,
    primaryInput: {
      path: params.path,
      rawText: params.rawText,
    },
    normalizedTaskText: params.normalizedTaskText,
    parserInputText: params.parserInputText,
    notes: [],
    constraints: [],
    ambiguities: params.ambiguities ?? [],
    recommendedUserActions: params.recommendedUserActions ?? [],
  };
}

function resolvePromptInput(prompt: string): NormalizedTaskInput {
  const ambiguities: string[] = [];
  const recommendedUserActions: string[] = [];

  if (isPromptTooShortToBeActionable(prompt)) {
    ambiguities.push(
      "Prompt mode input is too short to be actionable without follow-up. Clarify the goal, relevant files, or acceptance criteria.",
    );
    recommendedUserActions.push(
      "Expand the prompt with the intended files, behavior changes, or acceptance criteria before planning.",
    );
  }

  return createNormalizedTaskInput({
    inputMode: "prompt",
    path: null,
    rawText: prompt,
    normalizedTaskText: prompt,
    parserInputText: createSyntheticPromptSpec(prompt),
    ambiguities,
    recommendedUserActions,
  });
}

function resolveSpecInput(specPath: string, rawText: string): NormalizedTaskInput {
  return createNormalizedTaskInput({
    inputMode: "spec",
    path: specPath,
    rawText,
    normalizedTaskText: rawText,
    parserInputText: rawText,
  });
}

export function toArtifactSourceInputs(taskInput: NormalizedTaskInput): {
  input_mode: "spec" | "prompt";
  primary_input: {
    path: string | null;
    raw_text: string;
  };
  normalized_task_text: string;
  notes: string[];
  constraints: string[];
} {
  return {
    input_mode: taskInput.inputMode,
    primary_input: {
      path: taskInput.primaryInput.path,
      raw_text: taskInput.primaryInput.rawText,
    },
    normalized_task_text: taskInput.normalizedTaskText,
    notes: [...taskInput.notes],
    constraints: [...taskInput.constraints],
  };
}

export async function resolveTaskSource(
  options: IntakeCommandOptions,
  currentWorkingDirectory: string,
): Promise<TaskSourceResolutionResult> {
  const prompt = options.prompt?.trim();
  const spec = options.spec?.trim();

  if (!prompt && !spec) {
    return {
      taskInput: null,
      failure: {
        code: "INPUT_REQUIRED",
        message: "Forge intake requires exactly one primary input: pass either --spec or --prompt.",
      },
    };
  }

  if (prompt && spec) {
    return {
      taskInput: null,
      failure: {
        code: "INPUT_CONFLICT",
        message: "Forge intake accepts either --spec or --prompt, but not both in the same run.",
      },
    };
  }

  if (prompt) {
    return {
      taskInput: resolvePromptInput(prompt),
      failure: null,
    };
  }

  const specPath = path.isAbsolute(spec!)
    ? path.normalize(spec!)
    : path.resolve(currentWorkingDirectory, spec!);

  try {
    const rawText = await readFile(specPath, "utf8");
    const trimmedText = rawText.trim();

    if (trimmedText.length === 0) {
      return {
        taskInput: null,
        failure: {
          code: "SPEC_EMPTY",
          message: `Forge intake could not use --spec because the file is empty: ${specPath}`,
        },
      };
    }

    return {
      taskInput: resolveSpecInput(specPath, trimmedText),
      failure: null,
    };
  } catch (error) {
    return {
      taskInput: null,
      failure: {
        code: "SPEC_READ_FAILED",
        message: error instanceof Error
          ? `Forge intake could not read --spec at ${specPath}: ${error.message}`
          : `Forge intake could not read --spec at ${specPath}.`,
      },
    };
  }
}
