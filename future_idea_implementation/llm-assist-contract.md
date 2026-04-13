# Structured LLM-Assist Contract

## Problem Statement

Forge's current `--llm-assist` hook is optional and unstructured — it's a passthrough where any LLM output is accepted without a defined contract for what shape it takes or how it gets consumed downstream.

This creates two risks:

1. **The LLM output doesn't match what the next step expects** — an unstructured response gets passed to a downstream function that was designed for a specific data shape, causing silent failures or garbage outputs.

2. **Non-determinism creeps into the critical path** — since the LLM is in the critical path (not just a suggestion hook), the same input can produce different outputs on different runs, breaking Forge's reproducibility guarantee.

## Current State

Today, the assist hooks look like:

```typescript
// src/plan/assist.ts (simplified)
export async function applyPlanningAssist({
  foundation,
  model,
  planningAssistHook,
}: {
  foundation: PlanFoundationResult;
  model: PlanModel;
  planningAssistHook?: (input: {
    foundation: PlanFoundationResult;
    model: PlanModel;
  }) => Promise<PlanningAssistResolution>;
}): Promise<PlanningAssistResolution> {
  if (!planningAssistHook) {
    return { resolution: "unassisted", notes: [] };
  }

  const assisted = await planningAssistHook({ foundation, model });
  
  // Currently no validation of what assisted returns
  return assisted;
}
```

The hook can return anything, and that anything gets merged into the planning artifact. There's no schema enforcing what `PlanningAssistResolution` looks like.

## Proposed Solution

### 1. Define Typed Assist Contracts Per Step

Each step that supports LLM assist should have a **strict input/output contract**:

```typescript
// src/assist/contracts/intake-assist-contract.ts

export const INTAKE_ASSIST_INPUT_SCHEMA = z.object({
  rawTaskText: z.string(),
  repoContext: z.object({
    languages: z.array(z.string()),
    frameworks: z.array(z.string()),
    sourceFiles: z.array(z.string()),
    testFiles: z.array(z.string()),
  }),
  currentAmbiguities: z.array(z.object({
    category: z.enum(["acceptance_criteria", "scope", "constraints", "repo_alignment"]),
    text: z.string(),
  })),
  currentCandidateTargets: z.array(z.object({
    path: z.string(),
    kind: z.enum(["source", "test", "manifest", "config"]),
    matchType: z.enum(["explicit", "fallback"]),
  })),
});

export const INTAKE_ASSIST_OUTPUT_SCHEMA = z.object({
  enrichedGoal: z.string().optional(),
  suggestedAcceptanceCriteria: z.array(z.string()).optional(),
  suggestedScope: z.array(z.string()).optional(),
  suggestedConstraints: z.array(z.string()).optional(),
  clarifiedAmbiguities: z.array(z.object({
    originalAmbiguity: z.string(),
    clarification: z.string(),
  })).optional(),
  confidenceBoost: z.enum(["none", "low", "medium", "high"]).optional(),
  notes: z.array(z.string()),
});

export type IntakeAssistInput = z.infer<typeof INTAKE_ASSIST_INPUT_SCHEMA>;
export type IntakeAssistOutput = z.infer<typeof INTAKE_ASSIST_OUTPUT_SCHEMA>;
```

Same pattern for plan, verify, and split:

```typescript
// src/assist/contracts/plan-assist-contract.ts
export const PLAN_ASSIST_INPUT_SCHEMA = z.object({
  taskSpec: TaskSpec,
  repoContext: RepoContext,
  candidateTargets: CandidateTarget[],
  currentPlanItems: PlanItem[],  // empty if not yet planned
  ambiguities: AmbiguityItem[],
});

export const PLAN_ASSIST_OUTPUT_SCHEMA = z.object({
  refinedGoal: z.string().optional(),
  additionalRequirements: z.array(z.string()).optional(),
  suggestedParallelizationSignals: z.record(z.string(), z.enum([
    "safe_parallel", "serial_only", "protected_merge_order", "risky_shared", "parallel_after_dependency"
  ])).optional(),
  suggestedDependencies: z.array(z.object({
    fromPlanItemId: z.string(),
    toPlanItemId: z.string(),
    type: z.enum(["hard", "soft"]),
    reason: z.string(),
  })).optional(),
  identifiedConflictZones: z.array(z.object({
    planItemIds: z.array(z.string()),
    sharedPath: z.string(),
    riskLevel: z.enum(["low", "medium", "high"]),
    reason: z.string(),
  })).optional(),
  confidenceBoost: z.enum(["none", "low", "medium", "high"]).optional(),
  notes: z.array(z.string()),
});
```

