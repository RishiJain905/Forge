# Step 6 Batch 2 — Task 4: Missing Artifact Handling

## Owner

MiniMax

## Status

**Pending**

## Context

When `plan.json` or `verify.json` is absent, `forge integrate` currently logs a warning but continues. In `--auto` mode, this should fail. This task improves fallback behavior and makes missing artifact handling explicit.

## Implementation

### Better Stub Creators (`src/integrate/cli.ts`)

```typescript
function createPlanStub(executeArtifact: ExecuteArtifact): PlanArtifact {
  const firstWorkstream = executeArtifact.workstreams[0];

  return {
    schemaVersion: "1.0.0",
    task: {
      goal:
        firstWorkstream?.goal ??
        firstWorkstream?.title ??
        "Unknown task",
    },
    items: executeArtifact.workstreams.map((ws) => ({
      requirement: ws.title,
      category: "general",
      done: ws.state === "completed",
    })),
    goal:
      firstWorkstream?.goal ??
      firstWorkstream?.title ??
      "Unknown task",
  };
}

function createVerifyStub(): VerifyArtifact {
  return {
    schemaVersion: "1.0.0",
    findings: [],
    constraints: [],
    riskLevel: "none",
    riskZones: [],
  };
}
```

### Updated Artifact Loading + Auto Mode Enforcement

Replace the current loading section in `runIntegrateCommand`:

```typescript
// Load plan artifact
let planArtifact: PlanArtifact | null = null;
const planPath = path.join(repoRoot, ".forge", "plan.json");
try {
  const content = await fs.readFile(planPath, "utf-8");
  planArtifact = validatePlanArtifact(JSON.parse(content));
} catch {
  if (options.auto) {
    return {
      status: "failed",
      summary: "plan.json not found. --auto mode requires plan.json.",
      artifactPath: "",
      outputRoot: repoRoot,
      failure: {
        code: "PLAN_REQUIRED",
        message: "plan.json not found. Run 'forge plan' first or remove --auto flag.",
      },
    };
  }
  planArtifact = createPlanStub(executeArtifact);
  console.warn("Warning: plan.json not found. Using stub from execute artifact.");
}

// Load verify artifact
let verifyArtifact: VerifyArtifact | null = null;
const verifyPath = path.join(repoRoot, ".forge", "verify.json");
try {
  const content = await fs.readFile(verifyPath, "utf-8");
  verifyArtifact = validateVerifyArtifact(JSON.parse(content));
} catch {
  if (options.auto) {
    return {
      status: "failed",
      summary: "verify.json not found. --auto mode requires verify.json.",
      artifactPath: "",
      outputRoot: repoRoot,
      failure: {
        code: "VERIFY_REQUIRED",
        message: "verify.json not found. Run 'forge verify' first or remove --auto flag.",
      },
    };
  }
  verifyArtifact = createVerifyStub();
  console.warn("Warning: verify.json not found. Proceeding without verify context.");
}
```

### Validate Existing Imports

Ensure these imports are present in `cli.ts`:

```typescript
import { validatePlanArtifact } from "../plan/schema.js";
import { validateVerifyArtifact } from "../verify/schema.js";
```

## Files Modified

- `src/integrate/cli.ts`

## Tests

Add to `tests/integrate.cli.test.ts`:

- Missing `plan.json` without `--auto` → warning + stub created, continues
- Missing `plan.json` with `--auto` → fails with `PLAN_REQUIRED`
- Missing `verify.json` without `--auto` → warning + stub created, continues
- Missing `verify.json` with `--auto` → fails with `VERIFY_REQUIRED`
- Both `plan.json` and `verify.json` missing without `--auto` → both stubs created, continues
- Both missing with `--auto` → fails on first missing (plan)
- Stub plan artifact has correct goal derived from execute workstream
- Stub verify artifact has empty findings and constraints

## Verification

- `npm run typecheck` — PASS
- `npm run build` — PASS
- `npm run test` — ALL PASS
- Missing artifact without `--auto` produces a warning but succeeds
- Missing artifact with `--auto` produces a clear error with `PLAN_REQUIRED` or `VERIFY_REQUIRED`
