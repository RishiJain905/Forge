# Task 2: forge init

## Goal

Add the `forge init` command that creates the `.forge/` directory structure with a valid `config.yaml`, `.forgeignore`, and optional `forge.config.ts`.

## Context

Read these first:
- `src/cli.ts` — Existing CLI entry with Commander
- `future_idea_implementation/step7-deploy.md` — Design reference (lines 84-133)
- `src/index.ts` — Library entry point

## What To Do

### 1. Create `src/init.ts`

Create the `forge init` implementation:

```typescript
// src/init.ts
import { mkdir, writeFile, access, constants } from "node:fs/promises";
import { join, resolve } from "node:path";
import { existsSync } from "node:fs";

export interface InitOptions {
  dir?: string;       // Target directory (default: cwd)
  yes?: boolean;      // Non-interactive, use defaults
  force?: boolean;    // Overwrite existing .forge/
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

monitor:
  enabled: false
  interval_minutes: 60
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

const DEFAULT_FORGE_CONFIG_TS = `import { defineConfig } from "@forgecli/forge";

export default defineConfig({
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
});
`;

export async function initForge(options: InitOptions = {}): Promise<void> {
  const targetDir = options.dir ? resolve(options.dir) : process.cwd();
  const forgeDir = join(targetDir, ".forge");

  // Check if .forge already exists
  if (existsSync(forgeDir) && !options.force) {
    throw new Error(
      `.forge/ already exists at ${forgeDir}. Use --force to overwrite.`
    );
  }

  // Create .forge/ directory structure
  await mkdir(forgeDir, { recursive: true });
  await mkdir(join(forgeDir, "reports"), { recursive: true });
  await mkdir(join(forgeDir, "debug"), { recursive: true });

  // Write config.yaml
  await writeFile(
    join(forgeDir, "config.yaml"),
    DEFAULT_CONFIG,
    "utf8"
  );

  // Write .forgeignore
  await writeFile(
    join(forgeDir, ".forgeignore"),
    DEFAULT_FORGEIGNORE,
    "utf8"
  );

  // Write forge.config.ts (optional, only in non-interactive or with --yes)
  if (options.yes) {
    await writeFile(
      join(forgeDir, "forge.config.ts"),
      DEFAULT_FORGE_CONFIG_TS,
      "utf8"
    );
  }

  console.log(`✓ Created .forge/ directory at ${forgeDir}`);
  console.log(`  - config.yaml`);
  console.log(`  - .forgeignore`);
  if (options.yes) console.log(`  - forge.config.ts`);
  console.log(`  - reports/`);
  console.log(`  - debug/`);
  console.log("\nRun 'forge --help' to get started.");
}
```

### 2. Update `src/cli.ts` to add init command

Add to the CLI using Commander:

```typescript
// src/cli.ts
import { initForge } from "./init.js";

// After existing commands...

program
  .command("init")
  .description("Initialize Forge in the current directory")
  .option("--dir <path>", "Target directory")
  .option("--yes", "Non-interactive, use defaults")
  .option("--force", "Overwrite existing .forge/")
  .action(async (options) => {
    try {
      await initForge(options);
    } catch (error) {
      console.error("Error:", error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });
```

### 3. Add tests

Create `tests/init.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { initForge } from "../src/init.js";
import { rm, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { existsSync } from "node:fs";

describe("forge init", () => {
  const testDir = join(tmpdir(), `forge-init-test-${Date.now()}`);

  beforeEach(async () => {
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {}
  });

  it("creates .forge/ directory structure", async () => {
    await initForge({ dir: testDir });
    expect(existsSync(join(testDir, ".forge"))).toBe(true);
    expect(existsSync(join(testDir, ".forge", "config.yaml"))).toBe(true);
    expect(existsSync(join(testDir, ".forge", ".forgeignore"))).toBe(true);
    expect(existsSync(join(testDir, ".forge", "reports"))).toBe(true);
    expect(existsSync(join(testDir, ".forge", "debug"))).toBe(true);
  });

  it("creates config.yaml with valid YAML", async () => {
    await initForge({ dir: testDir });
    const config = await readFile(join(testDir, ".forge", "config.yaml"), "utf8");
    expect(config).toContain("forge:");
    expect(config).toContain("version:");
    expect(config).toContain("intake:");
    expect(config).toContain("execute:");
  });

  it("throws when .forge/ exists without --force", async () => {
    await initForge({ dir: testDir });
    await expect(initForge({ dir: testDir })).rejects.toThrow();
  });

  it("overwrites existing .forge/ with --force", async () => {
    await initForge({ dir: testDir });
    await expect(initForge({ dir: testDir, force: true })).resolves.not.toThrow();
  });

  it("creates forge.config.ts with --yes", async () => {
    await initForge({ dir: testDir, yes: true });
    expect(existsSync(join(testDir, ".forge", "forge.config.ts"))).toBe(true);
  });
});
```

### 4. Update smoke test

Update `scripts/smoke.mjs` to include `forge init` in the smoke path if needed.

## Deferred Items from Task 1

### `postinstall` script in package.json

Task 1 (npm Packaging) deferred the `postinstall` script because `forge init` did not exist yet.
Now that Task 2 implements `forge init`, add the postinstall script to `package.json`:

```json
"postinstall": "forge --init 2>/dev/null || true"
```

This script runs automatically after `npm install -g @forgecli/forge`, creating `.forge/` in the user's project directory with default config. The `2>/dev/null || true` ensures it fails silently if the user is installing globally or in a non-project directory.

Add a test in `tests/npm-packaging.test.ts` to verify the `postinstall` script is present:

```typescript
it("has postinstall script for forge init", () => {
  assert.ok(packageJson.scripts.postinstall);
  assert.match(packageJson.scripts.postinstall, /forge.*--init/);
});
```

### `forge --version` flag

Task 1 will add `.version(packageJson.version)` to the Commander program in `src/cli.ts`. Task 2 should verify that `forge --version` works after `forge init` is implemented, and that the smoke test covers it.

## Verification

- `forge init` creates valid `.forge/config.yaml`
- `forge init --yes` creates `.forge/forge.config.ts` in addition
- `forge init --force` overwrites existing `.forge/`
- `forge init --dir <path>` creates in specified directory
- All tests pass: `npm test`

## Files Modified/Created

- `src/init.ts` — NEW — forge init implementation
- `src/cli.ts` — MODIFY — add init command
- `tests/init.test.ts` — NEW — init tests
- `scripts/smoke.mjs` — MODIFY — add init smoke if needed

## Non-Goals

- Do not run `forge --init` automatically on every install (handled by postinstall script in package.json)
- Do not validate config.yaml schema during init (done in forge doctor)
- Do not create plan.json, execute.json, integrate.json during init (created by their commands)
