# Understanding Forge — The Complete Artifact Flow

This document walks through the complete Forge pipeline from Step 1 to Step 6, showing exactly what each step takes as input, what it produces as output, and what you'd type to run it.

---

## The Core Idea

Forge is a **structured execution harness** for AI coding agents. It breaks agentic coding into 6 sequential steps. Each step reads the previous step's artifacts and writes its own. This creates **bounded context per step** — no context window rot, no accumulated drift.

Think of each step as a **transform function**:

```
Input Artifact → [Step Processing] → Output Artifact
```

The output of Step N becomes the input to Step N+1. Each artifact is a **typed, validated JSON file** that the next step can trust.

---

## What You Manually Provide

- **Step 1 input** — your spec or prompt (what you want to build)
- **Step 5 input** — workstream assignments (who does what, when Steps 5 is built)
- **Step 6 input** — integration test results (when Step 6 is built)

Everything else is automatic artifact passing. The CLI handles reading the previous step's artifact and writing to the next.

---

## Step 1 → Step 2

### What You Type

```bash
forge intake --spec docs/phases/phase4/PHASE4_OVERVIEW.md
```

Or even simpler for a quick task:

```bash
forge intake --prompt "Add GDELT world events and ACLED conflict heatmap to TerraWatch"
```

### What Runs

`runIntakeCommand()` does the following:

1. **Input Resolution** — validates `--spec`, `--prompt`, `--notes`, `--constraints` flags
2. **Repo Scan** — walks your repository, finds source files, test files, manifests, detects languages and frameworks
3. **Task Parsing** — extracts goal, acceptance criteria, mentioned paths/modules from the spec
4. **Inference** — maps requirements to candidate target files (explicit vs fallback matching)
5. **Ambiguity Analysis** — identifies unclear areas: missing acceptance criteria, undefined scope, unstated constraints
6. **Confidence Scoring** — rates signal strength on task parsing, repo inspection, and targeting

### Output Artifact: `.forge/intake.json`

```json
{
  "schemaVersion": "2.0.0",
  "command": "forge intake",
  "stage": "step1",
  "status": "ready",
  "task_spec": {
    "title": "Phase 4 — World Events & Conflict Visualization",
    "goal": "Add GDELT world events and ACLED conflict heatmap to TerraWatch",
    "summary": "Phase 4 adds two new intelligence layers to TerraWatch...",
    "acceptance_criteria": [
      "GDELT events appear as colored points on globe",
      "ACLED conflicts appear as heatmap overlay",
      "Events refresh every 15 minutes, ACLED refreshes daily"
    ],
    "explicit_requirements": [
      "Use free GDELT API (no auth)",
      "Use free ACLED registration (OAuth Bearer token)"
    ],
    "implementation_necessities": [
      "Don't remove existing plane and ship layers",
      "New WebSocket message types are additive"
    ]
  },
  "repo_context": {
    "languages": ["typescript", "python"],
    "frameworks": ["react", "fastapi", "deck.gl"],
    "source_files": [
      "backend/app/services/adsb_service.py",
      "backend/app/services/ais_service.py",
      "frontend/src/components/Globe.tsx",
      ...
    ],
    "test_files": [
      "backend/tests/test_adsb_service.py",
      "backend/tests/test_adsb_scheduler.py",
      ...
    ],
    "entry_points": ["backend/main.py", "frontend/src/App.tsx"]
  },
  "candidate_targets": [
    {
      "path": "backend/app/services/gdelt_service.py",
      "kind": "source",
      "match_type": "fallback",
      "reason": "New file — not mentioned explicitly but required by task"
    },
    {
      "path": "frontend/src/components/Globe.tsx",
      "kind": "source",
      "match_type": "explicit",
      "reason": "Explicitly mentioned in task"
    },
    ...
  ],
  "confidence": {
    "level": "medium",
    "signals": {
      "taskParsing": "high",
      "repoInspection": "high",
      "targeting": "medium"
    },
    "reasons": [
      "Task parses cleanly with specific acceptance criteria",
      "Repo structure is well-organized with clear separation of concerns",
      "Some candidate targets use fallback matching (new service files)"
    ]
  },
  "next_step_readiness": {
    "ready": true,
    "blockingIssues": []
  }
}
```

### Also Outputs

`.forge/reports/intake-report.md` — human-readable version of the artifact for review.

