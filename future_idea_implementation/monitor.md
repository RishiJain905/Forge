# Forge Monitor — Post-Integration Observability

> **Stage:** Post-Step 6 (v2 extension)
> **Purpose:** Track whether integrated code continues to function correctly after the Forge pipeline completes — catching regressions before they reach production.

---

## Context

`forge integrate` verifies that the system works at the moment of execution. But code evolves:
- Dependencies change
- External APIs shift
- Other engineers touch adjacent code
- Production traffic reveals edge cases the integration tests didn't catch

Forge Monitor closes that gap by providing **ongoing observability** after a successful `forge integrate` run.

---

## What Forge Monitor Does

### 1. Baseline Snapshot

After `forge integrate` passes (all tests green), Forge records a **baseline snapshot**:

```
.forge/monitor/
├── snapshots/
│   └── <timestamp>/
│       ├── baseline.json       # Code state at integration time
│       ├── execute.json         # What was executed
│       ├── integrate.json       # What integration verified
│       └── artifact-hashes.json # SHA-256 of all tracked files
├── config.yaml                 # Monitor configuration
└── history.jsonl               # Ongoing change events
```

The baseline captures:
- Git commit hash at integration time
- SHA-256 of all files modified during execute
- Integration test results
- AI model + version used
- Test framework + version

### 2. Drift Detection

Forge Monitor runs on a configurable schedule (or on-demand) and compares the current state against the baseline:

| Drift Type | What It Detects |
|---|---|
| **File Drift** | A tracked file was modified, deleted, or added |
| **Dependency Drift** | `package.json`, `pyproject.toml`, `requirements.txt` changed |
| **API Contract Drift** | If tracking API endpoints, detect signature changes |
| **Test Surface Drift** | New test files added, existing tests removed |
| **Git Branch Divergence** | The tracked commit is no longer in the current branch history |

### 3. Scheduled Health Checks

```
forge monitor --watch        # Run continuously in background
forge monitor --check        # Run once, report and exit
forge monitor --schedule "0 */6 * * *"  # Cron expression
forge monitor --interval 30m # Run every 30 minutes
```

Health checks run the same integration test suite from Step 6 against the current codebase. If tests fail:
- Alert is triggered (configurable: webhook, Slack, email, GitHub issue)
- A **regression report** is generated
- The failed test(s) and their error output are captured

### 4. Regression Report

When drift is detected or tests fail, Forge produces a **Regression Report**:

```markdown
# Forge Monitor — Regression Report

**Generated:** 2025-04-19T12:00:00Z
**Snapshot:** baseline-20250418-143022
**Trigger:** Scheduled health check

## Drift Summary

| Type | File | Change |
|------|------|--------|
| MODIFIED | src/api/client.ts | 3 lines added, 1 removed |
| DELETED | tests/integration/auth.test.ts | File removed |
| DEPENDENCY | package.json | `axios` upgraded 1.2.3 → 1.3.0 |

## Test Results

| Test Suite | Status | Duration |
|------------|--------|----------|
| Integration | ❌ FAILED | 1,243ms |
| E2E | ✅ PASSED | 3,102ms |

### Failed Tests

#### ❌ Integration — API client returns correct data
```
Error: Expected 200 but received 404
  at api/client.ts:42
  at async generateReport (regression.ts:18)
```

## Recommendations

1. **Re-run `forge integrate`** to re-verify the full system
2. The `src/api/client.ts` change at line 42 may have altered the response contract
3. The deleted `tests/integration/auth.test.ts` should be restored or replaced

## Next Action

Run `forge monitor --rollback` to restore the baseline state, or `forge integrate` to re-verify.
```

### 5. Rollback (Optional)

If the drift is undesirable, Forge Monitor can **rollback** to the baseline:

```
forge monitor --rollback           # Interactive rollback
forge monitor --rollback --force   # Restore baseline without confirmation
```

Rollback:
- Restores all tracked files to their baseline SHA-256
- Creates a git stash of current changes before restoring
- Logs the rollback event in `history.jsonl`

> Note: Rollback is file-level, not a git revert. It restores individual files from the baseline snapshot, not entire commits.

### 6. Webhook Notifications

Forge Monitor supports outbound webhooks for CI/CD integration:

```yaml
# .forge/monitor/config.yaml
notifications:
  webhook:
    url: "https://hooks.example.com/forge-monitor"
    events:
      - test_failure
      - drift_detected
      - baseline_created
    retry:
      attempts: 3
      backoff: exponential
  slack:
    channel: "#forge-alerts"
    webhook_url: "https://hooks.slack.com/..."
  github:
    repo: "owner/repo"
    token: "${GITHUB_TOKEN}"
    create_issue: true
    issue_label: "forge-monitor"
```

---

## Architecture

### Directory Structure

```
src/monitor/
├── types.ts           # MonitorSnapshot, DriftEntry, RegressionReport, MonitorConfig
├── schema.ts          # Zod schemas for all monitor types
├── snapshot.ts        # createBaseline(), loadSnapshot(), compareToBaseline()
├── drift.ts           # detectDrift(), DriftType enum, DriftEntry
├── health.ts          # runHealthCheck(), HealthCheckResult
├── rollback.ts       # rollbackToBaseline(), createRollbackStash()
├── notifier.ts        # sendWebhook(), sendSlack(), createGitHubIssue()
├── report.ts          # generateRegressionReport()
├── scheduler.ts       # CronRunner, IntervalRunner
├── cli.ts             # forge monitor CLI command
```

### Key Types

