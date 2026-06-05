import { performance } from "perf_hooks";

// Array setup
const items = Array.from({ length: 100000 }, (_, i) => ({
  state: ["completed", "failed", "running", "queued"][i % 4]
}));

// Baseline (Multiple filters)
const start1 = performance.now();
for (let i = 0; i < 100; i++) {
  const completed = items.filter((ws) => ws.state === "completed").length;
  const failed = items.filter((ws) => ws.state === "failed").length;
  const running = items.filter((ws) => ws.state === "running").length;
  const queued = items.filter((ws) => ws.state === "queued").length;
}
const end1 = performance.now();
console.log(`Baseline (4x filter): ${(end1 - start1).toFixed(2)}ms`);

// Loop approach
const start2 = performance.now();
for (let i = 0; i < 100; i++) {
  let completed = 0, failed = 0, running = 0, queued = 0;
  for (const ws of items) {
    if (ws.state === "completed") completed++;
    else if (ws.state === "failed") failed++;
    else if (ws.state === "running") running++;
    else if (ws.state === "queued") queued++;
  }
}
const end2 = performance.now();
console.log(`Optimized (1 loop): ${(end2 - start2).toFixed(2)}ms`);
