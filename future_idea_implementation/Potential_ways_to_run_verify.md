# Potential Ways to Run Verify

Forge Verify is the most distinctive step in the Forge pipeline — real TLA+/TLC model checking against coordination logic. It can run two ways:

---

## 1. Full Pipeline Mode

Run the complete intake → plan → verify chain:

```bash
forge intake --spec PHASE4.md
forge plan
forge verify
```

Verify reads `.forge/plan.json` produced by the previous step.

---

## 2. Standalone Mode

Verify any plan artifact directly — no intake or plan step required:

```bash
forge verify --plan ./my-custom-plan.json
```

**This is the key flexibility.** You can:
- Verify a hand-written or externally-generated plan
- Iterate on plan design: edit → verify → edit → verify (seconds per iteration)
- Share plans for team review: teammate sends a plan.json, you verify it independently
- Do a quick coordination sanity check before implementing

### CLI Options

```bash
# Basic standalone verify
forge verify --plan ./path/to/plan.json

# With notes/constraints override
forge verify --plan ./path/to/plan.json --notes constraints.md

# With LLM assist (enrich the verification analysis)
forge verify --plan ./path/to/plan.json --llm-assist

# With explicit output directory
forge verify --plan ./path/to/plan.json --output-dir ./my-verify-output

# Dry run — show what would be verified without running TLC
forge verify --plan ./path/to/plan.json --dry-run

# Verbose — show detailed TLA+ specs and TLC output
forge verify --plan ./path/to/plan.json --verbose

# Specific lanes only (skip structural, run formal only)
forge verify --plan ./path/to/plan.json --lanes formal

# Specific plan items only
forge verify --plan ./path/to/plan.json --target pi-rate-limiter,pi-auth-middleware
```

### Input Resolution (Standalone Mode)

When running standalone:

```
1. --plan flag → load this plan.json (required)
2. --notes flag → optional override constraints
3. --config flag → optional Forge config
4. [synthetic carry_forward] → if no intake.json exists, create minimal context

No .forge/intake.json required.
No .forge/plan.json required (uses the one from --plan flag).
```

---

## What Verifier Checks

Two concurrent lanes:

### Structural Lane (Fast, Always Runs)
Pattern-matches plan structure to detect obvious coordination hazards:
- Dependency contradictions
- Unsafe sequencing
- Unsafe parallelization
- Conflict zone hazards

### Formal Lane (TLA+/TLC, Slower)
Real model checking for risky coordination logic:
- Retry logic
- Ownership transitions
- Duplicate execution risk
- Stale-write risk
- Ordering/serialization assumptions

---

## Example Workflow

```
T+0:  forge verify --plan plan-variant-a.json  →  FAILED: race condition detected
T+5:  Edit plan-variant-a.json (change parallelization signal)
T+10: forge verify --plan plan-variant-a.json  →  PASSED
```

Each iteration takes seconds — no need to rebuild the full pipeline.
