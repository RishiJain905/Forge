import path from "node:path";
import { readFile, stat } from "node:fs/promises";

import { validateLoadedIntakeInput } from "./validation.js";
import { acceptanceCriteriaHeadingPattern, explicitPathTokenPatternNoG } from "./patterns.js";
import type {
  ArtifactSourceInputs,
  BlockingIssue,
  IntakeCommandOptions,
  LoadedIntakeInput,
  NormalizedTaskInput,
  PromptDetails,
  PromptRequirementCandidate,
  ResolvedIntakeInput,
  ValidatedIntakeInputs,
} from "./types.js";

const markdownHeading = /^#{1,6}\s+/;

function createBlockingIssue(code: string, message: string): BlockingIssue {
  return { code, message };
}

function pushUnique(values: string[], value: string): void {
  if (!values.includes(value)) {
    values.push(value);
  }
}

function hasAcceptanceCriteriaSection(value: string): boolean {
  return acceptanceCriteriaHeadingPattern.test(value);
}

function hasExplicitPathToken(value: string): boolean {
  return explicitPathTokenPatternNoG.test(value);
}

function isPromptTooShortToBeActionable(prompt: string): boolean {
  const nonWhitespaceLength = prompt.replace(/\s+/g, "").length;
  const wordCount = prompt.trim().split(/\s+/).filter(Boolean).length;
  const hasStructuralSignal =
    hasExplicitPathToken(prompt) || hasAcceptanceCriteriaSection(prompt);

  return (nonWhitespaceLength < 20 || wordCount < 4) && !hasStructuralSignal;
}

function normalizeInlineWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
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

async function resolveFocusPaths(
  focusPaths: string[] | undefined,
  repoRoot: string,
  issues: BlockingIssue[],
): Promise<string[]> {
  if (!focusPaths || focusPaths.length === 0) {
    return [];
  }

  type ResolvedResult =
    | { type: "issue"; issue: BlockingIssue }
    | { type: "path"; path: string };

  const results = await Promise.all(
    focusPaths.map(async (rawFocusPath): Promise<ResolvedResult> => {
      const candidatePath = path.resolve(repoRoot, rawFocusPath);
      const normalizedCandidatePath = path.normalize(candidatePath);
      const relativePath = path.relative(repoRoot, normalizedCandidatePath);

      if (
        relativePath.startsWith("..") ||
        path.isAbsolute(relativePath)
      ) {
        return {
          type: "issue",
          issue: createBlockingIssue(
            "FOCUS_OUTSIDE_REPO",
            `Forge intake could not use --focus because the path resolves outside the repo root: ${rawFocusPath}`,
          ),
        };
      }

      try {
        await stat(normalizedCandidatePath);
        return {
          type: "path",
          path: relativePath === "" ? "." : relativePath.split(path.sep).join("/"),
        };
      } catch (error) {
        const detail = error instanceof Error ? error.message : "Unknown path failure.";
        return {
          type: "issue",
          issue: createBlockingIssue(
            "FOCUS_INVALID",
            `Forge intake could not use --focus at ${normalizedCandidatePath}: ${detail}`,
          ),
        };
      }
    }),
  );

  const normalizedFocusPaths: string[] = [];
  for (const result of results) {
    if (result.type === "issue") {
      issues.push(result.issue);
    } else if (result.type === "path") {
      normalizedFocusPaths.push(result.path);
    }
  }

  return normalizedFocusPaths;
}

function extractPromptAcceptanceCriteria(prompt: string): string[] {
  const lines = prompt.split(/\r?\n/);
  const acceptanceCriteria: string[] = [];
  let insideAcceptanceCriteria = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (!insideAcceptanceCriteria) {
      if (acceptanceCriteriaHeadingPattern.test(trimmed)) {
        insideAcceptanceCriteria = true;
      }

      continue;
    }

    if (/^#{1,6}\s+/.test(trimmed)) {
      break;
    }

    const checklistMatch = trimmed.match(/^[-*]\s+\[[ xX]\]\s+(.*)$/);
    if (checklistMatch?.[1]) {
      acceptanceCriteria.push(checklistMatch[1].trim());
      continue;
    }

    const listMatch = trimmed.match(/^[-*]\s+(.*)$/);
    if (listMatch?.[1]) {
      acceptanceCriteria.push(listMatch[1].trim());
    }
  }

  return acceptanceCriteria.filter((value) => value.length > 0);
}