### What You Type Next

```bash
forge plan
```

No arguments needed. Forge reads `.forge/intake.json` automatically.

---

## Step 2 → Step 3

### What You Type

```bash
forge plan
```

### What Runs

`runPlanCommand()` does the following:

1. **Requirement Classification** — each acceptance criterion gets mapped to a category (config, interface, implementation, test) using regex patterns
2. **File Requirement Mapping** — traces each requirement to the candidate files it likely affects
3. **Dependency Graph Construction** — for each pair of plan items:
   - Same file stem shared → hard dependency
   - Shared requirement text → soft dependency
   - Interface-implementation link → soft ordering signal
   - Test for implementation → hard dependency
4. **Conflict Zone Detection** — when two plan items modify the same high-risk path (manifests, entry points, shared surfaces)
5. **Parallelization Signal Assignment** — each plan item gets a signal:
   - `safe_parallel` — can run concurrently with others
   - `serial_only` — must run in isolation
   - `protected_merge_order` — can parallelize but must merge in specific order
   - `risky_shared` — touches shared risk surfaces, needs protection
   - `parallel_after_dependency` — parallel OK only after prerequisites complete
6. **Test Obligation Identification** — determines which plan items require tests and what kind

### Output Artifact: `.forge/plan.json`

```json
{
  "schemaVersion": "2.0.0",
  "command": "forge plan",
  "stage": "step2",
  "status": "complete",
  "plan_items": [
    {
      "id": "pi-gdelt-service",
      "title": "GDELT backend service",
      "description": "Create gdelt_service.py — fetch GDELT events via REST, parse CSV/JSON, normalize to Event model",
      "category": "implementation",
      "risk_level": "medium",
      "parallelization": {
        "signal": "safe_parallel",
        "reason": "No shared files with other plan items"
      },
      "likely_affected_paths": [
        "backend/app/services/gdelt_service.py",
        "backend/app/core/models.py"
      ],
      "verification_relevance": {
        "categories": ["retry_logic"],
        "summary": "Service fetching external API — retry logic important for resilience"
      },
      "test_obligation": {
        "category": "unit",
        "description": "Test GDELT parsing and normalization"
      }
    },
    {
      "id": "pi-acled-service",
      "title": "ACLED backend service",
      "description": "Create acled_service.py — OAuth authentication, API fetch, normalize to Conflict model",
      "category": "implementation",
      "risk_level": "medium",
      "parallelization": {
        "signal": "safe_parallel",
        "reason": "No shared files with other plan items"
      },
      "likely_affected_paths": [
        "backend/app/services/acled_service.py"
      ],
      "verification_relevance": {
        "categories": ["retry_logic", "ownership"],
        "summary": "OAuth token management — ownership and retry important"
      }
    },
    {
      "id": "pi-events-layer",
      "title": "Events layer on globe",
      "description": "Add ScatterplotLayer for GDELT points, colored by tone (red negative, green positive)",
      "category": "implementation",
      "risk_level": "medium",
      "parallelization": {
        "signal": "parallel_after_dependency",
        "reason": "Depends on backend API being available"
      },
      "likely_affected_paths": [
        "frontend/src/components/Globe.tsx",
        "frontend/src/hooks/useEvents.js"
      ],
      "verification_relevance": {
        "categories": ["api_contract"],
        "summary": "Frontend depends on /api/events endpoint contract"
      }
    },
    {
      "id": "pi-conflicts-layer",
      "title": "Conflicts heatmap layer",
      "description": "Add HeatmapLayer for ACLED conflict intensity, colored by fatalities",
      "category": "implementation",
      "risk_level": "medium",
      "parallelization": {
        "signal": "parallel_after_dependency",
        "reason": "Depends on backend API being available"
      },
      "likely_affected_paths": [
        "frontend/src/components/Globe.tsx",
        "frontend/src/hooks/useConflicts.js"
      ]
    },
    {
      "id": "pi-rest-endpoints",
      "title": "Event and Conflict REST endpoints",
      "description": "Create /api/events and /api/conflicts routes",
      "category": "implementation",
      "risk_level": "low",
      "parallelization": {
        "signal": "parallel_after_dependency",
        "reason": "Must come after services are implemented"
      },
      "likely_affected_paths": [
        "backend/app/api/routes/events.py",
        "backend/app/api/routes/conflicts.py"
      ]
    },
    {
      "id": "pi-websocket-wiring",
      "title": "WebSocket wiring for events and conflicts",
      "description": "Wire event_batch and conflict_batch WebSocket messages",
      "category": "implementation",
      "risk_level": "medium",
      "parallelization": {
        "signal": "protected_merge_order",
        "reason": "Shared WebSocket infrastructure — must merge carefully"
      },
      "likely_affected_paths": [
        "backend/app/websocket/manager.py",
        "frontend/src/App.tsx"
      ]
    }
  ],
  "dependency_graph": [
    {
      "plan_item_id": "pi-events-layer",
      "depends_on_plan_item_id": "pi-gdelt-service",
      "type": "hard",
      "reason": "Frontend needs /api/events endpoint before rendering layer"
    },
    {
      "plan_item_id": "pi-events-layer",
      "depends_on_plan_item_id": "pi-rest-endpoints",
      "type": "hard",
      "reason": "REST endpoints required for layer data"
    },
    {
      "plan_item_id": "pi-conflicts-layer",
      "depends_on_plan_item_id": "pi-acled-service",
      "type": "hard",
      "reason": "Frontend needs /api/conflicts endpoint before rendering layer"
    },
    {
      "plan_item_id": "pi-rest-endpoints",
      "depends_on_plan_item_id": "pi-gdelt-service",
      "type": "hard",
      "reason": "Events endpoints use GDELT service"
    },
    {
      "plan_item_id": "pi-rest-endpoints",
      "depends_on_plan_item_id": "pi-acled-service",
      "type": "hard",
      "reason": "Conflicts endpoints use ACLED service"
    },
    {
      "plan_item_id": "pi-websocket-wiring",
      "depends_on_plan_item_id": "pi-rest-endpoints",
      "type": "hard",
      "reason": "WebSocket wiring needs REST endpoints to exist"
    }
  ],
  "conflict_zones": [
    {
      "id": "cz-globe-component",
      "plan_item_ids": ["pi-events-layer", "pi-conflicts-layer"],
      "shared_path": "frontend/src/components/Globe.tsx",
      "risk_level": "medium",
      "reason": "Both layers modify the same Globe component"
    }
  ],
  "parallelization_signals": [
    {
      "plan_item_id": "pi-gdelt-service",
      "signal": "safe_parallel",
      "reason": "No dependencies at start of pipeline"
    },
    {
      "plan_item_id": "pi-acled-service",
      "signal": "safe_parallel",
      "reason": "No dependencies at start of pipeline"
    },
    {
      "plan_item_id": "pi-events-layer",
      "signal": "parallel_after_dependency",
      "reason": "Blocked until gdelt-service completes"
    },
    {
      "plan_item_id": "pi-conflicts-layer",
      "signal": "parallel_after_dependency",
      "reason": "Blocked until acled-service completes"
    }
  ],
  "test_obligations": [
    {
      "plan_item_id": "pi-gdelt-service",
      "category": "unit",
      "reason": "New service — unit tests required for parsing logic"
    },
    {
      "plan_item_id": "pi-acled-service",
      "category": "unit",
      "reason": "New service — unit tests required for OAuth and parsing"
    },
    {
      "plan_item_id": "pi-rest-endpoints",
      "category": "integration",
      "reason": "REST endpoints require integration tests"
    }
  ],
  "carry_forward": {
    "concerns": [],
    "warnings": [
      "GDELT uses 15-minute delayed data — no real-time expectation",
      "ACLED refreshes daily — conflict data is not real-time"
    ]
  },
  "planning_diagnostics": {
    "hasAmbiguities": false,
    "hasWarnings": false,
    "hasConflictZones": true,
    "lowConfidenceSignals": []
  }
}
```

