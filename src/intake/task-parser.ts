import type { IntakeTaskSpec, NormalizedTaskInput, TaskParserResult } from "./types.js";

const explicitPathToken = /\b(?:[\w.-]+\/)+[\w.-]+\b/g;
const acceptanceCriteriaHeading = /^(?:#{1,6}\s*)?acceptance criteria\b:?/i;
const markdownHeading = /^#{1,6}\s+/;
const markdownListItem = /^[-*]\s+(.*)$/;
const markdownChecklistItem = /^[-*]\s+\[[ xX]\]\s+(.*)$/;

function normalizeListValue(value: string): string {
  return value.trim();
}

export function createEmptyTaskSpec(): IntakeTaskSpec {
  return {
    goal: "",
    acceptanceCriteria: [],
    hasAcceptanceCriteria: false,
  };
}

function extractSpecGoal(lines: string[]): string {
  let insideAcceptanceCriteria = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      continue;
    }

    if (acceptanceCriteriaHeading.test(trimmed)) {
      insideAcceptanceCriteria = true;
      continue;
    }

    if (insideAcceptanceCriteria && markdownHeading.test(trimmed)) {
      insideAcceptanceCriteria = false;
    }

    if (insideAcceptanceCriteria || markdownHeading.test(trimmed)) {
      continue;
    }

    if (markdownChecklistItem.test(trimmed) || markdownListItem.test(trimmed)) {
      continue;
    }

    return trimmed;
  }

  return "";
}

function extractAcceptanceCriteria(lines: string[]): string[] {
  const collected: string[] = [];
  let insideAcceptanceCriteria = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (!insideAcceptanceCriteria) {
      if (acceptanceCriteriaHeading.test(trimmed)) {
        insideAcceptanceCriteria = true;
      }

      continue;
    }

    if (markdownHeading.test(trimmed)) {
      break;
    }

    const checklistMatch = trimmed.match(markdownChecklistItem);
    if (checklistMatch) {
      collected.push(normalizeListValue(checklistMatch[1]));
      continue;
    }

    const listMatch = trimmed.match(markdownListItem);
    if (listMatch) {
      collected.push(normalizeListValue(listMatch[1]));
    }
  }

  return collected.filter((value) => value.length > 0);
}

export function normalizeTaskSpec(taskInput: NormalizedTaskInput): IntakeTaskSpec {
  const lines = taskInput.parserInputText.split(/\r?\n/);
  const acceptanceCriteria = extractAcceptanceCriteria(lines);

  return {
    goal: extractSpecGoal(lines),
    acceptanceCriteria,
    hasAcceptanceCriteria: acceptanceCriteria.length > 0,
  };
}

function extractReferencedPaths(value: string): string[] {
  const matches = value.match(explicitPathToken) ?? [];
  const uniqueMatches = new Set(matches.map((match) => match.trim()));
  return [...uniqueMatches];
}

export function buildTaskParserResult(
  taskInput: NormalizedTaskInput | null,
): TaskParserResult {
  if (!taskInput) {
    return {
      taskSpec: createEmptyTaskSpec(),
      signals: {
        hasGoal: false,
        hasAcceptanceCriteria: false,
        referencedPaths: [],
        promptIsThin: false,
        promptRequirementCandidateCount: 0,
        promptOpenQuestionCategories: [],
      },
      ambiguities: [],
      warnings: [
        "Task parsing could not produce a normalized task input, so downstream intake analysis is operating with defaults.",
      ],
      recommendedUserActions: [],
    };
  }

  const taskSpec = normalizeTaskSpec(taskInput);
  const promptIsThin =
    taskInput.inputMode === "prompt" &&
    taskInput.ambiguities.some((ambiguity) => /too short|actionable/i.test(ambiguity));

  return {
    taskSpec,
    signals: {
      hasGoal: taskSpec.goal.trim().length > 0,
      hasAcceptanceCriteria: taskSpec.hasAcceptanceCriteria,
      referencedPaths: extractReferencedPaths(taskInput.normalizedTaskText),
      promptIsThin,
      promptRequirementCandidateCount: taskInput.promptDetails?.requirementCandidates.length ?? 0,
      promptOpenQuestionCategories: taskInput.promptDetails?.openQuestions.map((question) => question.category) ?? [],
    },
    ambiguities: [...taskInput.ambiguities],
    warnings: [],
    recommendedUserActions: [...taskInput.recommendedUserActions],
  };
}
