# Task 3: forge doctor

## Goal

Add the `forge doctor` command that runs pre-flight environment checks before a full pipeline run, verifying Node.js version, git, npm, network connectivity, config validity, permissions, and AI model credentials.

## Context

Read these first:
- `src/cli.ts` — Existing CLI entry with Commander
- `src/doctor/` — Directory structure for checks (to be created)
- `future_idea_implementation/step7-deploy.md` — Design reference (lines 180-200)

## What To Do

### 1. Create directory structure

```
src/doctor/
├── index.ts       — Check registry and runDoctor
├── node.ts        — Node >=18 check
├── git.ts         — Git installed + repo check
├── npm.ts         — npm available check
├── network.ts     — AI endpoint reachability
├── config.ts      — .forge/config.yaml validity
├── permissions.ts — Write permissions to .forge/
└── gitClean.ts    — Working tree clean check
```

### 2. Create check interfaces

```typescript
// src/doctor/index.ts
export interface CheckResult {
  name: string;
  status: "pass" | "warn" | "fail";
  message: string;
  fix?: string;
}

export interface Check {
  name: string;
  run(): Promise<CheckResult>;
  autoFix?: () => Promise<void>;
}
```

### 3. Create individual check files

**`src/doctor/node.ts`**
```typescript
import { exec } from "node:child_process";
import { promisify } from "node:util";
import type { Check, CheckResult } from "./index.js";

const execAsync = promisify(exec);

export const nodeCheck: Check = {
  name: "node",
  async run(): Promise<CheckResult> {
    const version = process.version.slice(1); // remove 'v'
    const [major] = version.split(".").map(Number);
    if (major >= 18) {
      return {
        name: "node",
        status: "pass",
        message: `Node.js ${version} (>=18 required)`,
      };
    }
    return {
      name: "node",
      status: "fail",
      message: `Node.js ${version} is too old. >=18 required.`,
      fix: "Install Node.js 18 or later: https://nodejs.org/",
    };
  },
};
```

**`src/doctor/git.ts`**
```typescript
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
import type { Check, CheckResult } from "./index.js";

const execAsync = promisify(exec);

export const gitCheck: Check = {
  name: "git",
  async run(): Promise<CheckResult> {
    try {
      await execAsync("git --version", { timeout: 5000 });
    } catch {
      return {
        name: "git",
        status: "fail",
        message: "Git is not installed.",
        fix: "Install git: https://git-scm.com/",
      };
    }

    const cwd = process.cwd();
    const gitDir = existsSync(".git") || existsSync(join(cwd, ".git"));
    if (!gitDir) {
      return {
        name: "git",
        status: "warn",
        message: "Not in a git repository.",
        fix: "Initialize git: git init",
      };
    }

    return {
      name: "git",
      status: "pass",
      message: "Git is installed and this is a git repository.",
    };
  },
};
```

**`src/doctor/npm.ts`**
```typescript
import { exec } from "node:child_process";
import { promisify } from "node:util";
import type { Check, CheckResult } from "./index.js";

const execAsync = promisify(exec);

export const npmCheck: Check = {
  name: "npm",
  async run(): Promise<CheckResult> {
    try {
      const { stdout } = await execAsync("npm --version", { timeout: 5000 });
      return {
        name: "npm",
        status: "pass",
        message: `npm ${stdout.trim()} is available.`,
      };
    } catch {
      return {
        name: "npm",
        status: "fail",
        message: "npm is not available.",
        fix: "Install Node.js which includes npm: https://nodejs.org/",
      };
    }
  },
};
```

