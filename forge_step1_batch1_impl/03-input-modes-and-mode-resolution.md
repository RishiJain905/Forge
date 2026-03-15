# Input Modes and Mode Resolution

## Purpose
Define how spec mode and prompt mode are selected and normalized.

## Why this matters
V1 supports two entry styles, and both must converge to the same internal shape.

## What Codex must build
- Mode resolution logic for `--spec` and `--prompt`.
- A normalized internal task representation shared by both modes.
- Different ambiguity handling rules for prompt mode.

## Required implementation tasks
- Validate that at least one primary input mode is present.
- Resolve spec mode vs prompt mode deterministically.
- Normalize both modes into a common task input object before downstream processing.
- Tag the artifact with the selected `input_mode`.

## Required code surfaces
- Mode resolver function.
- Normalized raw-input object.
- Input mode enum/type.
- Prompt-to-synthetic-spec normalization helper.

## Inputs
- `--spec`, `--prompt`, optional notes/constraints.

## Outputs
- Resolved mode.
- Normalized raw task source object.
- Input mode metadata in the artifact.

## Edge cases
- Both `--spec` and `--prompt` are passed together.
- Spec path exists but file is empty.
- Prompt is too short to be actionable.

## Acceptance criteria
- Mode resolution is deterministic and documented.
- Both modes produce a common downstream shape.
- Prompt mode emits more ambiguity/open-question signals when needed.

## Guardrails
- Do not silently merge spec and prompt into one blob without policy.
- If supporting both together later, make that explicit; for now prefer one primary mode.
