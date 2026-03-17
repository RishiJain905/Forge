import type {
  AssembledIntakeResult,
  BoundarySafeIntakeResult,
  CandidateTarget,
  IntakeExecutionContext,
  InitialVerificationTarget,
  NormalizedTaskInput,
} from "./types.js";

const WORK_SPLITTING_PATTERN = /\b(workstream|split\b|parallel(?:ize|ization)?|ownership)\b/i;
const FORMAL_VERIFICATION_PATTERN =
  /\b(formal verification|model check(?:ing)?|tla\+|tlc)\b/i;

function pushUnique(values: string[], value: string): void {
  if (!values.includes(value)) {
    values.push(value);
  }
}

function toVerificationReason(target: CandidateTarget): string {
  if (target.kind === "test") {
    return "Initial test surface related to the requested change.";
  }

  if (target.kind === "manifest") {
    return "Configuration or manifest surface that may constrain later verification.";
  }

  return "Initial code surface to inspect before later verification work.";
}

function buildInitialVerificationTargets(
  candidateTargets: CandidateTarget[],
): InitialVerificationTarget[] {
  const seen = new Set<string>();
  const targets: InitialVerificationTarget[] = [];

  for (const candidateTarget of candidateTargets) {
    const key = `${candidateTarget.kind}:${candidateTarget.path}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    targets.push({
      path: candidateTarget.path,
      kind: candidateTarget.kind,
      reason: toVerificationReason(candidateTarget),
    });
  }

  return targets;
}

function buildBoundaryNotes(params: {
  context: IntakeExecutionContext;
  taskInput: NormalizedTaskInput | null;
}): string[] {
  const notes = [
    "Intake is limited to repository inspection and artifact/report persistence.",
    "Implementation-oriented requests are recorded as intake context only; Step 1 defers code edits and implementation work to later workflow steps.",
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

  return notes;
}

export function buildBoundarySafeIntakeResult(params: {
  context: IntakeExecutionContext;
  taskInput: NormalizedTaskInput | null;
  assembledResult: AssembledIntakeResult;
}): BoundarySafeIntakeResult {
  return {
    taskSpec: params.assembledResult.taskSpec,
    repoContext: params.assembledResult.repoContext,
    candidateTargets: params.assembledResult.candidateTargets,
    initialVerificationTargets: buildInitialVerificationTargets(
      params.assembledResult.candidateTargets,
    ),
    ambiguities: [...params.assembledResult.ambiguities],
    warnings: [...params.assembledResult.warnings],
    recommendedUserActions: [...params.assembledResult.recommendedUserActions],
    boundaryNotes: buildBoundaryNotes({
      context: params.context,
      taskInput: params.taskInput,
    }),
  };
}
