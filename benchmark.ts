import { performance } from 'perf_hooks';

function addIfMissingOld(values: string[], value: string): void {
  if (!values.includes(value)) {
    values.push(value);
  }
}

function addIfMissingNew(values: Set<string>, value: string): void {
  values.add(value);
}

function runBenchmark() {
  const iterations = 10000;
  const numItems = 10000;

  // Baseline (Array)
  let start = performance.now();
  let valuesOld: string[] = [];
  for (let i = 0; i < numItems; i++) {
    addIfMissingOld(valuesOld, `item${i}`);
  }
  for (let i = 0; i < iterations; i++) {
    addIfMissingOld(valuesOld, `item${i}`); // Should be missing? No, should be duplicates to trigger includes O(N) worst case
  }
  let end = performance.now();
  const oldTime = end - start;

  // New (Set)
  start = performance.now();
  let valuesNew = new Set<string>();
  for (let i = 0; i < numItems; i++) {
    addIfMissingNew(valuesNew, `item${i}`);
  }
  for (let i = 0; i < iterations; i++) {
    addIfMissingNew(valuesNew, `item${i}`);
  }
  end = performance.now();
  const newTime = end - start;

  console.log(`Array includes: ${oldTime.toFixed(2)} ms`);
  console.log(`Set add: ${newTime.toFixed(2)} ms`);
  console.log(`Improvement: ${((oldTime - newTime) / oldTime * 100).toFixed(2)}%`);
}

runBenchmark();
