# Step 6 Batch 1 — Task 4: CLI Wiring

## Owner

MiniMax

## Description

Wire `forge integrate` into the CLI — `src/integrate/cli.ts` and update `src/cli.ts` to register the `integrate` command.

---

## What to Implement

### `src/integrate/cli.ts`

The integrate CLI (`runIntegrateCommand`). This is the entry point for `forge integrate`.

#### Command Flow

```
runIntegrateCommand(options)
  → Read .forge/execute.json (require it — no execute.json means fail)
  → Read .forge/plan.json (optional but warn if missing)
  → Read .forge/verify.json (optional but warn if missing)
  → Validate execute artifact with ExecuteArtifactSchema
  → Build PromptBuildContext
  → buildIntegrationTestPrompt(ctx) → BuiltPrompt
  → Call AI model (reuse model connector from execute)
  → Parse AI response → IntegrationTestFile[]
  → runIntegrationTests(testFiles, repoRoot) → TestRunResult
  → Build IntegrateArtifact
  → writeIntegrateArtifact(artifactPath, artifact)
  → createIntegrationReport(artifact) → integration-report.md
  → return IntegrateCommandResult
```

#### Prerequisites Check

Fail with clear error if:
- `.forge/execute.json` does not exist → `NO_EXECUTE_ARTIFACT`
- execute artifact has no workstreams → `NO_WORKSTREAMS`
- All workstreams failed → `ALL_WORKSTREAMS_FAILED` (integration meaningless)

Warn (but continue) if:
- `.forge/plan.json` missing → log warning, continue without plan context
- `.forge/verify.json` missing → log warning, continue without verify context

#### Reading Existing Artifacts

```typescript
async function loadExecuteArtifact(repoRoot: string): Promise<ExecuteArtifact>
async function loadPlanArtifact(repoRoot: string): Promise<PlanArtifact | null>
async function loadVerifyArtifact(repoRoot: string): Promise<VerifyArtifact | null>
```

#### Test File Generation

After getting AI response, parse the JSON:

```typescript
interface AIGeneratedTestFiles {
  testFiles: Array<{
    path: string;
    framework: string;
    language: string;
    content: string;
  }>;
}

// Parse from AI response
const parsed = JSON.parse(aiResponseText) as AIGeneratedTestFiles;
const testFiles: IntegrationTestFile[] = parsed.testFiles.map(tf => ({
  path: tf.path,
  framework: tf.framework,
  language: tf.language,
  testCount: countTestsInContent(tf.content), // rough count from "it(" or "def test_"
  content: tf.content,
}));
```

#### Building the Artifact

```typescript
const artifact = buildIntegrateArtifact(
  executeArtifact,
  planArtifact,
  verifyArtifact,
  testRunResult,
  aiModelUsed,
  aiConfig,
  SCHEMA_VERSION,
  FORGE_VERSION,
);
```

#### Artifact Path

- Primary artifact: `.forge/integrate.json`
- Report: `.forge/integration-report.md`

---

### `src/integrate/artifact.ts`

The artifact builder and writer.

#### Functions to Export

```typescript
export function buildIntegrateArtifact(
  executeArtifact: ExecuteArtifact,
  planArtifact: PlanArtifact | null,
  verifyArtifact: VerifyArtifact | null,
  testResult: TestRunResult,
  aiModelUsed: string,
  aiConfig: AIModelInfo | undefined,
  schemaVersion: string,
  forgeVersion: string,
): IntegrateArtifact

export async function writeIntegrateArtifact(
  path: string,
  artifact: IntegrateArtifact
): Promise<void>
```

#### `buildIntegrateArtifact` Logic

- `executeSource`: path to execute.json
- `planSource`: path to plan.json (or null)
- `verifySource`: path to verify.json (or null)
- `goal`: from planArtifact.goal or "Unknown goal"
- `workstreamsSummary`: computed from executeArtifact
- `tests`: from `testResult.tests`
- `testFiles`: from `testResult.testFiles`
- `summary`: computed from testResult
- `aiConfig`: passed in
- `recommendations`: extracted from failed tests' `recommendation` field

#### `writeIntegrateArtifact`

- Async function, writes JSON to disk
- Uses `fs.promises.writeFile`
- Should be called from cli.ts after artifact is built

---

### `src/integrate/report.ts`

Human-readable report generator.

```typescript
export function createIntegrationReport(artifact: IntegrateArtifact): string
```

Report sections:
1. Header: `## Forge Integration Report`
2. Summary table: total tests, passed, failed, duration
3. AI Model used
4. Test files generated (list with paths)
5. Individual test results (passed/failed/skipped)
6. Failed test details: name, error, recommendation
7. Recommendations (AI suggestions for fixing failures)
8. Next steps (if all pass: "Integration complete. Ready to deploy." If failures: "Review failures above.")

---

### Update `src/cli.ts`

Register `forge integrate`:

```typescript
import { runIntegrateCommand } from "./integrate/cli.js";
import type { IntegrateCommandResult } from "./integrate/types.js";
```

Add a new `program
.command("integrate")` section with:
- `--repo <path>` option
- `--output-dir <path>` option
- `--force` flag
- `--auto` flag
- `--test-framework <name>` option
- A corresponding `formatIntegrateCommandOutput` function

---

## Error Codes

| Code | Meaning |
|------|---------|
| `NO_EXECUTE_ARTIFACT` | execute.json not found |
| `NO_WORKSTREAMS` | execute.json has no workstreams |
| `ALL_WORKSTREAMS_FAILED` | All workstreams in execute.json failed |
| `INVALID_EXECUTE_ARTIFACT` | execute.json failed schema validation |
| `AI_GENERATION_FAILED` | AI model call failed |
| `NO_TEST_FILES_GENERATED` | AI returned no test files |
| `TEST_RUN_FAILED` | Test runner crashed or produced no results |
| `IO_ERROR` | File write error |

---

## Verification

- [ ] `npm run typecheck` — PASS
- [ ] `npm run build` — PASS
- [ ] `npm run test` — ALL PASS
- [ ] `forge integrate --help` shows the command
- [ ] `forge integrate` without execute.json fails with `NO_EXECUTE_ARTIFACT`
- [ ] `forge integrate` with valid execute.json produces `integrate.json`
- [ ] `integration-report.md` is generated alongside the artifact
- [ ] Exit code is 0 when all tests pass, non-zero when failures exist

---

## Output

When complete, create `step6_batch1/task_4_p4-done.md` documenting what was implemented and verified.
