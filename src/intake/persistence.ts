import path from "node:path";
import { mkdir, rm, writeFile } from "node:fs/promises";

import { PersistenceError } from "./errors.js";

interface PlannedWrite {
  filePath: string;
  contents: string;
}

async function ensureParentDirectory(filePath: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
}

async function bootstrapDirectories(filePaths: string[]): Promise<void> {
  const directories = [...new Set(filePaths.map((filePath) => path.dirname(filePath)))];

  for (const directory of directories) {
    await mkdir(directory, { recursive: true });
  }
}

async function cleanupPartialWrites(filePaths: string[]): Promise<void> {
  await Promise.all(filePaths.map((filePath) => rm(filePath, { force: true })));
}

function normalizePersistenceError(error: unknown): PersistenceError {
  if (error instanceof PersistenceError) {
    return error;
  }

  return new PersistenceError(
    error instanceof Error ? error.message : "Unknown persistence failure.",
  );
}

export async function persistIntakeOutputs(params: {
  criticalWrites: PlannedWrite[];
  debugWrites?: PlannedWrite[] | null;
}): Promise<void> {
  const writtenCriticalPaths: string[] = [];

  try {
    await bootstrapDirectories(params.criticalWrites.map((write) => write.filePath));

    for (const write of params.criticalWrites) {
      await ensureParentDirectory(write.filePath);
      await writeFile(write.filePath, write.contents, "utf8");
      writtenCriticalPaths.push(write.filePath);
    }
  } catch (error) {
    await cleanupPartialWrites(writtenCriticalPaths);
    throw normalizePersistenceError(error);
  }

  if (!params.debugWrites || params.debugWrites.length === 0) {
    return;
  }

  for (const debugWrite of params.debugWrites) {
    try {
      await ensureParentDirectory(debugWrite.filePath);
      await writeFile(debugWrite.filePath, debugWrite.contents, "utf8");
    } catch {
      // Internal debug output is best-effort and must not change the run result.
    }
  }
}
