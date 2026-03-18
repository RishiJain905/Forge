import type {
  Ambiguity,
  IntakeTaskSpec,
  NormalizedTaskInput,
  PromptOpenQuestion,
  TaskParserResult,
  WarningItem,
} from "./types.js";

type TaskSectionKey =
  | "summary"
  | "goal"
  | "scope"
  | "acceptanceCriteria"
  | "constraints";

interface ParsedTaskDocument {
  titleCandidate: string;
  proseLines: string[];
  sections: Record<TaskSectionKey, string[]>;
}

const explicitPathToken = /\b(?:[\w.-]+\/)+[\w.-]+\b/g;
const headingPattern = /^#{1,6}\s*(.+)$/;
const checklistItemPattern = /^(?:[-*+]|(?:\d+\.))\s+\[[ xX]\]\s+(.*)$/;
const listItemPattern = /^(?:[-*+]|(?:\d+\.))\s+(.*)$/;
const summaryHeadingPattern = /^(?:summary|overview|purpose|description)\b:?$/i;
const goalHeadingPattern = /^(?:goal|objective)\b:?$/i;
const scopeHeadingPattern = /^(?:scope|in scope|in-scope)\b:?$/i;
const acceptanceCriteriaHeadingPattern = /^(?:#{1,6}\s*)?acceptance criteria\b:?/im;
const constraintsHeadingPattern = /^(?:constraints|non-goals|non goals|limitations)\b:?$/i;
const riskPhrasePatterns = [
  { phrase: "api contract", pattern: /\bapi contract\b/i },
  { phrase: "migration", pattern: /\bmigrat(?:e|ion)\b/i },
  { phrase: "ownership", pattern: /\bownership\b/i },
  { phrase: "parallel", pattern: /\bparallel(?:ize|ization)?\b/i },
  { phrase: "retry", pattern: /\bretry\b/i },
  { phrase: "stale write", pattern: /\bstale write\b/i },
];
const actionableLinePattern =
  /\b(add|change|create|develop|ensure|implement|keep|maintain|migrate|plan|refactor|review|update|verify|cover|coordinate|align|handle|introduce|adjust|preserve|tighten|support|rework|replace)\b/i;
const backgroundLinePattern =
  /^(?:background|context|note|notes|for context|reference|references|history)\s*:/i;
const genericTitlePattern = /^(?:task|spec|request)$/i;

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function dedupeStable(values: string[]): string[] {
  const seen = new Set<string>();
  const deduped: string[] = [];

  for (const value of values) {
    const normalized = normalizeWhitespace(value);
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    deduped.push(normalized);
  }

  return deduped;
}

function normalizeListEntry(value: string): string {
  const listMatch = value.match(listItemPattern);
  if (listMatch?.[1]) {
    return normalizeWhitespace(listMatch[1]);
  }

  const checklistMatch = value.match(checklistItemPattern);
  if (checklistMatch?.[1]) {
    return normalizeWhitespace(checklistMatch[1]);
  }

  return normalizeWhitespace(value);
}

function isHeadingLine(value: string): boolean {
  return headingPattern.test(value);
}

function classifyHeading(value: string): TaskSectionKey | null {
  const normalized = normalizeWhitespace(value).toLowerCase();

  if (summaryHeadingPattern.test(normalized)) {
    return "summary";
  }

  if (goalHeadingPattern.test(normalized)) {
    return "goal";
  }

  if (scopeHeadingPattern.test(normalized)) {
    return "scope";
  }

  if (acceptanceCriteriaHeadingPattern.test(normalized)) {
    return "acceptanceCriteria";
  }

  if (constraintsHeadingPattern.test(normalized)) {
    return "constraints";
  }

  return null;
}

function parseTaskDocument(lines: string[]): ParsedTaskDocument {
  const sections: Record<TaskSectionKey, string[]> = {
    summary: [],
    goal: [],
    scope: [],
    acceptanceCriteria: [],
    constraints: [],
  };
  let currentSection: TaskSectionKey | null = null;
  let titleCandidate = "";
  let proseCandidate = "";

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    const headingMatch = trimmed.match(headingPattern);
    const headingText = headingMatch?.[1]
      ? normalizeWhitespace(headingMatch[1].replace(/[:\s]+$/, ""))
      : normalizeWhitespace(trimmed.replace(/[:\s]+$/, ""));
    const section = classifyHeading(headingText);

    if (section) {
      currentSection = section;
      continue;
    }

    if (headingMatch?.[1]) {
      currentSection = null;

      if (!titleCandidate) {
        titleCandidate = headingText;
      }

      continue;
    }

    if (currentSection) {
      sections[currentSection].push(trimmed);
      continue;
    }

    proseCandidate = proseCandidate || trimmed;

    if (!titleCandidate && !listItemPattern.test(trimmed) && !checklistItemPattern.test(trimmed)) {
      titleCandidate = trimmed;
    }
  }

  return {
    titleCandidate: titleCandidate || proseCandidate,
    proseLines: dedupeStable(
      lines
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && !isHeadingLine(line) && !listItemPattern.test(line)),
    ),
    sections,
  };
}

