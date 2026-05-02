import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);

/** .cmd shims need the shell on Windows; bare `npm` + `shell: true` matches PowerShell. */
function npmExecOptions(extra: { timeout?: number }): { timeout?: number; shell?: boolean } {
  return process.platform === "win32"
    ? { ...extra, shell: true }
    : extra;
}

export interface UpdateInfo {
  current: string;
  latest: string;
  outdated: boolean;
}

function getPackageVersion(): string {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const packagePath = join(__dirname, "..", "..", "package.json");
  const pkg = JSON.parse(readFileSync(packagePath, "utf8"));
  return pkg.version as string;
}

export async function checkForUpdate(): Promise<UpdateInfo> {
  const current = getPackageVersion();
  try {
    const { stdout } = await execFileAsync(
      "npm",
      ["view", "@forgecli/forge", "version"],
      npmExecOptions({ timeout: 10000 }),
    );
    const latest = stdout.trim();
    return { current, latest, outdated: compareSemver(latest, current) > 0 };
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
    console.log(
      `A new version of Forge is available: ${current} → ${latest}`,
    );
    console.log("Run 'forge update --yes' to update.");
    return;
  }

  if (!/^\d+\.\d+\.\d+$/.test(latest)) {
    throw new Error(`Invalid latest version: ${latest}`);
  }

  console.log(`Updating Forge ${current} → ${latest}...`);
  try {
    await execFileAsync(
      "npm",
      ["install", "-g", `@forgecli/forge@${latest}`],
      npmExecOptions({ timeout: 60000 }),
    );
    console.log("Update complete.");
    console.log(`Now running Forge ${latest}.`);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error);
    throw new Error(`Update failed: ${message}`);
  }
}

function compareSemver(a: string, b: string): number {
  const pa = a.split(".");
  const pb = b.split(".");
  for (let i = 0; i < 3; i++) {
    const na = parseInt(pa[i] || "0", 10);
    const nb = parseInt(pb[i] || "0", 10);
    if (na > nb) return 1;
    if (na < nb) return -1;
  }
  return 0;
}
