# Part 2 — Prompt-Mode Parity and Input Hardening

## Purpose

This part focuses on two things:
1. finishing prompt mode to a trustworthy V1 level
2. hardening the entire Step 1 input layer so both input modes behave predictably

Spec mode was the priority in Batch 3.
Batch 4 must now bring prompt mode to basic parity without overengineering it.

## Why this matters

If prompt mode remains weak:
- Step 1 feels unfinished
- users cannot create tasks on the fly reliably
- confidence/readiness logic becomes inconsistent across input modes
- Step 2 handoff becomes uneven

Prompt mode does not need to be fancy.
It needs to be trustworthy.

## Prompt-mode goal for V1

Prompt mode should:
- accept a direct natural-language task request
- normalize it into the same internal task structure used by spec mode
- generate open questions when underdefined
- surface weaker confidence when appropriate
- avoid inventing product scope
- still produce the normal Step 1 outputs

This is **basic trustworthy parity**, not full polish parity.

## What Codex must build

Codex must make prompt mode:
- routed cleanly through the same pipeline shape as spec mode
- stricter about ambiguity than spec mode
- able to produce a usable `NormalizedTaskSpec`
- able to produce artifacts/reports/debug outputs just like spec mode

Codex must also harden shared input handling so that:
- mode resolution is unambiguous
- input validation remains predictable
- supporting inputs behave the same across modes where applicable

## Required implementation tasks

### Prompt-mode parity tasks
1. audit current prompt-mode behavior
2. ensure prompt input becomes a synthetic normalized spec object
3. generate open questions more aggressively when prompt input is vague
4. ensure acceptance criteria may be sparse but ambiguity is surfaced
5. ensure prompt mode never invents new product behavior
6. make sure prompt mode flows into candidate targeting, analysis, reporting, and persistence correctly

### Input hardening tasks
1. verify mode resolution rules when prompt/spec flags are present
2. ensure invalid mixed input cases are handled clearly
3. ensure optional constraints/notes handling remains coherent in prompt mode
4. ensure focus path behavior is stable across both modes
5. ensure repo resolution behavior is consistent

## Required code surfaces

Likely files:
- `src/intake/input.ts`
- `src/intake/task-parser.ts`
- any mode-resolution helpers
- any prompt-normalization helpers

## Inputs

- `--prompt "<task>"`
- optional repo path
- optional focus paths
- optional constraints/notes where supported

## Outputs

- `ResolvedIntakeInput` for prompt mode
- `NormalizedTaskSpec` from prompt mode
- prompt-specific warnings/open questions where justified
- artifact/report output with the same overall contract as spec mode

## Edge cases

- extremely short prompt
- broad prompt with no acceptance criteria
- prompt implies multiple features
- prompt conflicts with constraints file
- prompt contains risky phrases without enough detail
- prompt includes file/module names directly
- both `--prompt` and `--spec` present

## Acceptance criteria

- prompt mode runs end-to-end
- prompt mode produces the normal Step 1 output set
- prompt mode is more ambiguity-heavy when necessary, not silently overconfident
- prompt mode does not invent scope
- shared input handling is stable across both modes

## Guardrails

- do not make prompt mode smarter by making it hallucinate more
- do not let prompt mode reshape the core Step 1 contract
- do not delay Step 1 completion by over-polishing prompt UX

