# Run Session Management — UX Gap and Proposed Solutions

## The Problem

Forge has no concept of a "run session." Each step reads the previous step's artifact and overwrites its own output. This works fine for a single, uninterrupted run. But in practice, software development is iterative and multi-phase:

**Real-world scenarios that break today:**

### Scenario 1: Multi-Phase Development

```
You finish Phase 4 (forge intake → integrate)
You start Phase 5

cd ~/TerraWatch
forge intake --spec docs/phases/phase5/PHASE5_OVERVIEW.md

Result: Reads old .forge/intake.json (Phase 4!) as input
        No warning. Silent cross-contamination.
```

### Scenario 2: Iterative Planning

```
You run forge plan, look at the output, decide to refine your spec
You re-run forge intake with the updated spec
You run forge plan again

Result: forge plan reads the NEW intake.json correctly
        BUT forge verify reads the OLD plan.json from before your refine
        You just verified stale plan data
```

### Scenario 3: Abandoned Run

```
You start forge intake → forge plan, then stop for the day
A week later you try to continue with forge verify

Result: Forge doesn't know the plan.json is a week old
        It verifies stale data against current code
        No timestamp checking, no warning
```

### Scenario 4: Multiple People on Same Repo

```
Developer A runs forge intake, commits .forge/intake.json
Developer B pulls, runs forge plan
Developer B's plan.json overwrites Developer A's

Result: Artifact provenance is lost
        No run IDs to track who produced what
```

## Current Mitigation

The `--output-dir` flag is the escape hatch:

```bash
forge intake --spec PHASE4.md --output-dir .forge-phase4
forge plan   --output-dir .forge-phase4
forge verify --output-dir .forge-phase4
forge split  --output-dir .forge-phase4
forge execute --output-dir .forge-phase4
forge integrate --output-dir .forge-phase4

# Phase 5: separate directory
forge intake --spec PHASE5.md --output-dir .forge-phase5
```

But this is manual, error-prone, and not intuitive. Most users won't know to do this.

## Proposed Solutions

### Solution 1: Run Session IDs (Recommended)

**Core idea:** Forge introduces a `--run-id` flag that creates an isolated run session. All artifacts for that run go into `--output-dir /path/to/run-<run-id>`. Steps within the same run share the session automatically.

```bash
# Start a new run session
forge intake --spec PHASE4.md --run-id phase4

# Forge automatically uses .forge/run-phase4/ for ALL subsequent steps
forge plan      # → reads .forge/run-phase4/intake.json, writes plan.json there
forge verify    # → reads .forge/run-phase4/plan.json, writes verify.json there
forge split     # → reads .forge/run-phase4/verify.json, writes split.json there
forge execute   # → reads .forge/run-phase4/split.json, writes execute.json there
forge integrate # → reads .forge/run-phase4/execute.json, writes integrate.json there

# Later, start a new run for Phase 5
forge intake --spec PHASE5.md --run-id phase5

# Phase 4 and Phase 5 artifacts are completely isolated
.forge/
  ├── run-phase4/
  │   ├── intake.json
  │   ├── plan.json
  │   ├── verify.json
  │   ├── split.json
  │   ├── execute.json
  │   └── integrate.json
  └── run-phase5/
      ├── intake.json
      └── ...
```

**Auto-creation:** If `--run-id` is provided but `--output-dir` is not, Forge automatically uses:
```
.forge/run-<run-id>/
```

**Same-run detection:** If `--run-id` is omitted but artifacts exist in the default `.forge/` directory, Forge can either:
- **Warn:** "Previous artifacts found. Use `--run-id` to start a fresh session or `--continue` to resume."
- **Auto-increment:** Create `.forge/run-2/`, `.forge/run-3/` automatically

**Resume support:**
```bash
forge plan --run-id phase4
# Finds existing .forge/run-phase4/intake.json
# Prompts: "Resume run 'phase4'? [Y/n]"
# Or with --force: overwrites without prompting
```

### Solution 2: Automatic Timestamp Validation

**Core idea:** Every artifact gets a `createdAt` and `previousArtifactHash` field. When a step reads an artifact, it validates:

1. The artifact isn't older than a configurable threshold (default: 7 days)
2. The `previousArtifactHash` chain is unbroken

```json
// Example: plan.json with provenance tracking
{
  "schemaVersion": "2.0.0",
  "command": "forge plan",
  "stage": "step2",
  "runId": "phase4",
  "createdAt": "2026-04-13T12:00:00Z",
  "previousArtifact": {
    "path": ".forge/run-phase4/intake.json",
    "hash": "sha256:abc123...",
    "createdAt": "2026-04-13T11:58:00Z"
  }
}
```

**Validation rules:**

