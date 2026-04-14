# Task 2: Execute State Machine

## Goal

Create `src/execute/state-machine.ts` with the core execution state machine that enforces merge_order constraints.

## Details

### State Machine

The state machine tracks workstream execution and enforces merge_order as a hard gate.

```typescript
import { ExecuteWorkstream, ExecuteWorkstreamState, ExecuteArtifact, StateTransition } from './types';
import { SplitJson } from '../split/types';  // the Step 4 artifact type

export interface ExecuteState {
  workstreams: Map<string, ExecuteWorkstream>;
  mergedWorkstreams: Set<string>;  // workstreams that have successfully completed
  transitions: StateTransition[];
  splitSource: string;
}

export function createExecuteState(splitJson: SplitJson): ExecuteState {
  // Initialize all workstreams to 'queued' state
  // Extract merge_order from splitJson.workstreams[x].mergeOrderAfter
  // Return ExecuteState
}

export function getWorkstream(id: string, state: ExecuteState): ExecuteWorkstream | undefined

export function transitionState(
  id: string,
  newState: ExecuteWorkstreamState,
  state: ExecuteState
): { success: boolean; error?: string; violations?: string[] }

export function getExecutableWorkstreams(state: ExecuteState): ExecuteWorkstream[]

export function getBlockedWorkstreams(state: ExecuteState): ExecuteWorkstream[]

export function buildExecuteArtifact(state: ExecuteState): ExecuteArtifact
```

### Key Behaviors

**State Transitions:**
- `queued → running`: Always allowed
- `running → completed`: Allowed only if all merge_order prerequisites have been merged
- `running → failed`: Always allowed (with optional reason)
- `blocked → running`: Allowed (a blocked ws can start if human wants to try)
- Any other transition: Rejected

**merge_order Enforcement:**
When transitioning to `completed`:
1. Get the workstream's `mergeOrderAfter` list from split.json
2. Check if ALL prerequisite workstream ids are in `mergedWorkstreams`
3. If any are missing, reject the transition and return the list of violations
4. If all prerequisites are met, add the workstream id to `mergedWorkstreams` and complete the transition

**Blocked State:**
- A workstream is `blocked` if it has `mergeOrderAfter` prerequisites that haven't merged yet
- This is computed dynamically — if prerequisites become available, the workstream becomes `queued` (not `blocked`) when checked via `getExecutableWorkstreams()`
- `blocked` is a human-visible state set when a workstream can't proceed yet

## Acceptance

- State machine correctly initializes all workstreams to `queued`
- `transitionState` enforces valid transitions only
- `completed` transition is blocked if prerequisites haven't merged (returns violations list)
- `mergedWorkstreams` is updated only when a workstream successfully completes
- `getExecutableWorkstreams` returns workstreams ready to run
- `buildExecuteArtifact` produces a valid `ExecuteArtifact`
