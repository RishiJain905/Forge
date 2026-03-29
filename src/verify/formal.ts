import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import path from "node:path";

import { persistIntakeOutputs } from "../intake/persistence.js";
import { resolveOutputFilePath } from "../intake/path-policy.js";
import {
  VERIFY_FORMAL_DIRECTORY_NAME,
  VERIFY_FORMAL_MODULE_PREFIX,
  VERIFY_TLC_JAR_PATH_ENV_VAR,
} from "./constants.js";
import type {
  VerifyCaseFormalDetails,
  VerifyFormalEntryCriterion,
  VerifyFormalScenarioKind,
  VerifyFormalVerification,
  VerifyFoundationResult,
  VerifyFormalSupportedCategory,
  VerifyStateModel,
  VerifyTargetRiskSource,
  VerifyTlaSpec,
  VerifyTlaSpecGenerationStatus,
  VerifyTlcResult,
  VerifyTlcStatus,
  VerifyVerificationCase,
  VerifyVerificationCategory,
  VerifyVerificationModel,
  VerifyVerificationTarget,
} from "./types.js";

type FormalTemplate = {
  actionLabel: string;
  scenarioActionLabel?: string;
  actors: string[];
  entities: string[];
  states: string[];
  transitions: Array<[string, string]>;
  unsafeStates: string[];
  unsafeConditions: string[];
  invariants: string[];
  initialConditions: string[];
  initialState: string;
  summary: string;
  unsupportedReason: string | null;
};

type FormalTemplateOverlay = Partial<Omit<FormalTemplate, "unsupportedReason">>;

type ProcessResult = {
  code: number | null;
  stdout: string;
  stderr: string;
  error: Error | null;
};

type ProcessInvocation = {
  command: string;
  args: string[];
  windowsVerbatimArguments?: boolean;
};

export interface VerifyFormalArtifactNames {
  stateModelId: string;
  tlaSpecId: string;
  tlcResultId: string;
  moduleName: string;
  specBaseName: string;
}

export interface VerifyFormalExecutionResult {
  cases: VerifyVerificationCase[];
  formalVerification: VerifyFormalVerification;
  findings: string[];
  constraints: string[];
}

export const VERIFY_SUPPORTED_FORMAL_CATEGORIES = [
  "retry_logic",
  "ownership",
  "parallel_overlap",
  "stale_write",
  "migration_order",
] as const satisfies readonly VerifyFormalSupportedCategory[];

export const VERIFY_FORMAL_SCENARIO_KINDS_BY_CATEGORY = {
  migration_order: [
    "ordering_serialization",
    "shared_artifact_merge_order",
  ],
  ownership: [
    "ownership_transition",
    "multi_agent_handoff_chain",
  ],
  parallel_overlap: [
    "duplicate_execution",
    "shared_resource_mutation_overlap",
  ],
  retry_logic: [
    "retry_reassignment",
    "queue_claim_release_lifecycle",
    "failure_recovery_loop",
  ],
  stale_write: [
    "stale_write_validity",
  ],
} as const satisfies Record<VerifyFormalSupportedCategory, readonly VerifyFormalScenarioKind[]>;

const FORMAL_TEMPLATE_BY_CATEGORY: Record<VerifyFormalSupportedCategory, Omit<FormalTemplate, "unsupportedReason">> = {
  retry_logic: {
    actionLabel: "RetryOrReassign",
    actors: ["worker", "scheduler"],
    entities: ["job", "retry budget"],
    states: ["pending", "claimed", "retry_queued", "completed", "failed"],
    transitions: [
      ["pending", "claimed"],
      ["claimed", "retry_queued"],
      ["retry_queued", "claimed"],
      ["claimed", "completed"],
      ["claimed", "failed"],
    ],
    unsafeStates: ["completed_after_failed_retry"],
    unsafeConditions: [
      "A retry reaches completed without re-entering claimed.",
      "A failed retry completes after the retry budget is exhausted.",
    ],
    invariants: [
      "A job cannot complete twice.",
      "A retry must re-enter claimed before the next completion attempt.",
    ],
    initialConditions: ["The job starts pending with zero retries consumed."],
    initialState: "pending",
    summary: "Retry reassignment loop with bounded retry budget and explicit reclaim.",
  },
  ownership: {
    actionLabel: "OwnershipTransition",
    actors: ["owner", "handoff_receiver"],
    entities: ["resource", "lease"],
    states: ["unowned", "owned", "handoff_pending", "released", "completed"],
    transitions: [
      ["unowned", "owned"],
      ["owned", "handoff_pending"],
      ["handoff_pending", "released"],
      ["released", "completed"],
    ],
    unsafeStates: ["dual_ownership"],
    unsafeConditions: [
      "A resource has two active owners at the same time.",
      "A handoff completes without first releasing ownership.",
    ],
    invariants: [
      "At most one owner is active at a time.",
      "A handoff must release before the next owner can complete.",
    ],
    initialConditions: ["The resource starts unowned."],
    initialState: "unowned",
    summary: "Ownership transition with a single active lease and explicit release.",
  },
  parallel_overlap: {
    actionLabel: "DuplicateExecution",
    actors: ["executor_a", "executor_b", "coordinator"],
    entities: ["shared work item", "execution slot"],
    states: ["idle", "running", "duplicate_running", "completed", "cancelled"],
    transitions: [
      ["idle", "running"],
      ["running", "duplicate_running"],
      ["running", "completed"],
      ["duplicate_running", "cancelled"],
    ],
    unsafeStates: ["duplicate_completion"],
    unsafeConditions: [
      "Two executors complete the same work item.",
      "Duplicate active execution is not cancelled or prevented.",
    ],
    invariants: [
      "Only one execution may complete successfully for a shared work item.",
      "Duplicate active execution must be cancelled or prevented.",
    ],
    initialConditions: ["The shared work item starts idle."],
    initialState: "idle",
    summary: "Duplicate execution with a single successful path and duplicate suppression.",
  },
  stale_write: {
    actionLabel: "StaleWriteValidity",
    actors: ["reader", "writer", "store"],
    entities: ["versioned record", "read version", "write version"],
    states: ["fresh_read", "stale_read", "write_attempted", "committed", "rejected"],
    transitions: [
      ["fresh_read", "write_attempted"],
      ["stale_read", "rejected"],
      ["write_attempted", "committed"],
      ["write_attempted", "rejected"],
    ],
    unsafeStates: ["stale_commit"],
    unsafeConditions: [
      "A stale read reaches committed.",
      "A rejected write mutates the committed version.",
    ],
    invariants: [
      "A stale read cannot reach committed.",
      "Rejected writes preserve the last committed version.",
    ],
    initialConditions: ["The record starts at a fresh read."],
    initialState: "fresh_read",
    summary: "Stale write validity that rejects outdated commits and preserves the latest version.",
  },
  migration_order: {
    actionLabel: "OrderingSerialization",
    actors: ["migrator", "gate"],
    entities: ["phase", "dependency"],
    states: ["not_started", "phase_1", "phase_2", "completed"],
    transitions: [
      ["not_started", "phase_1"],
      ["phase_1", "phase_2"],
      ["phase_2", "completed"],
    ],
    unsafeStates: ["phase_2_before_phase_1"],
    unsafeConditions: [
      "Phase 2 begins before phase 1 completes.",
      "Serialization fails to preserve the migration order.",
    ],
    invariants: [
      "Phase 2 cannot precede Phase 1.",
      "Completion requires both migration phases.",
    ],
    initialConditions: ["The migration starts not_started."],
    initialState: "not_started",
    summary: "Ordering serialization that preserves phased migration order.",
  },
};

