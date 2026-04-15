import { promises as fs } from "fs";
import { validateExecuteArtifact } from "./schema.js";
import type { ExecuteArtifact } from "./types.js";

export async function writeExecuteArtifact(
  outputPath: string,
  artifact: ExecuteArtifact
): Promise<void> {
  const validated = validateExecuteArtifact(artifact);
  await fs.writeFile(outputPath, JSON.stringify(validated, null, 2));
}