### Also Outputs

`.forge/reports/plan-report.md` — human-readable version of the plan for review.

### What You Type Next

```bash
forge verify
```

---

## Step 3 → Step 4

### What You Type

```bash
forge verify
```

### What Runs

`runVerifyCommand()` runs two concurrent verification lanes:

**Lane 1 — Structural Verification (fast, deterministic)**
- `dependency_contradiction` — dependency graph has conflicting edges
- `unsafe_sequencing` — serial-only item has unresolvable upstream dependencies
- `unsafe_parallelization` — parallel item touches conflict zone without protection
- `conflict_zone_hazard` — two parallel items target same high-risk file

**Lane 2 — Formal Verification (slower, uses TLA+/TLC)**
- Generates TLA+ specifications for risky coordination logic
- Runs TLC model checker to find invariant violations
- Only runs when structural lane finds something worth examining
- Targets: retry logic, ownership transitions, duplicate execution, stale writes, ordering constraints

### Output Artifact: `.forge/verify.json`

```json
{
  "schemaVersion": "2.0.0",
  "command": "forge verify",
  "stage": "step3",
  "status": "complete",
  "executionMode": "full_pipeline",
  "verification_targets": [
    {
      "id": "vt-retry-gdelt",
      "title": "GDELT service retry logic",
      "source_plan_item_ids": ["pi-gdelt-service"],
      "category": "retry_logic",
      "risk_summary": "Service calls external API — network failures require retry with backoff",
      "candidate_lanes": ["structural", "formal"],
      "verification_case_ids": ["vc-gdelt-retry-1", "vc-gdelt-retry-2"]
    },
    {
      "id": "vt-api-contract",
      "title": "REST API endpoint contracts",
      "source_plan_item_ids": ["pi-rest-endpoints", "pi-events-layer", "pi-conflicts-layer"],
      "category": "api_contract",
      "risk_summary": "Frontend depends on /api/events and /api/conflicts — contract must be stable",
      "candidate_lanes": ["structural"],
      "verification_case_ids": ["vc-api-contract-1"]
    }
  ],
  "verification_cases": [
    {
      "id": "vc-gdelt-retry-1",
      "title": "GDELT retry exhausts on persistent failure",
      "source_plan_item_ids": ["pi-gdelt-service"],
      "category": "retry_logic",
      "lane": "formal",
      "status": "passed",
      "summary": "TLC validated: retry loop terminates after max_attempts, no infinite retry under permanent failure",
      "tlc_result": {
        "status": "passed",
        "duration_ms": 2340,
        "states_explored": 127,
        "depth": 8
      }
    },
    {
      "id": "vc-gdelt-retry-2",
      "title": "GDELT backoff prevents thundering herd",
      "source_plan_item_ids": ["pi-gdelt-service"],
      "category": "retry_logic",
      "lane": "formal",
      "status": "passed",
      "summary": "TLC validated: exponential backoff prevents concurrent retries from overwhelming API"
    },
    {
      "id": "vc-api-contract-1",
      "title": "No circular dependency between endpoints and layers",
      "source_plan_item_ids": ["pi-rest-endpoints", "pi-events-layer"],
      "category": "api_contract",
      "lane": "structural",
      "status": "passed",
      "summary": "Dependency graph confirms endpoints are upstream of frontend layers"
    },
    {
      "id": "vc-websocket-conflicts",
      "title": "WebSocket merge doesn't conflict",
      "source_plan_item_ids": ["pi-websocket-wiring", "pi-events-layer", "pi-conflicts-layer"],
      "category": "parallel_overlap",
      "lane": "structural",
      "status": "passed",
      "summary": "Conflict zone at Globe.tsx is protected — events and conflicts layers are serialized through protected_merge"
    }
  ],
  "structural_execution": {
    "dependency_contradictions": [],
    "unsafe_sequencing": [],
    "unsafe_parallelization": [],
    "conflict_zone_hazards": []
  },
  "formal_verification": [
    {
      "target_id": "vt-retry-gdelt",
      "case_id": "vc-gdelt-retry-1",
      "status": "passed",
      "tlc_result": {
        "status": "passed",
        "duration_ms": 2340,
        "states_explored": 127
      },
      "tla_spec": "..."
    }
  ],
  "next_step_readiness": {
    "ready": true,
    "verification_summary": "All 4 verification cases passed. No coordination hazards found.",
    "blocked_items": []
  }
}
```