const FORMAL_TEMPLATE_BY_SCENARIO_KIND: Partial<Record<VerifyFormalScenarioKind, FormalTemplateOverlay>> = {
  multi_agent_handoff_chain: {
    actionLabel: "ChainedHandoffTransfer",
    actors: ["origin_owner", "relay_agent", "receiver"],
    entities: ["resource", "handoff chain", "ownership token"],
    states: ["owned", "handoff_sent", "handoff_received", "dropped_ownership", "completed"],
    transitions: [
      ["owned", "handoff_sent"],
      ["handoff_sent", "handoff_received"],
      ["handoff_received", "completed"],
      ["handoff_sent", "dropped_ownership"],
    ],
    unsafeStates: ["dropped_ownership"],
    unsafeConditions: [
      "A chained transfer drops ownership before the receiver accepts it.",
      "Dropped ownership leaves the resource without a valid owner.",
    ],
    invariants: [
      "A chained transfer must preserve ownership until the receiver accepts it.",
      "Dropped ownership is not allowed during the handoff chain.",
    ],
    initialConditions: ["The chain starts with one owner and no pending transfer."],
    initialState: "owned",
    summary: "Chained transfer handoff chain with dropped ownership protection.",
  },
  queue_claim_release_lifecycle: {
    actionLabel: "QueueClaimReleaseLifecycle",
    actors: ["queue", "worker", "lease_manager"],
    entities: ["queue item", "claim lease", "release record"],
    states: ["queued", "claimed", "released", "reclaimed", "completed"],
    transitions: [
      ["queued", "claimed"],
      ["claimed", "released"],
      ["released", "reclaimed"],
      ["reclaimed", "completed"],
      ["claimed", "completed"],
    ],
    unsafeStates: ["double_claim", "lost_claim"],
    unsafeConditions: [
      "A double-claim occurs before the lease is released.",
      "A lost-claim leaves the queue item unreachable after release.",
    ],
    invariants: [
      "A claim must be released before the next claimant takes ownership.",
      "A lost claim must be recovered before completion.",
    ],
    initialConditions: ["The item starts queued with no active claim."],
    initialState: "queued",
    summary: "Double-claim and lost-claim queue lifecycle with explicit release control.",
  },
  shared_artifact_merge_order: {
    actionLabel: "SharedArtifactMergeOrder",
    actors: ["branch_a", "branch_b", "merge_coordinator"],
    entities: ["shared artifact", "merge order", "merge queue"],
    states: ["base", "branch_a_ready", "branch_b_ready", "merge_ordered", "merged"],
    transitions: [
      ["base", "branch_a_ready"],
      ["branch_a_ready", "branch_b_ready"],
      ["branch_b_ready", "merge_ordered"],
      ["merge_ordered", "merged"],
    ],
    unsafeStates: ["merge_order_violation"],
    unsafeConditions: [
      "A merge order violation applies branch B before branch A.",
      "Shared artifact merge happens out of order.",
    ],
    invariants: [
      "Merge order must keep branch updates serialized.",
      "The shared artifact may only merge after both branches are ready.",
    ],
    initialConditions: ["The shared artifact starts at the base revision."],
    initialState: "base",
    summary: "Shared artifact merge order with serialized branch merging.",
  },
  shared_resource_mutation_overlap: {
    actionLabel: "SharedResourceMutationOverlap",
    actors: ["mutator_a", "mutator_b", "coordinator"],
    entities: ["shared resource", "mutation window", "conflict detector"],
    states: ["stable", "mutating_a", "mutating_b", "overlap_detected", "resolved"],
    transitions: [
      ["stable", "mutating_a"],
      ["stable", "mutating_b"],
      ["mutating_a", "overlap_detected"],
      ["mutating_b", "overlap_detected"],
      ["overlap_detected", "resolved"],
    ],
    unsafeStates: ["conflicting_update"],
    unsafeConditions: [
      "A shared resource mutation overlaps with another conflicting update.",
      "Conflicting update windows are not serialized or rejected.",
    ],
    invariants: [
      "Shared resource mutation must avoid conflicting update overlap.",
      "At most one mutator may write at a time.",
    ],
    initialConditions: ["The resource starts stable before any mutation begins."],
    initialState: "stable",
    summary: "Shared resource mutation overlap with conflicting updates.",
  },
  failure_recovery_loop: {
    actionLabel: "FailureRecoveryLoop",
    actors: ["worker", "supervisor", "rollback_manager"],
    entities: ["task", "rollback log", "reassignment loop"],
    states: ["running", "failed", "rollback", "reassignment", "recovered"],
    transitions: [
      ["running", "failed"],
      ["failed", "rollback"],
      ["rollback", "reassignment"],
      ["reassignment", "running"],
      ["reassignment", "recovered"],
    ],
    unsafeStates: ["recovery_stall"],
    unsafeConditions: [
      "A rollback fails to advance the recovery loop.",
      "The reassignment loop retries forever without recovery.",
    ],
    invariants: [
      "A failure recovery loop must either rollback or reassign.",
      "Rollback must eventually lead to recovery or a safe stop.",
    ],
    initialConditions: ["The task starts running with recovery available."],
    initialState: "running",
    summary: "Failure recovery loop with rollback and reassignment recovery.",
  },
};

