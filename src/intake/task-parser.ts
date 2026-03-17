import { createEmptyTaskSpec, normalizeTaskSpec } from "./task-spec.js";
import type { NormalizedTaskInput, TaskParserResult } from "./types.js";

const explicitPathToken = /\b(?:[\w.-]+\/)+[\w.-]+\b/g;

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
