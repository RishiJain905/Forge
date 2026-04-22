/**
 * Runs `forge init` after npm install without relying on a `forge` shim or
 * Unix-only shell (`2>/dev/null`, `|| true`). Safe on Windows and when `dist/`
 * is missing (clone before first build).
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(scriptDir, "..");
const entry = join(packageRoot, "dist", "src", "index.js");

if (!existsSync(entry)) {
  process.exit(0);
}

spawnSync(process.execPath, [entry, "init"], {
  cwd: packageRoot,
  stdio: "ignore",
});

process.exit(0);
