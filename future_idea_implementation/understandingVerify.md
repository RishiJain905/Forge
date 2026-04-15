# Understanding Forge Verify — Standalone and Full Pipeline

Forge Verify is the most distinctive step in the Forge pipeline. It's also the one that can run **standalone** — you don't need to run `forge intake` and `forge plan` first. You just give it any plan artifact and it tells you if your coordination logic is sound, using real TLA+/TLC model checking.

---

## Two Ways to Run Verify

### Full Pipeline Mode

```bash
forge intake --spec PHASE4.md
forge plan
forge verify
```

Verify reads `.forge/plan.json` from the previous step.

### Standalone Mode

```bash
forge verify --plan ./my-custom-plan.json
```

Verify reads the plan you provide directly. No intake, no plan step needed.

---

## What You Give It

A plan artifact with at minimum:

```json
{
  "schemaVersion": "2.0.0",
  "plan_items": [
    {
      "id": "pi-rate-limiter",
      "title": "Add distributed rate limiter",
      "description": "Implement token bucket rate limiter shared across API instances",
      "category": "implementation",
      "risk_level": "high",
      "parallelization": { "signal": "safe_parallel" }
    }
  ]
}
```

The more complete your plan is (with `dependency_graph`, `conflict_zones`, `parallelization_signals`), the more verification Forge can do.

---

## What It Does

Verify runs **two concurrent lanes** against your plan:

### Lane 1: Structural Verification (Fast, Always Runs)

Pattern-matches your plan's structure to detect obvious coordination hazards:

| Check | What it catches |
|-------|---------------|
| `dependency_contradiction` | Dependency graph has conflicting edges |
| `unsafe_sequencing` | Serial-only item has unresolvable upstream dependencies |
| `unsafe_parallelization` | Parallel item touches conflict zone without protection |
| `conflict_zone_hazard` | Two parallel items target the same high-risk file |

This lane is **deterministic and fast** — no external tools, just regex and graph traversal.

### Lane 2: Formal Verification (Slower, Selective)

Generates **TLA+ specifications** and runs them through the **TLC model checker** to catch subtle bugs that structural analysis misses.

It only runs formal verification on plan items that:
- Involve retry logic (calling external APIs that might fail)
- Have ownership transfer (one agent taking over work from another)
- Have duplicate execution risk (same work running twice)
- Touch shared resources (multiple agents modifying the same state)
- Have ordering constraints (sequence of operations matters)

The formal lane targets these **scenario kinds**:

| Scenario Kind | What it checks |
|--------------|---------------|
| `retry_logic` | Does the retry loop terminate? Does backoff prevent thundering herd? |
| `ownership_transition` | Can ownership be claimed by two agents simultaneously? |
| `duplicate_execution` | Can the same work run twice under concurrency? |
| `shared_resource_mutation_overlap` | Can two agents corrupt shared state? |
| `stale_write_validity` | Can a stale write corrupt shared state? |
| `ordering_serialization` | Can concurrent operations violate ordering? |

---

## What You Get

### The Artifact: `verify.json`

Machine-readable output for downstream steps or CI systems:

```json
{
  "schemaVersion": "2.0.0",
  "command": "forge verify",
  "stage": "step3",
  "status": "complete",
  "executionMode": "standalone",
  "sourcePlan": {
    "path": "./rate-limiter-plan.json",
    "origin": "user_provided"
  },
  "verification_targets": [
    {
      "id": "vt-ownership",
      "title": "Token bucket ownership during concurrent requests",
      "source_plan_item_ids": ["pi-rate-limiter"],
      "category": "ownership",
      "risk_summary": "Multiple concurrent requests may claim/release bucket simultaneously",
      "candidate_lanes": ["formal"],
      "verification_case_ids": ["vc-ownership-1"]
    }
  ],
  "verification_cases": [
    {
      "id": "vc-ownership-1",
      "title": "Only one agent claims bucket at a time",
      "category": "ownership",
      "lane": "formal",
      "status": "passed",
      "summary": "TLC validated: bucket ownership is exclusive, no simultaneous claims",
      "tlc_result": {
        "status": "passed",
        "duration_ms": 3102,
        "states_explored": 156,
        "depth": 6
      }
    }
  ],
  "structural_execution": {
    "dependency_contradictions": [],
    "unsafe_sequencing": [],
    "unsafe_parallelization": [],
    "conflict_zone_hazards": []
  },
  "next_step_readiness": {
    "ready": true,
    "verification_summary": "All verification cases passed. Plan is coordination-safe."
  }
}
```

