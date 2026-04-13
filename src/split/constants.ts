export const FORGE_SPLIT_COMMAND = "split" as const;
export const FORGE_SPLIT_STAGE = "step4" as const;
export const FORGE_SPLIT_FULL_COMMAND = `forge ${FORGE_SPLIT_COMMAND}` as const;
export const SPLIT_ARTIFACT_NAME = "split.json" as const;
export const SPLIT_REPORT_NAME = "split-report.md" as const;
export const SPLIT_DEBUG_ENV_VAR = "FORGE_SPLIT_DEBUG" as const;
export const SPLIT_DEBUG_ARTIFACT_NAME = "split-debug.json" as const;
export const SPLIT_DEBUG_WORKSTREAMS_NAME = "workstreams.json" as const;
export const SPLIT_DEBUG_MERGE_ORDER_NAME = "merge-order.json" as const;
export const SPLIT_DEBUG_BLOCKED_ITEMS_NAME = "blocked-items.json" as const;
export const SPLIT_DEBUG_STREAM_CONSTRAINTS_NAME = "stream-constraints.json" as const;
export const SPLIT_INPUT_TOO_WEAK = "SPLIT_INPUT_TOO_WEAK" as const;
export const SPLIT_EXECUTION_SCOPES = [
  "all_streams",
  "non_blocked_only",
  "none",
] as const;

export const SPLIT_STREAM_CATEGORIES = [
  "serial",
  "safe_parallel",
  "parallel_after_dependency",
  "protected_merge",
  "blocked",
] as const;

export const SPLIT_WORKSTREAM_REQUIRED_FIELDS = [
  "id",
  "title",
  "description",
  "category",
  "sourcePlanItemIds",
  "sourceVerificationCaseIds",
  "sourceFindingIds",
  "likelyAffectedPaths",
  "streamDependencies",
  "mergeOrderRequirements",
  "constraints",
  "blockedReason",
] as const;

export const SPLIT_CONSTRAINT_SOURCES = [
  "dependency_graph",
  "conflict_zone",
  "test_obligation",
  "verification_target",
  "verification_case",
  "structural_finding",
  "formal_finding",
  "verification_constraint",
  "carry_forward_concern",
  "planning_readiness",
  "verification_readiness",
] as const;

export const STEP4_SPLIT_PURPOSE =
  "Finish forge split as a V1-complete split stage and freeze it except for future bug fixes by transforming verified planning output into stable execution-ready workstreams that preserve dependency, verification, blocking, and merge-order constraints for clean Step 5 consumption." as const;

export const STEP4_BATCH3_FREEZE_GOAL =
  "Finish Step 4 as a V1-complete split stage and freeze it except for future bug fixes." as const;

export const STEP4_BATCH3_FINISH_LINE = [
  "`forge split` works reliably",
  "`.forge/split.json` is contract-stable",
  "`.forge/reports/split-report.md` is useful and consistent",
  "debug split artifacts can be emitted in a stable way",
  "warning/failure/readiness behavior is predictable",
  "aggressive regrouping remains auditable and traceable",
  "merge-order, blocked, and partially blocked semantics are stable",
  "tests are strong enough that only bug-fix work should remain",
  "Step 5 can consume Step 4 output without guessing",
] as const;

export const STEP4_BATCH3_REQUIRED_IMPLEMENTATION_TASKS = [
  "close remaining Step 4 gaps",
  "harden warnings, failures, readiness, and debug visibility",
  "harden regrouping semantics",
  "harden merge-order and blocking semantics",
  "align outputs for clean Step 5 consumption",
  "harden tests and freeze criteria",
] as const;

export const STEP4_IMPLEMENTATION_PRIORITIES = [
  ...STEP4_BATCH3_REQUIRED_IMPLEMENTATION_TASKS,
] as const;

export const STEP4_DETERMINISTIC_FIRST_NOTES = [
  "Consume the persisted Step 3 verify artifact instead of re-running broad verification logic.",
  "Load the referenced Step 2 plan artifact only as supporting structure for plan items, dependencies, conflict zones, test obligations, and parallelization signals.",
  "Treat Step 3 findings, constraints, carried-forward uncertainty, and split-readiness signals as authoritative safety inputs.",
  "Keep one real orchestration path from persisted Step 3 plus Step 2 output to persisted split outputs.",
  "Treat Batch 3 as the finish-and-freeze pass over the existing Step 4 runtime instead of a reason to start Step 5 behavior early.",
] as const;

