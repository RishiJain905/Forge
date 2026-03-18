import type {
  ArtifactSourceInputs,
  NormalizedTaskInput,
  PromptDetails,
  PromptRequirementCandidate,
  ValidatedIntakeInputs,
} from "./types.js";

const acceptanceCriteriaHeading = /^(?:#{1,6}\s*)?acceptance criteria\b:?/im;
const markdownHeading = /^#{1,6}\s+/;
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

function normalizeInlineWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function extractPromptAcceptanceCriteria(prompt: string): string[] {
  const lines = prompt.split(/\r?\n/);
  const acceptanceCriteria: string[] = [];
  let insideAcceptanceCriteria = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (!insideAcceptanceCriteria) {
      if (acceptanceCriteriaHeading.test(trimmed)) {
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
      acceptanceCriteriaHeading.test(trimmed) ||
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

function buildPromptDetails(prompt: string): PromptDetails {
  const goal = extractPromptGoal(prompt);
  const requirementCandidates = buildPromptRequirementCandidates(prompt);
  const promptIsThin = isPromptTooShortToBeActionable(prompt);
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
  const promptDetails = buildPromptDetails(input.primaryInput.rawText);
  let normalizedTaskText = input.primaryInput.rawText;
  let parserInputText = createSyntheticPromptSpec(promptDetails);

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
    promptDetails,
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

export function resolveLoadedIntakeInput(validatedInput: ValidatedIntakeInputs): NormalizedTaskInput {
  if (validatedInput.inputMode === "prompt") {
    return resolvePromptInput(validatedInput);
  }

  return resolveSpecInput(validatedInput);
}

export const resolveTaskSource = resolveLoadedIntakeInput;
