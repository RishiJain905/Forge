# Forge Bad vs Good Step-by-Step QA Log

**Repo:** `<repo-root>`  
**Branch:** `dev`  
**Purpose:** Compare a vague spec vs a well-scoped spec across Steps 1–6.  
**Note:** Steps 5 and 6 were attempted without AI model config.

## Quick comparison

| Example | Step 1 | Step 2 | Step 3 | Step 4 | Step 5 | Step 6 |
|---|---|---|---|---|---|---|
| Bad example | `warning` | `ready` | `ready` | `ready` | blocked by merge-order constraints | `failed` at AI boundary |
| Good example | `warning` | `ready` | `ready` | `ready` | blocked by merge-order constraints | `failed` at AI boundary |

## Bad example

**Spec file:** `<path-to-bad-spec.md>`  
**Output dir:** `.forge/bad`

### Step 1 — Intake

**Input**
- `<path-to-bad-spec.md>`

**Command**
```bash
node dist/src/index.js intake --repo <repo-root> --spec <path-to-bad-spec.md> --no-llm --output-dir .forge/bad
```

**Observed output**
```text
Status: warning
Summary: Forge intake is ready for forge plan with warnings.
Artifact: <repo-root>/.forge/bad/intake.json
Report: <repo-root>/.forge/bad/reports/intake-report.md
```

**Diagram**
```text
<path-to-bad-spec.md>
        ↓
forge intake --spec ... --no-llm
        ↓
.forge/bad/intake.json
.forge/bad/reports/intake-report.md
```

### Step 2 — Plan

**Input**
- `.forge/bad/intake.json`

**Command**
```bash
node dist/src/index.js plan --repo <repo-root> --output-dir .forge/bad
```

**Observed output**
```text
Status: ready
Summary: `forge verify` can proceed, but carried-forward warnings still constrain this plan.
Artifact: <repo-root>/.forge/bad/plan.json
Report: <repo-root>/.forge/bad/reports/plan-report.md
```

**Diagram**
```text
.forge/bad/intake.json
        ↓
forge plan
        ↓
.forge/bad/plan.json
.forge/bad/reports/plan-report.md
```

### Step 3 — Verify

**Input**
- `.forge/bad/plan.json`

**Command**
```bash
node dist/src/index.js verify --repo <repo-root> --output-dir .forge/bad
```

**Observed output**
```text
Status: ready
Summary: `forge split` can proceed with caution: only structural checks ran, no formal cases were modeled for this plan, TLC did not validate any verification case, and 9 structural constraint(s) still need to be carried forward.
Artifact: <repo-root>/.forge/bad/verify.json
Report: <repo-root>/.forge/bad/reports/verify-report.md
```

**Diagram**
```text
.forge/bad/plan.json
        ↓
forge verify
        ↓
.forge/bad/verify.json
.forge/bad/reports/verify-report.md
```

### Step 4 — Split

**Input**
- `.forge/bad/verify.json`

**Command**
```bash
node dist/src/index.js split --repo <repo-root> --output-dir .forge/bad
```

**Observed output**
```text
Status: ready
Summary: Forge split can proceed with warnings. All items were safely assigned, no blocked streams remain, no partially blocked items remain, merge-order constraints were imposed, and later execution must honor the carried-forward constraint detail.
Artifact: <repo-root>/.forge/bad/split.json
Report: <repo-root>/.forge/bad/reports/split-report.md
```

**Diagram**
```text
.forge/bad/verify.json
        ↓
forge split
        ↓
.forge/bad/split.json
.forge/bad/reports/split-report.md
```

### Step 5 — Execute

**Interactive input**
```text
status
exit
```

**Command**
```bash
node dist/src/index.js execute --repo <repo-root> --output-dir .forge/bad
```

