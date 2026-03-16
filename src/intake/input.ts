import path from "node:path";
import { readFile } from "node:fs/promises";

import type { IntakeCommandOptions, ResolvedTaskSource } from "./types.js";

interface TaskSourceResolutionFailure {
  code: string;
  message: string;
}

export interface TaskSourceResolutionResult {
  taskSource: ResolvedTaskSource | null;
  failure: TaskSourceResolutionFailure | null;
}

export async function resolveTaskSource(
  options: IntakeCommandOptions,
  currentWorkingDirectory: string,
): Promise<TaskSourceResolutionResult> {
  const prompt = options.prompt?.trim();
  const spec = options.spec?.trim();

  if (!prompt && !spec) {
    return {
      taskSource: null,
      failure: {
        code: "INPUT_REQUIRED",
        message: "Forge intake requires exactly one primary input: pass either --spec or --prompt.",
      },
    };
  }

  if (prompt && spec) {
    return {
      taskSource: null,
      failure: {
        code: "INPUT_CONFLICT",
        message: "Forge intake accepts either --spec or --prompt, but not both in the same run.",
      },
    };
  }

  if (prompt) {
    return {
      taskSource: {
        inputMode: "prompt",
        specPath: null,
        prompt,
        rawText: prompt,
      },
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
        taskSource: null,
        failure: {
          code: "SPEC_EMPTY",
          message: `Forge intake could not use --spec because the file is empty: ${specPath}`,
        },
      };
    }

    return {
      taskSource: {
        inputMode: "spec",
        specPath,
        prompt: null,
        rawText: trimmedText,
      },
      failure: null,
    };
  } catch (error) {
    return {
      taskSource: null,
      failure: {
        code: "SPEC_READ_FAILED",
        message: error instanceof Error
          ? `Forge intake could not read --spec at ${specPath}: ${error.message}`
          : `Forge intake could not read --spec at ${specPath}.`,
      },
    };
  }
}