function dedupeStable(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = value.trim().toLowerCase();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(value.trim());
  }
  return result;
}

function normalizeFragment(value: string): string {
  const normalized = value
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
  return normalized || "case";
}

export function isSupportedFormalCategory(
  category: VerifyVerificationCategory,
): category is VerifyFormalSupportedCategory {
  return (VERIFY_SUPPORTED_FORMAL_CATEGORIES as readonly string[]).includes(category);
}

export function getVerifyFormalScenarioKinds(
  category: VerifyVerificationCategory,
): VerifyFormalScenarioKind[] {
  return isSupportedFormalCategory(category)
    ? [...VERIFY_FORMAL_SCENARIO_KINDS_BY_CATEGORY[category]]
    : [];
}

export function buildVerifyFormalArtifactNames(caseId: string): VerifyFormalArtifactNames {
  const fragment = normalizeFragment(caseId);
  const moduleName = `${VERIFY_FORMAL_MODULE_PREFIX}_${fragment}`;

  return {
    stateModelId: `formal-state-model-${fragment}`,
    tlaSpecId: `formal-tla-spec-${fragment}`,
    tlcResultId: `formal-tlc-result-${fragment}`,
    moduleName,
    specBaseName: moduleName,
  };
}

export function buildVerifyFormalEntryCriteria(
  category: VerifyVerificationCategory,
  sourceRiskSources: Iterable<VerifyTargetRiskSource>,
  sourcePlanItemIds: Iterable<string>,
): VerifyFormalEntryCriterion[] {
  const riskSources = new Set(sourceRiskSources);
  const planItemIds = [...new Set(sourcePlanItemIds)];
  const criteria = new Set<VerifyFormalEntryCriterion>([
    "state_machine_like",
    "structural_check_insufficient",
  ]);

  switch (category) {
    case "retry_logic":
      criteria.add("retry_or_reassignment");
      break;
    case "ownership":
    case "stale_write":
      criteria.add("ownership_or_version_validity");
      break;
    case "migration_order":
      criteria.add("ordering_critical");
      break;
    case "parallel_overlap":
      criteria.add("multi_actor_or_interleaving");
      break;
    default:
      break;
  }

  if (
    planItemIds.length > 1 ||
    riskSources.has("conflict_zone") ||
    riskSources.has("parallelization_signal") ||
    riskSources.has("carry_forward_concern")
  ) {
    criteria.add("multi_actor_or_interleaving");
  }

  const orderedCriteria: VerifyFormalEntryCriterion[] = [
    "state_machine_like",
    "multi_actor_or_interleaving",
    "retry_or_reassignment",
    "ownership_or_version_validity",
    "ordering_critical",
    "structural_check_insufficient",
  ];

  return orderedCriteria.filter((criterion): criterion is VerifyFormalEntryCriterion => criteria.has(criterion));
}

export function buildVerifyFormalBaseCautionNotes(
  foundation: VerifyFoundationResult,
): string[] {
  const notes: string[] = [];
  if (foundation.verificationInput.uncertainty.carryForward.confidence.level === "low") {
    notes.push("Step 2 carried low-confidence context into verification; formal results must stay conservative.");
  }

  for (const item of foundation.verificationInput.usability.warningItems) {
    notes.push(`Verification warning context: [${item.code}] ${item.message}`);
  }

  if (foundation.verificationInput.uncertainty.planningReadiness.constraining_concern_ids.length > 0) {
    notes.push(
      `Step 2 preserved constraining concern ids for verification: ${foundation.verificationInput.uncertainty.planningReadiness.constraining_concern_ids.join(", ")}.`,
    );
  }

  return dedupeStable(notes);
}

