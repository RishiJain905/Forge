import type { IntakeTaskSpec, NormalizedTaskInput, TaskParserResult } from "./types.js";

const explicitPathToken = /\b(?:[\w.-]+\/)+[\w.-]+\b/g;
const acceptanceCriteriaHeading = /^(?:#{1,6}\s*)?acceptance criteria\b:?/i;
const summaryHeading = /^(?:#{1,6}\s*)?summary\b:?/i;
const scopeHeading = /^(?:#{1,6}\s*)?scope\b:?/i;
const notesHeading = /^(?:#{1,6}\s*)?notes\b:?/i;
const constraintsHeading = /^(?:#{1,6}\s*)?constraints\b:?/i;
const markdownHeading = /^#{1,6}\s+/;
const topLevelMarkdownHeading = /^#\s+/;
const markdownListItem = /^[-*]\s+(.*)$/;
const markdownChecklistItem = /^[-*]\s+\[[ xX]\]\s+(.*)$/;
const riskPhrasePatterns = [
  { phrase: "api contract", pattern: /\bapi contract\b/i },
  { phrase: "migration", pattern: /\bmigrat(?:e|ion)\b/i },
  { phrase: "ownership", pattern: /\bownership\b/i },
  { phrase: "parallel", pattern: /\bparallel(?:ize|ization)?\b/i },
  { phrase: "retry", pattern: /\bretry\b/i },
  { phrase: "stale write", pattern: /\bstale write\b/i },
];

function normalizeListValue(value: string): string {
  return value.trim();
}

export function createEmptyTaskSpec(): IntakeTaskSpec {
  return {
    title: "",
    summary: "",
    goal: "",
    scope: [],
    acceptanceCriteria: [],
    hasAcceptanceCriteria: false,
    explicitRequirements: [],
    constraints: [],
    mentionedPaths: [],
    mentionedTests: [],
    mentionedModules: [],
    riskyPhrases: [],
    openQuestions: [],
  };
}

function extractSectionLines(lines: string[], sectionHeading: RegExp): string[] {
  const collected: string[] = [];
  let insideSection = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (sectionHeading.test(trimmed)) {
      insideSection = true;
      continue;
    }

    if (
      insideSection &&
      (markdownHeading.test(trimmed) ||
        summaryHeading.test(trimmed) ||
        scopeHeading.test(trimmed) ||
        acceptanceCriteriaHeading.test(trimmed))
    ) {
      break;
    }

    if (!insideSection) {
      continue;
    }

    collected.push(trimmed);
  }

  return collected.filter((value) => value.length > 0);
}

function extractSpecTitle(lines: string[]): string {
  let firstNonSectionHeading = "";

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      continue;
    }

    if (
      summaryHeading.test(trimmed) ||
      scopeHeading.test(trimmed) ||
      acceptanceCriteriaHeading.test(trimmed) ||
      notesHeading.test(trimmed) ||
      constraintsHeading.test(trimmed)
    ) {
      continue;
    }

    if (topLevelMarkdownHeading.test(trimmed)) {
      return trimmed.replace(/^#{1,6}\s+/, "").trim();
    }

    if (markdownHeading.test(trimmed) && firstNonSectionHeading.length === 0) {
      firstNonSectionHeading = trimmed.replace(/^#{1,6}\s+/, "").trim();
    }
  }

  for (const line of lines) {
    const trimmed = line.trim();

    if (
      !trimmed ||
      markdownHeading.test(trimmed) ||
      markdownChecklistItem.test(trimmed) ||
      markdownListItem.test(trimmed) ||
      summaryHeading.test(trimmed) ||
      scopeHeading.test(trimmed) ||
      acceptanceCriteriaHeading.test(trimmed) ||
      notesHeading.test(trimmed) ||
      constraintsHeading.test(trimmed)
    ) {
      continue;
    }

    return trimmed;
  }

  return firstNonSectionHeading;
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

function extractSummary(lines: string[]): string {
  const summaryLines = extractSectionLines(lines, summaryHeading);

  if (summaryLines.length === 0) {
    return "";
  }

  return summaryLines
    .map((line) => {
      const listMatch = line.match(markdownListItem);
      return listMatch ? listMatch[1].trim() : line;
    })
    .filter((value) => value.length > 0)
    .join(" ");
}

function extractScope(lines: string[]): string[] {
  const scopeLines = extractSectionLines(lines, scopeHeading);
  const scopeItems: string[] = [];

  for (const line of scopeLines) {
    const checklistMatch = line.match(markdownChecklistItem);
    if (checklistMatch) {
      scopeItems.push(checklistMatch[1].trim());
      continue;
    }

    const listMatch = line.match(markdownListItem);
    if (listMatch) {
      scopeItems.push(listMatch[1].trim());
      continue;
    }

    scopeItems.push(line.trim());
  }

  return scopeItems.filter((value) => value.length > 0);
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
  const primaryLines = taskInput.primaryInput.rawText.split(/\r?\n/);
  const parserLines = taskInput.parserInputText.split(/\r?\n/);
  const summary =
    extractSummary(primaryLines) ||
    extractSpecGoal(primaryLines) ||
    taskInput.promptDetails?.summary ||
    "";
  const scope = extractScope(primaryLines);
  const acceptanceCriteria = extractAcceptanceCriteria(parserLines);
  const title =
    taskInput.inputMode === "prompt"
      ? taskInput.promptDetails?.title || taskInput.primaryInput.rawText.trim()
      : extractSpecTitle(primaryLines) || taskInput.promptDetails?.title || "";

  return {
    title,
    summary,
    goal: extractSpecGoal(primaryLines),
    scope,
    acceptanceCriteria,
    hasAcceptanceCriteria: acceptanceCriteria.length > 0,
  };
}

function extractReferencedPaths(value: string): string[] {
  const matches = value.match(explicitPathToken) ?? [];
  const uniqueMatches = new Set(matches.map((match) => match.trim()));
  return [...uniqueMatches];
}

function isTestPath(value: string): boolean {
  return (
    value.includes("/tests/") ||
    value.includes("/__tests__/") ||
    /\.test\./i.test(value) ||
    /\.spec\./i.test(value)
  );
}

function extractMentionedModules(referencedPaths: string[]): string[] {
  const modules = new Set<string>();

  for (const referencedPath of referencedPaths) {
    const normalizedPath = referencedPath.replace(/\\/g, "/");
    const baseName = normalizedPath.split("/").pop() ?? normalizedPath;
    const withoutExtension = baseName.replace(/\.[^.]+$/, "");

    if (withoutExtension.length > 0) {
      modules.add(withoutExtension.replace(/\.(test|spec)$/i, ""));
    }
  }

  return [...modules];
}

function extractRiskyPhrases(value: string): string[] {
  const riskyPhrases: string[] = [];

  for (const entry of riskPhrasePatterns) {
    if (entry.pattern.test(value)) {
      riskyPhrases.push(entry.phrase);
    }
  }

  return riskyPhrases;
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

  const baseTaskSpec = normalizeTaskSpec(taskInput);
  const mentionedPaths = extractReferencedPaths(taskInput.normalizedTaskText);
  const scope = (baseTaskSpec.scope?.length ?? 0) > 0
    ? [...(baseTaskSpec.scope ?? [])]
    : [...mentionedPaths];
  const explicitRequirements = baseTaskSpec.acceptanceCriteria.length > 0
    ? [...baseTaskSpec.acceptanceCriteria]
    : baseTaskSpec.goal
      ? [baseTaskSpec.goal]
      : [];
  const taskSpec: IntakeTaskSpec = {
    ...baseTaskSpec,
    scope,
    explicitRequirements,
    constraints: [...taskInput.constraints],
    mentionedPaths,
    mentionedTests: mentionedPaths.filter(isTestPath),
    mentionedModules: extractMentionedModules(mentionedPaths),
    riskyPhrases: extractRiskyPhrases(taskInput.normalizedTaskText),
    openQuestions: [...(taskInput.promptDetails?.openQuestions ?? [])],
  };
  const promptIsThin =
    taskInput.inputMode === "prompt" &&
    taskInput.ambiguities.some((ambiguity) => /too short|actionable/i.test(ambiguity));

  return {
    taskSpec,
    signals: {
      hasGoal: taskSpec.goal.trim().length > 0,
      hasAcceptanceCriteria: taskSpec.hasAcceptanceCriteria,
      referencedPaths: [...mentionedPaths],
      promptIsThin,
      promptRequirementCandidateCount: taskInput.promptDetails?.requirementCandidates.length ?? 0,
      promptOpenQuestionCategories: taskInput.promptDetails?.openQuestions.map((question) => question.category) ?? [],
    },
    ambiguities: [...taskInput.ambiguities],
    warnings: [],
    recommendedUserActions: [...taskInput.recommendedUserActions],
  };
}
