# Part 4 — Stage 5 and 6: Targeting, Analysis, and Confidence

## Purpose

This part covers the synthesis layer of Step 1:
- candidate targeting
- risk/ambiguity analysis
- initial verification target detection
- confidence/readiness resolution

This is where parsed task data and repo context become actionable Intake results.

---

## Why this matters

By this point, the system has:
- normalized task information
- repo context

Now it needs to answer:
- what files or modules look relevant
- what risks exist
- what is ambiguous
- what might need later verification
- whether planning can proceed

This is the layer that turns raw understanding into useful Intake judgment.

---

# Stage 5 — Candidate targeting

## Goal

Produce plausible candidate files/modules grounded in task signals and repo context.

## What Codex must build

Codex must make candidate targeting able to:
- map task mentions and signals to likely files/modules
- prioritize focus paths when present
- enforce stricter target filtering under `--strict-focus`
- identify shared-risk files
- attach reasons/confidence notes to candidate matches

## Required implementation tasks

1. Audit current candidate targeting logic.
2. Ensure the logic uses both:
   - task signals
   - repo context
3. Ensure reasons for candidate selection are inspectable.
4. Implement focus path influence carefully:
   - prioritize by default
   - constrain more strongly in strict mode
5. Surface shared-risk files where appropriate.

## Required code surfaces

Likely files:
- `src/intake/candidate-targets.ts`
- any path matching / ranking helpers

## Inputs
- `NormalizedTaskSpec`
- `RepoContext`
- focus path settings
- strict-focus flag

## Outputs
- `CandidateTargets`
- candidate-target warnings or confidence notes

## Edge cases
- task mentions no file/module names
- focus path excludes likely relevant file
- strict focus creates narrow candidate set
- repo structure is large and flat
- multiple similar candidate files exist

## Acceptance criteria
- plausible candidates are produced for realistic spec tasks
- reasons are visible
- focus behavior does not blind the system by default

## Guardrails
- do not use candidate targeting as a substitute for repo scanning
- do not hide weak mapping confidence

---

# Stage 6 — Risk, ambiguity, verification targets, and confidence

## Goal

Turn the synthesized understanding into usable analysis outputs and final Intake status.

## What Codex must build

Codex must implement or stabilize logic that:
- detects risk zones
- classifies ambiguities
- creates warnings
- proposes initial verification targets
- resolves confidence
- resolves next-step readiness
- resolves final Step 1 status

## Required implementation tasks

1. Audit risk and ambiguity analysis logic.
2. Classify ambiguity types using the Batch 1 categories where possible.
3. Detect risks such as:
   - migration risk
   - test risk
   - API compatibility risk
   - coordination/parallelization risk
4. Propose initial verification targets for later Step 3 where justified.
5. Stabilize confidence scoring so it is based on observable signals.
6. Stabilize readiness logic so it clearly says whether `forge plan` can proceed.
7. Ensure final status resolves to:
   - success
   - warning
   - failed

## Required code surfaces

Likely files:
- ambiguity/risk analysis helpers
- verification-target logic
- `src/intake/confidence.ts`
- readiness/status helpers if separate

## Inputs
- `NormalizedTaskSpec`
- `RepoContext`
- `CandidateTargets`
- parse/repo warnings

## Outputs
- `RiskAnalysis`
- `Ambiguity[]`
- `WarningItem[]`
- `VerificationTarget[]`
- `ConfidenceSummary`
- `NextStepReadiness`
- final status

## Edge cases
- strong task parse but weak repo mapping
- weak task parse but healthy repo
- no tests found
- candidates are low-confidence but not impossible
- ambiguities are numerous but not blocking

## Acceptance criteria
- ambiguities are explicit and typed
- warnings are distinct from failures
- confidence is not hand-wavy
- readiness meaningfully supports the next step
- verification targets are grounded

## Guardrails
- do not hide blocking issues inside generic warnings
- do not make confidence a pure LLM opinion
- do not overfit this layer to future verification logic
