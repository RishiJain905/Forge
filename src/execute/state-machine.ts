import type {
  ExecuteWorkstream,
  ExecuteWorkstreamState,
  ExecuteArtifact,
  StateTransition,
} from "./types.js";
import type { SplitArtifact } from "../split/types.js";

// Internal map to track mergeOrderRequirements per workstream id
const mergeOrderRequirementsMap = new WeakMap<
  ExecuteStateInternal,
  Map<string, string[]>
>();

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

  for (const sw of splitArtifact.workstreams) {
    const ws: ExecuteWorkstream = {
      workstreamId: sw.id,
      title: sw.title,
      state: "queued",
    };
    state.workstreams.set(sw.id, ws);
    reqMap.set(sw.id, [...sw.mergeOrderRequirements]);
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
  forgeVersion: string
): ExecuteArtifact {
  const reqMap = mergeOrderRequirementsMap.get(state);
  const workstreams = Array.from(state.workstreams.values());

  const summary = {
    total: workstreams.length,
    queued: 0,
    running: 0,
    completed: 0,
    failed: 0,
    blocked: 0,
  };

  for (const ws of workstreams) {
    summary[ws.state]++;
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
  };
}
