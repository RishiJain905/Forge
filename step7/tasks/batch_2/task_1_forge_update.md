# Task 1: forge update

## Goal

Add the `forge update` command that checks if a new version of Forge is available on npm and can self-update to the latest version.

## Context

Read these first:
- `src/cli.ts` — Existing CLI entry with Commander
- `package.json` — Current version
- `future_idea_implementation/step7-deploy.md` — Design reference (lines 135-178)

## What To Do

### 1. Create `src/update.ts`

```typescript
// src/update.ts
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const execAsync = promisify(exec);

interface UpdateInfo {
  current: string;
  latest: string;
  outdated: boolean;
}

interface PackageJson {
  version: string;
  name: string;
}

function getPackageVersion(): string {
  // Read version from package.json at runtime
  const packagePath = resolve(process.cwd(), "package.json");
  const pkg: PackageJson = JSON.parse(readFileSync(packagePath, "utf8"));
  return pkg.version;
}

export async function checkForUpdate(): Promise<UpdateInfo> {
  const current = getPackageVersion();
  try {
    const { stdout } = await execAsync(
      "npm view @forge-cli/forge version",
      { timeout: 10000 }
    );
    const latest = stdout.trim();
    return { current, latest, outdated: latest !== current };
  } catch {
    // npm view failed — assume not outdated
    return { current, latest: current, outdated: false };
  }
}

export async function selfUpdate(yes: boolean = false): Promise<void> {
  const { outdated, latest, current } = await checkForUpdate();

  if (!outdated) {
    console.log("Forge is already up to date.");
    console.log(`Current version: ${current}`);
    return;
  }

  if (!yes) {
    console.log(`A new version of Forge is available: ${current} → ${latest}`);
    console.log("Run 'forge update --yes' to update.");
    return;
  }

  console.log(`Updating Forge ${current} → ${latest}...`);
  try {
    await execAsync(`npm install -g @forge-cli/forge@${latest}`, {
      timeout: 60000,
    });
    console.log("Update complete.");
    console.log(`Now running Forge ${latest}.`);
  } catch (error) {
    console.error(
      `Update failed: ${error instanceof Error ? error.message : String(error)}`
    );
    process.exit(1);
  }
}
```

### 2. Add to CLI

```typescript
// src/cli.ts
import { checkForUpdate, selfUpdate } from "./update.js";

program
  .command("update")
  .description("Check for updates and update Forge to the latest version")
  .option("--dry-run", "Show what would be updated without installing")
  .option("--yes", "Update without prompting")
  .action(async (options) => {
    if (options.dryRun) {
      const info = await checkForUpdate();
      if (info.outdated) {
        console.log(`Update available: ${info.current} → ${info.latest}`);
      } else {
        console.log(`Forge is up to date (${info.current}).`);
      }
      return;
    }
    await selfUpdate(options.yes);
  });
```

### 3. Add tests

```typescript
// tests/update.test.ts
import { describe, it, expect, vi } from "vitest";
import { checkForUpdate } from "../src/update.js";

describe("forge update", () => {
  it("checkForUpdate returns current and latest version", async () => {
    const info = await checkForUpdate();
    expect(info).toHaveProperty("current");
    expect(info).toHaveProperty("latest");
    expect(info).toHaveProperty("outdated");
    expect(typeof info.outdated).toBe("boolean");
  });

  it("current version is a valid semver string", async () => {
    const info = await checkForUpdate();
    expect(info.current).toMatch(/^\d+\.\d+\.\d+/);
  });
});
```

## Verification

- `forge update --dry-run` reports current vs latest version
- `forge update` prompts before updating
- `forge update --yes` updates without prompting
- `forge update` when already up to date says "already up to date"
- Tests pass: `npm test`

## Files Created/Modified

- `src/update.ts` — NEW — Self-update logic
- `src/cli.ts` — MODIFY — add update command
- `tests/update.test.ts` — NEW — update tests

## Non-Goals

- Do not auto-update without user consent (except with `--yes`)
- Do not roll back to previous versions
- Do not update mid-session (update takes effect on next invocation)