### The Report: `verify-report.md`

Human-readable version for you to read and act on:

```markdown
# Forge Verify Report

**Plan:** ./rate-limiter-plan.json
**Mode:** standalone
**Status:** PASSED

---

## Verification Targets

### vt-ownership ✓
- **Status:** PASSED
- **Cases:** 1/1 passed
  - vc-ownership-1: Only one agent claims bucket at a time ✓

---

## Structural Verification

No structural hazards found.

---

## Next Step Readiness

**Status:** READY

Plan is coordination-safe. Ready for Step 4 (forge split).
```

### Terminal Output

Quick glance at whether you passed or failed:

```bash
$ forge verify --plan ./rate-limiter-plan.json

  Forge Verify — Step 3

  Plan: ./rate-limiter-plan.json
  Mode: standalone

  Targets:  1
  Cases:    1 (1 formal, 0 structural)
  Passed:   1
  Failed:   0

  Result: ✓ ALL PASSED

  vt-ownership ✓ (1/1 cases)

  Ready for Step 4 (forge split).

  Full report: .forge/reports/verify-report.md
```

---

## What a Failure Looks Like

When TLA+/TLC finds a bug, you get a detailed trace:

```json
{
  "verification_cases": [
    {
      "id": "vc-ownership-1",
      "title": "Only one agent claims bucket at a time",
      "category": "ownership",
      "lane": "formal",
      "status": "failed",
      "summary": "TLC found invariant violation: bucket claimed by two agents simultaneously",
      "tlc_result": {
        "status": "failed",
        "duration_ms": 892,
        "states_explored": 45,
        "depth": 4
      },
      "trace": {
        "states": [
          { "step": 0, "bucket_owner": "none", "bucket_tokens": 100 },
          { "step": 1, "bucket_owner": "agent-1", "bucket_tokens": 99 },
          { "step": 2, "bucket_owner": "agent-2", "bucket_tokens": 98 },
          { "step": 3, "violation": "bucket_owner is agent-1 AND agent-2 simultaneously" }
        ]
      },
      "explanation": "Two agents called claimBucket() at the same simulation tick. "
        + "The interleaving allowed both to read bucket_owner='none' before either wrote. "
        + "Both claimed ownership. "
        + "Fix: Use atomic compare-and-swap (CAS) for ownership transfer."
    }
  ],
  "next_step_readiness": {
    "ready": false,
    "blocked_items": [
      {
        "plan_item_id": "pi-rate-limiter",
        "reason": "vc-ownership-1 failed — concurrent ownership claim possible"
      }
    ]
  }
}
```

The terminal shows:

```bash
$ forge verify --plan ./rate-limiter-plan.json

  Forge Verify — Step 3

  Plan: ./rate-limiter-plan.json
  Mode: standalone

  Targets:  1
  Cases:    1 (1 formal, 0 structural)
  Passed:   0
  Failed:   1

  Result: ✗ FAILED

  vt-ownership ✗
    vc-ownership-1: concurrent ownership claim ✗

  Fix: Use atomic CAS for ownership transfer.
  Re-run with: forge verify --plan ./rate-limiter-plan.json

  Full report: .forge/reports/verify-report.md
```

---

## TLA+/TLC Explained

**TLA+** (Temporal Logic of Actions) is a formal specification language for describing system behaviors. **TLC** is the model checker that exhaustively explores all possible states of your system to find bugs.

Forge generates TLA+ specs automatically from your plan. For an ownership scenario, it generates something like:

