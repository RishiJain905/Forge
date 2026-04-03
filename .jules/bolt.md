## 2024-06-25 - O(1) Candidate Targeting Deduplication

**Learning:** During candidate target resolution, looking up items in arrays to enforce uniqueness creates an O(N^2) bottleneck when searching through thousands of files. `Set` allows for O(1) membership checks, dramatically improving scaling.
**Action:** Use Sets to handle unique tracking or lookup operations inside tight loops, especially when the iteration touches the entire `repoContext.sourceFiles` array. Pre-normalize repeating signals once before loops instead of re-normalizing inside the tight loop.
