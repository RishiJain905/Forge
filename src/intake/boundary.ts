import type {
  AssembledIntakeResult,
  BoundarySafeIntakeResult,
  IntakeExecutionContext,
  InitialVerificationTarget,
  NormalizedTaskInput,
} from "./types.js";

const WORK_SPLITTING_PATTERN = /\b(workstream|split\b|parallel(?:ize|ization)?|ownership)\b/i;
const FORMAL_VERIFICATION_PATTERN =
  /\b(formal verification|model check(?:ing)?|tla\+|tlc)\b/i;
const DEFERRED_CAPABILITIES_PATTERN =
  /\b(advanced AST|multi-language semantic analysis|issue-tracker ingestion|provider-specific execution prompt generation)\b/i;

function pushUnique(values: string[], value: string): void {
  if (!values.includes(value)) {
    values.push(value);
  }
}


function buildBoundaryNotes(params: {
  context: IntakeExecutionContext;
  taskInput: NormalizedTaskInput | null;
}): string[] {
  const notes = [
    "Intake is limited to repository inspection and artifact/report persistence.",
    "Implementation-oriented requests are recorded as intake context only; Step 1 defers code edits and implementation work to later workflow steps.",
    "Advanced AST and multi-language semantic analysis, issue-tracker ingestion, and provider-specific execution prompt generation are deferred to later workflow steps.",
    "Step 1 emits initial verification targets only; later workflow steps remain deferred, and this run does not perform forge plan, forge verify, workstream splitting, or execution packet creation.",
    params.context.paths.usedFallbackRoot
      ? "The requested output directory was rejected and Forge fell back to the default .forge output root."
      : "All writes are confined to the resolved output root.",
  ];
  const taskText = params.taskInput?.normalizedTaskText ?? "";

  if (WORK_SPLITTING_PATTERN.test(taskText)) {
    pushUnique(
      notes,
      "Work splitting was mentioned in the request, but Step 1 only records intake context; actual workstreams are deferred to later workflow steps.",
    );
  }

  if (FORMAL_VERIFICATION_PATTERN.test(taskText)) {
    pushUnique(
      notes,
      "Formal verification was mentioned in the request, but Step 1 only records initial verification targets; formal verification work is deferred.",
    );
  }

  if (DEFERRED_CAPABILITIES_PATTERN.test(taskText)) {
    pushUnique(
      notes,
      "The request mentioned advanced AST analysis, issue-tracker ingestion, or provider-specific execution prompt generation, but Step 1 only records intake context; those capabilities are deferred.",
    );
  }

  return notes;
}

export function buildBoundarySafeIntakeResult(params: {
  context: IntakeExecutionContext;
  taskInput: NormalizedTaskInput | null;
  assembledResult: AssembledIntakeResult;
  initialVerificationTargets: InitialVerificationTarget[];
}): BoundarySafeIntakeResult {
  return {
    taskSpec: params.assembledResult.taskSpec,
    repoContext: params.assembledResult.repoContext,
    candidateTargets: params.assembledResult.candidateTargets,
    initialVerificationTargets: params.initialVerificationTargets,
    ambiguities: [...params.assembledResult.ambiguities],
    warnings: [...params.assembledResult.warnings],
    recommendedUserActions: [...params.assembledResult.recommendedUserActions],
    boundaryNotes: buildBoundaryNotes({
      context: params.context,
      taskInput: params.taskInput,
    }),
  };
}
