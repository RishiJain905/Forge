# Step 6 Batch 2 — Task 1: Flag Hardening

## Owner

MiniMax

## Status

**Pending**

## Context

Implement `--force` and `--auto` flags for `forge integrate` to support CI/CD usage and re-run protection.

## Implementation

### `--force` Flag

Add to `IntegrateCommandOptions` in `src/integrate/types.ts`:

```typescript
export interface IntegrateCommandOptions {
  repo?: string;
  outputDir?: string;
  force?: boolean;  // NEW
  auto?: boolean;   // NEW
  testFramework?: string;
}
```

In `src/integrate/cli.ts`, add check at start of `runIntegrateCommand`:

```typescript
const integrateJsonPath = path.join(outputDir, "integrate.json");
const integrateExists = await fs.pathExists(integrateJsonPath);

if (integrateExists && !options.force) {
  return {
    status: "failed",
    summary: `integrate.json already exists at ${integrateJsonPath}. Use --force to re-run.`,
    artifactPath: integrateJsonPath,
    outputRoot: outputDir,
    failure: {
      code: "INTEGRATE_ALREADY_EXISTS",
      message: `integrate.json already exists. Run with --force to re-run integration.`,
    },
  };
}
```

Update `src/cli.ts` to register the new flags:

```typescript
.command("integrate")
  .option("--force", "Force re-run even if integrate.json already exists.")
  .option("--auto", "Non-interactive mode: fail on any warning or error.")
  .option("--test-framework <framework>", "Override detected test framework.")
```

### `--auto` Flag

When `options.auto` is true:

1. Missing `plan.json` → failure with `PLAN_REQUIRED`
2. Missing `verify.json` → failure with `VERIFY_REQUIRED`
3. Any warning → failure (no warnings, only errors or success)
4. Set `FORGE_NO_COLOR=true` for CI-safe output
5. Exit code strictly 1 on any failure

```typescript
if (options.auto) {
  if (!planArtifact) {
    return {
      status: "failed",
      summary: "plan.json not found. --auto mode requires plan.json.",
      artifactPath: "",
      outputRoot: repoRoot,
      failure: { code: "PLAN_REQUIRED", message: "plan.json required for --auto mode" },
    };
  }
  if (!verifyArtifact) {
    return {
      status: "failed",
      summary: "verify.json not found. --auto mode requires verify.json.",
      artifactPath: "",
      outputRoot: repoRoot,
      failure: { code: "VERIFY_REQUIRED", message: "verify.json required for --auto mode" },
    };
  }
}
```

## Files Modified

- `src/integrate/types.ts`
- `src/integrate/cli.ts`
- `src/cli.ts`

## Tests

Add to `tests/integrate.cli.test.ts`:

- `forge integrate --force` re-runs when `integrate.json` exists
- `forge integrate` without `--force` fails with `INTEGRATE_ALREADY_EXISTS` when `integrate.json` exists
- `forge integrate --auto` with missing `plan.json` fails with `PLAN_REQUIRED`
- `forge integrate --auto` with missing `verify.json` fails with `VERIFY_REQUIRED`
- `forge integrate --auto` with all artifacts present succeeds

## Verification

- `npm run typecheck` — PASS
- `npm run build` — PASS
- `npm run test` — ALL PASS
- `forge integrate --help` shows `--force` and `--auto` options