**Observed output**
```text
All workstreams are blocked by merge_order constraints.
[id] workstream_id    state       blocked by / merge order
[1] ws-plan-config-1 queued     waiting on: [Protected merge required due to shared-risk or verification constraints., Honor verify-constraint-001 before merge: Keep validation visible: Config and manifest changes should keep contract validation visible in the plan., Honor verify-constraint-002 before merge: Respect Step 2 parallelization guidance: protected_merge_order: Manifest and config work should keep protected merge order because the files are shared-risk., Honor verify-constraint-003 before merge: Keep conflict-zone safeguards in force: conflict-zone-config-1: Config and manifest surfaces are shared-risk files that can force protected merge order., Honor verify-constraint-004 before merge: Carry this concern forward: Step 1 confidence remains low because acceptance criteria are missing from the task input, prompt scope remains underspecified for the current repo, task ambiguities remain unresolved., Honor verify-constraint-005 before merge: Carry this concern forward: Task scope is still unclear for the current repo. Clarify the concrete files, modules, or bounded behavior to change., Honor verify-constraint-006 before merge: Carry this concern forward: Acceptance criteria are missing from the task input., Honor verify-constraint-007 before merge: Carry this concern forward: Acceptance criteria are missing, so Step 2 planning may need user follow-up., Honor verify-constraint-008 before merge: Carry this concern forward: Overall intake confidence is low because acceptance criteria are missing from the task input, prompt scope remains underspecified for the current repo, task ambiguities remain unresolved., Honor verify-constraint-009 before merge: No formal case was required for this target; later steps must still respect the structural safeguards above.]
AI execution requires FORGE_MODEL_PROVIDER and FORGE_MODEL_NAME env vars.
Status: ready
Summary: Total: 1, Completed: 0, Failed: 0, Running: 0, Queued: 1, Blocked: 1
Artifact: .forge/bad/execute.json
Report: .forge/bad/execute-report.md
```

**Diagram**
```text
.forge/bad/split.json
        ↓
forge execute
        ↓
REPL: blocked by merge_order constraints
        ↓
.forge/bad/execute.json
.forge/bad/execute-report.md
```

### Step 6 — Integrate

**Input**
- `.forge/bad/execute.json`

**Command**
```bash
node dist/src/index.js integrate --repo <repo-root> --output-dir .forge/bad
```

**Observed output**
```text
Status: failed
Summary: AI call failed (unknown_error): FORGE_MODEL_PROVIDER environment variable is not set. Set it to one of: openai, anthropic, google, ollama, glm
Failure: [AI_UNKNOWN] FORGE_MODEL_PROVIDER environment variable is not set. Set it to one of: openai, anthropic, google, ollama, glm
```

**Diagram**
```text
.forge/bad/execute.json
        ↓
forge integrate
        ↓
AI call fails: missing FORGE_MODEL_PROVIDER
        ↓
(no integrate.json written)
```

**Notes**
- This spec was intentionally vague, so warnings were expected.

## Good example

**Spec file:** `<path-to-good-spec.md>`  
**Output dir:** `.forge/good2`

### Step 1 — Intake

**Input**
- `<path-to-good-spec.md>`

**Command**
```bash
node dist/src/index.js intake --repo <repo-root> --spec <path-to-good-spec.md> --no-llm --output-dir .forge/good2
```

**Observed output**
```text
Status: warning
Summary: Forge intake is ready for forge plan with warnings.
Artifact: <repo-root>/.forge/good2/intake.json
Report: <repo-root>/.forge/good2/reports/intake-report.md
```

**Diagram**
```text
<path-to-good-spec.md>
        ↓
forge intake --spec ... --no-llm
        ↓
.forge/good2/intake.json
.forge/good2/reports/intake-report.md
```

### Step 2 — Plan

**Input**
- `.forge/good2/intake.json`

**Command**
```bash
node dist/src/index.js plan --repo <repo-root> --output-dir .forge/good2
```

**Observed output**
```text
Status: ready
Summary: `forge verify` can proceed, but carried-forward warnings still constrain this plan.
Artifact: <repo-root>/.forge/good2/plan.json
Report: <repo-root>/.forge/good2/reports/plan-report.md
```

**Diagram**
```text
.forge/good2/intake.json
        ↓
forge plan
        ↓
.forge/good2/plan.json
.forge/good2/reports/plan-report.md
```

### Step 3 — Verify

**Input**
- `.forge/good2/plan.json`

**Command**
```bash
node dist/src/index.js verify --repo <repo-root> --output-dir .forge/good2
```

**Observed output**
```text
Status: ready
Summary: `forge split` can proceed with caution: structural checks ran, formal cases were modeled for 1 target(s), but TLC was not run, so the formal lane has not validated those cases yet.
Artifact: <repo-root>/.forge/good2/verify.json
Report: <repo-root>/.forge/good2/reports/verify-report.md
```

**Diagram**
```text
.forge/good2/plan.json
        ↓
forge verify
        ↓
.forge/good2/verify.json
.forge/good2/reports/verify-report.md
```