export const STEP4_CONSERVATIVE_REGROUPING_NOTES = [
  "Keep the already-shipped stronger regrouping where it clearly improves execution readiness instead of reverting to placeholder one-stream-per-plan-item output.",
  "Keep source traceability and grouping rationale explicit so regrouped work stays auditable.",
  "Keep blocked and constrained work explicit instead of burying it inside broad stream descriptions.",
  "Harden aggressive regrouping semantics rather than widening them with new unstable experiments right before freeze.",
] as const;

export const STEP4_HONOR_MERGE_ORDER_ACTION =
  "Honor the explicit merge_order rules before execution and integration." as const;

export const STEP4_ALLOWED_SIDE_EFFECTS = [
  "read the Step 3 verify artifact",
  "read the Step 2 plan artifact referenced by Step 3",
  "validate the Step 3 handoff contract before split continues",
  "write split outputs inside the resolved output root",
  `optionally write internal split debug artifacts inside the resolved output root when ${SPLIT_DEBUG_ENV_VAR}=1`,
] as const;

export const STEP4_DEFERRED_CAPABILITIES = [
  "forge execute",
  "forge integrate",
  "interactive slash-command mode",
  "memory backends",
  "unrelated execution platform abstractions",
  "execution-packet prompt generation",
] as const;

export const STEP4_DISALLOWED_CAPABILITIES = [
  "execute code",
  "implement actual execution logic",
  "implement forge execute",
  "implement forge integrate",
  "modify code",
  "modify code as part of splitting",
  "edit source files directly",
  "create code-edit prompts or packets",
  "rewrite planning logic",
  "redo verification",
  "ignore verification constraints",
  "ignore TLC-backed failures or mitigations",
  "hide blocked work",
  "hide unresolved risk inside broad stream descriptions",
  "treat regrouping as a new experimental design space",
  "destabilize grouping semantics with experimental regrouping logic",
  "rename files for aesthetics only",
  "introduce large new abstractions",
  "reopen the Step 4 orchestrator shape without strong reason",
  "redesign Step 4 architecture without strong reason",
] as const;

export interface Step4BoundaryPolicy {
  command: string;
  stage: string;
  purpose: string;
  freezeGoal: string;
  finishLine: readonly string[];
  implementationPriorities: readonly string[];
  requiredImplementationTasks: readonly string[];
  authoritativeInputs: readonly string[];
  deterministicFirst: true;
  conservativeRegrouping: true;
  deterministicFirstNotes: readonly string[];
  conservativeRegroupingNotes: readonly string[];
  allowedSideEffects: readonly string[];
  deferredCapabilities: readonly string[];
  disallowedCapabilities: readonly string[];
}

export const STEP4_BOUNDARY_POLICY: Step4BoundaryPolicy = {
  command: FORGE_SPLIT_FULL_COMMAND,
  stage: FORGE_SPLIT_STAGE,
  purpose: STEP4_SPLIT_PURPOSE,
  freezeGoal: STEP4_BATCH3_FREEZE_GOAL,
  finishLine: STEP4_BATCH3_FINISH_LINE,
  implementationPriorities: STEP4_IMPLEMENTATION_PRIORITIES,
  requiredImplementationTasks: STEP4_BATCH3_REQUIRED_IMPLEMENTATION_TASKS,
  authoritativeInputs: [
    ".forge/verify.json",
    "source_plan.artifactPath",
    "plan_items",
    "dependency_graph",
    "conflict_zones",
    "test_obligations",
    "parallelization_signals",
    "verification_targets",
    "verification_cases",
    "findings",
    "constraints",
    "carry_forward",
    "verification_readiness",
  ] as const,
  deterministicFirst: true,
  conservativeRegrouping: true,
  deterministicFirstNotes: STEP4_DETERMINISTIC_FIRST_NOTES,
  conservativeRegroupingNotes: STEP4_CONSERVATIVE_REGROUPING_NOTES,
  allowedSideEffects: STEP4_ALLOWED_SIDE_EFFECTS,
  deferredCapabilities: STEP4_DEFERRED_CAPABILITIES,
  disallowedCapabilities: STEP4_DISALLOWED_CAPABILITIES,
} as const;
