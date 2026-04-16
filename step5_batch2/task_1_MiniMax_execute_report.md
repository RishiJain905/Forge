# Step 5 Batch 2 — Task 1: Execute Report Generation

## Context

Read `src/execute/cli.ts`, `src/execute/artifact.ts`, and the report patterns from `src/intake/report.ts` and `src/plan/report.ts`.

## Goal

Add a human-readable `execute-report.md` following the established report pattern used by Steps 1-4.

## Implementation

### Report Structure

Follow the same heading order as `plan-report.md` and `verify-report.md`:

```markdown
# Forge Execute Report

## Overview
- Source: split.json path
- Execute version
- Timestamp
- Workstream count summary: N total, M completed, K failed, R blocked

## Execution Summary
- Per-state counts
- Merge order gate status

## Workstream Details
Table:
| ID | Title | State | Started | Completed | Duration |
|----|-------|-------|---------|-----------|----------|
| ws-1 | ... | completed | HH:MM:SS | HH:MM:SS | 5m 23s |
| ws-2 | ... | running | HH:MM:SS | — | 3m 01s |
...

## Merge Order Gates
- Per-gate status: satisfied / pending / violated

## Errors (if any)
- Failed workstreams with reasons

## Recommendations
- What to do next (e.g., "Rerun failed workstreams before proceeding to Step 6")

## Output Files
- `execute.json` — machine-readable artifact
- `execute-report.md` — this report
```

### Report Builder

Create `src/execute/report.ts`:

```typescript
import type { ExecuteArtifact } from './types.js'

export function buildExecuteReport(artifact: ExecuteArtifact): string {
  // Build markdown report following the heading structure above
  // Compute durations from timestamps
  // Summarize merge order gate status
}
```

### CLI Integration

In `src/execute/cli.ts`, call the report builder before exiting:

```typescript
import { buildExecuteReport } from './report.js'

// On exit:
const reportPath = path.join(outputDir, 'execute-report.md')
const report = buildExecuteArtifact(state, artifact)
await fs.writeFile(reportPath, report, 'utf-8')
console.log(`Report written to ${reportPath}`)
```

### Schema

No new schema — reuse existing `ExecuteArtifact` type. Report is human-readable only.

## Files to Update / Create

- `src/execute/report.ts` — NEW — report builder
- `src/execute/cli.ts` — UPDATE — call report builder on exit, write execute-report.md
- `src/execute/index.ts` — UPDATE — add report builder export
- `tests/execute.report.test.ts` — NEW — report content tests

## Verification

- [ ] `execute-report.md` written on every `forge execute` exit
- [ ] Report has correct heading order
- [ ] Duration computed from timestamps
- [ ] Merge order gate status shown
- [ ] Failed workstreams show error reasons
- [ ] Recommendations section present
