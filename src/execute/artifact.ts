import { promises as fs } from "fs";
import { buildExecuteArtifact } from "./state-machine.js";
import type { ExecuteState } from "./state-machine.js";
import { validateExecuteArtifact } from "./schema.js";

export async function writeExecuteArtifact(
  state: ExecuteState,
  outputPath: string
): Promise<void> {
  const artifact = buildExecuteArtifact(state, "1.0.0", "0.0.1");
  const validated = validateExecuteArtifact(artifact);
  await fs.writeFile(outputPath, JSON.stringify(validated, null, 2));
}
