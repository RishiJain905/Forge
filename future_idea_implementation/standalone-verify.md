# Standalone Verify — Independent Step 3 Execution

## Problem Statement

Forge's verification step (Step 3) is its most distinctive and valuable feature — real TLA+/TLC model checking against coordination logic. But today, running `forge verify` requires having gone through the full upstream pipeline:

```
forge intake → forge plan → forge verify
```

This creates a significant friction for users who:

1. Already have a plan from another source (manual, another tool, previous work)
2. Want to **verify a plan in isolation** without rebuilding the full pipeline
3. Want to **iterate on a plan** — edit the plan, re-verify, edit, re-verify — without running intake and plan each time
4. Want to **share plans for review** — a teammate sends a plan.json, you verify it independently

The TLA+/TLC engine is powerful enough to justify running standalone. It shouldn't require a full intake → plan → verify pipeline to use it.

## Use Cases

### Use Case 1: Verify a Hand-Written Plan

A user has a plan they wrote by hand or generated from another tool:

```json
// my-architecture-plan.json
{
  "plan_items": [
    {
      "id": "pi-rate-limiter",
      "title": "Add distributed rate limiter",
      "description": "Implement token bucket rate limiter shared across API instances",
      "category": "implementation",
      "parallelization": { "signal": "safe_parallel" },
      "risk_level": "high"
    },
    {
      "id": "pi-auth-middleware",
      "title": "Update auth middleware",
      "description": "Update JWT validation to support RS256+ algorithm allowlist",
      "category": "implementation",
      "parallelization": { "signal": "risky_shared" },
      "risk_level": "medium"
    }
  ],
  "dependency_graph": [
    {
      "plan_item_id": "pi-auth-middleware",
      "depends_on_plan_item_id": "pi-rate-limiter",
      "type": "hard",
      "reason": "Rate limiter must be available before auth middleware can validate tokens"
    }
  ],
  "conflict_zones": [
    {
      "id": "cz-shared-config",
      "plan_item_ids": ["pi-rate-limiter", "pi-auth-middleware"],
      "shared_path": "src/config/rate-limit.ts",
      "risk_level": "high",
      "reason": "Both plan items modify rate limit configuration"
    }
  ]
}
```

They want to verify this plan's coordination logic without running `forge intake` or `forge plan`:

```bash
forge verify --plan ./my-architecture-plan.json
```

### Use Case 2: Iterate on Plan Design

During architecture discussions, a team wants to explore different parallelization strategies:

```
T+0:  forge verify --plan plan-variant-a.json  →  FAILED: race condition detected
T+5:  Edit plan-variant-a.json (change parallelization signal)
T+10: forge verify --plan plan-variant-a.json  →  PASSED
```

Each iteration takes seconds to verify, not minutes to rebuild the full pipeline.

### Use Case 3: Share Plans for Code Review

A teammate sends you a plan artifact:

```bash
# Download the plan from PR, review, verify
curl -O https://internal-tools.company.com/plans/feature-auth-review.json
forge verify --plan ./feature-auth-review.json

# Output shows:
# - Structural: conflict zone detected at cz-shared-config
# - Formal: stale_write_risk in pi-rate-limiter
# - Recommendation: change pi-rate-limiter from safe_parallel to serial_only
```

### Use Case 4: Quick Coordination Check

A developer wants a quick sanity check before implementing:

```bash
forge verify --plan-prompt "I want to add caching to the user service and update the auth flow"
```

This creates a minimal plan in memory, verifies it, and returns results — all in one command.

## Architecture

### CLI Interface

```bash
# Basic standalone verify
forge verify --plan ./path/to/plan.json

# With overrides (notes/constraints from user)
forge verify --plan ./path/to/plan.json --notes constraints.md

# With LLM assist (enrich the verification analysis)
forge verify --plan ./path/to/plan.json --llm-assist

# With explicit output directory
forge verify --plan ./path/to/plan.json --output-dir ./my-verify-output

# Dry run — show what would be verified without running TLC
forge verify --plan ./path/to/plan.json --dry-run

# Verbose — show detailed TLA+ specs and TLC output
forge verify --plan ./path/to/plan.json --verbose

# Specific verification targets only (skip structural lane, run formal only)
forge verify --plan ./path/to/plan.json --lanes formal

# Specific plan items only
forge verify --plan ./path/to/plan.json --target pi-rate-limiter,pi-auth-middleware
```

### Input Resolution

Currently `runVerifyCommand` requires `.forge/intake.json`. For standalone verify:

```
Input Resolution Order (standalone mode):
  1. --plan flag → load this plan.json (required)
  2. --notes flag → optional override constraints
  3. --config flag → optional Forge config
  4. [synthetic carry_forward] → if no intake.json exists, create minimal context
  
  No .forge/intake.json required.
  No .forge/plan.json required (use the one from --plan flag).
```

