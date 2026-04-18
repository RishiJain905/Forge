---
name: backend-worker
description: Implement backend modules for forge integrate
---

# Backend Worker

NOTE: Startup and cleanup are handled by `worker-base`. This skill defines the WORK PROCEDURE.

## When to Use This Skill

This worker handles features that involve:
- TypeScript type definitions and Zod schemas
- CLI command implementation and wiring
- Artifact building and validation
- Test runner implementation
- Prompt builder logic

## Required Skills

- `test` — for running TDD tests and validation
- None other applicable

## Work Procedure

### Before Starting
1. Read `mission.md` in missionDir for mission overview
2. Read `AGENTS.md` in missionDir for mission boundaries and guidance
3. Read `features.json` to understand the feature you're assigned
4. Run baseline tests: `npm run typecheck && npm run build && npm run test`

### Implementation Steps
1. **Implement the feature** following the specification in `features.json` and the guidance in `AGENTS.md`
2. **Write TDD tests first** (for schema/features that require them) — write failing tests, then implement to make them pass
3. **Run verification** after each module:
   - `npm run typecheck` — must pass
   - `npm run build` — must pass
   - `npm run test` — all tests pass
4. **Verify the feature** against the `verificationSteps` in `features.json`
5. **Commit your work** when the feature is complete and verified

### For Step 6 Batch 1 Specifically
1. Create `src/integrate/` directory
2. Implement in order: types.ts → schema.ts → prompt-builder.ts → test-runner.ts → artifact.ts → report.ts → cli.ts
3. Update `src/cli.ts` to register the integrate command
4. Write TDD tests in `tests/integrate.types-schema.test.ts`
5. Run full validation: `npm run typecheck && npm run build && npm run test && npm run smoke`

### Important Constraints
- **DO NOT create a new AI model connector** — reuse `executeWorkstream` from `src/execute/model-connector.ts`
- Follow existing Forge patterns from `src/execute/`, `src/plan/`, `src/verify/`
- Use `import type` for cross-module type imports
- All schemas must use `.strict()` to reject unknown keys

## Example Handoff

```json
{
  "salientSummary": "Implemented src/integrate/types.ts with all required types (IntegrationTestState, IntegrationTestCase, IntegrationTestFile, IntegrationSummary, IntegrateArtifact, etc.) and re-exported ExecuteArtifact, PlanArtifact, VerifyArtifact, AIModelInfo. All types compile without errors.",
  "whatWasImplemented": "Created src/integrate/types.ts with 10 exported types and interfaces for the integrate step. IntegrationTestState = 'pending' | 'passed' | 'failed' | 'skipped'. IntegrationTestCase has id, name, status (required), durationMs, error, recommendation (optional). IntegrateArtifact includes all required top-level fields.",
  "whatWasLeftUndone": "",
  "verification": {
    "commandsRun": [
      { "command": "npm run typecheck", "exitCode": 0, "observation": "No errors" },
      { "command": "npm run build", "exitCode": 0, "observation": "Compiled successfully" }
    ],
    "interactiveChecks": []
  },
  "tests": {
    "added": [
      {
        "file": "tests/integrate.types-schema.test.ts",
        "cases": [
          { "name": "IntegrationTestStateSchema parses valid states", "verifies": "VAL-TYPES-002" },
          { "name": "IntegrationTestCaseSchema rejects unknown keys", "verifies": "VAL-SCHEMA-004" }
        ]
      }
    ]
  },
  "discoveredIssues": []
}
```

## When to Return to Orchestrator

- Implementation depends on a type/interface that doesn't exist yet
- Requirements are ambiguous or contradictory to existing patterns
- A verification command fails and you're unsure how to fix
- You discover a gap in the specification that needs clarification
