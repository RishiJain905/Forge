## 2025-02-13 - [Caching `isPromptTooShortToBeActionable` Results]
**Learning:** Calling `isPromptTooShortToBeActionable` multiple times per input text parses the string and executes multiple regular expressions repeatedly. Also, when extracting regexes to a shared constants file, JavaScript `RegExp` objects with the `/g` flag are stateful (`lastIndex`). Reusing a `/g` RegExp with `.test()` will result in unpredictable failures because it doesn't reset `lastIndex`.
**Action:** Caches the result of `isPromptTooShortToBeActionable` into a `promptIsThin` boolean early in the process and passes it down. When sharing regexes, keep a non-global (`NoG`) version specifically for `.test()` checks to avoid state-mutation bugs, or use `/g` only with `.match()`.

## 2025-02-13 - [Pre-compiled Regex for Path Matching Over Array Iteration]
**Learning:** In heavily-called utility functions (like `isSharedSurfacePath` in `src/plan/planner.ts`), performing `.split("/")` and mapping over segments inside `.some()` creates a massive number of temporary string and array allocations. These string operations compound and block the event loop during large recursive or batch processing tasks.
**Action:** When repeatedly checking string patterns against a known dictionary of terms, use a pre-compiled `RegExp` instead of splitting and checking via `Set.has()`. This approach is 5-6x faster as it pushes the string matching down to the optimized regex engine without additional array allocations.

## 2025-05-01 - [Optimize Module Signal Matching]
**Learning:** In hot paths (like `tokenizeModuleCandidates`), chaining array methods (`.split().flatMap().concat().map().filter()`) generates multiple intermediate arrays, causing significant garbage collection overhead. Additionally, using `includes()` on an array of tokens results in an O(N) lookup.
**Action:** Replace array chains with explicit `for...of` loops accumulating directly into a `Set`. This avoids intermediate allocations and provides O(1) lookups via `Set.has()`, significantly improving performance during high-volume path matching. Extracting split regular expressions into constants also prevents repeated RegExp compilation overhead.
