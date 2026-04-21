# Forge Local Step-by-Step QA Log

**Repo:** `<repo-root>`  
**Branch:** `dev`  
**Test input:** `<path-to-spec.md>`  
**Scope:** Steps 1–4 deterministic; Steps 5–6 attempted without AI model config  
**Note:** No source files were modified during this QA run.

## Step 1 — Intake

**Input file**
- `<path-to-spec.md>`

**Command**
```bash
forge intake --repo <repo-root> --spec <path-to-spec.md> --no-llm
```

**Output artifacts**
- `<repo-root>/.forge/intake.json`
- `<repo-root>/.forge/reports/intake-report.md`

**Observed result**
- `Status: warning`
- `Summary: Forge intake is ready for forge plan with warnings.`

**Diagram**
```text
<path-to-spec.md>
        ↓
forge intake --spec ... --no-llm
        ↓
.forge/intake.json
.forge/reports/intake-report.md
```

## Step 2 — Plan

**Input file**
- `<repo-root>/.forge/intake.json`

**Command**
```bash
forge plan --repo <repo-root>
```

**Output artifacts**
- `<repo-root>/.forge/plan.json`
- `<repo-root>/.forge/reports/plan-report.md`

**Observed result**
- `Status: ready`
- `Summary: forge verify can proceed, but carried-forward warnings still constrain this plan.`

**Diagram**
```text
.forge/intake.json
        ↓
forge plan
        ↓
.forge/plan.json
.forge/reports/plan-report.md
```

## Step 3 — Verify

**Input file**
- `<repo-root>/.forge/plan.json`

**Command**
```bash
forge verify --repo <repo-root>
```

**Output artifacts**
- `<repo-root>/.forge/verify.json`
- `<repo-root>/.forge/reports/verify-report.md`

**Observed result**
- `Status: ready`
- `Summary: forge split can proceed with caution...`

**Diagram**
```text
.forge/plan.json
        ↓
forge verify
        ↓
.forge/verify.json
.forge/reports/verify-report.md
```

## Step 4 — Split

**Input file**
- `<repo-root>/.forge/verify.json`

**Command**
```bash
forge split --repo <repo-root>
```

**Output artifacts**
- `<repo-root>/.forge/split.json`
- `<repo-root>/.forge/reports/split-report.md`

**Observed result**
- `Status: ready`
- `Summary: Forge split can proceed with warnings.`

**Diagram**
```text
.forge/verify.json
        ↓
forge split
        ↓
.forge/split.json
.forge/reports/split-report.md
```

## Step 5 — Execute

**Input file**
- `<repo-root>/.forge/split.json`

**Command**
```bash
forge execute --repo <repo-root>
```

**Interactive inputs**
```text
run 1
status
done 1
exit
```

**Output artifacts**
- `<repo-root>/.forge/execute.json`
- `<repo-root>/.forge/execute-report.md`

**Observed result**
- `run 1` succeeded and entered `manual mode`
- `done 1` failed because merge-order prerequisites were not satisfied

**Diagram**
```text
.forge/split.json
        ↓
forge execute
        ↓
REPL: run 1 → manual mode
REPL: done 1 → merge_order blocked
        ↓
.forge/execute.json
.forge/execute-report.md
```

## Step 6 — Integrate

**Input file**
- `<repo-root>/.forge/execute.json`

**Command**
```bash
forge integrate --repo <repo-root>
```

**Output artifacts**
- No `integrate.json` was produced

**Observed result**
- The command reached the AI-call boundary and failed because `FORGE_MODEL_PROVIDER` was not set

**Failure text**
```text
FORGE_MODEL_PROVIDER environment variable is not set
```

**Diagram**
```text
.forge/execute.json
        ↓
forge integrate
        ↓
AI call fails: missing FORGE_MODEL_PROVIDER
        ↓
(no integrate.json written)
```

## Summary

- Steps **1–4** completed deterministically and produced the expected artifacts.
- Step **5** successfully entered manual mode for `run 1`, but `done 1` was blocked by merge-order requirements.
- Step **6** failed cleanly at the AI provider boundary because no model provider was configured.
- This QA run did not modify any source files.
