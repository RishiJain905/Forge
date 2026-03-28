import { rm, writeFile, mkdir } from "node:fs/promises";
import * as path from "node:path";

async function cleanupPartialWritesBaseline(filePaths: string[]): Promise<void> {
  for (const filePath of filePaths) {
    await rm(filePath, { force: true });
  }
}

async function cleanupPartialWritesOptimized(filePaths: string[]): Promise<void> {
  await Promise.all(filePaths.map((filePath) => rm(filePath, { force: true })));
}

async function runBenchmark() {
  const NUM_FILES = 100;
  const testDir = path.join(process.cwd(), "benchmark-tmp");

  await mkdir(testDir, { recursive: true });

  // Create dummy files
  const createFiles = async () => {
    const files: string[] = [];
    for (let i = 0; i < NUM_FILES; i++) {
      const filePath = path.join(testDir, `file-${i}.txt`);
      await writeFile(filePath, "test data");
      files.push(filePath);
    }
    return files;
  };

  // Run Baseline
  let baselineTime = 0;
  for (let iter = 0; iter < 5; iter++) {
    const files = await createFiles();
    const start = performance.now();
    await cleanupPartialWritesBaseline(files);
    const end = performance.now();
    baselineTime += (end - start);
  }
  baselineTime /= 5;

  // Run Optimized
  let optimizedTime = 0;
  for (let iter = 0; iter < 5; iter++) {
    const files = await createFiles();
    const start = performance.now();
    await cleanupPartialWritesOptimized(files);
    const end = performance.now();
    optimizedTime += (end - start);
  }
  optimizedTime /= 5;

  console.log(`Baseline (Sequential): ${baselineTime.toFixed(2)}ms`);
  console.log(`Optimized (Concurrent): ${optimizedTime.toFixed(2)}ms`);

  await rm(testDir, { recursive: true, force: true });
}

runBenchmark().catch(console.error);
