import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Loads `<repoRoot>/.env` into `process.env` for keys that are not already set
 * in the real environment (host and prior loads win).
 *
 * V1: `KEY=value` per line, optional surrounding single/double quotes on values,
 * `#` line comments, blank lines, optional leading `export `, UTF-8 BOM stripped.
 */
export function loadRepoDotenv(repoRoot: string): void {
  const envPath = join(repoRoot, ".env");
  if (!existsSync(envPath)) {
    return;
  }

  let text: string;
  try {
    text = readFileSync(envPath, "utf8");
  } catch {
    return;
  }

  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1);
  }

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const exportStripped = line.startsWith("export ")
      ? line.slice("export ".length).trim()
      : line;

    const eq = exportStripped.indexOf("=");
    if (eq <= 0) continue;

    const key = exportStripped.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;

    if (process.env[key] !== undefined) continue;

    let value = exportStripped.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}