### Carry-Forward Context (Synthetic)

When no intake artifact exists, the verify step creates a minimal synthetic carry-forward:

```typescript
// src/verify/standalone-context.ts
export function buildSyntheticCarryForward(plan: PlanArtifact): CarryForwardContext {
  return {
    sourceIntake: null,  // null signals "standalone mode"
    carryForward: {
      concerns: [],
      warnings: [
        "Running in standalone mode — no intake artifact available",
        "Some verification targets may have reduced context",
        "Review carry_forward warnings before acting on results"
      ],
    },
    planningDiagnostics: {
      hasAmbiguities: false,
      hasWarnings: false,
      hasConflictZones: plan.conflict_zones.length > 0,
      lowConfidenceSignals: [],
    },
    planningReadiness: {
      status: plan.plan_items.length > 0 ? "actionable" : "non_actionable",
      readinessItems: [],
      warnings: plan.conflict_zones.length > 0
        ? ["Plan has conflict zones — verify catches these structurally"]
        : [],
    },
  };
}
```

### Output Structure

Standalone verify produces the same verify.json artifact as full pipeline verify:

```
.forge/
├── verify.json                    # Full verification artifact
└── reports/
    └── verify-report.md           # Human-readable report
```

The only difference: `verify.json` has an additional field:

```json
{
  "schemaVersion": "2.0.0",
  "command": "forge verify",
  "stage": "step3",
  "executionMode": "standalone",    // NEW: "full_pipeline" | "standalone"
  "sourcePlan": {
    "path": "./my-architecture-plan.json",  // null if from .forge/plan.json
    "origin": "user_provided"        // "full_pipeline" | "user_provided" | "generated"
  },
  ...
}
```

## Implementation

### Changes to verify/input.ts

```typescript
// src/verify/input.ts

export interface VerifyCommandOptions {
  // Existing full-pipeline options
  planArtifactPath?: string;
  outputDir?: string;
  
  // NEW: Standalone mode options
  standalonePlanPath?: string;     // --plan flag
  standaloneNotes?: string;        // --notes flag  
  standaloneConstraints?: string;  // --constraints flag
  
  // Derived
  isStandaloneMode: boolean;       // true if standalonePlanPath is set
}

export async function resolveVerifyFoundationInput(
  options: VerifyCommandOptions,
  currentWorkingDirectory: string,
): Promise<VerifyFoundationInput> {
  const isStandalone = Boolean(options.standalonePlanPath);
  
  if (isStandalone) {
    // Standalone mode: load plan from --plan flag
    const planArtifact = await loadPlanArtifact(options.standalonePlanPath);
    const syntheticCarryForward = buildSyntheticCarryForward(planArtifact);
    
    return {
      sourcePlan: planArtifact,
      verificationInput: {
        usability: resolveVerificationUsability(planArtifact),
        uncertainty: syntheticCarryForward,
        context: {
          taskSpec: planArtifact.task_spec,
          repoContext: buildMinimalRepoContext(planArtifact),  // minimal — from plan
          candidateTargets: planArtifact.candidate_targets ?? [],
          initialVerificationTargets: deriveVerificationTargets(planArtifact),
          dependencyGraph: planArtifact.dependency_graph,
          conflictZones: planArtifact.conflict_zones,
          testObligations: planArtifact.test_obligations ?? [],
          parallelizationSignals: planArtifact.parallelization_signals ?? [],
          carryForward: syntheticCarryForward,
        },
      },
    };
  }
  
  // Full pipeline mode: existing logic
  return resolveVerifyFoundationInputFullPipeline(options, currentWorkingDirectory);
}
```

### Changes to verify/runner.ts

