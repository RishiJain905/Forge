import { exec } from "node:child_process";
import { promisify } from "node:util";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const execAsync = promisify(exec);

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
    const { stdout } = await execAsync("npm view @forge-cli/forge version", {
      timeout: 10000,
    });
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
    console.log(
      `A new version of Forge is available: ${current} → ${latest}`
    );
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
    const message =
      error instanceof Error ? error.message : String(error);
    throw new Error(`Update failed: ${message}`);
  }
}
