import { persistIntakeOutputs } from "./dist/src/intake/persistence.js";
import { performance } from "node:perf_hooks";
import { rm } from "node:fs/promises";

async function runBenchmark() {
    const debugWrites = [];
    for (let i = 0; i < 500; i++) {
        debugWrites.push({
            filePath: `./.bench/debug/file_${i}.txt`,
            contents: `Debug content ${i}`
        });
    }

    // Cleanup before
    await rm("./.bench", { recursive: true, force: true }).catch(() => {});

    const start = performance.now();
    await persistIntakeOutputs({
        criticalWrites: [],
        debugWrites
    });
    const end = performance.now();

    console.log(`Time taken: ${(end - start).toFixed(2)} ms`);

    // Cleanup after
    await rm("./.bench", { recursive: true, force: true }).catch(() => {});
}

runBenchmark();
