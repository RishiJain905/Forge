# Step 7 Batch 1 Task 1 — npm Packaging Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Configure Forge's `package.json` for npm publishing under `@forge-cli/forge` with a correct bin entry, shebang-preserved CLI, and all required npm metadata — ensuring the package is installable globally and runnable via npx.

**Architecture:** Update `package.json` with scoped package name, bin entry, engines, exports, keywords, os, repository, license, and publishConfig. Add a `scripts/fix-shebang.js` post-build step to guarantee the CLI entry point retains its shebang after TypeScript compilation. Add a dedicated test suite for the npm packaging contract. Do NOT change any existing CLI commands (intake, plan, verify, split, execute, integrate) or library entry behavior.

**Tech Stack:** TypeScript, Node.js >=20, Commander.js, npm publishing

---

## Spec vs. Live Repo Mismatches

| Spec says | Live repo does | Resolution |
|-----------|---------------|------------|
| `"bin": { "forge": "./dist/cli.js" }` | `"bin": { "forge": "./dist/src/index.js" }` | **Follow live repo.** The `tsconfig.json` has `outDir: "dist"` and `rootDir: "."`, so `src/index.ts` compiles to `dist/src/index.js`. The spec's `./dist/cli.js` path does not exist and would require either restructuring the build output or creating a wrapper. The existing `src/index.ts` already serves as the CLI entry point with a shebang. Keep `./dist/src/index.js` as the bin target. |
| `"main": "dist/index.js"` | No `main` field currently | **Follow live repo convention.** Since `src/index.ts` is the CLI entry and `src/cli.ts` is the Commander program, the library entry should be `dist/src/index.js` if we add a `main` field. But `src/index.ts` is a CLI bootstrapper (calls `runCli` and `process.exit`), not a library. We will add `main` pointing to `dist/src/index.js` for now to match the spec intent, but note the library-vs-CLI distinction. |
| `"engines": { "node": ">=18.0.0" }` | `"engines": { "node": ">=20" }` | **Follow live repo.** The existing `"node": ">=20"` is stricter and already established. Do not downgrade it. |
| Spec creates `dist/cli.js` shebang wrapper separately | `src/index.ts` already has `#!/usr/bin/env node` shebang | **Follow live repo.** `src/index.ts` already has the shebang, and `tsc` preserves it in `dist/src/index.js`. No separate wrapper file needed. The `fix-shebang.js` script is still valuable as a safety net. |
| `"exports"` with `"./cli"` subpath | No exports currently | **Follow spec.** Add exports map, but adjust paths to match the real `dist/src/` output structure. |
| `"version": "1.0.0"` | `"version": "0.1.0"` | **Follow spec.** Bump to `1.0.0` as Step 7 is the V1 release step. |

---

## Task 1: Update `package.json` with npm publishing metadata

**Objective:** Update all required `package.json` fields for npm publishing under the `@forge-cli/forge` scope.

**Files:**
- Modify: `package.json`

**Step 1: Write failing test for package.json contract**

Create `tests/npm-packaging.test.ts`:

```typescript
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(currentDirectory, "..");
const packageJsonPath = resolve(projectRoot, "package.json");
const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));

describe("npm packaging contract", () => {
  it("has scoped package name @forge-cli/forge", () => {
    assert.equal(packageJson.name, "@forge-cli/forge");
  });

  it("has version 1.0.0 for V1 release", () => {
    assert.equal(packageJson.version, "1.0.0");
  });

  it("has a description", () => {
    assert.ok(typeof packageJson.description === "string" && packageJson.description.length > 0);
  });

  it("has bin entry pointing to dist/src/index.js", () => {
    assert.ok(packageJson.bin);
    assert.equal(packageJson.bin.forge, "./dist/src/index.js");
  });

  it("has engines.node >=20", () => {
    assert.ok(packageJson.engines);
    assert.ok(packageJson.engines.node);
    const version = packageJson.engines.node.replace(/>=|\s/g, "");
    const major = parseInt(version, 10);
    assert.ok(major >= 20, `expected node >=20, got ${packageJson.engines.node}`);
  });

  it("has os field with darwin, linux, win32", () => {
    assert.ok(packageJson.os);
    assert.ok(packageJson.os.includes("darwin"));
    assert.ok(packageJson.os.includes("linux"));
    assert.ok(packageJson.os.includes("win32"));
  });

  it("has keywords including cli, forge", () => {
    assert.ok(Array.isArray(packageJson.keywords));
    assert.ok(packageJson.keywords.includes("cli"));
    assert.ok(packageJson.keywords.includes("forge"));
  });

  it("has exports map with main and package.json entries", () => {
    assert.ok(packageJson.exports);
    assert.ok(packageJson.exports["."]);
    assert.ok(packageJson.exports["."].import);
    assert.ok(packageJson.exports["."].types);
    assert.ok(packageJson.exports["./package.json"]);
  });

  it("has repository field", () => {
    assert.ok(packageJson.repository);
    assert.equal(packageJson.repository.type, "git");
    assert.ok(packageJson.repository.url.includes("RishiJain905/Forge"));
  });

  it("has MIT license", () => {
    assert.equal(packageJson.license, "MIT");
  });

  it("has publishConfig with public access", () => {
    assert.ok(packageJson.publishConfig);
    assert.equal(packageJson.publishConfig.access, "public");
    assert.ok(packageJson.publishConfig.registry.includes("registry.npmjs.org"));
  });

  it("has type module", () => {
    assert.equal(packageJson.type, "module");
  });

  it("has files field including dist", () => {
    assert.ok(Array.isArray(packageJson.files));
    assert.ok(packageJson.files.includes("dist"));
  });

  it("has prepublishOnly script", () => {
    assert.ok(packageJson.scripts.prepublishOnly);
  });
});
```