### Step 4 — Split

**Input**
- `.forge/good2/verify.json`

**Command**
```bash
node dist/src/index.js split --repo <repo-root> --output-dir .forge/good2
```

**Observed output**
```text
Status: ready
Summary: Forge split can proceed with warnings. All items were safely assigned, no blocked streams remain, no partially blocked items remain, merge-order constraints were imposed, and later execution must honor the carried-forward constraint detail.
Artifact: <repo-root>/.forge/good2/split.json
Report: <repo-root>/.forge/good2/reports/split-report.md
```

**Diagram**
```text
.forge/good2/verify.json
        ↓
forge split
        ↓
.forge/good2/split.json
.forge/good2/reports/split-report.md
```

### Step 5 — Execute

**Interactive input**
```text
status
run ws-plan-config-1
done ws-plan-config-1
exit
```

**Command**
```bash
node dist/src/index.js execute --repo <repo-root> --output-dir .forge/good2
```

**Observed output**
```text
All workstreams are blocked by merge_order constraints.
[id] workstream_id    state       blocked by / merge order
[1] ws-plan-config-1 queued     waiting on: [Protected merge required due to shared-risk or verification constraints., Honor verify-constraint-001 before merge: Keep validation visible: Config and manifest changes should keep contract validation visible in the plan., Honor verify-constraint-002 before merge: Respect Step 2 parallelization guidance: protected_merge_order: Manifest and config work should keep protected merge order because the files are shared-risk., Honor verify-constraint-003 before merge: Keep conflict-zone safeguards in force: conflict-zone-config-1: Config and manifest surfaces are shared-risk files that can force protected merge order., Honor verify-constraint-004 before merge: Carry this concern forward: Step 1 confidence remains low because acceptance criteria are missing from the task input, prompt scope remains underspecified for the current repo, task ambiguities remain unresolved., Honor verify-constraint-005 before merge: Carry this concern forward: Task scope is still unclear for the current repo. Clarify the concrete files, modules, or bounded behavior to change., Honor verify-constraint-006 before merge: Carry this concern forward: Acceptance criteria are missing from the task input., Honor verify-constraint-007 before merge: Carry this concern forward: Acceptance criteria are missing, so Step 2 planning may need user follow-up., Honor verify-constraint-008 before merge: Carry this concern forward: Overall intake confidence is low because acceptance criteria are missing from the task input, prompt scope remains underspecified for the current repo, task ambiguities remain unresolved., Honor verify-constraint-009 before merge: No formal case was required for this target; later steps must still respect the structural safeguards above.]
AI execution requires FORGE_MODEL_PROVIDER and FORGE_MODEL_NAME env vars.
Status: ready
Summary: Total: 1, Completed: 0, Failed: 0, Running: 0, Queued: 1, Blocked: 1
Artifact: .forge/good2/execute.json
Report: .forge/good2/execute-report.md
```

**Diagram**
```text
.forge/good2/split.json
        ↓
forge execute
        ↓
REPL: blocked by merge_order constraints
        ↓
.forge/good2/execute.json
.forge/good2/execute-report.md
```

### Step 6 — Integrate

**Input**
- `.forge/good2/execute.json`

**Command**
```bash
node dist/src/index.js integrate --repo <repo-root> --output-dir .forge/good2
```

**Observed output**
```text
Status: failed
Summary: AI call failed (unknown_error): FORGE_MODEL_PROVIDER environment variable is not set. Set it to one of: openai, anthropic, google, ollama, glm
Failure: [AI_UNKNOWN] FORGE_MODEL_PROVIDER environment variable is not set. Set it to one of: openai, anthropic, google, ollama, glm
```

**Diagram**
```text
.forge/good2/execute.json
        ↓
forge integrate
        ↓
AI call fails: missing FORGE_MODEL_PROVIDER
        ↓
(no integrate.json written)
```

**Notes**
- This spec is much more precise than the bad example and uses explicit scope + acceptance criteria.
- It still stays warning-grade on intake, but the downstream plan/verify outputs are more concrete.

## Overall takeaway

- The vague spec produces warning-heavy output by design.
- The scoped spec is the better template for users, even though Forge remains conservative and may still carry warnings forward.
- Steps 5 and 6 still require a model provider for full AI execution; without it, Step 5 is gated by merge-order constraints and Step 6 fails at the AI boundary.
