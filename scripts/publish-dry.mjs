#!/usr/bin/env node
/**
 * Cross-platform publish dry-run (same behavior as scripts/publish.sh).
 * Used by npm run publish:dry on Windows where bash/WSL may be unavailable.
 *
 * On Windows, `spawnSync("npm.cmd", …)` without a shell can fail with EINVAL
 * (.cmd is not a native PE). PowerShell resolves `npm` via cmd; we match that
 * by using `npm` + `shell: true` on win32.
 */
import { spawnSync } from "node:child_process";

const useShell = process.platform === "win32";

const spawnOpts = {
  cwd: process.cwd(),
  env: process.env,
  shell: useShell,
  windowsHide: useShell,
};

function runNpm(args, inheritStdio) {
  return spawnSync("npm", args, {
    ...spawnOpts,
    stdio: inheritStdio ? "inherit" : "pipe",
    encoding: inheritStdio ? undefined : "utf8",
  });
}

console.log("=== npm whoami ===");
const whoami = runNpm(["whoami"], false);
const whoamiCode = whoami.status === null ? 1 : whoami.status;
if (whoamiCode !== 0) {
  if (whoami.error) {
    console.error(`Could not run npm: ${whoami.error.message}`);
    process.exit(1);
  }
  const errText = [whoami.stderr, whoami.stdout].filter(Boolean).join("").trim();
  if (errText) {
    console.error(errText);
  }
  console.log(
    "npm whoami failed — npm has no (valid) auth token for the registry you are using.",
  );
  console.log("That is expected until you log in once. Run: npm login");
  console.log(
    "Then run `npm whoami` in this same terminal; when that prints your username, publish:dry will proceed.",
  );
  process.exit(1);
}
if (whoami.stdout) {
  process.stdout.write(whoami.stdout);
}

console.log("");
console.log("=== npm publish --dry-run ===");
const dry = runNpm(["publish", "--dry-run", "--access", "public"], true);
const code = dry.status === null ? 1 : dry.status;
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
console.log("  - npm account with @forgecli organization access");
console.log("  - 2FA enabled and OTP ready");