function sectionEntries(lines: string[]): string[] {
  return dedupeStable(lines.map(normalizeListEntry));
}

function extractSummary(document: ParsedTaskDocument, promptDetails: NormalizedTaskInput["promptDetails"]): string {
  const summary = sectionEntries(document.sections.summary).join(" ");
  if (summary.length > 0) {
    return summary;
  }

  if (promptDetails?.summary) {
    return normalizeWhitespace(promptDetails.summary);
  }

  return "";
}

function extractGoal(document: ParsedTaskDocument, promptDetails: NormalizedTaskInput["promptDetails"]): string {
  const titleCandidate = genericTitlePattern.test(document.titleCandidate)
    ? ""
    : document.titleCandidate;
  const goal = sectionEntries(document.sections.goal)[0] || document.proseLines[0] || titleCandidate;
  if (goal.length > 0) {
    return goal;
  }

  if (promptDetails?.goal) {
    return normalizeWhitespace(promptDetails.goal);
  }

  return "";
}

function extractTitle(document: ParsedTaskDocument, promptDetails: NormalizedTaskInput["promptDetails"], inputMode: NormalizedTaskInput["inputMode"]): string {
  if (inputMode === "prompt" && promptDetails?.title) {
    return normalizeWhitespace(promptDetails.title);
  }

  if (document.titleCandidate.length > 0 && !genericTitlePattern.test(document.titleCandidate)) {
    return normalizeWhitespace(document.titleCandidate);
  }

  if (document.proseLines[0]) {
    return normalizeWhitespace(document.proseLines[0]);
  }

  if (promptDetails?.title) {
    return normalizeWhitespace(promptDetails.title);
  }

  return "";
}

function extractScope(document: ParsedTaskDocument, mentionedPaths: string[]): string[] {
  const scope = sectionEntries(document.sections.scope);
  return scope.length > 0 ? scope : dedupeStable(mentionedPaths);
}

function extractAcceptanceCriteria(document: ParsedTaskDocument, promptDetails: NormalizedTaskInput["promptDetails"]): string[] {
  const criteria = sectionEntries(document.sections.acceptanceCriteria);

  if (criteria.length > 0) {
    return criteria;
  }

  const promptCriteria = promptDetails?.requirementCandidates
    ?.filter((candidate) => candidate.source === "acceptance-criteria")
    .map((candidate) => candidate.text ?? "") ?? [];

  return dedupeStable(promptCriteria);
}

function buildAnalysisText(taskSpec: IntakeTaskSpec): string {
  return [
    taskSpec.title ?? "",
    taskSpec.summary ?? "",
    taskSpec.goal ?? "",
    ...(taskSpec.scope ?? []),
    ...(taskSpec.acceptanceCriteria ?? []),
    ...(taskSpec.explicitRequirements ?? []),
    ...(taskSpec.constraints ?? []),
  ]
    .filter((value) => value.trim().length > 0)
    .join("\n");
}

