#!/usr/bin/env node
/**
 * Cross-platform publish dry-run (same behavior as scripts/publish.sh).
 * Used by npm run publish:dry on Windows where bash/WSL may be unavailable.
 */
import { spawnSync } from "node:child_process";

const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";

function runNpm(args, inherit = true) {
  return spawnSync(npmCmd, args, {
    stdio: inherit ? "inherit" : "pipe",
    encoding: inherit ? undefined : "utf8",
  });
}

console.log("=== npm whoami ===");
const whoami = runNpm(["whoami"], false);
if (whoami.status !== 0) {
  console.log("You are not logged into npm. Run: npm login");
  process.exit(1);
}
if (whoami.stdout) {
  process.stdout.write(whoami.stdout);
}

console.log("");
console.log("=== npm publish --dry-run ===");
const dry = runNpm(["publish", "--dry-run", "--access", "public"], true);
const code = dry.status ?? 1;
if (code !== 0) {
  process.exit(code);
}

console.log("");
console.log("Dry-run passed!");
console.log("");
console.log("To publish for real, run:");
console.log("  npm publish --access public");
console.log("");
console.log("Requirements for real publish:");
console.log("  - npm account with @forge-cli organization access");
console.log("  - 2FA enabled and OTP ready");