### Also Outputs

`.forge/reports/verify-report.md` — human-readable verification report.

### What You Type Next

```bash
forge split
```

---

## Step 4 → Step 5

### What You Type

```bash
forge split
```

### What Runs

`runSplitCommand()` does the following:

1. **Workstream Construction** — each plan item becomes a workstream
2. **Surface-Based Grouping** — files are analyzed by surface (e.g., `services/`, `components/`) to find items that can be grouped together
3. **Category Assignment** — each workstream gets categorized:
   - `safe_parallel` — can run concurrently, no merge constraints
   - `serial` — must run and merge in isolation
   - `protected_merge` — can parallelize but must merge carefully due to shared risk
   - `parallel_after_dependency` — blocked until dependencies complete
   - `blocked` — cannot proceed due to failed verification or upstream block
4. **Merge Order Computation** — topological sort of dependencies to determine merge sequence
5. **Constraint Collection** — gathers all constraints from dependencies, conflict zones, test obligations, verification constraints

### Output Artifact: `.forge/split.json`

```json
{
  "schemaVersion": "2.0.0",
  "command": "forge split",
  "stage": "step4",
  "status": "complete",
  "workstreams": [
    {
      "id": "ws-gdelt-service",
      "category": "safe_parallel",
      "plan_item_ids": ["pi-gdelt-service"],
      "description": "Create GDELT backend service",
      "constraints": [
        "No merge ordering required for safe_parallel workstream",
        "Test obligation: unit tests for GDELT parsing"
      ],
      "merge_order_after": [],
      "blocked_reason": null,
      "surface_key": "services"
    },
    {
      "id": "ws-acled-service",
      "category": "safe_parallel",
      "plan_item_ids": ["pi-acled-service"],
      "description": "Create ACLED backend service",
      "constraints": [
        "No merge ordering required for safe_parallel workstream",
        "Test obligation: unit tests for ACLED OAuth and parsing"
      ],
      "merge_order_after": [],
      "blocked_reason": null,
      "surface_key": "services"
    },
    {
      "id": "ws-rest-endpoints",
      "category": "parallel_after_dependency",
      "plan_item_ids": ["pi-rest-endpoints"],
      "description": "Create Event and Conflict REST endpoints",
      "constraints": [
        "Wait for ws-gdelt-service before merge",
        "Wait for ws-acled-service before merge",
        "Test obligation: integration tests for REST endpoints"
      ],
      "merge_order_after": ["ws-gdelt-service", "ws-acled-service"],
      "blocked_reason": null,
      "surface_key": "api/routes"
    },
    {
      "id": "ws-events-layer",
      "category": "parallel_after_dependency",
      "plan_item_ids": ["pi-events-layer"],
      "description": "Events layer on globe",
      "constraints": [
        "Wait for ws-rest-endpoints before merge",
        "Conflict zone at Globe.tsx — coordinate with ws-conflicts-layer"
      ],
      "merge_order_after": ["ws-rest-endpoints"],
      "blocked_reason": null,
      "surface_key": "components"
    },
    {
      "id": "ws-conflicts-layer",
      "category": "parallel_after_dependency",
      "plan_item_ids": ["pi-conflicts-layer"],
      "description": "Conflicts heatmap layer",
      "constraints": [
        "Wait for ws-rest-endpoints before merge",
        "Conflict zone at Globe.tsx — coordinate with ws-events-layer"
      ],
      "merge_order_after": ["ws-rest-endpoints"],
      "blocked_reason": null,
      "surface_key": "components"
    },
    {
      "id": "ws-websocket-wiring",
      "category": "protected_merge",
      "plan_item_ids": ["pi-websocket-wiring"],
      "description": "WebSocket wiring for events and conflicts",
      "constraints": [
        "Protected merge — serialize with ws-events-layer and ws-conflicts-layer",
        "Wait for ws-events-layer and ws-conflicts-layer before merge"
      ],
      "merge_order_after": ["ws-events-layer", "ws-conflicts-layer"],
      "blocked_reason": null,
      "surface_key": "websocket"
    }
  ],
  "stream_categories": {
    "safe_parallel": 2,
    "serial": 0,
    "parallel_after_dependency": 4,
    "protected_merge": 1,
    "blocked": 0
  },
  "merge_order_entries": [
    { "order": 1, "workstream_id": "ws-gdelt-service" },
    { "order": 1, "workstream_id": "ws-acled-service" },
    { "order": 2, "workstream_id": "ws-rest-endpoints" },
    { "order": 3, "workstream_id": "ws-events-layer" },
    { "order": 3, "workstream_id": "ws-conflicts-layer" },
    { "order": 4, "workstream_id": "ws-websocket-wiring" }
  ],
  "blocked_items": [],
  "next_step_readiness": {
    "ready": true,
    "summary": "6 workstreams generated. 2 safe_parallel (can run concurrently). 4 serializable after dependencies. 0 blocked."
  }
}
```