function extractReferencedPaths(value: string): string[] {
  const matches = value.match(explicitPathToken) ?? [];
  return dedupeStable(matches);
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
  const modules: string[] = [];

  for (const referencedPath of referencedPaths) {
    const normalizedPath = referencedPath.replace(/\\/g, "/");
    const baseName = normalizedPath.split("/").pop() ?? normalizedPath;
    const withoutExtension = baseName.replace(/\.[^.]+$/, "");
    const moduleName = withoutExtension.replace(/\.(test|spec)$/i, "");

    if (moduleName.length > 0) {
      modules.push(moduleName);
    }
  }

  return dedupeStable(modules);
}

function isActionableRiskSegment(text: string, section: "title" | "summary" | "goal" | "scope" | "acceptanceCriteria" | "explicitRequirements" | "constraints"): boolean {
  const normalized = normalizeWhitespace(text);

  if (!normalized || backgroundLinePattern.test(normalized)) {
    return false;
  }

  if (section === "acceptanceCriteria") {
    return true;
  }

  return actionableLinePattern.test(normalized);
}

function extractRiskyPhrases(taskSpec: IntakeTaskSpec): string[] {
  const segments = [
    { text: taskSpec.title ?? "", section: "title" as const },
    { text: taskSpec.summary ?? "", section: "summary" as const },
    { text: taskSpec.goal ?? "", section: "goal" as const },
    ...((taskSpec.scope ?? []).map((text) => ({ text, section: "scope" as const }))),
    ...((taskSpec.acceptanceCriteria ?? []).map((text) => ({ text, section: "acceptanceCriteria" as const }))),
    ...((taskSpec.explicitRequirements ?? []).map((text) => ({ text, section: "explicitRequirements" as const }))),
    ...((taskSpec.constraints ?? []).map((text) => ({ text, section: "constraints" as const }))),
  ];
  const riskyPhrases: string[] = [];

  for (const segment of segments) {
    if (!isActionableRiskSegment(segment.text, segment.section)) {
      continue;
    }

    for (const entry of riskPhrasePatterns) {
      if (entry.pattern.test(segment.text)) {
        riskyPhrases.push(entry.phrase);
      }
    }
  }

  return dedupeStable(riskyPhrases);
}

function addIfMissing(values: string[], value: string): void {
  if (!values.includes(value)) {
    values.push(value);
  }
}

function buildImplementationNecessities(taskSpec: IntakeTaskSpec): string[] {
  const necessities: string[] = [];
  const analysisText = buildAnalysisText(taskSpec);
  const riskyPhrases = new Set(taskSpec.riskyPhrases ?? []);
  const referencedPaths = taskSpec.mentionedPaths ?? [];
  const testPaths = taskSpec.mentionedTests ?? [];

  if (
    /\btest(s|ing)?\b/i.test(analysisText) ||
    analysisText.includes(".test.") ||
    analysisText.includes(".spec.") ||
    (taskSpec.acceptanceCriteria ?? []).some((criterion) => /\btest(s|ing)?\b/i.test(criterion))
  ) {
    addIfMissing(necessities, "Update or add tests for the impacted behavior.");
  }

  if (/package\.json|tsconfig|config|manifest/i.test(analysisText)) {
    addIfMissing(necessities, "Review manifest or configuration impact before implementation.");
  }

  if (riskyPhrases.has("migration") || /\bmigrat(?:e|ion)\b/i.test(analysisText)) {
    addIfMissing(necessities, "Plan migration sequencing before implementation.");
  }

  if (riskyPhrases.has("ownership") || riskyPhrases.has("parallel") || /\bownership\b|\bparallel(?:ize|ization)?\b/i.test(analysisText)) {
    addIfMissing(necessities, "Coordinate ownership and parallelization before implementation.");
  }

  if (
    /\balign(?:ed|ment)?\b/i.test(analysisText) ||
    /\bkeep\b.*\balign(?:ed|ment)?\b/i.test(analysisText) ||
    (referencedPaths.length > 1 && testPaths.length > 0)
  ) {
    addIfMissing(necessities, "Coordinate ownership and parallelization before implementation.");
  }

  if (riskyPhrases.has("retry") || /\bretry\b/i.test(analysisText)) {
    addIfMissing(necessities, "Verify retry behavior before implementation.");
  }

  if (riskyPhrases.has("stale write") || /\bstale write\b/i.test(analysisText)) {
    addIfMissing(necessities, "Verify stale write handling before implementation.");
  }

  if (riskyPhrases.has("api contract") || /\bapi contract\b/i.test(analysisText)) {
    addIfMissing(necessities, "Verify API contract impact before implementation.");
  }

  return necessities;
}