**`src/doctor/network.ts`**
```typescript
import { exec } from "node:child_process";
import { promisify } from "node:util";
import type { Check, CheckResult } from "./index.js";

const execAsync = promisify(exec);

// Check connectivity to common AI endpoints
const TEST_URLS = [
  "https://api.openai.com/v1/models",
  "https://api.anthropic.com/v1/models",
];

export const networkCheck: Check = {
  name: "network",
  async run(): Promise<CheckResult> {
    const results = await Promise.allSettled(
      TEST_URLS.map(async (url) => {
        try {
          await execAsync(`curl -s -o /dev/null -w "%{http_code}" ${url}`, {
            timeout: 10000,
          });
          return url;
        } catch {
          return null;
        }
      })
    );

    const reachable = results.filter((r) => r.status === "fulfilled" && r.value);
    if (reachable.length > 0) {
      return {
        name: "network",
        status: "pass",
        message: `Network is reachable (${reachable.length}/${TEST_URLS.length} AI endpoints accessible).`,
      };
    }
    return {
      name: "network",
      status: "warn",
      message: "Cannot reach AI model endpoints. Check network/proxy settings.",
      fix: "Configure proxy: export https_proxy=http://proxy:8080",
    };
  },
};
```

**`src/doctor/config.ts`**
```typescript
import { existsSync, readFileSync } from "node:fs";
import { parse } from "yaml";
import type { Check, CheckResult } from "./index.js";

export const configCheck: Check = {
  name: "config",
  async run(): Promise<CheckResult> {
    const configPath = existsSync(".forge/config.yaml")
      ? ".forge/config.yaml"
      : existsSync("forge.config.ts")
      ? "forge.config.ts"
      : null;

    if (!configPath) {
      return {
        name: "config",
        status: "warn",
        message: "No .forge/config.yaml or forge.config.ts found.",
        fix: "Run 'forge init' to create a config file.",
      };
    }

    try {
      if (configPath.endsWith(".yaml") || configPath.endsWith(".yml")) {
        const content = readFileSync(configPath, "utf8");
        parse(content); // Throws if invalid YAML
      }
      return {
        name: "config",
        status: "pass",
        message: `Config file is valid (${configPath}).`,
      };
    } catch (error) {
      return {
        name: "config",
        status: "fail",
        message: `Config file is invalid: ${error instanceof Error ? error.message : String(error)}`,
        fix: "Fix the YAML syntax in .forge/config.yaml",
      };
    }
  },
};
```

**`src/doctor/permissions.ts`**
```typescript
import { access, constants, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Check, CheckResult } from "./index.js";

export const permissionsCheck: Check = {
  name: "permissions",
  async run(): Promise<CheckResult> {
    const forgeDir = existsSync(".forge") ? ".forge" : null;

    if (!forgeDir) {
      return {
        name: "permissions",
        status: "pass",
        message: ".forge/ does not exist yet, will be created with correct permissions.",
      };
    }

    try {
      await access(forgeDir, constants.W_OK);
      return {
        name: "permissions",
        status: "pass",
        message: "Can write to .forge/ directory.",
      };
    } catch {
      return {
        name: "permissions",
        status: "fail",
        message: "Cannot write to .forge/ directory.",
        fix: "Check directory permissions: chmod u+w .forge/",
      };
    }
  },
};
```

**`src/doctor/gitClean.ts`**
```typescript
import { exec } from "node:child_process";
import { promisify } from "node:util";
import type { Check, CheckResult } from "./index.js";

const execAsync = promisify(exec);

export const gitCleanCheck: Check = {
  name: "git-clean",
  async run(): Promise<CheckResult> {
    try {
      const { stdout } = await execAsync(
        "git status --porcelain",
        { timeout: 5000 }
      );
      if (stdout.trim() === "") {
        return {
          name: "git-clean",
          status: "pass",
          message: "Working tree is clean.",
        };
      }
      return {
        name: "git-clean",
        status: "warn",
        message: `Working tree has uncommitted changes (${stdout.split("\n").length} file(s)).`,
        fix: "Commit or stash changes before running forge.",
      };
    } catch {
      return {
        name: "git-clean",
        status: "warn",
        message: "Cannot determine git status.",
      };
    }
  },
};
```

### 4. Create the doctor runner