### Also Outputs

`.forge/reports/split-report.md` — human-readable workstream breakdown.

### What You Type Next

```bash
forge execute
```

---

## Step 5 → Step 6

### What You Type

```bash
forge execute --agent claude-code
```

### What Runs

`runExecuteCommand()` (the orchestrator — not yet built) does the following:

1. **Queue Management** — reads split.json, identifies root workstreams (no dependencies)
2. **Agent Dispatch** — dispatches safe_parallel workstreams to agents simultaneously
3. **Constraint Enforcement** — holds downstream workstreams until their merge_order prerequisites complete
4. **Handoff Management** — transfers artifacts between dependent workstreams
5. **State Tracking** — tracks running/complete/failed/blocked per workstream
6. **Failure Handling** — retries, rollbacks, or surfaces failures before proceeding

### Output Artifact: `.forge/execute.json` (design draft)

```json
{
  "schemaVersion": "2.0.0",
  "command": "forge execute",
  "stage": "step5",
  "status": "complete",
  "execution_summary": {
    "total_workstreams": 6,
    "dispatched": 6,
    "succeeded": 5,
    "failed": 0,
    "skipped": 0,
    "duration_ms": 847230
  },
  "workstream_results": {
    "ws-gdelt-service": {
      "status": "success",
      "agent_type": "claude-code",
      "dispatched_at": "2026-04-13T12:00:00Z",
      "completed_at": "2026-04-13T12:03:21Z",
      "duration_ms": 201000,
      "artifacts": [
        "backend/app/services/gdelt_service.py",
        "backend/tests/test_gdelt_service.py"
      ],
      "summary": "Created gdelt_service.py with fetch, parse, normalize. 3 unit tests passing."
    },
    "ws-acled-service": {
      "status": "success",
      "agent_type": "claude-code",
      "dispatched_at": "2026-04-13T12:00:00Z",
      "completed_at": "2026-04-13T12:04:55Z",
      "duration_ms": 295000,
      "artifacts": [
        "backend/app/services/acled_service.py",
        "backend/tests/test_acled_service.py"
      ],
      "summary": "Created acled_service.py with OAuth token management and API fetch. 4 unit tests passing."
    },
    "ws-rest-endpoints": {
      "status": "success",
      "agent_type": "claude-code",
      "dispatched_at": "2026-04-13T12:04:56Z",
      "completed_at": "2026-04-13T12:08:12Z",
      "duration_ms": 196000,
      "artifacts": [
        "backend/app/api/routes/events.py",
        "backend/app/api/routes/conflicts.py"
      ],
      "summary": "Created REST endpoints for /api/events and /api/conflicts. Integration tests passing."
    },
    "ws-events-layer": {
      "status": "success",
      "agent_type": "claude-code",
      "dispatched_at": "2026-04-13T12:08:13Z",
      "completed_at": "2026-04-13T12:12:45Z",
      "duration_ms": 272000,
      "artifacts": [
        "frontend/src/components/EventsLayer.tsx",
        "frontend/src/hooks/useEvents.js"
      ],
      "summary": "Created EventsLayer ScatterplotLayer. Points colored by tone. EventInfoPanel created."
    },
    "ws-conflicts-layer": {
      "status": "success",
      "agent_type": "claude-code",
      "dispatched_at": "2026-04-13T12:08:13Z",
      "completed_at": "2026-04-13T12:11:30Z",
      "duration_ms": 257000,
      "artifacts": [
        "frontend/src/components/ConflictsLayer.tsx",
        "frontend/src/hooks/useConflicts.js"
      ],
      "summary": "Created ConflictsLayer HeatmapLayer. Intensity by fatalities. ConflictInfoPanel created."
    },
    "ws-websocket-wiring": {
      "status": "success",
      "agent_type": "claude-code",
      "dispatched_at": "2026-04-13T12:12:46Z",
      "completed_at": "2026-04-13T12:14:55Z",
      "duration_ms": 129000,
      "artifacts": [
        "backend/app/websocket/manager.py",
        "frontend/src/App.tsx"
      ],
      "summary": "Wired event_batch and conflict_batch WebSocket messages. Filter controls added."
    }
  },
  "merge_order_executed": [
    { "order": 1, "workstream_id": "ws-gdelt-service", "merged_at": "2026-04-13T12:03:21Z" },
    { "order": 1, "workstream_id": "ws-acled-service", "merged_at": "2026-04-13T12:04:55Z" },
    { "order": 2, "workstream_id": "ws-rest-endpoints", "merged_at": "2026-04-13T12:08:12Z" },
    { "order": 3, "workstream_id": "ws-events-layer", "merged_at": "2026-04-13T12:12:45Z" },
    { "order": 3, "workstream_id": "ws-conflicts-layer", "merged_at": "2026-04-13T12:11:30Z" },
    { "order": 4, "workstream_id": "ws-websocket-wiring", "merged_at": "2026-04-13T12:14:55Z" }
  ]
}
```

