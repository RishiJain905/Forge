# Part 4 — Step 3 Polish, Test Hardening, and Freeze Criteria

## Purpose

This part defines the final stabilization work needed before Step 3 can be frozen.

It covers:
- polish expectations
- test hardening
- final freeze criteria
- what must be true before Step 3 is considered done

## Why this matters

Without explicit freeze criteria, Step 3 can keep absorbing endless polish work.

This file defines the point where Step 3 should stop being an active build area and start being a stable dependency for Step 4 and later stages.

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

Codex must harden Step 3 so that:
- verification outputs are stable enough for real use
- artifacts/reports/debug data are clear
- warnings/failures/readiness are reliable
- tests protect the stage strongly
- the code no longer feels experimental

## Required implementation tasks

### Output polish
1. ensure verify artifact field population is consistent
2. ensure report sections are consistently present and readable
3. ensure warnings/readiness/carry-forward sections tell a coherent story
4. ensure debug outputs do not confuse the main output path

### Test hardening
1. audit existing Step 3 tests after Batch 2
2. strengthen warning/failure coverage
3. strengthen carry-forward and readiness coverage
4. strengthen debug-output coverage where implemented
5. strengthen TLC-path coverage, especially around Tier 2 additions
6. ensure at least one strong end-to-end test exists for `forge verify`

### Freeze work
1. identify any remaining architecture drift in Step 3
2. remove or close TODOs that block freezing
3. ensure any remaining Step 3 non-goals are documented rather than half-built
4. define Step 3 as frozen except for future bug fixes

## Required code surfaces

Likely files:
- Step 3 tests
- artifact/report builders
- status/warning/readiness logic
- debug-output surfaces
- formal-lane support code

## Inputs
- completed Step 3 implementation from Batch 2
- Batch 3 hardening work

## Outputs
- stronger Step 3 behavior
- stronger tests
- explicit freeze line

## Edge cases
- warning-heavy verification still needs to feel coherent
- TLC pass/fail/error/partial behavior must remain bounded and clear
- readiness may be usable but cautious
- output stability under repeated runs
- carry-forward uncertainty remains significant

## Freeze criteria

Step 3 should be frozen when all of the following are true:

1. `forge verify` is reliable
2. verification outputs are contract-stable
3. warnings/failures/readiness are stable
4. optional debug outputs are coherent
5. Tier 1 and Tier 2 formal cases are materially implemented
6. TLC semantics and trace handling are stable
7. tests protect both happy paths and major warning/failure paths
8. there are no major open design questions left inside Step 3
9. future work on Step 3 can reasonably be treated as bug fixes only

## Acceptance criteria

This part is complete when:
- the freeze criteria are explicit
- the implementation tasks needed to reach them are explicit
- Step 3 has a clear stopping point for active feature work

## Guardrails

- do not keep Step 3 open forever
- do not let one more verification tweak delay Step 4
- freeze when trust is high enough, not when perfection is achieved