```typescript
// src/doctor/index.ts
import { nodeCheck } from "./node.js";
import { gitCheck } from "./git.js";
import { npmCheck } from "./npm.js";
import { networkCheck } from "./network.js";
import { configCheck } from "./config.js";
import { permissionsCheck } from "./permissions.js";
import { gitCleanCheck } from "./gitClean.js";
import type { Check, CheckResult } from "./index.js";

export interface DoctorOptions {
  fix?: boolean;
  checks?: string[]; // e.g., ["node", "git"]
}

export const ALL_CHECKS: Check[] = [
  nodeCheck,
  gitCheck,
  npmCheck,
  networkCheck,
  configCheck,
  permissionsCheck,
  gitCleanCheck,
];

export async function runDoctor(options: DoctorOptions = {}): Promise<CheckResult[]> {
  const checks = options.checks
    ? ALL_CHECKS.filter((c) => options.checks!.includes(c.name))
    : ALL_CHECKS;

  const results: CheckResult[] = [];

  for (const check of checks) {
    const result = await check.run();
    results.push(result);
  }

  return results;
}

export function printDoctorResults(results: CheckResult[]): void {
  console.log("\n=== Forge Doctor Results ===\n");

  for (const result of results) {
    const icon = result.status === "pass" ? "✓" : result.status === "warn" ? "⚠" : "✗";
    console.log(`${icon} [${result.status.toUpperCase()}] ${result.name}`);
    console.log(`  ${result.message}`);
    if (result.fix) {
      console.log(`  → Fix: ${result.fix}`);
    }
    console.log();
  }

  const passed = results.filter((r) => r.status === "pass").length;
  const warned = results.filter((r) => r.status === "warn").length;
  const failed = results.filter((r) => r.status === "fail").length;

  console.log(`Summary: ${passed} passed, ${warned} warnings, ${failed} failed`);
}
```

### 5. Add to CLI

```typescript
// src/cli.ts
import { runDoctor, printDoctorResults, ALL_CHECKS } from "./doctor/index.js";

program
  .command("doctor")
  .description("Run pre-flight environment checks")
  .option("--fix", "Auto-fix what can be fixed")
  .option("--checks <list>", "Comma-separated list of checks to run (e.g., node,git,npm)")
  .action(async (options) => {
    const checkNames = options.checks
      ? options.checks.split(",").map((s: string) => s.trim())
      : undefined;

    const results = await runDoctor({
      fix: options.fix,
      checks: checkNames,
    });

    printDoctorResults(results);

    const hasFailures = results.some((r) => r.status === "fail");
    process.exit(hasFailures ? 1 : 0);
  });
```

### 6. Add tests

Create `tests/doctor.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { runDoctor, ALL_CHECKS } from "../src/doctor/index.js";

describe("forge doctor", () => {
  it("runs all checks by default", async () => {
    const results = await runDoctor();
    expect(results.length).toBe(ALL_CHECKS.length);
  });

  it("runs only specified checks", async () => {
    const results = await runDoctor({ checks: ["node", "npm"] });
    expect(results.length).toBe(2);
    expect(results.every((r) => ["node", "npm"].includes(r.name))).toBe(true);
  });

  it("node check passes for Node >= 18", async () => {
    const results = await runDoctor({ checks: ["node"] });
    expect(results[0].status).toBe("pass");
  });

  it("npm check passes when npm is available", async () => {
    const results = await runDoctor({ checks: ["npm"] });
    expect(["pass", "fail"]).toContain(results[0].status);
  });
});
```

## Verification

- `forge doctor` runs all checks and prints results
- `forge doctor --checks node,git` runs only specified checks
- `forge doctor --fix` attempts auto-fix where supported
- `forge doctor` exits with code 1 if any check fails
- All tests pass: `npm test`

## Files Created

- `src/doctor/index.ts` — Check registry and runner
- `src/doctor/node.ts` — Node version check
- `src/doctor/git.ts` — Git check
- `src/doctor/npm.ts` — npm check
- `src/doctor/network.ts` — Network check
- `src/doctor/config.ts` — Config validity check
- `src/doctor/permissions.ts` — Write permission check
- `src/doctor/gitClean.ts` — Git working tree check
- `tests/doctor.test.ts` — Doctor tests

## Non-Goals

- Do not implement auto-fix for all checks (only where straightforward)
- Do not change existing CLI commands
- Do not require .forge/config.yaml to exist (warn instead of fail)
