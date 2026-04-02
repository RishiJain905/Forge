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
  "Transform verified planning output into safe execution-ready workstreams that preserve dependency, verification, and merge-order constraints." as const;

export const STEP4_DETERMINISTIC_FIRST_NOTES = [
  "Consume the persisted Step 3 verify artifact instead of re-running broad verification logic.",
  "Load the referenced Step 2 plan artifact only as supporting structure for plan items, dependencies, conflict zones, test obligations, and parallelization signals.",
  "Treat Step 3 findings, constraints, carried-forward uncertainty, and split-readiness signals as authoritative safety inputs.",
  "Keep the split skeleton deterministic-first so later assistive phrasing cannot override the safety model.",
] as const;

export const STEP4_CONSERVATIVE_REGROUPING_NOTES = [
  "Preserve the Step 2 and Step 3 structure where possible instead of aggressively recomposing work.",
  "Only regroup when safety and clarity clearly improve.",
  "Keep blocked work explicit instead of burying it inside broad stream descriptions.",
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
  "interactive shell behavior",
  "memory backends",
  "execution-packet prompt generation",
  "freeform regrouping optimization",
] as const;

export const STEP4_DISALLOWED_CAPABILITIES = [
  "execute code",
  "modify code",
  "edit source files directly",
  "rewrite planning logic",
  "redo verification",
  "ignore TLC-backed failures or mitigations",
  "hide blocked work",
  "hide unresolved risk inside broad stream descriptions",
  "act like a freeform project-manager step",
  "aggressively regroup work without a clear safety gain",
] as const;

export interface Step4BoundaryPolicy {
  command: string;
  stage: string;
  purpose: string;
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
