import type {
  ExecuteWorkstream,
  ExecuteWorkstreamState,
  ExecuteArtifact,
  StateTransition,
  AIModelInfo,
} from "./types.js";
import type { SplitArtifact } from "../split/types.js";

// Internal map: prerequisite workstream ids that must be completed before this stream runs / merges
const mergeOrderRequirementsMap = new WeakMap<
  ExecuteStateInternal,
  Map<string, string[]>
>();

function dedupeWorkstreamIds(ids: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/**
 * Workstream ids that must appear in `mergedWorkstreams` before this workstream can run or complete.
 * Uses `splitArtifact.merge_order` and `streamDependencies`; only treats `mergeOrderRequirements`
 * entries as ids when they match a known workstream id (tests / legacy fixtures).
 */
export function buildMergePrerequisiteIds(
  splitArtifact: SplitArtifact
): Map<string, string[]> {
  const knownIds = new Set(splitArtifact.workstreams.map((w) => w.id));
  const result = new Map<string, string[]>();

  for (const ws of splitArtifact.workstreams) {
    result.set(ws.id, []);
  }

  for (const entry of splitArtifact.merge_order) {
    if (!knownIds.has(entry.workstreamId)) continue;
    const cur = result.get(entry.workstreamId) ?? [];
    result.set(
      entry.workstreamId,
      dedupeWorkstreamIds([...cur, ...entry.mustMergeAfterWorkstreamIds])
    );
  }

  for (const sw of splitArtifact.workstreams) {
    const cur = result.get(sw.id) ?? [];
    const fromDeps = dedupeWorkstreamIds([...cur, ...sw.streamDependencies]);
    const fromLegacyMergeReq = sw.mergeOrderRequirements.filter((r) =>
      knownIds.has(r)
    );
    result.set(sw.id, dedupeWorkstreamIds([...fromDeps, ...fromLegacyMergeReq]));
  }

  return result;
}

// The public interface plus a hidden slot for our internal bookkeeping
interface ExecuteStateInternal {
  workstreams: Map<string, ExecuteWorkstream>;
  mergedWorkstreams: Set<string>;
  transitions: StateTransition[];
  splitSource: string;
}

// Export the public-facing type (identical shape)
export type ExecuteState = ExecuteStateInternal;

export function createExecuteState(
  splitArtifact: SplitArtifact,
  splitSourcePath: string
): ExecuteState {
  const state: ExecuteState = {
    workstreams: new Map(),
    mergedWorkstreams: new Set(),
    transitions: [],
    splitSource: splitSourcePath,
  };

  const reqMap = new Map<string, string[]>();
  mergeOrderRequirementsMap.set(state, reqMap);
  const prereqs = buildMergePrerequisiteIds(splitArtifact);

  for (const sw of splitArtifact.workstreams) {
    const ws: ExecuteWorkstream = {
      workstreamId: sw.id,
      title: sw.title,
      state: "queued",
      aiModelUsed: undefined,
      aiPromptHash: undefined,
      aiProvider: undefined,
      changesMade: undefined,
      aiExecutionDurationMs: undefined,
      aiChangesCount: undefined,
      aiLinesAdded: undefined,
      aiLinesRemoved: undefined,
    };
    state.workstreams.set(sw.id, ws);
    reqMap.set(sw.id, prereqs.get(sw.id) ?? []);
  }

  return state;
}

export function getWorkstream(
  id: string,
  state: ExecuteState
): ExecuteWorkstream | undefined {
  return state.workstreams.get(id);
}

export function transitionState(
  id: string,
  newState: ExecuteWorkstreamState,
  state: ExecuteState,
  reason?: string
): { success: boolean; error?: string; violations?: string[] } {
  const ws = state.workstreams.get(id);
  if (!ws) {
    return { success: false, error: `Workstream ${id} not found` };
  }

  const oldState = ws.state;

  // Define valid transitions
  const validTransitions: Record<string, Set<string>> = {
    queued: new Set(["running"]),
    running: new Set(["completed", "failed"]),
    blocked: new Set(["running"]),
    completed: new Set(),
    failed: new Set(),
  };

  if (!validTransitions[oldState]?.has(newState)) {
    return {
      success: false,
      error: `Invalid transition: ${oldState}→${newState}`,
    };
  }

  // Merge order enforcement for running→completed
  if (oldState === "running" && newState === "completed") {
    const reqMap = mergeOrderRequirementsMap.get(state);
    const requirements = reqMap?.get(id) ?? [];
    const unmet = requirements.filter((req) => !state.mergedWorkstreams.has(req));

    if (unmet.length > 0) {
      ws.mergeOrderViolations = unmet;
      const now = new Date().toISOString();
      state.transitions.push({
        workstreamId: id,
        from: oldState,
        to: newState,
        timestamp: now,
        reason: `Blocked: merge order not satisfied (${unmet.join(', ')})`,
      });
      return {
        success: false,
        error: `Merge order requirements not met: ${unmet.join(", ")}`,
        violations: unmet,
      };
    }
  }

  // Apply the transition
  ws.state = newState;

  const now = new Date().toISOString();

  if (newState === "running") {
    ws.startedAt = now;
  } else if (newState === "completed") {
    ws.completedAt = now;
    state.mergedWorkstreams.add(id);
  } else if (newState === "failed") {
    ws.failedAt = now;
    ws.error = reason;
  }

  // Log the transition
  state.transitions.push({
    workstreamId: id,
    from: oldState,
    to: newState,
    timestamp: now,
    reason,
  });

  return { success: true };
}

export function getExecutableWorkstreams(
  state: ExecuteState
): ExecuteWorkstream[] {
  const reqMap = mergeOrderRequirementsMap.get(state);
  const result: ExecuteWorkstream[] = [];

  for (const [id, ws] of state.workstreams) {
    if (ws.state !== "queued") continue;

    const requirements = reqMap?.get(id) ?? [];
    const allMet = requirements.every((req) =>
      state.mergedWorkstreams.has(req)
    );

    if (allMet) {
      result.push(ws);
    }
  }

  return result;
}

export function getBlockedWorkstreams(
  state: ExecuteState
): ExecuteWorkstream[] {
  const reqMap = mergeOrderRequirementsMap.get(state);
  const result: ExecuteWorkstream[] = [];

  for (const [id, ws] of state.workstreams) {
    if (ws.state !== "queued") continue;

    const requirements = reqMap?.get(id) ?? [];
    const allMet = requirements.every((req) =>
      state.mergedWorkstreams.has(req)
    );

    if (!allMet) {
      result.push(ws);
    }
  }

  return result;
}

export function buildExecuteArtifact(
  state: ExecuteState,
  schemaVersion: string,
  forgeVersion: string,
  aiConfig?: AIModelInfo
): ExecuteArtifact {
  const reqMap = mergeOrderRequirementsMap.get(state);
  const workstreams = Array.from(state.workstreams.values());

  const blockedWorkstreams = getBlockedWorkstreams(state);

  const summary = {
    total: workstreams.length,
    queued: 0,
    running: 0,
    completed: 0,
    failed: 0,
    blocked: blockedWorkstreams.length,
    aiExecutedCount: 0,
    totalChangesMade: 0,
  };

  for (const ws of workstreams) {
    if (ws.state in summary && ws.state !== "blocked") {
      summary[ws.state as keyof typeof summary]++;
    }
    // Count AI-executed workstreams and total changes
    if (ws.aiModelUsed !== undefined) {
      summary.aiExecutedCount++;
    }
    if (ws.changesMade !== undefined) {
      summary.totalChangesMade += ws.changesMade.length;
    }
  }

  const mergeOrderGates: ExecuteArtifact["mergeOrderGates"] = [];
  for (const [id, ws] of state.workstreams) {
    const requirements = reqMap?.get(id) ?? [];
    if (requirements.length > 0) {
      mergeOrderGates.push({
        workstreamId: id,
        prerequisites: requirements,
        prerequisitesMet: requirements.every((req) =>
          state.mergedWorkstreams.has(req)
        ),
      });
    }
  }

  return {
    schemaVersion,
    forgeVersion,
    createdAt: new Date().toISOString(),
    splitSource: state.splitSource,
    workstreams,
    mergeOrderGates,
    summary,
    transitions: [...state.transitions],
    aiConfig,
  };
}

/**
 * Restore an ExecuteState from a previously saved ExecuteArtifact.
 * Used to resume execution from an existing execute.json.
 */
export function restoreExecuteState(
  artifact: ExecuteArtifact,
  splitSourcePath: string,
  splitArtifact?: SplitArtifact
): ExecuteState {
  const state: ExecuteState = {
    workstreams: new Map(),
    mergedWorkstreams: new Set(),
    transitions: [...artifact.transitions],
    splitSource: splitSourcePath,
  };

  // Reconstruct the mergeOrderRequirementsMap
  const reqMap = new Map<string, string[]>();
  mergeOrderRequirementsMap.set(state, reqMap);
  const rebuilt =
    splitArtifact !== undefined
      ? buildMergePrerequisiteIds(splitArtifact)
      : undefined;

  for (const ws of artifact.workstreams) {
    state.workstreams.set(ws.workstreamId, { ...ws });
    const gate = artifact.mergeOrderGates.find(
      (g) => g.workstreamId === ws.workstreamId
    );
    const prereqs =
      rebuilt?.get(ws.workstreamId) ?? gate?.prerequisites ?? [];
    reqMap.set(ws.workstreamId, prereqs);
    if (ws.state === "completed") {
      state.mergedWorkstreams.add(ws.workstreamId);
    }
  }

  return state;
}
