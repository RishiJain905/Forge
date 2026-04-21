# Step 7 Batch 1 Task 2 — forge init Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Add the `forge init` command that creates the `.forge/` directory structure with a valid `config.yaml` and `.forgeignore`. Also complete the two deferred items from Task 1: add `postinstall` script to package.json and wire `forge --version` via Commander.

**Architecture:** Create `src/init.ts` with the `initForge` function, wire it as a Commander subcommand in `src/cli.ts`, add `--version` to the Commander program, add `postinstall` to package.json, and write a dedicated test suite using `node:test` (the repo's test framework — NOT vitest as the spec suggests).

**Tech Stack:** TypeScript, Node.js >=20, Commander.js, node:test, node:fs/promises

---

## Spec vs. Live Repo Mismatches

| Spec says | Live repo does | Resolution |
|-----------|---------------|------------|
| Test uses `vitest` (`describe`/`it`/`expect` imports from vitest) | All tests use `node:test` + `node:assert/strict` | **Follow live repo.** Use `node:test` and `node:assert/strict`. No vitest dependency exists. |
| `forge.config.ts` template imports `defineConfig` from `@forge-cli/forge` | No `defineConfig` export exists in the library | **Do not reference `defineConfig`.** Generate `forge.config.ts` with a plain default export object instead. The `defineConfig` helper can be added in a future task. |
| `initForge` returns `void` and throws errors | Existing CLI commands return typed result objects | **For `forge init`, follow spec.** It's a simple setup command, not a pipeline stage. Throwing on error is acceptable. The CLI action handler catches and reports errors. |
| `console.log` for init output | Existing commands use `formatXxxCommandOutput` | **Follow spec for init.** `forge init` is an interactive-style command, not an artifact-producing pipeline stage. Direct console output is appropriate. |
| `node` check in doctor is `>=18` | `engines.node` is `>=20` | **Already reconciled in Task 1.** Using >=20. |

---

## Task 1: Create `src/init.ts` — the initForge implementation

**Objective:** Implement the `initForge` function that creates the `.forge/` directory structure.

**Files:**
- Create: `src/init.ts`

**Step 1: Write failing test for initForge**

Create `tests/init.test.ts`:

```typescript
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, it, beforeEach, afterEach } from "node:test";

import { initForge } from "../src/init.js";

describe("forge init", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), "forge-init-test-"));
  });

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // best effort cleanup
    }
  });

  it("creates .forge/ directory structure with config.yaml and .forgeignore", async () => {
    await initForge({ dir: testDir });

    assert.equal(existsSync(join(testDir, ".forge")), true);
    assert.equal(existsSync(join(testDir, ".forge", "config.yaml")), true);
    assert.equal(existsSync(join(testDir, ".forge", ".forgeignore")), true);
    assert.equal(existsSync(join(testDir, ".forge", "reports")), true);
    assert.equal(existsSync(join(testDir, ".forge", "debug")), true);
  });

  it("creates config.yaml with valid content", async () => {
    await initForge({ dir: testDir });

    const config = await readFile(join(testDir, ".forge", "config.yaml"), "utf8");
    assert.ok(config.includes("forge:"));
    assert.ok(config.includes("version:"));
    assert.ok(config.includes("intake:"));
    assert.ok(config.includes("execute:"));
    assert.ok(config.includes("integrate:"));
  });

  it("creates .forgeignore with standard patterns", async () => {
    await initForge({ dir: testDir });

    const ignore = await readFile(join(testDir, ".forge", ".forgeignore"), "utf8");
    assert.ok(ignore.includes("node_modules/"));
    assert.ok(ignore.includes("dist/"));
  });

  it("throws when .forge/ already exists without --force", async () => {
    await initForge({ dir: testDir });

    await assert.rejects(
      () => initForge({ dir: testDir }),
      { message: /already exists/ },
    );
  });

  it("overwrites existing .forge/ with --force", async () => {
    await initForge({ dir: testDir });

    // Should not throw
    await initForge({ dir: testDir, force: true });

    // Verify it still has valid content after overwrite
    const config = await readFile(join(testDir, ".forge", "config.yaml"), "utf8");
    assert.ok(config.includes("forge:"));
  });

  it("creates forge.config.ts with --yes", async () => {
    await initForge({ dir: testDir, yes: true });

    assert.equal(existsSync(join(testDir, ".forge", "forge.config.ts")), true);
    const configTs = await readFile(join(testDir, ".forge", "forge.config.ts"), "utf8");
    // Should NOT import defineConfig (doesn't exist yet)
    assert.equal(configTs.includes("defineConfig"), false);
    // Should have a default export
    assert.ok(configTs.includes("export default"));
  });

  it("does not create forge.config.ts without --yes", async () => {
    await initForge({ dir: testDir });

    assert.equal(existsSync(join(testDir, ".forge", "forge.config.ts")), false);
  });

  it("uses current working directory when dir is not specified", async () => {
    const originalCwd = process.cwd();
    try {
      process.chdir(testDir);
      await initForge({});
      assert.equal(existsSync(join(testDir, ".forge")), true);
    } finally {
      process.chdir(originalCwd);
    }
  });
});
```

**Step 2: Run test to verify failure**

Run: `cd /home/trjxter/Forge && npx tsc -p tsconfig.test.json && node dist-tests/tests/init.test.js`
Expected: FAIL — `../src/init.js` not found.

**Step 3: Create `src/init.ts`**

```typescript
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { existsSync } from "node:fs";

export interface InitOptions {
  dir?: string;
  yes?: boolean;
  force?: boolean;
}

const DEFAULT_CONFIG = `forge:
  version: "1.0.0"
  log_level: info  # debug | info | warn | error
  default_model: openai/gpt-4o

intake:
  default_llm_mode: auto

execute:
  parallel_workstreams: true
  max_workstreams: 10
  default_model: openai/gpt-4o

integrate:
  auto_run: true
  test_framework: auto  # auto-detect
`;

const DEFAULT_FORGEIGNORE = `# Forge ignore patterns
node_modules/
dist/
.env
*.log
.DS_Store
.vscode/
.idea/
`;

const DEFAULT_FORGE_CONFIG_TS = `// Forge configuration
// See https://github.com/RishiJain905/Forge for documentation

export default {
  forge: {
    version: "1.0.0",
    logLevel: "info",
    defaultModel: "openai/gpt-4o",
  },
  intake: {
    defaultLlmMode: "auto",
  },
  execute: {
    parallelWorkstreams: true,
    maxWorkstreams: 10,
    defaultModel: "openai/gpt-4o",
  },
  integrate: {
    autoRun: true,
    testFramework: "auto",
  },
};
`;

export async function initForge(options: InitOptions = {}): Promise<void> {
  const targetDir = options.dir ? resolve(options.dir) : process.cwd();
  const forgeDir = join(targetDir, ".forge");

  if (existsSync(forgeDir) && !options.force) {
    throw new Error(
      `.forge/ already exists at ${forgeDir}. Use --force to overwrite.`
    );
  }

  await mkdir(forgeDir, { recursive: true });
  await mkdir(join(forgeDir, "reports"), { recursive: true });
  await mkdir(join(forgeDir, "debug"), { recursive: true });

  await writeFile(join(forgeDir, "config.yaml"), DEFAULT_CONFIG, "utf8");
  await writeFile(join(forgeDir, ".forgeignore"), DEFAULT_FORGEIGNORE, "utf8");

  if (options.yes) {
    await writeFile(join(forgeDir, "forge.config.ts"), DEFAULT_FORGE_CONFIG_TS, "utf8");
  }

  console.log(`Created .forge/ directory at ${forgeDir}`);
  console.log("  - config.yaml");
  console.log("  - .forgeignore");
  if (options.yes) console.log("  - forge.config.ts");
  console.log("  - reports/");
  console.log("  - debug/");
  console.log("\nRun 'forge --help' to get started.");
}
```

**Step 4: Run test to verify pass**

Run: `cd /home/trjxter/Forge && npx tsc -p tsconfig.test.json && node dist-tests/tests/init.test.js`
Expected: PASS — all 8 tests.

**Step 5: Commit**

```bash
git add src/init.ts tests/init.test.ts
git commit -m "feat(step7-b1): forge init — src/init.ts implementation + test suite"
```

---

## Task 2: Wire `forge init` command in `src/cli.ts`

**Objective:** Add the `forge init` Commander subcommand to the CLI.

**Files:**
- Modify: `src/cli.ts`

**Step 1: Add CLI wiring test**

Add an import and test to `tests/init.test.ts`:

```typescript
import { runCli } from "../src/cli.js";

// Add a new describe block:
describe("forge init CLI command", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), "forge-init-cli-test-"));
  });

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {}
  });

  it("forge init --dir <path> creates .forge/ via CLI", async () => {
    const exitCode = await runCli(["init", "--dir", testDir]);
    assert.equal(exitCode, 0);
    assert.equal(existsSync(join(testDir, ".forge", "config.yaml")), true);
  });

  it("forge init without --dir creates .forge/ in cwd", async () => {
    const originalCwd = process.cwd();
    try {
      process.chdir(testDir);
      const exitCode = await runCli(["init"]);
      assert.equal(exitCode, 0);
      assert.equal(existsSync(join(testDir, ".forge")), true);
    } finally {
      process.chdir(originalCwd);
    }
  });

  it("forge init exits 1 when .forge/ exists without --force", async () => {
    await initForge({ dir: testDir });
    const exitCode = await runCli(["init", "--dir", testDir]);
    assert.equal(exitCode, 1);
  });

  it("forge init --force succeeds when .forge/ exists", async () => {
    await initForge({ dir: testDir });
    const exitCode = await runCli(["init", "--dir", testDir, "--force"]);
    assert.equal(exitCode, 0);
  });

  it("forge init --yes creates forge.config.ts", async () => {
    const exitCode = await runCli(["init", "--dir", testDir, "--yes"]);
    assert.equal(exitCode, 0);
    assert.equal(existsSync(join(testDir, ".forge", "forge.config.ts")), true);
  });
});
```

**Step 2: Run test to verify failure**

Run: `cd /home/trjxter/Forge && npm run build && npx tsc -p tsconfig.test.json && node dist-tests/tests/init.test.js`
Expected: FAIL — `init` command not recognized by `runCli`.

**Step 3: Update `src/cli.ts`**

Add the import and Commander command to `src/cli.ts`:

1. Add import at top:
```typescript
import { initForge } from "./init.js";
```

2. Add the `init` command after the existing commands (before `await program.parseAsync`):
```typescript
  program
    .command("init")
    .description("Initialize Forge in the current directory.")
    .option("--dir <path>", "Target directory.")
    .option("--yes", "Non-interactive, use defaults.")
    .option("--force", "Overwrite existing .forge/ directory.")
    .action(async (options: { dir?: string; yes?: boolean; force?: boolean }) => {
      try {
        await initForge(options);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        process.stderr.write(`Error: ${message}\n`);
        exitCode = 1;
      }
    });
```

**Step 4: Run test to verify pass**

Run: `cd /home/trjxter/Forge && npm run build && npx tsc -p tsconfig.test.json && node dist-tests/tests/init.test.js`
Expected: PASS — all 13 tests (8 initForge + 5 CLI command).

**Step 5: Commit**

```bash
git add src/cli.ts tests/init.test.ts
git commit -m "feat(step7-b1): wire forge init command in cli.ts"
```

---

## Task 3: Add `--version` flag to Commander (deferred from Task 1)

**Objective:** Wire `forge --version` to print the package version via Commander's `.version()`.

**Files:**
- Modify: `src/cli.ts`
- Modify: `tests/init.test.ts` (add --version test)
- Modify: `scripts/smoke.mjs` (add --version check)

**Step 1: Add failing test**

Add to `tests/init.test.ts` (or create a dedicated section):

```typescript
describe("forge --version", () => {
  it("forge --version prints the package version", async () => {
    // --version causes Commander to print and exit, so we test via the binary
    const { spawnSync } = await import("node:child_process");
    const entryPoint = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "dist", "src", "index.js");
    const result = spawnSync(process.execPath, [entryPoint, "--version"], {
      encoding: "utf8",
    });
    assert.equal(result.status, 0);
    assert.ok(result.stdout.trim().length > 0, "expected version output");
    // Verify it matches package.json version
    const pkg = JSON.parse(readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "package.json"), "utf8"));
    assert.equal(result.stdout.trim(), pkg.version);
  });
});
```

NOTE: This test needs `readFileSync`, `resolve`, `dirname`, `fileURLToPath` imports — check what's already imported in the file and add as needed. Also add `import { spawnSync } from "node:child_process"` at the top.

**Step 2: Run test to verify failure**

Run: `cd /home/trjxter/Forge && npm run build && npx tsc -p tsconfig.test.json && node dist-tests/tests/init.test.js`
Expected: FAIL — `--version` unknown option.

**Step 3: Add `.version()` to Commander in `src/cli.ts`**

Add at top of `src/cli.ts`:
```typescript
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageJson = JSON.parse(
  readFileSync(join(__dirname, "..", "package.json"), "utf8")
);
```

Then modify the program setup in `runCli`:
```typescript
  program
    .name("forge")
    .description("Reliability-first CLI for agentic software development.")
    .version(packageJson.version)
    .showHelpAfterError();
```

**Step 4: Run test to verify pass**

Run: `cd /home/trjxter/Forge && npm run build && npx tsc -p tsconfig.test.json && node dist-tests/tests/init.test.js`
Expected: PASS — all 14 tests.

**Step 5: Update `scripts/smoke.mjs` to verify `--version`**

Add after the `entryPointPath` definition and before the `smokeIntegrate` function:

```javascript
// Verify forge --version works
const versionResult = spawnSync(process.execPath, [entryPointPath, "--version"], {
  cwd: repoRoot,
  encoding: "utf8",
});
if (versionResult.error) throw versionResult.error;
assert.equal(versionResult.status, 0);
assert.ok(versionResult.stdout.trim().length > 0, "expected version output from forge --version");
console.log("PASS: forge --version");
```

**Step 6: Run smoke**

Run: `npm run smoke`
Expected: PASS with "PASS: forge --version" output.

**Step 7: Commit**

```bash
git add src/cli.ts tests/init.test.ts scripts/smoke.mjs
git commit -m "feat(step7-b1): add forge --version flag via Commander"
```

---

## Task 4: Add `postinstall` script to package.json (deferred from Task 1)

**Objective:** Add the `postinstall` npm script that runs `forge --init` after `npm install`.

**Files:**
- Modify: `package.json`
- Modify: `tests/npm-packaging.test.ts`

**Step 1: Add failing test**

Add to `tests/npm-packaging.test.ts` inside the `describe("npm packaging contract")` block:

```typescript
  it("has postinstall script for forge init", () => {
    assert.ok(packageJson.scripts.postinstall);
    assert.match(packageJson.scripts.postinstall, /forge.*--init/);
  });
```

**Step 2: Run test to verify failure**

Run: `cd /home/trjxter/Forge && npx tsc -p tsconfig.test.json && node dist-tests/tests/npm-packaging.test.js`
Expected: FAIL — postinstall not in package.json scripts.

**Step 3: Add postinstall to package.json**

Add `"postinstall": "forge --init 2>/dev/null || true"` to the scripts section.

**Step 4: Run test to verify pass**

Run: `cd /home/trjxter/Forge && npx tsc -p tsconfig.test.json && node dist-tests/tests/npm-packaging.test.js`
Expected: PASS — 17 tests (15 original + 1 shebang + 1 postinstall).

**Step 5: Commit**

```bash
git add package.json tests/npm-packaging.test.ts
git commit -m "feat(step7-b1): add postinstall script for forge init after npm install"
```

---

## Task 5: Wire init test into default test gate

**Objective:** Add `init.test.js` to the `npm test` command chain.

**Files:**
- Modify: `package.json` (scripts.test)

**Step 1: Add to test script**

Append `&& node dist-tests/tests/init.test.js` to the end of the existing `test` script in `package.json`.

Use the patch tool with careful context — find the end of the current test script chain.

**Step 2: Run default test gate**

Run: `cd /home/trjxter/Forge && npm test 2>&1 | grep -E '# (tests|pass|fail|suites)' | tail -3`
Expected: All tests pass.

**Step 3: Commit**

```bash
git add package.json
git commit -m "feat(step7-b1): wire init test into default test gate"
```

---

## Task 6: Integration verification and full gate

**Objective:** Run the complete verification gate to confirm no regressions.

**Files:**
- None (verification only)

**Step 1: Run full gate**

```bash
npm test
npm run typecheck
npm run build
npm run smoke
```

Expected: ALL pass.

**Step 2: Verify `forge init` via the built CLI**

```bash
cd /tmp && mkdir forge-init-verify && node /home/trjxter/Forge/dist/src/index.js init --dir /tmp/forge-init-verify && cat /tmp/forge-init-verify/.forge/config.yaml && rm -rf /tmp/forge-init-verify
```

Expected: Creates `.forge/` with `config.yaml`, `.forgeignore`, `reports/`, `debug/`.

---

## Task 7: Create `docs/S7-B1-Done/p2-done.md` and update progress

**Objective:** Create the batch completion documentation and update progress tracking.

**Files:**
- Create: `docs/S7-B1-Done/p2-done.md`
- Modify: `step7/progress.md`
- Modify: `progress.md`

**Step 1: Create `docs/S7-B1-Done/p2-done.md`**

```markdown
# Step 7 Batch 1 Part 2 Done — forge init

## Implemented Spec
- `step7/tasks/batch_1/task_2_forge_init.md`

## What Changed

### src/init.ts — NEW
- `initForge(options)` creates `.forge/` with `config.yaml`, `.forgeignore`, `reports/`, and `debug/`
- With `--yes`, also creates `forge.config.ts` (plain default export, no `defineConfig` import)
- Throws if `.forge/` exists without `--force`
- Supports `--dir <path>` to initialize in a different directory

### src/cli.ts — MODIFY
- Added `forge init` Commander subcommand with `--dir`, `--yes`, `--force` options
- Added `forge --version` flag via `.version(packageJson.version)` (deferred from Task 1)
- Added package.json import for version number

### tests/init.test.ts — NEW
- 14 tests: 8 for initForge unit, 5 for CLI command wiring, 1 for --version flag
- Uses `node:test` + `node:assert/strict` (not vitest as spec suggested)
- Wired into default `npm test` gate

### package.json — MODIFY
- Added `postinstall` script: `forge --init 2>/dev/null || true` (deferred from Task 1)

### tests/npm-packaging.test.ts — MODIFY
- Added `postinstall` script assertion test

### scripts/smoke.mjs — MODIFY
- Added `forge --version` verification step

## Spec vs Repo Decisions

| Spec | Live Repo | Decision |
|------|-----------|----------|
| `vitest` test framework | `node:test` | Use `node:test` — no vitest dependency |
| `defineConfig` import in forge.config.ts | Library doesn't export `defineConfig` | Use plain default export object |
| `initForge` returns void / throws | Pipeline commands return result objects | Keep void/throw — init is not a pipeline stage |

## Verification
- `npm run build` — clean
- `npm run typecheck` — no type errors
- `npm test` — all tests pass including 14 new init tests
- `npm run smoke` — forge --version verified
- `forge init --dir <path>` — creates valid .forge/ structure
- `forge init --yes` — creates forge.config.ts
- `forge init --force` — overwrites existing .forge/

## Non-Goals Preserved
- No automatic `forge --init` beyond postinstall (silent, non-blocking)
- No config.yaml schema validation during init (done in forge doctor)
- No creation of plan.json, execute.json, integrate.json during init
```

**Step 2: Update `step7/progress.md`**

Mark Batch 1 Task 2 as complete, add commit entries.

**Step 3: Update `progress.md`**

Add Step 7 Batch 1 Task 2 entry to the `## Completed` section.
Update the `## Next` section to reflect Task 2 completion with Task 3 (forge doctor) as next.

IMPORTANT: Before changing `progress.md`, grep tests for assertions on old text:
```bash
grep -rn "Step 7 Batch 1 Task 1 is complete" tests/
grep -rn "Step 7 Batch 1 Task 2" tests/
```

**Step 4: Commit and push**

```bash
git add docs/S7-B1-Done/p2-done.md step7/progress.md progress.md
git commit -m "docs(step7-b1): forge init completion — S7-B1-Done/p2-done.md, progress updates"
git push origin dev
```

---

## Pre-Flight Checks Before Execution

- [ ] Search all test files for assertions referencing existing `progress.md` text
- [ ] Verify `npm run build`, `npm run typecheck` pass on current `dev`
- [ ] Confirm no uncommitted files in working tree (except .hermes/)

## Risk Areas

1. **`progress.md` test assertions** — Previous steps have freeze-criteria tests asserting on content. Adding new entries at the end is safe but verify.
2. **`src/cli.ts` modification** — Adding imports and a new command. Must not break existing command wiring. The `import` for `packageJson` must use the correct relative path from `dist/src/cli.js` to `package.json`.
3. **`--version` test via `spawnSync`** — Commander prints version to stdout and calls `process.exit(0)` when `--version` is used. Testing via the CLI entrypoint binary is the reliable approach.
4. **`forge.config.ts` and `defineConfig`** — The spec references `defineConfig` which doesn't exist. Using a plain default export is the safe V1 choice.
5. **`postinstall` script** — The `forge --init 2>/dev/null || true` must not fail during CI or when Forge is installed globally. The `2>/dev/null || true` handles this.
6. **`runCli` returns exit code** — Current `runCli` returns an exit code. The `init` action handler must set `exitCode = 1` on failure to match the existing pattern.

## Done Summary (after execution)

After all tasks are complete:
- `src/init.ts` exists with `initForge` function
- `src/cli.ts` has `forge init` command + `--version` flag
- `tests/init.test.ts` exists with 14+ tests, wired into default gate
- `package.json` has `postinstall` script
- `tests/npm-packaging.test.ts` has postinstall assertion
- `scripts/smoke.mjs` verifies `forge --version`
- `docs/S7-B1-Done/p2-done.md` exists
- `step7/progress.md` and `progress.md` updated
- Full gate green: `npm test`, `npm run typecheck`, `npm run build`, `npm run smoke`