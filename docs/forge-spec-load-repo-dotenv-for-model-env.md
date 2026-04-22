# Load repository `.env` for Forge model environment variables

## Goal
When developers run Forge from a repo that contains a `.env` file, automatically merge those variables into `process.env` (before any command reads configuration) so `FORGE_MODEL_API_KEY`, `FORGE_MODEL_BASE_URL`, and related `FORGE_MODEL_*` values work without manual `export` or shell-specific loading.

## Summary
Today the CLI relies on the shell or host to populate environment variables; a `.env` file in the project root is a common convention but is not loaded by Node unless something else does it. Align Forge with that convention in a predictable, documented way: resolve `.env` relative to the working directory (or the path given by the `--repo` flag when applicable), parse a minimal subset of dotenv rules, and fail soft or warn on parse issues without breaking unrelated commands.

## Scope
- Implement `.env` discovery and loading at a single early entry point in the CLI (for example in `src/cli.ts` or `src/index.ts` before `runCli` dispatches subcommands).
- Support the same variable names documented in the README for AI setup (`FORGE_MODEL_PROVIDER`, `FORGE_MODEL_NAME`, `FORGE_MODEL_API_KEY`, `FORGE_MODEL_BASE_URL`, and other `FORGE_*` keys already read from `process.env`).
- Do not overwrite variables that are already set in the environment (host wins).
- Add or extend tests under `tests/` for: missing `.env` (no-op), valid `.env` (values applied), existing env precedence, and malformed lines (defined behavior: skip or warn).
- Update `README.md` AI Model Setup and installation notes to state that repo `.env` is loaded and any limitations (for example no multiline values in v1).

## Acceptance Criteria
- With a `.env` in the current working directory containing `FORGE_MODEL_API_KEY` with a real secret value (and model provider and model name configured as required elsewhere), `forge doctor` and AI-backed commands see that key without the user exporting it in the shell first.
- Variables already present in the real environment are not replaced by `.env`.
- If `.env` is absent, behavior is unchanged from today.
- `forge --help` and subcommand `--help` output are unchanged in purpose.
- Automated tests cover happy path, precedence, and at least one edge case (empty file, comment-only file, or bad line).
- No new network calls solely for loading `.env` (reading the local file from disk is allowed).

## Constraints
- No new runtime dependency unless justified and approved (prefer a tiny inline parser for `KEY=value` lines over pulling `dotenv` if the project wishes to stay dependency-light).
- Do not log or print secret values; redact or omit values in any debug output.
- Keep V1 scope: a single `.env` at the repository root or current working directory only (no nested `.env` cascade unless explicitly specified in a follow-up spec).
- No change to the deterministic intake, plan, verify, or split pipelines beyond shared environment loading at CLI startup.
