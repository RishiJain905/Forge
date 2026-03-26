export const FORGE_VERIFY_COMMAND = "verify" as const;
export const FORGE_VERIFY_STAGE = "step3" as const;
export const FORGE_VERIFY_FULL_COMMAND = `forge ${FORGE_VERIFY_COMMAND}` as const;
export const VERIFY_ARTIFACT_NAME = "verify.json" as const;
export const VERIFY_REPORT_NAME = "verify-report.md" as const;
export const VERIFY_FORMAL_DIRECTORY_NAME = "formal" as const;
export const VERIFY_FORMAL_MODULE_PREFIX = "ForgeVerify" as const;
export const VERIFY_TLC_JAR_PATH_ENV_VAR = "FORGE_TLC_JAR_PATH" as const;
export const VERIFY_INPUT_TOO_WEAK = "VERIFY_INPUT_TOO_WEAK" as const;
export const VERIFY_TLA_SPEC_GENERATION_STATUSES = [
  "generated",
  "invalid_spec",
  "errored",
] as const;

export const STEP3_VERIFY_PURPOSE =
  "Transform Step 2 planning output into verified or constrained planning output by applying both structural verification and formal TLA+/TLC-backed verification to risky coordination/workflow logic." as const;

export const STEP3_DETERMINISTIC_FIRST_NOTES = [
  "Consume the persisted Step 2 plan artifact instead of re-planning from prose or re-running broad planning logic.",
  "Treat Step 2 plan structure, carried-forward uncertainty, and planning readiness as authoritative verification inputs.",
  "Keep target selection, lane assignment, and formal-lane entry deterministic-first so optional explanation can remain bounded later.",
] as const;

export const STEP3_ALLOWED_SIDE_EFFECTS = [
  "read the Step 2 plan artifact",
  "validate the Step 2 verification handoff contract before verification continues",
  "write verification outputs inside the resolved output root",
  "generate formal TLA+ and TLC artifacts inside the resolved output root",
  `invoke local TLC when ${VERIFY_TLC_JAR_PATH_ENV_VAR} is set`,
] as const;

export const STEP3_DEFERRED_CAPABILITIES = [
  "forge split",
  "forge execute",
  "forge integrate",
  "universal business-logic verification",
  "freeform LLM verification orchestration",
] as const;

export const STEP3_DISALLOWED_CAPABILITIES = [
  "re-plan the task from prose",
  "modify code",
  "split into workstreams",
  "generate execution packets",
  "hide weak plan inputs behind fake verification confidence",
  "claim proofs where TLC did not validate the case",
  "treat all plan work as equally worthy of formal modeling",
] as const;

export const VERIFY_SUPPORTED_LANES = [
  "structural",
  "formal",
] as const;

export const VERIFY_TARGET_REQUIRED_FIELDS = [
  "id",
  "title",
  "category",
  "sourcePlanItemIds",
  "riskSummary",
  "candidateLanes",
  "sourceRiskSources",
  "expectedFindingKinds",
  "verificationCaseIds",
  "traceabilityNotes",
] as const;

export const VERIFY_TARGET_RISK_SOURCES = [
  "plan_item_verification_relevance",
  "test_obligation",
  "conflict_zone",
  "parallelization_signal",
  "carry_forward_concern",
  "initial_verification_target",
] as const;

export const VERIFY_STRUCTURAL_FOCUS_AREAS = [
  "dependency_contradiction",
  "unsafe_sequencing",
  "unsafe_parallelization",
  "conflict_zone_hazard",
  "merge_or_serialization_contradiction",
] as const;

export const VERIFY_FORMAL_FOCUS_AREAS = [
  "retry_logic",
  "handoff_logic",
  "ownership_transition",
  "duplicate_execution_risk",
  "stale_write_risk",
  "ordering_constraint",
] as const;

export const VERIFY_FORMAL_ENTRY_CRITERIA = [
  "state_machine_like",
  "multi_actor_or_interleaving",
  "retry_or_reassignment",
  "ownership_or_version_validity",
  "ordering_critical",
  "structural_check_insufficient",
] as const;

export const VERIFY_STATE_MODEL_REQUIRED_FIELDS = [
  "actors",
  "entities",
  "states",
  "transitions",
  "unsafe_states",
  "invariants",
  "initial_conditions",
] as const;

export const VERIFY_FORMAL_TOOLING = [
  "TLA+",
  "TLC",
] as const;

export const VERIFY_TLC_STATUSES = [
  "not_run",
  "passed",
  "failed",
  "errored",
  "invalid_spec",
] as const;

export const VERIFY_CASE_STATUSES = [
  "not_run",
  "passed",
  "failed",
  "errored",
  "invalid_spec",
] as const;

export interface VerifyFormalLanePolicy {
  tooling: readonly string[];
  focusAreas: readonly string[];
  entryCriteria: readonly string[];
  stateModelRequiredFields: readonly string[];
  tlcStatuses: readonly string[];
}

export interface Step3BoundaryPolicy {
  command: string;
  stage: string;
  purpose: string;
  authoritativeInputs: readonly string[];
  deterministicFirst: true;
  allowedSideEffects: readonly string[];
  deferredCapabilities: readonly string[];
  disallowedCapabilities: readonly string[];
  supportedLanes: readonly string[];
  formalLane: VerifyFormalLanePolicy;
}

export const STEP3_BOUNDARY_POLICY: Step3BoundaryPolicy = {
  command: FORGE_VERIFY_FULL_COMMAND,
  stage: FORGE_VERIFY_STAGE,
  purpose: STEP3_VERIFY_PURPOSE,
  authoritativeInputs: [
    ".forge/plan.json",
    "source_intake",
    "plan_item_contract",
    "plan_items",
    "dependency_graph",
    "conflict_zones",
    "test_obligations",
    "parallelization_signals",
    "carry_forward",
    "planning_diagnostics",
    "planning_readiness",
  ] as const,
  deterministicFirst: true,
  allowedSideEffects: STEP3_ALLOWED_SIDE_EFFECTS,
  deferredCapabilities: STEP3_DEFERRED_CAPABILITIES,
  disallowedCapabilities: STEP3_DISALLOWED_CAPABILITIES,
  supportedLanes: VERIFY_SUPPORTED_LANES,
  formalLane: {
    tooling: VERIFY_FORMAL_TOOLING,
    focusAreas: VERIFY_FORMAL_FOCUS_AREAS,
    entryCriteria: VERIFY_FORMAL_ENTRY_CRITERIA,
    stateModelRequiredFields: VERIFY_STATE_MODEL_REQUIRED_FIELDS,
    tlcStatuses: VERIFY_TLC_STATUSES,
  },
} as const;