### What You Type Next

```bash
forge integrate
```

---

## Step 6

### What You Type

```bash
forge integrate
```

### What Runs

`runIntegrateCommand()` (not yet built) does the following:

1. **Artifact Collection** — pulls all workstream outputs from execute.json
2. **Integration Test Execution** — runs end-to-end tests across all components
3. **Contract Validation** — verifies WebSocket messages, REST endpoints, and globe layers all work together
4. **Final Report** — produces a completion artifact with test results

### Output Artifact: `.forge/integrate.json` (design draft)

```json
{
  "schemaVersion": "2.0.0",
  "command": "forge integrate",
  "stage": "step6",
  "status": "complete",
  "integration_results": {
    "api_endpoints": {
      "/api/events": { "status": "✓", "response_time_ms": 45 },
      "/api/conflicts": { "status": "✓", "response_time_ms": 120 },
      "/api/events/count": { "status": "✓", "response_time_ms": 12 },
      "/api/conflicts/count": { "status": "✓", "response_time_ms": 15 }
    },
    "websocket": {
      "event_batch": { "status": "✓", "broadcasting": true },
      "conflict_batch": { "status": "✓", "broadcasting": true }
    },
    "globe_layers": {
      "events_layer": { "status": "✓", "rendering": true, "point_count": 847 },
      "conflicts_layer": { "status": "✓", "rendering": true, "heat_zones": 23 }
    }
  },
  "test_results": {
    "total": 47,
    "passed": 46,
    "failed": 1,
    "skipped": 0,
    "failed_test": {
      "name": "test_acled_oauth_token_refresh",
      "reason": "Mock server returned 401 — token refresh timing issue",
      "retry_recommended": true
    }
  },
  "final_artifacts": {
    "backend": [
      "backend/app/services/gdelt_service.py",
      "backend/app/services/acled_service.py",
      "backend/app/api/routes/events.py",
      "backend/app/api/routes/conflicts.py",
      "backend/app/websocket/manager.py"
    ],
    "frontend": [
      "frontend/src/components/EventsLayer.tsx",
      "frontend/src/components/ConflictsLayer.tsx",
      "frontend/src/hooks/useEvents.js",
      "frontend/src/hooks/useConflicts.js",
      "frontend/src/App.tsx"
    ]
  },
  "build_status": {
    "backend_build": "✓ success",
    "frontend_build": "✓ success",
    "all_tests_pass": false
  }
}
```

---

## Visual Summary

```
forge intake --spec PHASE4_OVERVIEW.md
    ↓
    .forge/intake.json
    .forge/reports/intake-report.md

forge plan
    ↓
    .forge/plan.json
    .forge/reports/plan-report.md

forge verify
    ↓
    .forge/verify.json
    .forge/reports/verify-report.md

forge split
    ↓
    .forge/split.json
    .forge/reports/split-report.md

forge execute --agent claude-code
    ↓
    .forge/execute.json

forge integrate
    ↓
    .forge/integrate.json
    .forge/reports/integrate-report.md
```

---

## What You'd Type (Full Manual Run)

```bash
# The complete pipeline
forge intake --spec docs/phases/phase4/PHASE4_OVERVIEW.md
forge plan
forge verify
forge split
forge execute --agent claude-code
forge integrate
```

That's it. Each step reads the previous step's artifact automatically. The only things you specify are:
- `--spec` at Step 1 (what you want to build)
- `--agent` at Step 5 (who implements — when Step 5 is built)
