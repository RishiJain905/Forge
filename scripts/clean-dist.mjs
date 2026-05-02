#!/usr/bin/env node
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const dist = join(repoRoot, "dist");

if (existsSync(dist)) {
  rmSync(dist, { recursive: true, force: true });
}