```tla
---- MODULE RateLimiter ----
\* Variables
VARIABLE bucket_owner
VARIABLE bucket_tokens

\* Initial state
Init ==
  /\ bucket_owner = "none"
  /\ bucket_tokens = 100

\* Claim bucket action
ClaimBucket(agent) ==
  /\ bucket_owner = "none"
  /\ bucket_owner' = agent
  /\ bucket_tokens' = bucket_tokens - 1

\* Safety: only one owner at a time
SafetyInvariant ==
  \A a, b \in {"agent-1", "agent-2"}:
    bucket_owner = a /\ bucket_owner = b => a = b

\* Model checking
Next ==
  \E agent \in {"agent-1", "agent-2"}: ClaimBucket(agent)

\* TLC checks: can SafetyInvariant ever be violated?
====
```

TLC exhaustively explores all possible interleavings of `ClaimBucket` actions. If it finds a state where `SafetyInvariant` is violated, it returns a counterexample trace.

---

## What Gets Verified vs What Doesn't

### Gets Verified

- **Retry loops** — Do they terminate? Do they prevent thundering herd?
- **Ownership transfer** — Is ownership exclusive?
- **Duplicate execution** — Can the same work run twice?
- **Shared resource mutation** — Can concurrent writes corrupt state?
- **Ordering constraints** — Can sequence violations occur?
- **Dependency graph contradictions** — Do plan dependencies conflict?
- **Conflict zone hazards** — Do parallel items collide on shared files?

### Does NOT Get Verified

- **Correctness of business logic** — Forge checks coordination, not whether your algorithm is right
- **Performance** — No latency or throughput analysis
- **Code syntax** — No compilation checks
- **API contract semantics** — Forge checks the plan's coordination model, not whether the API makes sense

---

## How to Interpret Results

### All Cases Passed

Your plan's coordination logic is **formally verified** as safe. This means:
- No race conditions in ownership transfer
- Retry loops terminate correctly
- Parallel workstreams won't corrupt shared state
- Dependencies are consistent

You can proceed with confidence.

### Cases Failed

Forge found a **concrete counterexample** where your coordination model breaks. The trace shows exactly what happened. The explanation tells you what to fix.

Fix the plan item, re-run verify, and iterate until everything passes.

### Structural Hazards Found

Your plan has **structural problems** — like two workstreams trying to modify the same high-risk file without protection. Fix the parallelization signals or dependency graph.

### Verification Blocked

Something in the plan is too complex for Forge to verify with the available tools. This means:
- State space is too large (reduce parallelism or scope)
- The plan item doesn't fit the supported scenario kinds
- TLC ran out of resources

Reduce the scope or simplify the coordination pattern.

---

## CLI Options for Verify

```bash
# Basic standalone
forge verify --plan ./my-plan.json

# With notes/constraints override
forge verify --plan ./my-plan.json --notes constraints.md

# With LLM assist (enrich the verification analysis)
forge verify --plan ./my-plan.json --llm-assist

# With explicit output directory
forge verify --plan ./my-plan.json --output-dir ./verify-output

# Dry run — show what would be verified without running TLC
forge verify --plan ./my-plan.json --dry-run

# Verbose — show detailed TLA+ specs and TLC output
forge verify --plan ./my-plan.json --verbose

# Specific lanes only (skip formal, run structural only)
forge verify --plan ./my-plan.json --lanes structural

# Specific plan items only
forge verify --plan ./my-plan.json --target pi-rate-limiter,pi-auth
```

---

## Integration with the Full Pipeline

Standalone verify and full pipeline verify produce identical artifacts:

```bash
# Full pipeline
forge intake --spec PHASE4.md
forge plan              # → .forge/plan.json
forge verify            # → reads .forge/plan.json

# Standalone (same verify.json output)
forge verify --plan ./my-plan.json

# The verify.json is identical in both cases
# Step 4 (split) doesn't care how verify was run
forge split  # → reads .forge/verify.json
```

---

## Why Standalone Verify Is Powerful

1. **You own the plan** — Use any planning tool, write plans by hand, import from elsewhere
2. **Fast iteration** — Edit plan, verify, edit, verify — without rebuilding intake and plan each time
3. **Share plans for review** — Send a plan.json to a colleague to verify independently
4. **Third-party verification** — Verify plans from other methodologies or tools
5. **CI/CD integration** — Run `forge verify --plan pr-plan.json` in a pull request pipeline

The TLA+/TLC engine is the most valuable part of Forge. Making it standalone means you can reach for it whenever you have a plan to stress-test, not just when you've committed to the full Forge pipeline.
