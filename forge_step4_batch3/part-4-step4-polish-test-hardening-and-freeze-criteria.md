# Part 4 — Step 4 Polish, Test Hardening, and Freeze Criteria

## Purpose

This part defines the final stabilization work needed before Step 4 can be frozen.

It covers:
- polish expectations
- test hardening
- final freeze criteria
- what must be true before Step 4 is considered done

## Why this matters

Without explicit freeze criteria, Step 4 can keep absorbing endless polish work.

This file defines the point where Step 4 should stop being an active build area and start being a stable dependency for Step 5 and later stages.

## Polish goal for Batch 3

Polish here means:
- behavior consistency
- output clarity
- better stability
- stronger tests
- cleaner developer trust

It does not mean:
- endless UX tweaking
- architecture redesign
- over-optimization
- future-step expansion

## What Codex must build

Codex must harden Step 4 so that:
- split outputs are stable enough for real use
- artifacts/reports/debug data are clear
- warnings/failures/readiness are reliable
- tests protect the stage strongly
- the code no longer feels experimental

## Required implementation tasks

### Output polish
1. ensure split artifact field population is consistent
2. ensure report sections are consistently present and readable
3. ensure warnings/readiness/carry-forward sections tell a coherent story
4. ensure debug outputs do not confuse the main output path

### Test hardening
1. audit existing Step 4 tests after Batch 2
2. strengthen warning/failure coverage
3. strengthen blocked and partially blocked coverage
4. strengthen merge-order coverage
5. strengthen debug-output coverage
6. ensure at least one strong end-to-end test exists for `forge split`

### Freeze work
1. identify any remaining architecture drift in Step 4
2. remove or close TODOs that block freezing
3. ensure any remaining Step 4 non-goals are documented rather than half-built
4. define Step 4 as frozen except for future bug fixes

## Required code surfaces

Likely files:
- Step 4 tests
- artifact/report builders
- status/warning/readiness logic
- debug-output surfaces
- regrouping/blocking/merge-order support code

## Inputs
- completed Step 4 implementation from Batch 2
- Batch 3 hardening work

## Outputs
- stronger Step 4 behavior
- stronger tests
- explicit freeze line

## Edge cases
- warning-heavy split still needs to feel coherent
- blocked and partially blocked behavior must remain bounded and clear
- readiness may be usable but cautious
- output stability under repeated runs
- carried-forward uncertainty remains significant

## Freeze criteria

Step 4 should be frozen when all of the following are true:

1. `forge split` is reliable
2. split outputs are contract-stable
3. warnings/failures/readiness are stable
4. debug outputs are coherent
5. regrouping remains aggressive but traceable
6. merge-order, blocked, and partially blocked semantics are stable
7. tests protect both happy paths and major warning/failure paths
8. there are no major open design questions left inside Step 4
9. future work on Step 4 can reasonably be treated as bug fixes only

## Acceptance criteria

This part is complete when:
- the freeze criteria are explicit
- the implementation tasks needed to reach them are explicit
- Step 4 has a clear stopping point for active feature work

## Guardrails

- do not keep Step 4 open forever
- do not let one more split tweak delay Step 5
- freeze when trust is high enough, not when perfection is achieved

