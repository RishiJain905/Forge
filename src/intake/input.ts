import type { ArtifactSourceInputs, NormalizedTaskInput, ValidatedIntakeInputs } from "./types.js";

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
  };
}

function resolvePromptInput(input: ValidatedIntakeInputs): NormalizedTaskInput {
  const ambiguities: string[] = [];
  const recommendedUserActions = [...input.recommendedUserActions];
  let normalizedTaskText = input.primaryInput.rawText;
  let parserInputText = createSyntheticPromptSpec(input.primaryInput.rawText);

  if (isPromptTooShortToBeActionable(input.primaryInput.rawText)) {
    ambiguities.push(
      "Prompt mode input is too short to be actionable without follow-up. Clarify the goal, relevant files, or acceptance criteria.",
    );
    recommendedUserActions.push(
      "Expand the prompt with the intended files, behavior changes, or acceptance criteria before planning.",
    );
  }

  normalizedTaskText = appendSupplementalSection(normalizedTaskText, "## Notes", input.notes);
  normalizedTaskText = appendSupplementalSection(normalizedTaskText, "## Constraints", input.constraints);
  parserInputText = appendSupplementalSection(parserInputText, "## Notes", input.notes);
  parserInputText = appendSupplementalSection(parserInputText, "## Constraints", input.constraints);

  return createNormalizedTaskInput({
    inputMode: "prompt",
    path: null,
    rawText: input.primaryInput.rawText,
    notes: input.notes,
    constraints: input.constraints,
    configPath: input.configPath,
    focusPaths: input.focusPaths,
    normalizedTaskText,
    parserInputText,
    ambiguities,
    recommendedUserActions,
  });
}

function resolveSpecInput(input: ValidatedIntakeInputs): NormalizedTaskInput {
  let normalizedTaskText = input.primaryInput.rawText;
  let parserInputText = input.primaryInput.rawText;

  normalizedTaskText = appendSupplementalSection(normalizedTaskText, "## Notes", input.notes);
  normalizedTaskText = appendSupplementalSection(normalizedTaskText, "## Constraints", input.constraints);
  parserInputText = appendSupplementalSection(parserInputText, "## Notes", input.notes);
  parserInputText = appendSupplementalSection(parserInputText, "## Constraints", input.constraints);

  return createNormalizedTaskInput({
    inputMode: "spec",
    path: input.primaryInput.path,
    rawText: input.primaryInput.rawText,
    notes: input.notes,
    constraints: input.constraints,
    configPath: input.configPath,
    focusPaths: input.focusPaths,
    normalizedTaskText,
    parserInputText,
  });
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

export function resolveTaskSource(validatedInput: ValidatedIntakeInputs): NormalizedTaskInput {
  if (validatedInput.inputMode === "prompt") {
    return resolvePromptInput(validatedInput);
  }

  return resolveSpecInput(validatedInput);
}