**Step 2: Run test to verify failure**

Run: `npx tsc -p tsconfig.test.json && node dist-tests/tests/npm-packaging.test.js`
Expected: FAIL — several assertions fail because `package.json` still has old values.

**Step 3: Update package.json**

Update the following fields in `package.json` (preserving all existing scripts and dependencies):

- `"name"`: `"@forge-cli/forge"` (was `"forge-cli"`)
- `"version"`: `"1.0.0"` (was `"0.1.0"`)
- `"bin"`: `{ "forge": "./dist/src/index.js" }` (keep existing — correct for real build output)
- `"main"`: `"dist/src/index.js"` (NEW field)
- `"engines"`: keep `{"node": ">=20"}` (do NOT downgrade to >=18)
- `"os"`: `["darwin", "linux", "win32"]` (NEW field)
- `"keywords"`: `["cli", "ai", "agentic", "development", "workflow", "forge"]` (NEW field)
- `"exports"`:
  ```json
  {
    ".": {
      "import": "./dist/src/index.js",
      "types": "./dist/src/index.d.ts"
    },
    "./package.json": "./package.json"
  }
  ```
  (NEW field — adjusted paths for real `dist/src/` structure)
- `"repository"`: `{ "type": "git", "url": "https://github.com/RishiJain905/Forge" }` (NEW field)
- `"license"`: `"MIT"` (NEW field)
- `"publishConfig"`: `{ "access": "public", "registry": "https://registry.npmjs.org/" }` (NEW field)
- Add `"prepublishOnly"` to scripts: `"npm run build"`
- Keep `files: ["dist"]` as-is.

**Step 4: Run test to verify pass**

Run: `npx tsc -p tsconfig.test.json && node dist-tests/tests/npm-packaging.test.js`
Expected: PASS — all assertions pass.

**Step 5: Commit**

```bash
git add package.json tests/npm-packaging.test.ts
git commit -m "feat(step7-b1): npm packaging — package.json metadata for @forge-cli/forge"
```

---

## Task 2: Create `scripts/fix-shebang.js` for build safety

**Objective:** Add a post-build script that guarantees the CLI entry point `dist/src/index.js` starts with `#!/usr/bin/env node` — even if a future build tool strips it.

**Files:**
- Create: `scripts/fix-shebang.js`

**Step 1: Write test for shebang preservation**

Add to `tests/npm-packaging.test.ts`:

```typescript
import { readFileSync as readFileSyncSync } from "node:fs";

describe("shebang preservation", () => {
  it("dist/src/index.js starts with #!/usr/bin/env node after build", () => {
    const cliPath = resolve(projectRoot, "dist", "src", "index.js");
    let content: string;
    try {
      content = readFileSyncSync(cliPath, "utf8");
    } catch {
      // File doesn't exist yet — this is expected to fail before build
      assert.ok(false, `dist/src/index.js not found — run npm run build first`);
    }
    assert.ok(
      content.startsWith("#!/usr/bin/env node"),
      `CLI entry point must start with #!/usr/bin/env node, got: ${content.slice(0, 40)}...`
    );
  });
});
```

**Step 2: Run test to verify current state**

Run: `npm run build && npx tsc -p tsconfig.test.json && node dist-tests/tests/npm-packaging.test.js`
Expected: PASS for now (shebang already exists in `dist/src/index.js` from `src/index.ts`). The `fix-shebang.js` script is a safety net for future builds.

**Step 3: Create `scripts/fix-shebang.js`**

```javascript
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const cliPath = join(__dirname, "..", "dist", "src", "index.js");

