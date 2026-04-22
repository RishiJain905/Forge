# Task 1: npm Packaging

## Goal

Configure `package.json` for npm publishing under `@forgecli/forge`, add the CLI bin entry point, and ensure the package is installable globally via `npm install -g` and runnable via `npx @forgecli/forge`.

## Context

Read these first:
- `package.json` — Current npm configuration
- `src/index.ts` — Library entry point
- `src/cli.ts` — Existing CLI entry with Commander
- `future_idea_implementation/step7-deploy.md` — Design reference (lines 32-83)

## What To Do

### 1. Update `package.json`

Update the following fields in `package.json`:

```json
{
  "name": "@forgecli/forge",
  "version": "1.0.0",
  "description": "Reliability-first CLI for agentic software development",
  "main": "dist/index.js",
  "bin": {
    "forge": "./dist/cli.js"
  },
  "scripts": {
    "prepublishOnly": "npm run build",
    "postinstall": "forge --init 2>/dev/null || true"
  },
  "engines": {
    "node": ">=18.0.0"
  },
  "os": ["darwin", "linux", "win32"],
  "keywords": ["cli", "ai", "agentic", "development", "workflow", "forge"],
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    },
    "./cli": {
      "import": "./dist/cli.js",
      "types": "./dist/cli.d.ts"
    },
    "./package.json": "./package.json"
  },
  "repository": {
    "type": "git",
    "url": "https://github.com/RishiJain905/Forge"
  },
  "license": "MIT",
  "publishConfig": {
    "access": "public",
    "registry": "https://registry.npmjs.org/"
  }
}
```

### 2. Create `dist/cli.js` (shebang wrapper)

Create `dist/cli.js` as the bin entry point:

```javascript
#!/usr/bin/env node
import "../dist/index.js";
```

Note: After TypeScript build, `dist/cli.js` will be the compiled version of `src/cli.ts`. The shebang must be preserved in the compiled output. Use `tsc` with `esbuild` or a build script that preserves shebangs, OR add the shebang as a separate step in the build script.

### 3. Ensure build preserves shebang

Update `package.json` scripts to ensure the shebang is preserved:

```json
{
  "scripts": {
    "build": "tsc && node scripts/fix-shebang.js",
    "prepublishOnly": "npm run build"
  }
}
```

Create `scripts/fix-shebang.js`:

```javascript
import { readFileSync, writeFileSync } from "node:fs";
const cliPath = new URL("../dist/cli.js", import.meta.url);
const content = readFileSync(cliPath, "utf8");
if (!content.startsWith("#!")) {
  writeFileSync(cliPath, "#!/usr/bin/env node\n" + content, "utf8");
}
```

### 4. Verify the package

- Run `npm run build` and check `dist/cli.js` starts with `#!/usr/bin/env node`
- Run `npm publish --dry-run` and verify no errors
- After publish (not yet), `forge --version` should work globally

## Deferred Items (completed post-initial-implementation)

### `postinstall` script

The spec lists `"postinstall": "forge --init 2>/dev/null || true"` in package.json scripts.
This was deferred from the initial Task 1 implementation because `forge init` did not exist yet.
**Action:** Add `"postinstall": "forge --init 2>/dev/null || true"` to `package.json` scripts when Task 2 (`forge init`) is implemented and tested.

### `--version` flag

The design reference (`future_idea_implementation/step7-deploy.md` line 78) shows `.version(packageJson.version)` on the Commander program, and the verification checklist includes `forge --version` printing the correct version.
**Action:** Add `program.version(...)` to `src/cli.ts` with the version read from `package.json`.
This is a one-line addition in `src/cli.ts`:

```typescript
// src/cli.ts — near the top, after importing Commander
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageJson = JSON.parse(
  readFileSync(join(__dirname, "..", "package.json"), "utf8")
);

// Then in runCli():
program
  .name("forge")
  .description("Reliability-first CLI for agentic software development.")
  .version(packageJson.version)
  .showHelpAfterError();
```

Add `forge --version` to the smoke test assertions in `scripts/smoke.mjs`.

## Verification

- `npm run build` produces clean `dist/` with no TypeScript errors
- `dist/src/index.js` starts with `#!/usr/bin/env node`
- `npm publish --dry-run` passes without errors
- `forge --version` prints the correct version (`1.0.0`)
- Package has correct `bin`, `exports`, `engines`, `os` fields
- `postinstall` script is present in package.json (after Task 2 is complete)

## Files Modified

- `package.json` — Updated with new name, bin, exports, engines, scripts
- `scripts/fix-shebang.js` — NEW — Preserves shebang after build
- `src/cli.ts` — MODIFY — Add `.version(packageJson.version)` with package.json import
- `scripts/smoke.mjs` — MODIFY — Add `forge --version` assertion

## Non-Goals

- Do not change the existing CLI commands (intake, plan, verify, split, execute, integrate)
- Do not change the library entry point behavior
- Do not publish to npm yet (only configure for publishing)