```typescript
// When forge verify reads plan.json
async function validateInputArtifact(inputPath: string): Promise<ValidationResult> {
  const artifact = await readArtifact(inputPath);
  
  // Check 1: Age
  const ageMs = Date.now() - new Date(artifact.createdAt).getTime();
  const maxAgeMs = (process.env.FORGE_MAX_ARTIFACT_AGE ?? "7d") as Duration;
  
  if (ageMs > maxAgeMs) {
    return {
      valid: false,
      warning: `Artifact is ${formatDuration(ageMs)} old. ` +
        `The codebase may have changed significantly since it was created. ` +
        `Run the upstream step again to refresh.`
    };
  }
  
  // Check 2: Provenance chain
  const expectedHash = artifact.previousArtifact?.hash;
  const actualHash = await hashFile(artifact.previousArtifact?.path);
  
  if (expectedHash && expectedHash !== actualHash) {
    return {
      valid: false,
      error: `Input artifact's predecessor has been modified since this artifact was created. ` +
        `The chain of provenance is broken. ` +
        `Run forge ${artifact.stage.replace("step", "") - 1} again to regenerate.`
    };
  }
  
  return { valid: true };
}
```

**CLI behavior:**
```bash
forge verify

# If plan.json is too old:
# WARNING: plan.json is 8 days old. The codebase may have changed.
# Run `forge plan` again to refresh, or set FORGE_MAX_ARTIFACT_AGE=0 to suppress.

# If provenance chain is broken:
# ERROR: plan.json was generated from an older intake.json that has since been modified.
# The plan may not reflect the current spec.
# Run `forge plan` again to regenerate from the current intake.json.
```

### Solution 3: Interactive Session Manager

**Core idea:** A `forge session` command that manages run lifecycles interactively.

```bash
# Start a new session
$ forge session new --spec PHASE4.md
Created new run session: phase4-2026-04-13
Artifacts: .forge/run-phase4-2026-04-13/

? What's next?
  > forge intake --run-id phase4-2026-04-13
  [Copy to clipboard]

# List existing sessions
$ forge session list
Sessions in .forge/:
  run-phase4-2026-04-13  [complete]  2 days ago
  run-phase4-2026-14     [verify]    14 hours ago
  run-phase5-planning    [plan]      2 hours ago

# Resume a session
$ forge session resume phase4-2026-14
Resuming run 'phase4-2026-14' at step: verify
Last step: forge plan completed 14 hours ago

? What's next?
  > forge verify --run-id phase4-2026-14
  [Copy to clipboard]

# Inspect a session
$ forge session inspect phase4-2026-14
Run: phase4-2026-14
Started: 2026-04-14T10:00:00Z
Last activity: 2026-04-14T14:22:00Z (14 hours ago)
Current step: verify

Artifact chain:
  intake.json  [complete]  ✓  sha256:abc123
  plan.json    [complete]  ✓  sha256:def456
  verify.json  [running]   ⟳  (in progress)

Codebase state at plan time:
  Git commit: a1b2c3d "Add GDELT service skeleton"
  Git branch: phase4
  Uncommitted changes: src/app/services/gdelt_service.py

Warnings:
  ⚠ Codebase has 3 uncommitted changes since plan.json was generated
  ⚠ 14 hours since last step — codebase may have drifted
```

### Solution 4: Git-Native Artifact Tracking

**Core idea:** Store artifacts alongside code in git, with run IDs as branches or tags.

```bash
# When you start a run, optionally create a branch
forge intake --spec PHASE4.md --branch phase4-run-1

# Each step commits its artifact
git add .forge/intake.json && git commit -m "forge(step1): intake complete"
forge plan && git add .forge/plan.json && git commit -m "forge(step2): plan complete"
forge verify && git add .forge/verify.json && git commit -m "forge(step3): verify complete"

# You can diff artifacts across runs
git diff phase4-run-1:forge/plan.json phase5-run-1:forge/plan.json

# Or checkout a specific run
git checkout phase4-run-1
```

**Tradeoff:** This is powerful but requires git familiarity and adds commit noise.

## Recommended Approach: Combination of Solution 1 + 2

**Solution 1 (Run Session IDs)** handles the core UX problem — isolation between phases and runs.

**Solution 2 (Timestamp Validation)** handles the secondary problem — detecting stale artifacts and broken provenance chains.

Together they give you:

1. **Isolation** — `--run-id` keeps Phase 4 and Phase 5 artifacts separate
2. **Safety** — timestamp and hash validation catches stale/broken chains before you act on bad data
3. **Transparency** — `runId` in every artifact makes it clear which run produced what

**Session list and resume (Solution 3)** can be added as a convenience layer on top.

## Implementation Plan

### Phase A: Run Session IDs (Small, High Value)

- Add `--run-id <string>` flag to all step commands
- Add `runId: string` field to all artifact schemas
- Update `resolveOutputRoot()` to use `runId` for default output path
- Update CLI to auto-create output directory from `--run-id`
- Add `--continue` flag to resume from existing session

### Phase B: Provenance Validation (Medium, High Safety Value)

- Add `previousArtifact: { path, hash, createdAt }` to artifact schema
- Add `--max-artifact-age <duration>` env var (default: 7 days)
- Add validation in each step's runner to check age and hash chain
- Emit warning or error if validation fails
- Add `forge session list` and `forge session inspect` commands

### Phase C: Interactive Session Manager (Larger, Nice to Have)

- Implement `forge session` subcommand
- Add `session new`, `session list`, `session resume`, `session inspect`
- Interactive prompts with `--interactive` flag
- Optional git branch creation on session start

## Schema Changes

### New Field: All Artifacts

```typescript
interface ForgeArtifact {
  schemaVersion: string;
  command: string;
  stage: string;
  runId: string | null;      // NEW: which run session this belongs to
  createdAt: string;          // NEW: ISO timestamp
  previousArtifact?: {        // NEW: provenance chain
    path: string;
    hash: string;              // SHA-256 of the predecessor artifact
    createdAt: string;
  };
  // ... existing fields
}
```

### New CLI Flags

```bash
# --run-id: isolates artifacts to a named session
forge intake --run-id phase4