```typescript
// src/monitor/types.ts

export type DriftType = "modified" | "deleted" | "added" | "dependency";

export interface DriftEntry {
  type: DriftType;
  file: string;
  baselineHash?: string;
  currentHash?: string;
  detectedAt: string;
}

export interface MonitorSnapshot {
  id: string;
  createdAt: string;
  gitCommit?: string;
  trackedFiles: Record<string, string>; // path → SHA-256
  dependencies: Record<string, string>;  // package → version
  integrateJsonHash: string;
  testFramework: string;
  testFrameworkVersion: string;
  aiModel?: string;
}

export interface RegressionReport {
  generatedAt: string;
  snapshotId: string;
  trigger: "scheduled" | "manual" | "webhook";
  drift: DriftEntry[];
  healthCheck: HealthCheckResult;
  recommendations: string[];
}

export interface HealthCheckResult {
  passed: boolean;
  durationMs: number;
  testResults: {
    name: string;
    status: "passed" | "failed" | "skipped";
    error?: string;
    durationMs: number;
  }[];
}

export interface MonitorConfig {
  enabled: boolean;
  schedule?: string;       // cron expression
  intervalMinutes?: number;
  trackedPaths: string[]; // glob patterns
  ignoredPaths: string[]; // glob patterns
  notifications: NotificationConfig;
  autoRollback: boolean;
  snapshotRetention: number; // number of snapshots to keep
}
```

### Snapshot Creation Flow

```typescript
// 1. After forge integrate succeeds, monitor can be initialized:
await createBaseline({
  repoRoot,
  integrateJsonPath: ".forge/integrate.json",
  trackedPaths: ["src/**", "tests/**", "package.json"],
  config: monitorConfig,
});

// createBaseline:
// - Computes SHA-256 for all tracked files
// - Records git commit hash
// - Copies integrate.json into snapshot
// - Saves to .forge/monitor/snapshots/<timestamp>/
// - Updates .forge/monitor/history.jsonl
```

### Drift Detection Flow

```typescript
// On each health check interval:
const snapshot = await loadSnapshot(repoRoot, latestSnapshotId);
const drift = await detectDrift(snapshot, {
  trackedPaths: ["src/**", "tests/**", "package.json"],
  ignoredPaths: ["node_modules/**", "dist/**"],
});

// detectDrift:
// - Walks current tracked files
// - Computes SHA-256 for each
// - Compares to snapshot
// - Returns DriftEntry[] for any changed files
// - Checks dependency files for version changes
```

---

## CLI Surface

```
forge monitor init                          # Initialize monitor in current repo
forge monitor --check                       # Run health check once
forge monitor --watch                        # Run continuously
forge monitor --schedule "0 */6 * * *"      # Set cron schedule
forge monitor --status                      # Show last check result + drift
forge monitor --snapshots                   # List all snapshots
forge monitor --rollback                    # Rollback to last snapshot (interactive)
forge monitor --rollback <snapshot-id>       # Rollback to specific snapshot
forge monitor --export                      # Export current baseline as tarball
forge monitor --restore <backup.tar.gz>    # Restore from backup
forge monitor config --set interval=30m     # Update config
forge monitor config --set ignoredPaths=... # Update config
```

---

## Configuration

```yaml
# .forge/monitor/config.yaml
monitor:
  enabled: true
  interval_minutes: 60  # Run health check every hour
  tracked_paths:
    - "src/**"
    - "tests/**"
    - "package.json"
    - "pyproject.toml"
  ignored_paths:
    - "node_modules/**"
    - "dist/**"
    - ".git/**"
    - "*.lock"
  snapshot_retention: 10  # Keep last 10 snapshots
  auto_rollback: false
  notifications:
    webhook:
      enabled: true
      url: "${FORGE_WEBHOOK_URL}"
      events:
        - test_failure
        - drift_detected
    slack:
      enabled: false
    github:
      enabled: false
```

---

## Relationship to Existing Steps

| Step | What It Does | Monitor's Role |
|------|-------------|----------------|
| Step 5 — Execute | AI implements workstreams | Records what was changed |
| Step 6 — Integrate | AI generates + runs integration tests | **Monitor re-runs the same tests** |
| Monitor | Ongoing health checks post-integrate | Closes the loop after Forge exits |

Monitor is the **feedback loop** after Forge's pipeline completes. It doesn't replace CI/CD — it's a Forge-specific observability layer that understands what the pipeline *intended* to build.

---

## Verification

- `npm run typecheck` — PASS
- `npm run build` — PASS
- `npm run test` — ALL PASS
- `forge monitor init` — Creates `.forge/monitor/config.yaml` and baseline snapshot
- `forge monitor --check` — Detects drift and/or runs integration tests
- `forge monitor --watch` — Runs continuously, sends notifications on failure
- Regression report is generated with all sections
- Rollback restores tracked files to baseline state

---

## Non-Goals

- **Not a replacement for CI/CD** — Use your existing CI system alongside Forge Monitor
- **Not a deployment tool** — Monitor observes, it doesn't deploy
- **Not production APM** — Use Datadog/New Relic for real production monitoring
- **Not a substitute for good tests** — Monitor only runs what Step 6 generated

---

## Open Questions

1. Should Monitor watch a git branch or the local filesystem? (Local by default, git-aware optional)
2. Should Monitor track API contract definitions (e.g., OpenAPI specs) explicitly?
3. Should rollback create a git branch automatically before restoring?
4. How to handle monorepos where multiple `forge execute` runs happened?
5. Should Monitor support multiple simultaneous baselines for different features?
