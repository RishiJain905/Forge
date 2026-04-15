# Step 5 Batch 2 — Task 4: Acceptance Gate + Freeze Criteria

## Context

Read `tests/execute.v1-minimal.test.ts`, `tests/execute-state-machine.test.ts`, `tests/execute-types.test.ts`, and the freeze criteria patterns from other steps (e.g., `tests/plan.batch3-freeze-criteria.test.ts`).

## Goal

Lock Step 5 execute as complete and frozen for V1 by adding the acceptance gate suite, freeze criteria tests, and updating `progress.md`.

## Acceptance Gate

Follow the same pattern as Steps 1-4 acceptance gates:

### Gate 1: Command Contract
- `forge execute` accepts `--repo` and `--output-dir`
- Missing split.json produces error message

### Gate 2: Artifact Contract
- `execute.json` produced on exit (Zod-valid)
- `execute-report.md` produced on exit
- All required fields present

### Gate 3: State Machine Contract
- All state transitions work correctly
- merge_order blocking enforced
- Failed workstreams don't block others

### Gate 4: Error Handling Contract
- Exit code 0 on full completion
- Exit code 1 on errors
- Exit code 2 on blocked exit
- Clear error messages

### Gate 5: Edge Case Contract
- Empty workstream list handled
- All-blocked handled
- Resume works
- Debug output works

## Freeze Criteria

Add `tests/execute.freeze-criteria.test.ts`:

```typescript
describe('execute freeze criteria', () => {
  it('no TODO/FIXME/XXX markers in execute source', () => {})
  it('no TODO/FIXME/XXX markers in execute tests', () => {})
  it('typecheck passes', () => {})
  it('build passes', () => {})
  it('smoke passes', () => {})
  it('all execute tests pass', () => {})
})
```

## Progress.md Update

Add Step 5 Batch 2 entries to `progress.md` in the Completed section and the "Next" section. Update `progress.md` `## Current Branch State` with Step 5 Batch 2 completion note.

## Step 5 Completion

After this task, Step 5 is complete and frozen for V1. The "Next" section of `progress.md` should say:

```
- Step 5 is complete for V1 and frozen except for future bug fixes.
- Next major target: Step 6 integrate implementation work.
```

## Files to Update

- `tests/execute.freeze-criteria.test.ts` — NEW
- `progress.md` — UPDATE — add Step 5 Batch 2 entries

## Verification

- [ ] Acceptance gate tests: Gate 1-5 all pass
- [ ] Freeze criteria tests pass
- [ ] `npm run typecheck` — PASS
- [ ] `npm run build` — PASS
- [ ] `npm run test` — ALL PASS (no regressions)
- [ ] `npm run smoke` — PASS
- [ ] `progress.md` updated with Step 5 Batch 2 completion
- [ ] `progress.md` "Next" section updated to Step 6