function extractPromptGoal(prompt: string): string {
  const lines = prompt.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();

    if (
      !trimmed ||
      markdownHeading.test(trimmed) ||
      acceptanceCriteriaHeadingPattern.test(trimmed) ||
      /^[-*]\s+/.test(trimmed)
    ) {
      continue;
    }

    return trimmed;
  }

  return normalizeInlineWhitespace(prompt);
}

function createPromptTitle(goal: string): string {
  const normalizedGoal = normalizeInlineWhitespace(goal).replace(/[.?!]+$/, "");
  return normalizedGoal || "Inline prompt task";
}

function buildPromptRequirementCandidates(prompt: string): PromptRequirementCandidate[] {
  const acceptanceCriteria = extractPromptAcceptanceCriteria(prompt);

  if (acceptanceCriteria.length > 0) {
    return acceptanceCriteria.map((text) => ({
      text,
      source: "acceptance-criteria",
    }));
  }

  const goal = extractPromptGoal(prompt);
  if (!goal) {
    return [];
  }

  return [{
    text: goal,
    source: "prompt-clause",
  }];
}

function buildPromptDetails(prompt: string, promptIsThin: boolean): PromptDetails {
  const goal = extractPromptGoal(prompt);
  const requirementCandidates = buildPromptRequirementCandidates(prompt);
  const hasExplicitPath = hasExplicitPathToken(prompt);
  const hasAcceptanceCriteria = requirementCandidates.some((candidate) => candidate.source === "acceptance-criteria");
  const summary = normalizeInlineWhitespace(prompt);
  const openQuestions = [];

  if (!hasAcceptanceCriteria) {
    openQuestions.push({
      category: "acceptance_criteria" as const,
      text: "What acceptance criteria define success for this prompt?",
    });
  }

  if (!hasExplicitPath) {
    const broadScopeSignal = /\b(build|create|implement|design|develop|launch|add)\b/i.test(summary);

    if (promptIsThin || broadScopeSignal) {
      openQuestions.push({
        category: "scope" as const,
        text: "Which concrete files, modules, or bounded behavior should this prompt change?",
      });
    }

    if (promptIsThin || broadScopeSignal) {
      openQuestions.push({
        category: "constraints" as const,
        text: "What constraints, non-goals, or rollout limits should bound this prompt?",
      });
    }
  }

  return {
    title: createPromptTitle(goal),
    goal,
    summary,
    requirementCandidates,
    openQuestions,
  };
}

function createSyntheticPromptSpec(promptDetails: PromptDetails): string {
  const lines = [
    "# Task",
    "",
    promptDetails.goal,
    "",
    "## Acceptance Criteria",
    "",
  ];

  if (promptDetails.requirementCandidates.some((candidate) => candidate.source === "acceptance-criteria")) {
    lines.push(...promptDetails.requirementCandidates.map((candidate) => `- ${candidate.text}`));
  }

  return lines.join("\n");
}

function appendSupplementalSection(text: string, heading: string, lines: string[]): string {
  if (lines.length === 0) {
    return text;
  }

  return [
    text,
    "",
    heading,
    "",
    ...lines,
  ].join("\n");
}

function createNormalizedTaskInput(params: {
  inputMode: "spec" | "prompt";
  path: string | null;
  rawText: string;
  notes: string[];
  constraints: string[];
  configPath: string | null;
  focusPaths: string[];
  normalizedTaskText: string;
  parserInputText: string;
  ambiguities?: string[];
  recommendedUserActions?: string[];
  promptDetails?: PromptDetails;
}): NormalizedTaskInput {
  return {
    inputMode: params.inputMode,
    primaryInput: {
      path: params.path,
      rawText: params.rawText,
    },
    normalizedTaskText: params.normalizedTaskText,
    parserInputText: params.parserInputText,
    notes: [...params.notes],
    constraints: [...params.constraints],
    configPath: params.configPath,
    focusPaths: [...params.focusPaths],
    ambiguities: params.ambiguities ?? [],
    recommendedUserActions: params.recommendedUserActions ?? [],
    ...(params.promptDetails ? { promptDetails: params.promptDetails } : {}),
  };
}