```typescript
// src/verify/runner.ts

export async function runVerifyCommand(
  options: VerifyCommandOptions = {},
  currentWorkingDirectory = process.cwd(),
): Promise<VerifyCommandResult> {
  const isStandalone = Boolean(options.standalonePlanPath);
  
  if (isStandalone) {
    return runVerifyCommandStandalone(options, currentWorkingDirectory);
  }
  
  return runVerifyCommandFullPipeline(options, currentWorkingDirectory);
}

async function runVerifyCommandStandalone(
  options: VerifyCommandOptions,
  currentWorkingDirectory: string,
): Promise<VerifyCommandResult> {
  // 1. Resolve plan from --plan flag
  const input = await resolveVerifyFoundationInput(options, currentWorkingDirectory);
  
  // 2. Build verification model (same as full pipeline)
  const initialFoundation = buildVerifyFoundation(input);
  const initialModel = buildVerifyVerificationModel(initialFoundation);
  const foundation = applyDerivedVerifyModelUsability(
    initialFoundation,
    initialModel.targets.length
  );
  const model = foundation === initialFoundation
    ? initialModel
    : buildVerifyVerificationModel(foundation);
  
  // 3. Run verification (same lanes as full pipeline)
  const startedAt = new Date().toISOString();
  const structuralExecution = buildVerifyStructuralExecution({ foundation, model });
  const structuralModel = {
    ...model,
    cases: structuralExecution.cases,
  };
  const formalExecution = await buildVerifyFormalExecution({
    foundation,
    model: structuralModel,
    outputRoot: paths.outputRoot,
    currentWorkingDirectory,
  });
  
  // 4. Build artifact with standalone metadata
  const readinessResolution = resolveVerifyReadiness({
    foundation,
    model,
    structuralExecution,
    formalExecution,
  });
  const finishedAt = new Date().toISOString();
  
  const artifact = createVerifyArtifact({
    foundation,
    model,
    structuralExecution,
    formalExecution,
    readinessResolution,
    failure: null,
    paths,
    startedAt,
    finishedAt,
    // NEW: standalone metadata
    executionMode: "standalone",
    sourcePlan: {
      path: options.standalonePlanPath,
      origin: "user_provided",
    },
  });
  
  // 5. Write outputs
  const report = createVerifyReport(artifact);
  await persistVerifyCommandOutputs({ artifact, report, paths });
  
  return buildVerifyCommandResult({ artifact, paths });
}
```

### Plan Artifact Schema (Minimum Required Fields)

For standalone verify to work, the provided plan.json must have at least:

```typescript
// src/verify/types.ts
export const STANDALONE_VERIFY_MINIMUM_SCHEMA = z.object({
  schemaVersion: z.string(),
  plan_items: z.array(z.object({
    id: z.string(),
    title: z.string(),
    description: z.string(),
    category: z.enum(["config", "interface", "implementation", "test"]),
    risk_level: z.enum(["low", "medium", "high"]),
    parallelization: z.object({
      signal: z.enum([
        "safe_parallel",
        "serial_only", 
        "protected_merge_order",
        "risky_shared",
        "parallel_after_dependency"
      ]),
    }),
    // Optional but recommended:
    likely_affected_paths: z.array(z.string()).optional(),
  })),
  dependency_graph: z.array(z.object({
    plan_item_id: z.string(),
    depends_on_plan_item_id: z.string(),
    type: z.enum(["hard", "soft"]),
    reason: z.string(),
  })).optional(),  // Optional — structural lane handles empty graph
  conflict_zones: z.array(z.object({
    id: z.string(),
    plan_item_ids: z.array(z.string()),
    shared_path: z.string().optional(),
    risk_level: z.enum(["low", "medium", "high"]),
    reason: z.string(),
  })).optional(),  // Optional — structural lane handles empty conflict zones
});
```

This means even a minimal plan like:

```json
{
  "schemaVersion": "2.0.0",
  "plan_items": [
    {
      "id": "pi-1",
      "title": "Add rate limiter",
      "description": "Implement distributed token bucket",
      "category": "implementation",
      "risk_level": "high",
      "parallelization": { "signal": "safe_parallel" }
    }
  ]
}
```

Is valid for standalone verify. It just won't trigger formal lane verification (no conflict zones, no dependencies to analyze structurally).

### Quick Verify Mode (--plan-prompt)

For the "I have an idea, verify it fast" use case:

```bash
forge verify --plan-prompt "I want to add a distributed cache with two services reading and writing"
```

This creates a minimal plan in memory, verifies it, and returns results:

```typescript
// src/verify/plan-prompt.ts
export async function verifyFromPrompt(
  prompt: string,
  options: VerifyCommandOptions
): Promise<VerifyCommandResult> {
  // 1. Generate minimal plan from prompt using LLM
  const minimalPlan = await generateMinimalPlan({
    prompt,
    model: options.model ?? "claude-opus-4",
  });
  
  // 2. Write to temp location
  const tempPlanPath = `.forge/temp-plan-${Date.now()}.json`;
  await writeFile(tempPlanPath, JSON.stringify(minimalPlan));
  
  try {
    // 3. Run standalone verify on temp plan
    return await runVerifyCommandStandalone({
      ...options,
      standalonePlanPath: tempPlanPath,
    }, process.cwd());
  } finally {
    // 4. Cleanup temp file
    await unlink(tempPlanPath);
  }
}

async function generateMinimalPlan(params: {
  prompt: string;
  model: string;
}): Promise<MinimalPlan> {
  const systemPrompt = `You are a planning assistant. Given a user's description of what they want to build, generate a minimal Forge plan artifact.

Output a JSON object with:
- plan_items: array of plan items (keep it to 3-5 max)
- dependency_graph: relationships between plan items
- conflict_zones: if any plan items share files