function buildTemplate(
  category: VerifyVerificationCategory,
  scenarioKind?: VerifyFormalScenarioKind,
): FormalTemplate {
  if (isSupportedFormalCategory(category)) {
    return buildScenarioTemplate(category, scenarioKind);
  }

  return {
    actionLabel: "UnsupportedFormalCase",
    actors: ["actor"],
    entities: ["state machine"],
    states: ["initial", "running", "completed"],
    transitions: [
      ["initial", "running"],
      ["running", "completed"],
    ],
    unsafeStates: ["unsupported_formal_case"],
    unsafeConditions: [`Unsupported formal verification category: ${category}.`],
    invariants: ["The fallback formal model must remain bounded and conservative."],
    initialConditions: ["The fallback formal case starts initial."],
    initialState: "initial",
    summary: "Fallback formal verification model remains bounded and conservative.",
    unsupportedReason: `Unsupported formal verification category: ${category}.`,
  };
}

function buildScenarioTemplate(
  category: VerifyFormalSupportedCategory,
  scenarioKind: VerifyFormalScenarioKind | undefined,
): FormalTemplate {
  const base = FORMAL_TEMPLATE_BY_CATEGORY[category];
  const overlay = scenarioKind ? FORMAL_TEMPLATE_BY_SCENARIO_KIND[scenarioKind] : undefined;
  if (!overlay) {
    return {
      ...base,
      actors: [...base.actors],
      entities: [...base.entities],
      states: [...base.states],
      transitions: base.transitions.map(([from, to]) => [from, to] as [string, string]),
      unsafeStates: [...base.unsafeStates],
      unsafeConditions: [...base.unsafeConditions],
      invariants: [...base.invariants],
      initialConditions: [...base.initialConditions],
      unsupportedReason: null,
    };
  }

  return {
    actionLabel: base.actionLabel,
    scenarioActionLabel: overlay.actionLabel ?? base.actionLabel,
    actors: [...(overlay.actors ?? base.actors)],
    entities: [...(overlay.entities ?? base.entities)],
    states: [...(overlay.states ?? base.states)],
    transitions: (overlay.transitions ?? base.transitions).map(([from, to]) => [from, to] as [string, string]),
    unsafeStates: [...(overlay.unsafeStates ?? base.unsafeStates)],
    unsafeConditions: [...(overlay.unsafeConditions ?? base.unsafeConditions)],
    invariants: [...(overlay.invariants ?? base.invariants)],
    initialConditions: [...(overlay.initialConditions ?? base.initialConditions)],
    initialState: overlay.initialState ?? base.initialState,
    summary: overlay.summary ?? base.summary,
    unsupportedReason: null,
  };
}

function buildFormalStateModel(params: {
  case: VerifyVerificationCase;
  targetTitle: string;
  names: VerifyFormalArtifactNames;
  scenarioKind: VerifyFormalScenarioKind;
}): { stateModel: VerifyStateModel; template: FormalTemplate } {
  const template = buildTemplate(params.case.category, params.scenarioKind);
  return {
    template,
    stateModel: {
      id: params.names.stateModelId,
      verification_case_id: params.case.id,
      verification_target_id: params.case.verificationTargetId,
      scenario_kind: params.scenarioKind,
      name: `${params.case.title} state model`,
      summary: template.unsupportedReason
        ? `Fallback formal state model for ${params.case.category} scenario ${params.scenarioKind}. ${template.summary}`
        : `State model for ${params.case.category} scenario ${params.scenarioKind} case ${params.case.id} derived from Step 2 signals on ${params.targetTitle}. ${template.summary}`,
      actors: [...template.actors],
      entities: [...template.entities],
      states: [...template.states],
      transitions: template.transitions.map(([from, to]) => `${from} -> ${to}`),
      unsafe_states: [...template.unsafeStates],
      unsafe_conditions: [...template.unsafeConditions],
      invariants: [...template.invariants],
      initial_conditions: [...template.initialConditions],
    },
  };
}

function renderTlaModule(params: {
  case: VerifyVerificationCase;
  targetTitle: string;
  template: FormalTemplate;
  names: VerifyFormalArtifactNames;
  stateModel: VerifyStateModel;
}): string {
  const transitions = params.template.transitions
    .map(([from, to]) => [
      `  \\/ /\\ state = "${from}"`,
      `     /\\ state' = "${to}"`,
    ].join("\n"))
    .join("\n");

  return [
    `---- MODULE ${params.names.moduleName} ----`,
    "",
    `\\* Forge formal verification case: ${params.case.id}`,
    `\\* Verification target: ${params.case.verificationTargetId}`,
    `\\* Target title: ${params.targetTitle}`,
    `\\* Category: ${params.case.category}`,
    `\\* Scenario kind: ${params.stateModel.scenario_kind}`,
    `\\* Summary: ${params.stateModel.summary}`,
    `\\* Actors: ${params.stateModel.actors.join(", ")}`,
    `\\* Entities: ${params.stateModel.entities.join(", ")}`,
    `\\* States: ${params.stateModel.states.join(", ")}`,
    `\\* Unsafe states: ${params.stateModel.unsafe_states.join(", ")}`,
    `\\* Unsafe conditions: ${params.stateModel.unsafe_conditions.join(" | ")}`,
    `\\* Invariants: ${params.stateModel.invariants.join(" | ")}`,
    `\\* Initial conditions: ${params.stateModel.initial_conditions.join(" | ")}`,
    "",
    "VARIABLES state",
    "",
    `AllowedStates == {${params.template.states.map((state) => `"${state}"`).join(", ")}}`,
    "",
    `Init == state = "${params.template.initialState}"`,
    "",
    `\\* Action label: ${params.template.actionLabel}`,
    ...(params.template.scenarioActionLabel && params.template.scenarioActionLabel !== params.template.actionLabel
      ? [`\\* Scenario action label: ${params.template.scenarioActionLabel}`]
      : []),
    `${params.template.actionLabel} ==`,
    transitions,
    "",
    `Next == ${params.template.actionLabel}`,
    "",
    "Spec == Init /\\ [][Next]_state",
    "",
    "Safety == state \\in AllowedStates",
    "",
    "====",
  ].join("\n");
}