function resolvePromptInput(input: ValidatedIntakeInputs): NormalizedTaskInput {
  const ambiguities: string[] = [];
  const recommendedUserActions = [...input.recommendedUserActions];
  const promptIsThin = isPromptTooShortToBeActionable(input.primaryInput.rawText);
  const promptDetails = buildPromptDetails(input.primaryInput.rawText, promptIsThin);
  let normalizedTaskText = input.primaryInput.rawText;
  let parserInputText = createSyntheticPromptSpec(promptDetails);

  if (promptIsThin) {
    ambiguities.push(
      "Prompt mode input is too short to be actionable without follow-up. Clarify the goal, relevant files, or acceptance criteria.",
    );
    recommendedUserActions.push(
      "Expand the prompt with the intended files, behavior changes, or acceptance criteria before planning.",
    );
  }

  normalizedTaskText = appendSupplementalSection(
    normalizedTaskText,
    "## Notes",
    input.supplementalInputs.notes,
  );
  normalizedTaskText = appendSupplementalSection(
    normalizedTaskText,
    "## Constraints",
    input.supplementalInputs.constraints,
  );
  parserInputText = appendSupplementalSection(
    parserInputText,
    "## Notes",
    input.supplementalInputs.notes,
  );
  parserInputText = appendSupplementalSection(
    parserInputText,
    "## Constraints",
    input.supplementalInputs.constraints,
  );

  return createNormalizedTaskInput({
    inputMode: "prompt",
    path: null,
    rawText: input.primaryInput.rawText,
    notes: input.supplementalInputs.notes,
    constraints: input.supplementalInputs.constraints,
    configPath: input.supplementalInputs.configPath,
    focusPaths: input.supplementalInputs.focusPaths,
    normalizedTaskText,
    parserInputText,
    ambiguities,
    recommendedUserActions,
    promptDetails,
  });
}

function resolveSpecInput(input: ValidatedIntakeInputs): NormalizedTaskInput {
  let normalizedTaskText = input.primaryInput.rawText;
  let parserInputText = input.primaryInput.rawText;

  normalizedTaskText = appendSupplementalSection(
    normalizedTaskText,
    "## Notes",
    input.supplementalInputs.notes,
  );
  normalizedTaskText = appendSupplementalSection(
    normalizedTaskText,
    "## Constraints",
    input.supplementalInputs.constraints,
  );
  parserInputText = appendSupplementalSection(
    parserInputText,
    "## Notes",
    input.supplementalInputs.notes,
  );
  parserInputText = appendSupplementalSection(
    parserInputText,
    "## Constraints",
    input.supplementalInputs.constraints,
  );

  return createNormalizedTaskInput({
    inputMode: "spec",
    path: input.primaryInput.path,
    rawText: input.primaryInput.rawText,
    notes: input.supplementalInputs.notes,
    constraints: input.supplementalInputs.constraints,
    configPath: input.supplementalInputs.configPath,
    focusPaths: input.supplementalInputs.focusPaths,
    normalizedTaskText,
    parserInputText,
  });
}

function buildValidatedIntakeInput(params: {
  inputMode: "prompt" | "spec";
  primaryInput: ValidatedIntakeInputs["primaryInput"];
  supplementalInputs: ValidatedIntakeInputs["supplementalInputs"];
  warnings: string[];
  recommendedUserActions: string[];
}): ValidatedIntakeInputs {
  return {
    inputMode: params.inputMode,
    primaryInput: params.primaryInput,
    supplementalInputs: params.supplementalInputs,
    warnings: [...params.warnings],
    recommendedUserActions: [...params.recommendedUserActions],
  };
}