try {
  const content = readFileSync(cliPath, "utf8");
  if (!content.startsWith("#!")) {
    writeFileSync(cliPath, "#!/usr/bin/env node\n" + content, "utf8");
    console.log("fix-shebang: prepended shebang to dist/src/index.js");
  } else {
    console.log("fix-shebang: shebang already present in dist/src/index.js");
  }
} catch (err) {
  if (err.code === "ENOENT") {
    console.error("fix-shebang: dist/src/index.js not found — run build first");
    process.exit(1);
  }
  throw err;
}
```

**Step 4: Update build script in `package.json`**

Change the `build` script from:
```json
"build": "tsc -p tsconfig.build.json"
```
to:
```json
"build": "tsc -p tsconfig.build.json && node scripts/fix-shebang.js"
```

**Step 5: Run full build and verify**

Run: `npm run build`
Expected: build succeeds, output includes "fix-shebang: shebang already present" message.

Run: `npx tsc -p tsconfig.test.json && node dist-tests/tests/npm-packaging.test.js`
Expected: PASS

**Step 6: Commit**

```bash
git add scripts/fix-shebang.js package.json
git commit -m "feat(step7-b1): add fix-shebang.js build safety net for CLI entry point"
```

---

## Task 3: Wire npm-packaging test into default test gate

**Objective:** Add `tests/npm-packaging.test.ts` to the default `npm test` command so the packaging contract is always verified.

**Files:**
- Modify: `package.json` (scripts.test)

**Step 1: Add test to npm test script**

Append `&& node dist-tests/tests/npm-packaging.test.js` to the existing `test` script in `package.json`.

**Step 2: Run default test gate**

Run: `npm test`
Expected: All existing tests pass + npm-packaging tests pass.

**Step 3: Commit**

```bash
git add package.json
git commit -m "feat(step7-b1): wire npm-packaging test into default test gate"
```

---

## Task 4: Verify `npm publish --dry-run` passes

**Objective:** Confirm the package is configured correctly for npm publishing without actually publishing.

**Files:**
- None (verification only)

**Step 1: Run build**

Run: `npm run build`
Expected: Clean build with no errors.

**Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: No type errors.

**Step 3: Run npm publish --dry-run**

Run: `npm publish --dry-run 2>&1`
Expected: No errors. Output shows package name `@forge-cli/forge`, version `1.0.0`, included files from `dist/`, and bin entry.

NOTE: The `prepublishOnly` script will trigger `npm run build` during `npm publish`. Since we are using `--dry-run`, this should complete successfully. If `npm publish --dry-run` fails due to auth, that is expected and acceptable — the important thing is that the **package structure** is valid.

**Step 4: Verify forge --version works from the built CLI**

Run: `node dist/src/index.js --version`
Expected: Prints `1.0.0` (Commander should show version from package.json)

NOTE: If `--version` is not yet wired in `src/cli.ts`, this is acceptable for Task 1 scope. The version can be verified via `node -e "console.log(require('./package.json').version)"` as a fallback.

**Step 5: Run smoke**

Run: `npm run smoke`
Expected: PASS — existing CLI behavior is unchanged.

---

## Task 5: Integration verification and full gate

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

**Step 2: Review git diff**

```bash
git diff --stat
git log --oneline -5
```

Expected: Only the intended changes — `package.json`, `scripts/fix-shebang.js`, `tests/npm-packaging.test.ts`.

---

## Task 6: Create S7-B1-Done/p1-done.md and update progress.md

**Objective:** Create the batch completion documentation and update the step and root progress tracking.

**Files:**
- Create: `docs/S7-B1-Done/p1-done.md`
- Modify: `step7/progress.md`
- Modify: `progress.md`

**Step 1: Create docs/S7-B1-Done/p1-done.md**

```markdown
# Step 7 Batch 1 Part 1 Done — npm Packaging

## Implemented Spec
- `step7/tasks/batch_1/task_1_npm_packaging.md`

## What Changed

### package.json Updates
- Renamed package from `forge-cli` to `@forge-cli/forge`
- Bumped version from `0.1.0` to `1.0.0`
- Added `main`: `dist/src/index.js`
- Kept `bin.forge`: `./dist/src/index.js` (matches real build output)
- Added `os`: `["darwin", "linux", "win32"]`
- Added `keywords`: `["cli", "ai", "agentic", "development", "workflow", "forge"]`
- Added `exports` map with main entry and package.json subpath
- Added `repository`: `{ "type": "git", "url": "https://github.com/RishiJain905/Forge" }`
- Added `license`: `"MIT"`
- Added `publishConfig`: `{ "access": "public", "registry": "https://registry.npmjs.org/" }`
- Added `prepublishOnly` script: `npm run build`
- Updated `build` script: `tsc -p tsconfig.build.json && node scripts/fix-shebang.js`
- Kept `engines.node`: `>=20` (spec said >=18, live repo uses >=20 — kept stricter)