# --continue: resume last run or prompt for session
forge plan --continue

# --max-age: override artifact staleness threshold
forge verify --max-age 1d    # warn if artifact is older than 1 day
forge verify --max-age 0    # fail if any artifact is stale

# --session: interactive session management
forge session list
forge session inspect phase4
forge session new --spec PHASE5.md
```

### Environment Variables

```bash
FORGE_DEFAULT_RUN_ID=phase4          # default run ID for this directory
FORGE_MAX_ARTIFACT_AGE=7d           # max artifact age before warning
FORGE_AUTO_COMMIT_ARTIFACTS=true    # auto-git-commit artifacts
FORGE_ARTIFACT_STORAGE=forge        # 'forge' | 'git' | 'both'
```

## Example: Full Workflow with Run IDs

```bash
# Start Phase 4
cd ~/TerraWatch

forge intake --spec docs/phases/phase4/PHASE4_OVERVIEW.md --run-id phase4
# Output: Created .forge/run-phase4/intake.json

forge plan --run-id phase4
# Output: Created .forge/run-phase4/plan.json

forge verify --run-id phase4
# Output: Created .forge/run-phase4/verify.json
# Validation: plan.json hash matches intake.json hash ✓

forge split --run-id phase4
forge execute --run-id phase4
forge integrate --run-id phase4

# Phase 4 complete. Phase 4 artifacts preserved in .forge/run-phase4/

# Two weeks later, you want to verify the Phase 4 plan is still valid
forge verify --run-id phase4
# Validation: plan.json is 14 days old
# WARNING: Plan artifact is 14 days old. Codebase may have drifted.
# Run forge plan --run-id phase4 --force to regenerate, or ignore with --ignore-stale

# Start Phase 5 (completely separate)
forge intake --spec docs/phases/phase5/PHASE5_OVERVIEW.md --run-id phase5
# Output: Created .forge/run-phase5/intake.json
# No conflict with Phase 4 artifacts
```

## Backward Compatibility

- `runId` and `previousArtifact` fields are **optional** in the schema
- Existing artifacts without these fields are treated as `runId: null`
- Old artifacts pass validation (no previous artifact = skip hash check)
- `--run-id` is optional — existing workflows without it continue to work

## Checklist

### Phase A: Run Session IDs
- [ ] Add `runId: string | null` to all artifact types
- [ ] Add `previousArtifact: { path, hash, createdAt } | undefined` to all artifact types
- [ ] Add `--run-id` flag to CLI for all step commands
- [ ] Update `resolveOutputRoot()` to use `runId` for default path
- [ ] Update artifact creation to compute `previousArtifact.hash`
- [ ] Add `FORGE_DEFAULT_RUN_ID` env var support
- [ ] Write tests for run ID isolation
- [ ] Update docs

### Phase B: Provenance Validation
- [ ] Add artifact age checking in step runners
- [ ] Add hash chain validation in step runners
- [ ] Add `--max-age` CLI flag
- [ ] Add `FORGE_MAX_ARTIFACT_AGE` env var
- [ ] Emit warnings vs errors based on severity
- [ ] Write tests for stale artifact detection
- [ ] Write tests for broken provenance chain detection
- [ ] Update docs

### Phase C: Session Manager
- [ ] Implement `forge session list`
- [ ] Implement `forge session inspect <run-id>`
- [ ] Implement `forge session new --spec <path>`
- [ ] Implement `forge session resume <run-id>`
- [ ] Add interactive prompts
- [ ] Write tests
- [ ] Update docs

## Why This Matters

The artifact system is the heart of Forge's reliability. If users can't trust that their artifacts are:
- **Isolated** — Phase 4 artifacts don't mix with Phase 5
- **Fresh** — artifacts reflect the current codebase, not a week-old snapshot
- **Provable** — you can trace any artifact back to its inputs

Then the guarantees that Forge builds its pipeline on start to crumble.

Run session management isn't glamorous, but it's what separates a tool that's **trustworthy in practice** from one that only works in demos.