export async function resolveIntakeInput(params: {
  options: IntakeCommandOptions;
  currentWorkingDirectory: string;
  repoRoot: string;
}): Promise<ResolvedIntakeInput> {
  const blockingIssues: BlockingIssue[] = [];
  const warnings: string[] = [];
  const recommendedUserActions: string[] = [];
  const prompt = params.options.prompt?.trim();
  const spec = params.options.spec?.trim();

  const specResult = spec
    ? await readTextInput("--spec", spec, params.currentWorkingDirectory, blockingIssues)
    : { path: null, text: null };

  if (specResult.text !== null && specResult.text.trim().length === 0) {
    blockingIssues.push(
      createBlockingIssue(
        "SPEC_EMPTY",
        `Forge intake could not use --spec because the file is empty: ${specResult.path}`,
      ),
    );
  }

  const notesResult = params.options.notes?.trim()
    ? await readTextInput("--notes", params.options.notes.trim(), params.currentWorkingDirectory, blockingIssues)
    : { path: null, text: null };
  const constraintsResult = params.options.constraints?.trim()
    ? await readTextInput(
      "--constraints",
      params.options.constraints.trim(),
      params.currentWorkingDirectory,
      blockingIssues,
    )
    : { path: null, text: null };
  const configResult = params.options.config?.trim()
    ? await readTextInput("--config", params.options.config.trim(), params.currentWorkingDirectory, blockingIssues)
    : { path: null, text: null };
  const focusPaths = await resolveFocusPaths(params.options.focus, params.repoRoot, blockingIssues);

  if (blockingIssues.length > 0) {
    if (params.options.notes?.trim()) {
      pushUnique(recommendedUserActions, "Provide a readable file for --notes or omit the flag.");
    }

    if (params.options.constraints?.trim()) {
      pushUnique(recommendedUserActions, "Provide a readable file for --constraints or omit the flag.");
    }

    if (params.options.config?.trim()) {
      pushUnique(recommendedUserActions, "Provide a readable file for --config or omit the flag.");
    }

    if ((params.options.focus?.length ?? 0) > 0) {
      pushUnique(recommendedUserActions, "Pass only existing repo-relative paths to --focus.");
    }

    if (params.options.strictFocus) {
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
          loaded: true,
        }
      : {
          path: specResult.path,
          rawText: specResult.text?.trim() ?? "",
          loaded: specResult.text !== null && specResult.text.trim().length > 0,
        },
    supplementalInputs: {
      notes: notesResult.text ? normalizeSupplementalLines(notesResult.text) : [],
      constraints: constraintsResult.text ? normalizeSupplementalLines(constraintsResult.text) : [],
      configPath: configResult.path,
      configLoaded: configResult.text !== null,
      focusPaths,
      strictFocus: params.options.strictFocus === true,
    },
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

  const combinedBlockingIssues = [...blockingIssues, ...policyResult.blockingIssues];

  if (combinedBlockingIssues.length > 0) {
    return {
      inputMode: loadedInput.inputMode,
      sourceSelection: loadedInput.sourceSelection,
      primaryInput: loadedInput.primaryInput,
      supplementalInputs: loadedInput.supplementalInputs,
      normalizedTaskInput: null,
      blockingIssues: combinedBlockingIssues,
      warnings,
      recommendedUserActions,
    };
  }

  const validatedInput = buildValidatedIntakeInput({
    inputMode: loadedInput.inputMode,
    primaryInput: loadedInput.primaryInput,
    supplementalInputs: {
      notes: [...loadedInput.supplementalInputs.notes],
      constraints: [...loadedInput.supplementalInputs.constraints],
      configPath: loadedInput.supplementalInputs.configPath,
      focusPaths: [...loadedInput.supplementalInputs.focusPaths],
    },
    warnings,
    recommendedUserActions,
  });

  const normalizedTaskInput = resolveLoadedIntakeInput(validatedInput);

  return {
    inputMode: loadedInput.inputMode,
    sourceSelection: loadedInput.sourceSelection,
    primaryInput: loadedInput.primaryInput,
    supplementalInputs: loadedInput.supplementalInputs,
    normalizedTaskInput,
    blockingIssues: [],
    warnings,
    recommendedUserActions,
  };
}

export function toArtifactSourceInputs(taskInput: NormalizedTaskInput): ArtifactSourceInputs {
  return {
    input_mode: taskInput.inputMode,
    primary_input: {
      path: taskInput.primaryInput.path,
      raw_text: taskInput.primaryInput.rawText,
    },
    normalized_task_text: taskInput.normalizedTaskText,
    notes: [...taskInput.notes],
    constraints: [...taskInput.constraints],
    config_path: taskInput.configPath,
    focus_paths: [...taskInput.focusPaths],
  };
}

export function resolveLoadedIntakeInput(validatedInput: ValidatedIntakeInputs): NormalizedTaskInput {
  if (validatedInput.inputMode === "prompt") {
    return resolvePromptInput(validatedInput);
  }

  return resolveSpecInput(validatedInput);
}