### scripts/fix-shebang.js — NEW
- Post-build safety net that prepends `#!/usr/bin/env node` to `dist/src/index.js` if missing
- Runs automatically as part of `npm run build`
- Idempotent — no-ops if shebang already present

### tests/npm-packaging.test.ts — NEW
- Dedicated test suite for npm packaging contract
- Covers: package name, version, bin entry, engines, os, keywords, exports, repository, license, publishConfig, shebang preservation
- Wired into default `npm test` gate

## Spec vs Repo Decisions

| Spec | Live Repo | Decision |
|------|-----------|----------|
| `bin: ./dist/cli.js` | `bin: ./dist/src/index.js` | Keep live repo path (real build output) |
| `engines: >=18` | `engines: >=20` | Keep >=20 (stricter, already established) |
| Separate `dist/cli.js` wrapper | `src/index.ts` already has shebang | No wrapper needed, use fix-shebang.js as safety net |

## Verification
- `npm run build` — clean with no TypeScript errors
- `npm run typecheck` — no type errors
- `npm test` — all tests pass including new npm-packaging suite
- `npm run smoke` — all existing CLI behavior unchanged
- `npm publish --dry-run` — valid package structure

## Non-Goals Preserved
- No changes to existing CLI commands (intake, plan, verify, split, execute, integrate)
- No changes to library entry point behavior
- No actual npm publish (only configured for publishing)
```

**Step 2: Update step7/progress.md**

Mark Batch 1 Task 1 as complete:
```markdown
## Status

- [x] Batch 1 Task 1 (npm Packaging)
- [ ] Batch 1 Task 2 (forge init)
- [ ] Batch 1 Task 3 (forge doctor)
...
```

Add commit entry for task 1.

**Step 3: Update root progress.md**

Add Step 7 Batch 1 Part 1 completion entry to the `## Completed` section:
```markdown
- Step 7 Batch 1 Part 1 (npm Packaging):
  - Renamed package to @forge-cli/forge, bumped to 1.0.0
  - Added bin, exports, engines, os, keywords, repository, license, publishConfig
  - Added scripts/fix-shebang.js build safety net
  - Added tests/npm-packaging.test.ts wired into default test gate
  - Kept engines.node >=20 (stricter than spec's >=18)
```

IMPORTANT: Before changing `progress.md`, search all test files for assertions on old progress text:
```bash
grep -rn "old progress text" tests/
```

**Step 4: Commit documentation**

```bash
git add docs/S7-B1-Done/p1-done.md step7/progress.md progress.md
git commit -m "docs(step7-b1): npm packaging completion — S7-B1-Done/p1-done.md, progress updates"
```

---

## Pre-Flight Checks Before Execution

- [ ] Search all test files for assertions that reference old `progress.md` text before modifying it
- [ ] Verify `npm test`, `npm run typecheck`, `npm run build`, `npm run smoke` all pass on current `dev` branch
- [ ] Confirm no untracked or uncommitted files in the working tree before starting

## Risk Areas

1. **`progress.md` test assertions** — Many steps' freeze-criteria tests assert on `progress.md` content. Any change to root `progress.md` must be preceded by a grep for affected tests.
2. **`package.json` test wiring** — The `test` script is a very long single-line concatenation. Appending to it must be done carefully without breaking the existing chain.
3. **`npm publish --dry-run` auth** — May fail with auth errors if no npm token is configured. This is acceptable; the key check is package structure validity, not actual publishability.
4. **Bin path stability** — Changing the bin entry from `./dist/src/index.js` to anything else would break the existing test helpers (`tests/support/forge-cli.ts` line 27: `forgeEntrypointPath`). We are NOT changing it.

## Done Summary (after execution)

After all tasks are complete, the following should be true:
- `package.json` has `@forge-cli/forge`, version `1.0.0`, full npm metadata
- `scripts/fix-shebang.js` exists and runs as part of `npm run build`
- `tests/npm-packaging.test.ts` exists and passes, wired into default test gate
- `docs/S7-B1-Done/p1-done.md` exists with completion summary
- `step7/progress.md` and root `progress.md` updated
- Full gate green: `npm test`, `npm run typecheck`, `npm run build`, `npm run smoke`