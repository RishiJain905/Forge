# Shortening the execute (Step 5) workstream prompt

This guide is for when you want a **smaller** AI prompt during `forge execute` **without** stripping the signal the model needs to do useful work. It complements `docs/step5-ai-execute-flow.md` (what goes into the prompt) and `src/execute/prompt-builder.ts` (implementation).

---

## What “prompt size” means here

- The number logged as `calling model (N chars …)` is the **full user message** sent to the provider: workstream context, scoped plan/verify bullets, **file snippets**, fixed instructions, and the **## CHANGES** / JSON example shape.
- **Largest lever** is almost always **embedded file bodies**. Artifact text (constraints, concerns, merge order) adds up too, especially on big repos.

---

## Step 1 — Start with environment variables (no code)

Set these in **repo `.env`**, your shell, or CI. Forge loads repo `.env` when execute runs (see `loadRepoDotenv` in the execute CLI path). Values are integers; the code clamps each to a safe min/max.

| Variable | What it does | If you lower it |
|----------|----------------|------------------|
| `FORGE_EXECUTE_FILE_SNIPPETS_TOTAL_CHARS` | **Total** character budget **split across all** target files that have content | Many `likelyAffectedPaths` → much smaller prompt |
| `FORGE_EXECUTE_FILE_SNIPPET_CHARS` | **Per-file ceiling** (still split by total above) | Each file’s head/tail snippet shrinks |
| `FORGE_EXECUTE_TEXT_FIELD_MAX_CHARS` | Workstream description (and related one-line clamps) | Less prose; rarely drops hard constraints |
| `FORGE_EXECUTE_CONSTRAINT_LINES_MAX` | Max lines for conflict zones + findings + constraints | Fewer verify/plan bullets before “see plan.json / verify.json” |
| `FORGE_EXECUTE_MAX_CONCERNS` | Max carried-forward concern lines | Fewer concern bullets |

**Suggested order to try**

1. `FORGE_EXECUTE_FILE_SNIPPETS_TOTAL_CHARS` (e.g. `5000` → then `4000` if still too big).
2. `FORGE_EXECUTE_FILE_SNIPPET_CHARS` (e.g. `1200`).
3. `FORGE_EXECUTE_TEXT_FIELD_MAX_CHARS` (e.g. `400`).
4. Only if artifact sections dominate: `FORGE_EXECUTE_CONSTRAINT_LINES_MAX` and `FORGE_EXECUTE_MAX_CONCERNS`.

**Rebuild** is only needed if you change **TypeScript** defaults; **`.env` alone** does not require `npm run build`.

---

## Step 2 — After each change, sanity-check behavior

1. Run one workstream and confirm the model still **respects constraints** and **touches the right files**.
2. If edits become vague or wrong, you likely cut **snippet** too far for files the model does not re-read; raise file caps slightly or narrow `likelyAffectedPaths` upstream in split/plan instead of starving the prompt globally.
3. Watch the log line `calling model (N chars …)` until `N` feels right for **cost, latency, and model context**.

---

## Step 3 — Know what is usually safe vs risky to shrink

### Usually safe (padding or recoverable from disk)

- Shorter **boilerplate** in the fixed template (as long as the **## CHANGES** + fenced `json` pattern stays compatible with `parseModelResponse` in `src/execute/model-connector.ts`).
- **Tighter file snippet budgets** while keeping one line that says the **repo on disk is authoritative** (so the model is not misled into thinking the snippet is the whole file).
- **Shorter workstream / merge-order prose** via `FORGE_EXECUTE_TEXT_FIELD_MAX_CHARS`.

### Medium risk (trim only if redundant)

- **Many similar constraint lines** — lowering `FORGE_EXECUTE_CONSTRAINT_LINES_MAX` hurts less if bullets repeat the same idea; hurts more if each line is unique and actionable.

### Riskier (easy to make the prompt “dumb”)

- Removing or over-compressing **distinct verify findings/constraints** that change behavior.
- Obscuring **merge order** (what must complete first).
- Snippets so small the model cannot see **imports, types, or the edit neighborhood** unless it consistently reads the full file.

---

## Step 4 — If env tuning is not enough (optional / code)

Only if you still need smaller prompts after Step 1:

- **Dedupe** near-duplicate constraint or finding lines in `prompt-builder.ts`.
- **Compress plan item lines** further (e.g. emphasize `id` + `category/risk`, shorten titles).
- **Cap total prompt characters** with a final pass (advanced: must not break the required `## CHANGES` / JSON contract).

Document any new behavior in `docs/step5-ai-execute-flow.md` and add tests under `tests/execute.ai-prompt-builder.test.ts`.

---

## Quick reference — defaults (when env is unset)

Defined in `src/execute/prompt-builder.ts` (subject to change in code; read the file for exact min/max clamps):

| Variable | Typical default role |
|----------|----------------------|
| `FORGE_EXECUTE_FILE_SNIPPETS_TOTAL_CHARS` | Caps **sum** of file bodies in the prompt |
| `FORGE_EXECUTE_FILE_SNIPPET_CHARS` | Per-file **max** snippet size |
| `FORGE_EXECUTE_TEXT_FIELD_MAX_CHARS` | Description-style fields |
| `FORGE_EXECUTE_CONSTRAINT_LINES_MAX` | Constraint block depth |
| `FORGE_EXECUTE_MAX_CONCERNS` | Concern bullet count |

---

## Related files

- `src/execute/prompt-builder.ts` — assembly, truncation, env parsing  
- `src/execute/cli.ts` — loads artifacts, calls `buildWorkstreamPrompt`, logs prompt length  
- `src/execute/model-connector.ts` — parses model reply (`## CHANGES` plus a fenced JSON code block)  
- `docs/step5-ai-execute-flow.md` — end-to-end Step 5 AI flow and prompt layout  