### 2. Validate LLM Output Before Use

```typescript
// src/assist/validate-assist-output.ts
export async function applyIntakeAssistWithValidation({
  rawInput,
  llmOutput,
}: {
  rawInput: IntakeAssistInput;
  llmOutput: unknown;  // untrusted
}): Promise<IntakeAssistOutput> {
  const parseResult = INTAKE_ASSIST_OUTPUT_SCHEMA.safeParse(llmOutput);
  
  if (!parseResult.success) {
    return {
      resolution: "rejected",
      reason: "LLM output did not match the assist contract",
      schemaErrors: parseResult.error.flatten(),
      fallback: "unassisted",
    };
  }

  const validated = parseResult.data;

  // Sanity check: enriched goal shouldn't contradict raw input
  if (validated.enrichedGoal) {
    const contradiction = detectContradiction(rawInput.rawTaskText, validated.enrichedGoal);
    if (contradiction) {
      return {
        resolution: "rejected",
        reason: `Enriched goal contradicts input: ${contradiction}`,
        fallback: "unassisted",
      };
    }
  }

  return {
    resolution: "accepted",
    output: validated,
    notes: validated.notes ?? [],
  };
}
```

### 3. Deterministic-First Merge Strategy

When assist is used, the LLM output should **augment** the deterministic output, not replace it:

```typescript
// src/assist/merge-assist-output.ts
export function mergeIntakeAssist({
  deterministic,
  assisted,
}: {
  deterministic: AssembledIntakeResult;
  assisted: IntakeAssistOutput;
}): AssembledIntakeResult {
  const merged = { ...deterministic };

  // LLM suggestions are additive — deterministic outputs take precedence
  if (assisted.suggestedAcceptanceCriteria) {
    const existingCriteria = new Set(deterministic.taskSpec.acceptance_criteria ?? []);
    const newCriteria = assisted.suggestedAcceptanceCriteria.filter(
      (c) => !existingCriteria.has(c)
    );
    merged.taskSpec.acceptance_criteria = [
      ...(deterministic.taskSpec.acceptance_criteria ?? []),
      ...newCriteria,
    ];
  }

  if (assisted.confidenceBoost && assisted.confidenceBoost !== "none") {
    // Only upgrade confidence, never downgrade via assist
    const boostMap = { "none": 0, "low": 1, "medium": 2, "high": 3 };
    const currentLevel = boostMap[deterministic.confidence.level];
    const boostLevel = boostMap[assisted.confidenceBoost];
    if (boostLevel > currentLevel) {
      merged.confidence.level = assisted.confidenceBoost as ConfidenceLevel;
    }
  }

  if (assisted.clarifiedAmbiguities) {
    // Remove clarified ambiguities from the active list
    const clarifiedTexts = new Set(
      assisted.clarifiedAmbiguities.map((c) => c.originalAmbiguity)
    );
    merged.ambiguities = merged.ambiguities.filter(
      (a) => !clarifiedTexts.has(a)
    );
  }

  return merged;
}
```

### 4. Assist Audit Trail

Every assist invocation gets logged for reproducibility:

```typescript
// src/assist/audit.ts
export interface AssistAuditEntry {
  step: "intake" | "plan" | "verify" | "split";
  timestamp: string;
  inputHash: string;      // SHA-256 of the assist input
  outputHash: string;     // SHA-256 of the raw LLM output
  validationResult: "accepted" | "rejected";
  rejectionReason?: string;
  mergedInto: string;      // which artifact received this assist
  deterministicFirstMaintained: boolean;
}

export function logAssistAudit(entry: AssistAuditEntry): void {
  const auditLogPath = `.forge/audit/assist-log.jsonl`;
  const line = JSON.stringify(entry) + "\n";
  appendToFile(auditLogPath, line);
}
```

