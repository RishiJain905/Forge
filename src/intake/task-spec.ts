import type { IntakeTaskSpec, NormalizedTaskInput } from "./types.js";

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