function isPromptTooShortToBeActionable(taskInput: NormalizedTaskInput): boolean {
  if (taskInput.inputMode !== "prompt") {
    return false;
  }

  const prompt = taskInput.primaryInput.rawText;
  const nonWhitespaceLength = prompt.replace(/\s+/g, "").length;
  const wordCount = prompt.trim().split(/\s+/).filter(Boolean).length;
  const hasStructuralSignal =
    Boolean(prompt.match(explicitPathToken)) ||
    acceptanceCriteriaHeadingPattern.test(prompt);

  return (nonWhitespaceLength < 20 || wordCount < 4) && !hasStructuralSignal;
}

function buildOpenQuestions(params: {
  taskSpec: IntakeTaskSpec;
  taskInput: NormalizedTaskInput;
  hasAcceptanceCriteriaSection: boolean;
  hasScopeSection: boolean;
  hasConstraintsSection: boolean;
}): PromptOpenQuestion[] {
  const openQuestions: PromptOpenQuestion[] = [];
  const hasGroundedScope =
    params.hasScopeSection ||
    (params.taskSpec.scope?.length ?? 0) > 0 ||
    (params.taskSpec.mentionedPaths?.length ?? 0) > 0;
  const shouldAskForConstraints =
    !params.hasConstraintsSection &&
    (
      isPromptTooShortToBeActionable(params.taskInput) ||
      (params.taskSpec.riskyPhrases?.length ?? 0) > 0 ||
      (
        params.taskInput.inputMode === "prompt" &&
        (params.taskSpec.mentionedPaths?.length ?? 0) === 0
      )
    );

  if (!params.hasAcceptanceCriteriaSection && !params.taskSpec.hasAcceptanceCriteria) {
    openQuestions.push({
      category: "acceptance_criteria",
      text: "What acceptance criteria define success for this task?",
    });
  }

  if (!hasGroundedScope) {
    openQuestions.push({
      category: "scope",
      text: "Which concrete files, modules, or bounded behavior should this task change?",
    });
  }

  if (shouldAskForConstraints) {
    openQuestions.push({
      category: "constraints",
      text: "What constraints, non-goals, or rollout limits should bound this task?",
    });
  }

  return dedupeOpenQuestions(openQuestions);
}

