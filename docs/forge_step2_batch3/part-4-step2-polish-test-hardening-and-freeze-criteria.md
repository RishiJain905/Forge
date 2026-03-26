# Part 4 — Step 2 Polish, Test Hardening, and Freeze Criteria

## Purpose

This part defines the final stabilization work needed before Step 2 can be frozen.

It covers:
- polish expectations
- test hardening
- final freeze criteria
- what must be true before Step 2 is considered done

## Why this matters

Without explicit freeze criteria, Step 2 can keep absorbing endless polish work.

This file defines the point where Step 2 should stop being an active build area and start being a stable dependency for Step 3 and later stages.

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

Codex must harden Step 2 so that:
- planning outputs are stable enough for real use
- artifacts/reports/debug data are clear
- warnings/failures/readiness are reliable
- tests protect the stage strongly
- the code no longer feels experimental

## Required implementation tasks

### Output polish
1. ensure plan artifact field population is consistent
2. ensure report sections are consistently present and readable
3. ensure warnings/readiness/carry-forward sections tell a coherent story
4. ensure debug outputs do not confuse the main output path

### Test hardening
1. audit existing Step 2 tests after Batch 2
2. strengthen warning/failure coverage
3. strengthen carry-forward and readiness coverage
4. strengthen debug-output coverage where implemented
5. strengthen planning-assist coverage in a narrow bounded way
6. ensure at least one strong end-to-end test exists for `forge plan`

### Freeze work
1. identify any remaining architecture drift in Step 2
2. remove or close TODOs that block freezing
3. ensure any remaining Step 2 non-goals are documented rather than half-built
4. define Step 2 as frozen except for future bug fixes

## Required code surfaces

Likely files:
- Step 2 tests
- artifact/report builders
- status/warning/readiness logic
- debug-output surfaces
- planning-assist support code

## Inputs
- completed Step 2 implementation from Batch 2
- Batch 3 hardening work

## Outputs
- stronger Step 2 behavior
- stronger tests
- explicit freeze line

## Edge cases
- warning-heavy plans still need to feel coherent
- assist-on versus assist-off behavior must remain bounded
- readiness may be usable but cautious
- output stability under repeated runs
- carry-forward uncertainty remains significant

## Freeze criteria

Step 2 should be frozen when all of the following are true:

1. `forge plan` is reliable
2. planning outputs are contract-stable
3. warnings/failures/readiness are stable
4. optional debug outputs are coherent
5. planning-assist exists in a narrow hardened form
6. plan items, dependencies, conflict zones, test obligations, and parallelization categories are stable
7. tests protect both happy paths and major warning/failure paths
8. there are no major open design questions left inside Step 2
9. future work on Step 2 can reasonably be treated as bug fixes only

## Acceptance criteria

This part is complete when:
- the freeze criteria are explicit
- the implementation tasks needed to reach them are explicit
- Step 2 has a clear stopping point for active feature work

## Guardrails

- do not keep Step 2 open forever
- do not let “one more planning tweak” delay Step 3
- freeze when trust is high enough, not when perfection is achieved