function renderTlcConfig(): string {
  return ["SPECIFICATION Spec", "INVARIANT Safety", ""].join("\n");
}

function quoteWindowsCmdArg(value: string): string {
  return `"${value.replace(/"/g, '""').replace(/%/g, "%%")}"`;
}

async function resolveWindowsCommand(command: string): Promise<string | null> {
  if (path.isAbsolute(command) || command.includes("\\") || command.includes("/")) {
    try {
      await access(command);
      return command;
    } catch {
      return null;
    }
  }

  const pathEntries = (process.env.PATH ?? process.env.Path ?? "")
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  const pathExts = (process.env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD")
    .split(";")
    .map((extension) => extension.trim().toLowerCase())
    .filter((extension) => extension.length > 0);
  const commandHasExtension = path.extname(command).length > 0;

  for (const entry of pathEntries) {
    const baseCandidate = path.join(entry, command);
    const candidates = commandHasExtension
      ? [baseCandidate]
      : pathExts.map((extension) => `${baseCandidate}${extension}`);

    for (const candidate of candidates) {
      try {
        await access(candidate);
        return candidate;
      } catch {
        // Keep scanning PATH candidates until one exists.
      }
    }
  }

  return null;
}

async function resolveProcessInvocation(
  command: string,
  args: string[],
): Promise<ProcessInvocation> {
  if (process.platform !== "win32") {
    return { command, args };
  }

  const resolvedCommand = await resolveWindowsCommand(command);
  if (!resolvedCommand) {
    return { command, args };
  }

  if (/\.(cmd|bat)$/i.test(resolvedCommand)) {
    const quotedArgs = args.map(quoteWindowsCmdArg).join(" ");
    const shellCommand = `""${resolvedCommand}"${quotedArgs ? ` ${quotedArgs}` : ""}"`;

    return {
      command: process.env.ComSpec ?? "cmd.exe",
      args: ["/d", "/s", "/c", shellCommand],
      windowsVerbatimArguments: true,
    };
  }

  return {
    command: resolvedCommand,
    args,
  };
}

async function spawnProcess(command: string, args: string[], cwd: string): Promise<ProcessResult> {
  const invocation = await resolveProcessInvocation(command, args);

  return new Promise((resolve) => {
    const child = spawn(invocation.command, invocation.args, {
      cwd,
      shell: false, // Security: Disable shell execution to prevent command injection
      windowsHide: true,
      windowsVerbatimArguments: invocation.windowsVerbatimArguments ?? false,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.once("error", (error) => {
      resolve({
        code: null,
        stdout,
        stderr,
        error: error instanceof Error ? error : new Error("Command execution failed."),
      });
    });
    child.once("close", (code) => {
      resolve({
        code,
        stdout,
        stderr,
        error: null,
      });
    });
  });
}

async function writeFormalArtifacts(params: {
  outputRoot: string;
  names: VerifyFormalArtifactNames;
  tlaText: string;
  cfgText: string;
}): Promise<{ specPath: string; configPath: string }> {
  const formalDirectory = resolveOutputFilePath(params.outputRoot, VERIFY_FORMAL_DIRECTORY_NAME);
  const specPath = resolveOutputFilePath(formalDirectory, `${params.names.specBaseName}.tla`);
  const configPath = resolveOutputFilePath(formalDirectory, `${params.names.specBaseName}.cfg`);

  await persistIntakeOutputs({
    criticalWrites: [
      { filePath: specPath, contents: params.tlaText },
      { filePath: configPath, contents: params.cfgText },
    ],
  });

  return { specPath, configPath };
}

function classifyTlcStatus(params: {
  configured: boolean;
  processResult: ProcessResult | null;
  combinedOutput: string;
  generationStatus: VerifyTlaSpecGenerationStatus;
}): VerifyTlcStatus {
  if (params.generationStatus === "invalid_spec") return "invalid_spec";
  if (params.generationStatus === "errored") return "errored";
  if (!params.configured) return "not_run";
  if (params.processResult?.error) return "errored";

  const output = params.combinedOutput.toLowerCase();
  if (
    /invalid[_ -]?spec/.test(output) ||
    /could not be run/.test(output)
  ) {
    return "invalid_spec";
  }
  if (
    /counter[- ]?example/.test(output) ||
    /invariant.*violat/.test(output) ||
    /property.*violat/.test(output) ||
    /behavior.*constitutes a counter-example/.test(output)
  ) {
    return "failed";
  }
  if (
    /inconclusive/.test(output) ||
    /partial evidence/.test(output) ||
    /no trustworthy verdict/.test(output) ||
    /partial verdict/.test(output)
  ) {
    return "inconclusive";
  }
  if (
    /parse error/.test(output) ||
    /syntax error/.test(output) ||
    /configuration file/.test(output) ||
    /module .* not found/.test(output) ||
    /illegal token/.test(output) ||
    /unknown operator/.test(output)
  ) {
    return "invalid_spec";
  }
  if (
    /no error has been found/.test(output) ||
    /model checking completed/.test(output) ||
    /no errors? found/.test(output) ||
    /success/.test(output)
  ) {
    return "passed";
  }
  if (params.processResult?.code === 0) return "passed";
  return "errored";
}

function buildTlcSummary(
  caseId: string,
  status: VerifyTlcStatus,
  configured: boolean,
): string {
  switch (status) {
    case "passed":
      return `TLC passed for ${caseId}.`;
    case "failed":
      return `TLC found a counterexample for ${caseId}.`;
    case "inconclusive":
      return `TLC returned an inconclusive verdict for ${caseId}.`;
    case "invalid_spec":
      return `The generated TLA+ artifacts for ${caseId} were not runnable.`;
    case "errored":
      return `TLC errored while checking ${caseId}.`;
    case "not_run":
    default:
      return configured
        ? `TLC was configured but not run for ${caseId}.`
        : `TLC was not run for ${caseId} because ${VERIFY_TLC_JAR_PATH_ENV_VAR} is not configured.`;
  }
}

function buildCaseConstraints(stateModel: VerifyStateModel, status: VerifyTlcStatus): string[] {
  const constraints = [
    ...stateModel.invariants,
    ...stateModel.initial_conditions.map((condition) => `Initial condition: ${condition}`),
    ...stateModel.unsafe_conditions.map((condition) => `Unsafe condition: ${condition}`),
  ];

  if (status === "failed") {
    constraints.push("TLC found a counterexample; later steps must not proceed until the violating trace is resolved.");
  } else if (status === "inconclusive") {
    constraints.push("TLC returned an inconclusive verdict; later steps must carry the unresolved formal uncertainty forward.");
  } else if (status === "invalid_spec") {
    constraints.push("The generated TLA+ spec is not runnable; later steps must treat the formal lane as unresolved.");
  } else if (status === "errored") {
    constraints.push("TLC errored before completion; later steps must treat the formal lane as unresolved.");
  } else if (status === "not_run") {
    constraints.push(`TLC did not run; formal validation remains pending until ${VERIFY_TLC_JAR_PATH_ENV_VAR} is configured.`);
  }

  return dedupeStable(constraints);
}

function buildCaseFindings(caseId: string, summary: string, status: VerifyTlcStatus, configured: boolean): string[] {
  const findings = [summary];
  if (status === "passed") findings.push(`Formal verification passed for ${caseId}.`);
  if (status === "failed") findings.push(`Formal verification failed for ${caseId}.`);
  if (status === "inconclusive") findings.push(`Formal verification remained inconclusive for ${caseId}.`);
  if (status === "invalid_spec") findings.push(`Formal verification could not validate the generated spec for ${caseId}.`);
  if (status === "errored") findings.push(`Formal verification errored for ${caseId}.`);
  if (status === "not_run" && !configured) findings.push(`TLC is deferred until ${VERIFY_TLC_JAR_PATH_ENV_VAR} is configured.`);
  return dedupeStable(findings);
}

function buildFormalVerificationStatus(results: VerifyTlcResult[]): VerifyTlcStatus {
  const precedence: VerifyTlcStatus[] = ["failed", "errored", "invalid_spec", "inconclusive", "not_run", "passed"];
  for (const status of precedence) {
    if (results.some((result) => result.status === status)) return status;
  }
  return "not_run";
}

function buildFormalVerificationSummary(
  caseCount: number,
  results: VerifyTlcResult[],
  configured: boolean,
): string {
  if (caseCount === 0) return "No formal verification cases were selected in Part 3.";

  const counts = results.reduce(
    (accumulator, result) => {
      accumulator[result.status] += 1;
      return accumulator;
    },
    { passed: 0, failed: 0, errored: 0, invalid_spec: 0, inconclusive: 0, not_run: 0 } satisfies Record<VerifyTlcStatus, number>,
  );

  if (counts.failed > 0) {
    return `${caseCount} formal verification case(s) were selected in Part 3; TLC found ${counts.failed} failing case(s).`;
  }
  if (counts.errored > 0) {
    return `${caseCount} formal verification case(s) were selected in Part 3; TLC errored for ${counts.errored} case(s).`;
  }
  if (counts.invalid_spec > 0) {
    return `${caseCount} formal verification case(s) were selected in Part 3; ${counts.invalid_spec} generated spec(s) were not runnable.`;
  }
  if (counts.inconclusive > 0) {
    return `${caseCount} formal verification case(s) were selected in Part 3; TLC was inconclusive for ${counts.inconclusive} case(s).`;
  }
  if (counts.not_run > 0) {
    return configured
      ? `${caseCount} formal verification case(s) were selected in Part 3; TLC was configured but not run for ${counts.not_run} case(s).`
      : `${caseCount} formal verification case(s) were selected in Part 3; TLA+ specs were generated, but TLC was not run because ${VERIFY_TLC_JAR_PATH_ENV_VAR} is not configured.`;
  }
  return `${caseCount} formal verification case(s) passed TLC.`;
}

async function buildCaseExecution(params: {
  foundation: VerifyFoundationResult;
  verificationCase: VerifyVerificationCase;
  target: VerifyVerificationTarget | null;
  targetTitle: string;
  outputRoot: string;
  currentWorkingDirectory: string;
}): Promise<{
  case: VerifyVerificationCase;
  stateModel: VerifyStateModel;
  tlaSpec: VerifyTlaSpec;
  tlcResult: VerifyTlcResult;
  findings: string[];
  constraints: string[];
  cautionNotes: string[];
  }> {
  const names = buildVerifyFormalArtifactNames(params.verificationCase.id);
  const scenarioKind: VerifyFormalScenarioKind =
    params.verificationCase.formalDetails?.scenarioKind ??
    getVerifyFormalScenarioKinds(params.verificationCase.category)[0] ??
    "stale_write_validity";
  const template = buildTemplate(params.verificationCase.category, scenarioKind);
  const { stateModel } = buildFormalStateModel({
    case: params.verificationCase,
    targetTitle: params.targetTitle,
    names,
    scenarioKind,
  });
  const entryCriteria = buildVerifyFormalEntryCriteria(
    params.verificationCase.category,
    params.target?.sourceRiskSources ?? [],
    params.target?.sourcePlanItemIds ?? params.verificationCase.sourcePlanItemIds,
  );
  const tlaText = renderTlaModule({
    case: params.verificationCase,
    targetTitle: params.targetTitle,
    template,
    names,
    stateModel,
  });
  const cfgText = renderTlcConfig();
  let generationStatus: VerifyTlaSpecGenerationStatus = "generated";
  let processResult: ProcessResult | null = null;
  let combinedOutput = "";

  try {
    await writeFormalArtifacts({
      outputRoot: params.outputRoot,
      names,
      tlaText,
      cfgText,
    });
  } catch (error) {
    generationStatus = "errored";
    processResult = {
      code: null,
      stdout: "",
      stderr: "",
      error: error instanceof Error ? error : new Error("Unable to write formal TLA+ artifacts."),
    };
  }

  const tlcConfigured = Boolean((process.env[VERIFY_TLC_JAR_PATH_ENV_VAR] ?? "").trim());
  if (generationStatus === "generated") {
    if (template.unsupportedReason) {
      generationStatus = "invalid_spec";
    } else if (tlcConfigured) {
      const resolvedJarPath = path.isAbsolute(process.env[VERIFY_TLC_JAR_PATH_ENV_VAR] ?? "")
        ? path.normalize(process.env[VERIFY_TLC_JAR_PATH_ENV_VAR] ?? "")
        : path.resolve(params.currentWorkingDirectory, process.env[VERIFY_TLC_JAR_PATH_ENV_VAR] ?? "");

      try {
        await access(resolvedJarPath);
        const formalDirectory = resolveOutputFilePath(params.outputRoot, VERIFY_FORMAL_DIRECTORY_NAME);
        processResult = await spawnProcess(
          "java",
          ["-cp", resolvedJarPath, "tlc2.TLC", "-config", `${names.specBaseName}.cfg`, names.moduleName],
          formalDirectory,
        );
        combinedOutput = [processResult.stdout, processResult.stderr].filter((value) => value.trim().length > 0).join("\n");
      } catch (error) {
        generationStatus = "errored";
        processResult = {
          code: null,
          stdout: "",
          stderr: "",
          error: error instanceof Error
            ? new Error(`TLC jar path configured by ${VERIFY_TLC_JAR_PATH_ENV_VAR} could not be used: ${error.message}`)
            : new Error(`TLC jar path configured by ${VERIFY_TLC_JAR_PATH_ENV_VAR} could not be used.`),
        };
      }
    }
  }

  const tlcStatus = classifyTlcStatus({
    configured: tlcConfigured,
    processResult,
    combinedOutput,
    generationStatus,
  });
  const tlcSummary = buildTlcSummary(params.verificationCase.id, tlcStatus, tlcConfigured);
  const cautionNotes = dedupeStable([
    ...buildVerifyFormalBaseCautionNotes(params.foundation),
    ...(params.verificationCase.formalDetails?.cautionNotes ?? []),
    ...(template.unsupportedReason ? [template.unsupportedReason] : []),
    ...(tlcStatus === "not_run"
      ? [tlcConfigured
          ? "TLC was configured but not run for this formal case."
          : `TLC was not run because ${VERIFY_TLC_JAR_PATH_ENV_VAR} is not configured.`]
      : []),
    ...(tlcStatus === "inconclusive"
      ? ["TLC produced an inconclusive verdict; review the partial evidence before relying on it."]
      : []),
    ...(tlcStatus === "failed" ? ["TLC found a counterexample; review the trace before proceeding."] : []),
    ...(tlcStatus === "invalid_spec" ? ["The generated TLA+ spec was not runnable and needs repair before TLC can validate it."] : []),
    ...(tlcStatus === "errored" ? ["TLC errored unexpectedly; the formal lane remains cautious."] : []),
    ...(processResult?.error ? [processResult.error.message] : []),
  ]);
  const formalDetails: VerifyCaseFormalDetails = {
    enteredFormalLane: true,
    entryCriteria,
    stateModelId: names.stateModelId,
    tlaSpecId: names.tlaSpecId,
    tlcResultId: names.tlcResultId,
    scenarioKind,
    cautionNotes,
    trace: tlcStatus === "passed" || tlcStatus === "not_run" ? null : (combinedOutput.trim() || null),
    errors: processResult?.error
      ? [processResult.error.message]
      : tlcStatus === "passed" || tlcStatus === "inconclusive"
        ? []
        : tlcStatus === "not_run"
          ? [tlcSummary]
        : splitOutputLines(combinedOutput).slice(0, 3),
  };
  const tlaSpec: VerifyTlaSpec = {
    id: names.tlaSpecId,
    verification_case_id: params.verificationCase.id,
    state_model_id: stateModel.id,
    scenario_kind: scenarioKind,
    name: `${params.verificationCase.title} TLA+ spec`,
    summary: generationStatus === "generated"
      ? `Generated TLA+ spec for ${params.verificationCase.id} (${scenarioKind}) using module ${names.moduleName}.`
      : `TLA+ spec for ${params.verificationCase.id} could not be generated cleanly.`,
    module_name: names.moduleName,
    spec_path: resolveOutputFilePath(resolveOutputFilePath(params.outputRoot, VERIFY_FORMAL_DIRECTORY_NAME), `${names.specBaseName}.tla`),
    config_path: resolveOutputFilePath(resolveOutputFilePath(params.outputRoot, VERIFY_FORMAL_DIRECTORY_NAME), `${names.specBaseName}.cfg`),
    generation_status: generationStatus,
  };
  const tlcResult: VerifyTlcResult = {
    id: names.tlcResultId,
    verification_case_id: params.verificationCase.id,
    tla_spec_id: names.tlaSpecId,
    scenario_kind: scenarioKind,
    status: tlcStatus,
    summary: tlcSummary,
    trace: formalDetails.trace,
    errors: formalDetails.errors,
  };

  return {
    case: {
      ...params.verificationCase,
      status: tlcStatus,
      summary: tlcSummary,
      formalDetails,
      findings: buildCaseFindings(params.verificationCase.id, tlcSummary, tlcStatus, tlcConfigured),
      mitigations: buildCaseMitigations(tlcStatus),
      constraints: buildCaseConstraints(stateModel, tlcStatus),
    },
    stateModel,
    tlaSpec,
    tlcResult,
    findings: buildCaseFindings(params.verificationCase.id, tlcSummary, tlcStatus, tlcConfigured),
    constraints: buildCaseConstraints(stateModel, tlcStatus),
    cautionNotes,
  };
}

function buildCaseMitigations(status: VerifyTlcStatus): string[] {
  switch (status) {
    case "passed":
      return ["No immediate mitigation required from the formal lane."];
    case "failed":
      return ["Review the counterexample trace and tighten the plan before proceeding."];
    case "inconclusive":
      return ["Review the partial TLC evidence and tighten the model before relying on the result."];
    case "invalid_spec":
      return ["Repair the generated TLA+ spec or configuration before rerunning TLC."];
    case "errored":
      return ["Fix the TLC execution problem before treating the formal lane as complete."];
    case "not_run":
    default:
      return [`Configure ${VERIFY_TLC_JAR_PATH_ENV_VAR} to run TLC for this case.`];
  }
}

function splitOutputLines(text: string): string[] {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export async function buildVerifyFormalExecution(params: {
  foundation: VerifyFoundationResult;
  model: VerifyVerificationModel;
  outputRoot: string;
  currentWorkingDirectory: string;
}): Promise<VerifyFormalExecutionResult> {
  const targetById = new Map(params.model.targets.map((target) => [target.id, target] as const));
  const executions: Awaited<ReturnType<typeof buildCaseExecution>>[] = [];

  for (const verificationCase of params.model.cases) {
    if (!verificationCase.lanes.includes("formal")) {
      continue;
    }

    const target = targetById.get(verificationCase.verificationTargetId);
    executions.push(
      await buildCaseExecution({
        foundation: params.foundation,
        verificationCase,
        target: target ?? null,
        targetTitle: target?.title ?? verificationCase.title,
        outputRoot: params.outputRoot,
        currentWorkingDirectory: params.currentWorkingDirectory,
      }),
    );
  }

  const executionByCaseId = new Map(executions.map((execution) => [execution.case.id, execution] as const));
  const cases = params.model.cases.map((verificationCase) => executionByCaseId.get(verificationCase.id)?.case ?? verificationCase);
  const stateModels = executions.map((execution) => execution.stateModel);
  const tlaSpecs = executions.map((execution) => execution.tlaSpec);
  const tlcResults = executions.map((execution) => execution.tlcResult);
  const tlcConfigured = Boolean((process.env[VERIFY_TLC_JAR_PATH_ENV_VAR] ?? "").trim());

  return {
    cases,
    formalVerification: {
      status: buildFormalVerificationStatus(tlcResults),
      summary: buildFormalVerificationSummary(executions.length, tlcResults, tlcConfigured),
      caution_notes: dedupeStable(executions.flatMap((execution) => execution.cautionNotes)),
      state_models: stateModels,
      tla_specs: tlaSpecs,
      tlc_results: tlcResults,
      findings: dedupeStable(executions.flatMap((execution) => execution.findings)),
      constraints: dedupeStable(executions.flatMap((execution) => execution.constraints)),
    },
    findings: dedupeStable(executions.flatMap((execution) => execution.findings)),
    constraints: dedupeStable(executions.flatMap((execution) => execution.constraints)),
  };
}