function dedupeOpenQuestions(openQuestions: PromptOpenQuestion[]): PromptOpenQuestion[] {
  const seen = new Set<string>();
  const deduped: PromptOpenQuestion[] = [];

  for (const question of openQuestions) {
    const key = `${question.category}:${normalizeWhitespace(question.text).toLowerCase()}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(question);
  }

  return deduped;
}

function toAmbiguityItems(openQuestions: PromptOpenQuestion[]): Ambiguity[] {
  return openQuestions.map((question) => ({
    type: question.category,
    severity: question.category === "acceptance_criteria" ? "high" : "medium",
    message: question.text,
  }));
}

function toWarningItems(openQuestions: PromptOpenQuestion[]): WarningItem[] {
  return openQuestions.map((question) => ({
    code:
      question.category === "acceptance_criteria"
        ? "ACCEPTANCE_CRITERIA_MISSING"
        : question.category === "scope"
          ? "SCOPE_MISSING"
          : question.category === "constraints"
            ? "CONSTRAINTS_MISSING"
            : "INPUT_AMBIGUOUS",
    message: question.text,
  }));
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
    implementationNecessities: [],
    constraints: [],
    mentionedPaths: [],
    mentionedTests: [],
    mentionedModules: [],
    riskyPhrases: [],
    openQuestions: [],
  };
}

export function normalizeTaskSpec(taskInput: NormalizedTaskInput): IntakeTaskSpec {
  const document = parseTaskDocument(taskInput.parserInputText.split(/\r?\n/));
  const title = extractTitle(document, taskInput.promptDetails, taskInput.inputMode);
  const goal = extractGoal(document, taskInput.promptDetails);
  const summary = extractSummary(document, taskInput.promptDetails) || goal;
  const scope = extractScope(document, []);
  const acceptanceCriteria = extractAcceptanceCriteria(document, taskInput.promptDetails);
  const constraints = sectionEntries(document.sections.constraints);
  const explicitRequirements = acceptanceCriteria.length > 0
    ? [...acceptanceCriteria]
    : goal
      ? [goal]
      : [];
  const taskSpec: IntakeTaskSpec = {
    title,
    summary,
    goal,
    scope,
    acceptanceCriteria,
    hasAcceptanceCriteria: acceptanceCriteria.length > 0,
    explicitRequirements,
    implementationNecessities: [],
    constraints,
    mentionedPaths: [],
    mentionedTests: [],
    mentionedModules: [],
    riskyPhrases: [],
    openQuestions: [],
  };
  const analysisText = buildAnalysisText(taskSpec);
  const mentionedPaths = extractReferencedPaths(analysisText);
  const finalScope = scope.length > 0 ? scope : dedupeStable(mentionedPaths);
  const finalTaskSpec: IntakeTaskSpec = {
    ...taskSpec,
    scope: finalScope,
    mentionedPaths,
    mentionedTests: mentionedPaths.filter(isTestPath),
    mentionedModules: extractMentionedModules(mentionedPaths),
    riskyPhrases: extractRiskyPhrases({
      ...taskSpec,
      scope: finalScope,
      mentionedPaths,
      mentionedTests: mentionedPaths.filter(isTestPath),
      mentionedModules: extractMentionedModules(mentionedPaths),
      implementationNecessities: [],
      riskyPhrases: [],
      openQuestions: [],
    }),
  };

  return {
    ...finalTaskSpec,
    implementationNecessities: buildImplementationNecessities(finalTaskSpec),
  };
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
      ambiguityItems: [],
      warningItems: [],
      ambiguities: [],
      warnings: [
        "Task parsing could not produce a normalized task input, so downstream intake analysis is operating with defaults.",
      ],
      recommendedUserActions: [],
    };
  }

  const document = parseTaskDocument(taskInput.parserInputText.split(/\r?\n/));
  const taskSpec = normalizeTaskSpec(taskInput);
  const hasAcceptanceCriteriaSection = document.sections.acceptanceCriteria.length > 0;
  const hasScopeSection = document.sections.scope.length > 0;
  const hasConstraintsSection = document.sections.constraints.length > 0;
  const openQuestions = buildOpenQuestions({
    taskSpec,
    taskInput,
    hasAcceptanceCriteriaSection,
    hasScopeSection,
    hasConstraintsSection,
  });
  const ambiguityItems = toAmbiguityItems(openQuestions);
  const warningItems = toWarningItems(openQuestions);
  const parserWarnings: string[] = [];
  const recommendedUserActions = [...taskInput.recommendedUserActions];

  if (isPromptTooShortToBeActionable(taskInput)) {
    addIfMissing(
      parserWarnings,
      "Prompt mode input is too short to be actionable without follow-up. Clarify the goal, relevant files, or acceptance criteria.",
    );
    addIfMissing(
      recommendedUserActions,
      "Expand the prompt with the intended files, behavior changes, or acceptance criteria before planning.",
    );
  }

  return {
    taskSpec: {
      ...taskSpec,
      openQuestions,
    },
    signals: {
      hasGoal: taskSpec.goal.trim().length > 0,
      hasAcceptanceCriteria: taskSpec.hasAcceptanceCriteria,
      referencedPaths: [...(taskSpec.mentionedPaths ?? [])],
      promptIsThin: isPromptTooShortToBeActionable(taskInput),
      promptRequirementCandidateCount: taskInput.promptDetails?.requirementCandidates.length ?? 0,
      promptOpenQuestionCategories: openQuestions.map((question) => question.category),
    },
    ambiguityItems,
    warningItems,
    ambiguities: dedupeStable([...taskInput.ambiguities]),
    warnings: dedupeStable([...parserWarnings]),
    recommendedUserActions,
  };
}
