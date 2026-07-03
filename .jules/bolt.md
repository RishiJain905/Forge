## 2024-07-03 - Replacing chained array methods with single-pass loops
**Learning:** Chaining array methods like `filter(...).length` repeatedly over the same array creates multiple O(N) passes and instantiates unnecessary intermediate arrays. This is particularly noticeable when performing aggregate counts over a collection.
**Action:** Replace sequential `.filter(...).length` and `.reduce(...)` calls over the same array with a single `for...of` loop aggregating multiple values at once. This avoids redundant passes and intermediate allocations.
