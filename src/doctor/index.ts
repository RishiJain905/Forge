import { nodeCheck } from "./node.js";
import { gitCheck } from "./git.js";
import { npmCheck } from "./npm.js";
import { networkCheck } from "./network.js";
import { configCheck } from "./config.js";
import { permissionsCheck } from "./permissions.js";
import { gitCleanCheck } from "./gitClean.js";

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

export interface DoctorOptions {
  fix?: boolean;
  checks?: string[];
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
  let checks = ALL_CHECKS;

  if (options.checks && options.checks.length > 0) {
    const checkSet = new Set(options.checks);
    checks = ALL_CHECKS.filter((c) => checkSet.has(c.name));
  }

  const results: CheckResult[] = [];

  for (const check of checks) {
    const result = await check.run();

    if (options.fix && result.status !== "pass" && check.autoFix) {
      await check.autoFix();
    }

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
  }

  // Optimization: Calculate status counts in a single pass instead of multiple .filter().length
  let passed = 0;
  let warnings = 0;
  let failed = 0;

  for (const r of results) {
    if (r.status === "pass") passed++;
    else if (r.status === "warn") warnings++;
    else if (r.status === "fail") failed++;
  }

  console.log(`\n${passed} passed, ${warnings} warnings, ${failed} failed`);
}