This means if an assist is later found to have caused a problem, you can:
- Find the exact input that produced the bad output
- Replay the assist with a different model/settings
- Trace which downstream artifact was affected

### 5. Model-Agnostic Prompt Templates

```typescript
// src/assist/prompts/intake-assist-prompt.ts
export const INTAKE_ASSIST_SYSTEM_PROMPT = `You are an expert requirements analyst working within the Forge software development pipeline.

Your role is to ENRICH AND CLARIFY, never to invent or hallucinate.

You receive:
- A raw task description
- The repository context (languages, frameworks, existing files)
- Ambiguities already detected by Forge's deterministic intake analyzer
- Candidate files already identified as likely targets

Your job:
1. STRENGTHEN the acceptance criteria — make them concrete and testable
2. RESOLVE ambiguities where possible — if Forge flagged "scope unclear", narrow it
3. ADD constraints if obvious ones are missing (e.g., "must be backwards compatible")
4. NEVER contradict the existing repo context
5. NEVER suggest files that don't exist in the repo context

Output format: JSON matching the IntakeAssistOutput schema.
Reasoning: Before outputting JSON, briefly explain your additions in plain text so a human can audit your changes.`;

export function buildIntakeAssistPrompt(input: IntakeAssistInput): string {
  return `${INTAKE_ASSIST_SYSTEM_PROMPT}

---
TASK:
${input.rawTaskText}

REPO CONTEXT:
Languages: ${input.repoContext.languages.join(", ")}
Frameworks: ${input.repoContext.frameworks.join(", ")}
Existing source files: ${input.repoContext.sourceFiles.slice(0, 20).join(", ")}${input.repoContext.sourceFiles.length > 20 ? " ..." : ""}

DETECTED AMBIGUITIES:
${input.currentAmbiguities.map((a) => `[${a.category}] ${a.text}`).join("\n")}

CANDIDATE TARGETS:
${input.currentCandidateTargets.map((t) => `${t.path} (${t.kind}, ${t.matchType})`).join("\n")}

---

Your output (JSON only, no markdown):`;
}
```

### 6. Assist Mode: Suggestion vs Injection

Two modes for LLM assist:

```typescript
// src/assist/types.ts
export type AssistMode =
  // LLM suggestions are shown to the user for approval before merging
  | "suggestion"  
  // LLM suggestions are auto-merged if validation passes (reproducibility risk)
  | "auto_merge";

// CLI flag: forge intake --llm-assist=suggestion (default)
// CLI flag: forge intake --llm-assist=auto_merge (opt-in to non-determinism)
```

"Suggestion" mode is the default — the artifact gets a `pending_assist_suggestions` field, and Forge pauses to let the user review and accept/reject each suggestion before it merges into the artifact.

"Auto_merge" is available for batch/production use where reproducibility is traded for automation.

## Implementation Checklist

- [ ] Define typed assist contracts (Zod schemas) for each step
- [ ] Implement `validateAssistOutput()` that parses and validates LLM output against the contract
- [ ] Implement `mergeAssistOutput()` that augments deterministic results without replacing them
- [ ] Add contradiction detection (LLM output shouldn't conflict with deterministic input)
- [ ] Add assist audit trail (input hash, output hash, validation result, merge result)
- [ ] Define prompt templates for each assist type with clear system prompts
- [ ] Implement "suggestion" mode — pause for user review before merging
- [ ] Implement "auto_merge" mode — validated assists auto-merge
- [ ] Add `FORGE_ASSIST_AUDIT_LOG` env var to configure audit log location
- [ ] Write tests: valid assist, invalid assist, contradiction detection, merge correctness
- [ ] Document assist contract in docs/forge_llm_assist.md

## Why This Matters

Without a structured assist contract, Forge's deterministic-first guarantee only applies to the parts of each step that don't use the LLM. The assist is essentially a wild card that can silently corrupt artifacts.

By adding typed contracts, validation, and merge strategies, the LLM assist becomes:

1. **Safe** — invalid outputs are rejected, not silently merged
2. **Auditable** — every assist call is logged with hashes for reproducibility
3. **Additive** — deterministic outputs take precedence, LLM output only augments
4. **Transparent** — users can see exactly what the LLM suggested and why

This transforms LLM assist from a footgun into a genuine force multiplier for the deterministic pipeline.
