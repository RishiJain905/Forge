# Step 5 Batch 2 — Execute Hardening

## Goal

Harden the Step 5 execute runtime to production quality before Step 6. Batch 1 delivered the minimal V1 `forge execute` surface. Batch 2 focuses on the report output, error handling, and edge case coverage that make it production-ready.

---

## Context Files (Read First)

Before any implementation, read:
- `src/execute/cli.ts` — current execute CLI implementation
- `src/execute/state-machine.ts` — current state machine
- `src/execute/artifact.ts` — current artifact writer
- `src/execute/types.ts` — current type definitions
- `src/execute/schema.ts` — current schema definitions
- `tests/execute.v1-minimal.test.ts` — existing test suite
- `tests/execute-state-machine.test.ts` — state machine tests
- `tests/execute-types.test.ts` — type tests
- `Forge_step5_Batch1/SPEC.md` — Batch 1 spec (follow-on note references report generation, error handling, edge cases)

---

## What This Batch Is

- A human-readable `execute-report.md` report for `forge execute`
- Hardened error handling: missing split.json, corrupt inputs, write failures
- Edge case coverage: empty workstream list, all blocked, partial completion
- Exit code semantics for script automation
- Freeze criteria ensuring no regressions

---

## What This Batch Is NOT

- AI agent dispatch (V2)
- API adapter layer (V2)
- Model configuration (V2)
- Concurrent workstream execution (V2)

---

## Task Breakdown

| # | Task | Description | Agent |
|---|------|-------------|-------|
| 1 | Execute Report Generation | Human-readable `execute-report.md` following the established report pattern | MiniMax |
| 2 | Error Handling Polish | Missing/corrupt split.json, write failures, invalid state transitions, exit codes | MiniMax |
| 3 | Edge Case Hardening | Empty workstream list, all blocked, partial completion, concurrent modification, debug output | MiniMax |
| 4 | Acceptance Gate + Freeze Criteria | Acceptance gate suite, freeze criteria, Step 5 completion checklist | MiniMax |

---

## File Structure

```
step5_batch2/
├── SPEC.md                         # This file
├── README.md                       # Batch 2 index with task list and status
├── task_1_MiniMax_execute_report.md
├── task_2_MiniMax_error_handling.md
├── task_3_MiniMax_edge_cases.md
└── task_4_MiniMax_freeze_acceptance.md

src/execute/
├── cli.ts              UPDATE — add report generation, error handling
├── report.ts           NEW — execute report builder
└── (existing files)    UPDATE — error handling, edge cases

tests/
├── execute.report.test.ts         NEW
├── execute.error-handling.test.ts NEW
├── execute.edge-cases.test.ts    NEW
└── execute.freeze-criteria.test.ts NEW
```

---

## Verification

All tasks must pass before Step 5 is considered complete:

- [ ] `npm run typecheck` — PASS
- [ ] `npm run build` — PASS
- [ ] `npm run test` — ALL PASS (no regressions)
- [ ] `npm run smoke` — PASS
- [ ] `forge execute` produces `execute-report.md` on exit
- [ ] Missing `split.json` produces clear error with exit code
- [ ] Corrupt `split.json` produces clear error with exit code
- [ ] Write failures produce clear error with exit code
- [ ] Empty workstream list handled gracefully
- [ ] All-blocked workstream list handled gracefully
- [ ] Partial completion handled correctly
- [ ] Exit codes: 0 for success, 1 for failure, 2 for blocked
- [ ] Step 5 frozen for V1 (no new features)
