# Part 4 — Step 1 Polish, Test Hardening, and Freeze Criteria

## Purpose

This part defines the final stabilization work needed before Step 1 can be frozen.

It covers:
- polish expectations
- test hardening
- final freeze criteria
- what must be true before Step 1 is considered done

## Why this matters

Without explicit freeze criteria, Step 1 can keep absorbing endless polish work.

This file defines the point where Step 1 should stop being an active build area and start being a stable dependency for the rest of Forge.

## Polish goal for Batch 4

Polish here means:
- behavior consistency
- output clarity
- better stability
- stronger tests
- cleaner developer trust

It does **not** mean:
- endless UX tweaking
- architecture redesign
- over-optimization
- future-step expansion

## What Codex must build

Codex must harden Step 1 so that:
- both modes are stable enough for real use
- artifacts and reports are clear
- warnings/failures/debug data are reliable
- tests protect the step strongly
- the code no longer feels experimental

## Required implementation tasks

### Output polish
1. ensure artifact field population is consistent
2. ensure report sections are consistently present and readable
3. ensure warnings and confidence/readiness sections tell a coherent story
4. ensure debug outputs do not confuse the main output path

### Test hardening
1. audit existing Step 1 tests after Batch 3
2. strengthen prompt-mode coverage
3. strengthen warning/failure coverage
4. strengthen debug-output coverage where implemented
5. strengthen `--llm-assist` behavior tests in a narrow bounded way
6. ensure at least one strong end-to-end test exists for spec mode and prompt mode

### Freeze work
1. identify any remaining architecture drift in Step 1
2. remove or close TODOs that block freezing
3. ensure any remaining Step 1 non-goals are documented rather than half-built
4. define Step 1 as frozen except for future bug fixes

## Required code surfaces

Likely files:
- Step 1 tests
- artifact/report builders
- status/warning/confidence logic
- any debug-output surfaces
- any `--llm-assist` support code

## Inputs

- completed Step 1 implementation from Batch 3
- Batch 4 prompt-mode and hardening work

## Outputs

- stronger Step 1 behavior
- stronger tests
- explicit freeze line

## Edge cases

- prompt mode succeeds but remains low confidence
- assist-on versus assist-off behavioral differences
- warning-heavy output still needs to feel coherent
- partial-failure debug output remains usable
- output stability under repeated runs

## Freeze criteria

Step 1 should be frozen when all of the following are true:

1. spec mode is reliable
2. prompt mode is trustworthy at basic parity
3. warning/failure behavior is stable
4. optional debug outputs are coherent
5. `--llm-assist` exists in narrow V1 form
6. artifacts and reports are contract-stable
7. tests protect both major input modes and major warning/failure paths
8. there are no major open design questions left inside Step 1
9. future work on Step 1 can reasonably be treated as bug fixes only

## Acceptance criteria

This part is complete when:
- the freeze criteria are explicit
- the implementation tasks needed to reach them are explicit
- Step 1 has a clear stopping point for active feature work

## Guardrails

- do not keep Step 1 open forever
- do not let “one more polish tweak” delay Step 2
- freeze when trust is high enough, not when perfection is achieved