Keep plan items at a high level. This is for verification only, not implementation.`;

  const response = await callLLM({
    model: params.model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: params.prompt },
    ],
  });

  return JSON.parse(response.content);
}
```

## Benefits

### For Forge Users

1. **Fast iteration** — edit plan, verify, edit, verify — without rebuild overhead
2. **Shared plans** — send a plan.json to a colleague for independent verification
3. **Third-party plans** — verify plans from other tools or methodologies
4. **Architecture exploration** — try different parallelization strategies quickly
5. **Debug plans in isolation** — catch coordination bugs before any code is written

### For the Forge Ecosystem

1. **Verification as a service** — standalone verify could be exposed as an API
2. **Plan marketplace** — share verified plans that have passed TLA+/TLC checks
3. **CI/CD integration** — `forge verify --plan pr-plan.json` in a PR pipeline without running the full Forge pipeline
4. **Education** — learn TLA+/TLC through Forge's verification without understanding the full pipeline

## Integration with Full Pipeline

Standalone verify and full pipeline verify are not mutually exclusive:

```bash
# User starts with standalone verify to explore architecture
forge verify --plan ./exploration-plan.json --output-dir ./exploration-results

# Once satisfied, run full pipeline
forge intake --spec SPEC.md
forge plan
forge verify                    # Uses .forge/plan.json (full pipeline mode)
forge split

# Or use the explored plan in the full pipeline
forge intake --spec SPEC.md
cp ./exploration-plan.json .forge/plan.json   # Replace generated plan
forge verify                    # Verifies the explored plan (standalone mode)
forge split
```

The verify.json artifact is identical regardless of how verify was invoked. Step 4 (split) and Step 5 (execute) don't care if the plan came from full pipeline or standalone.

## CLI Flag Changes

Add to `src/cli.ts`:

```typescript
// --plan flag for standalone verify
forge verify --plan <path>

// --output-dir already exists

// --dry-run (new)
forge verify --plan <path> --dry-run

// --lanes (new)
forge verify --plan <path> --lanes structural  # skip formal
forge verify --plan <path> --lanes formal      # skip structural  
forge verify --plan <path> --lanes all        # default

// --target (new)
forge verify --plan <path> --target pi-1,pi-2

// --plan-prompt (new)
forge verify --plan-prompt <text>
```

## Implementation Checklist

### Core Changes
- [ ] Add `STANDALONE_VERIFY_MINIMUM_SCHEMA` to `src/verify/types.ts`
- [ ] Update `resolveVerifyFoundationInput()` to handle standalone mode
- [ ] Implement `buildSyntheticCarryForward()` for missing intake context
- [ ] Implement `loadPlanArtifact()` with schema validation
- [ ] Update `runVerifyCommand()` to dispatch to standalone vs full pipeline
- [ ] Add `executionMode` and `sourcePlan` fields to verify artifact

### CLI Changes
- [ ] Add `--plan` flag to verify command in `src/cli.ts`
- [ ] Add `--lanes` flag (structural | formal | all)
- [ ] Add `--target` flag (comma-separated plan item IDs)
- [ ] Add `--dry-run` flag
- [ ] Add `--plan-prompt` flag for quick verify from natural language

### Quick Verify Mode
- [ ] Implement `generateMinimalPlan()` from prompt
- [ ] Implement `verifyFromPrompt()` runner
- [ ] Wire `--plan-prompt` to `verifyFromPrompt()`
- [ ] Add temp file cleanup on error

### Documentation
- [ ] Update docs for standalone verify
- [ ] Add examples to README
- [ ] Add usage guide: when to use standalone vs full pipeline
- [ ] Document schema requirements for user-provided plans

### Testing
- [ ] Test standalone verify with minimal plan (no dependencies, no conflict zones)
- [ ] Test standalone verify with complex plan (all field populated)
- [ ] Test standalone verify with invalid plan schema (should fail gracefully)
- [ ] Test standalone verify with --llm-assist
- [ ] Test standalone vs full pipeline produce identical verify.json
- [ ] Test --plan-prompt generates valid plans
- [ ] Test --dry-run produces no outputs

## Why This Matters

Forge's most valuable feature is not the intake step or the plan step — it's the **verify step with real TLA+/TLC model checking**. Making it standalone multiplies its value:

- **Without standalone verify**: You must commit to the full Forge pipeline to use verification
- **With standalone verify**: Verification is a **tool you reach for** whenever you have a plan to stress-test

This is how tools become indispensable. Not through feature completeness, but through **accessibility of the most valuable feature**. Make it easy to verify any plan, not just Forge-generated plans.

The full pipeline remains for users who want the complete Forge experience. Standalone verify is for everyone else who just wants the verification.
