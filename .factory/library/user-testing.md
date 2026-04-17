# User Testing

## Validation Surface

`forge integrate` is a CLI command. Validation is done through:
- CLI invocation (`forge integrate`, `forge integrate --help`)
- Exit code inspection
- File system inspection (checking for integrate.json and integration-report.md)
- Schema validation of generated artifacts

## No Browser/UI Testing

This step has no web UI or browser-accessible surfaces. All validation is done via:
- CLI commands
- TypeScript compilation checks
- Unit test execution
- File system checks

## Resource Cost Classification

`forge integrate` is lightweight — it:
- Reads JSON artifacts from disk
- Calls an AI model (user-provided API key)
- Writes test files and executes them via npm test or pytest
- Writes output artifacts

No dedicated services need to run. Resource usage is dominated by:
- The AI model call (network I/O)
- Test execution (CPU/disk I/O depending on project)

## How to Validate

1. **Type check:** `npm run typecheck`
2. **Build:** `npm run build`
3. **Unit tests:** `npm run test`
4. **Smoke test:** `npm run smoke`
5. **CLI help:** `forge integrate --help`
6. **CLI error case:** `forge integrate` without execute.json → should fail with NO_EXECUTE_ARTIFACT
7. **Full flow:** With valid execute.json, `forge integrate` produces integrate.json and integration-report.md

## Validation Concurrency

Max concurrent validators: 3

This is a pure TypeScript library module with no services, no browser UI, and no shared mutable state. Validators operate on the same codebase but read-only. Types and schemas can be validated concurrently without interference.

## Flow Validator Guidance: types-and-schemas

**Surface:** TypeScript type definitions and Zod schemas in `src/integrate/types.ts` and `src/integrate/schema.ts`

**Isolation rules:**
- All validators share the same codebase and run read-only operations
- No shared mutable state between validators
- Validators may run concurrently
- Each validator should run `npm run typecheck` and/or `node dist-tests/tests/integrate.types-schema.test.js` independently

**Constraints:**
- Do NOT modify any source files
- Do NOT start or stop any services (none needed)
- All assertions are code-level validations via type checking and unit tests

**Commands to run:**
- Type checking: `npm run typecheck` (in project root)
- Build: `npm run build` (in project root)
- Schema tests: `node dist-tests/tests/integrate.types-schema.test.js` (after build + test compile)
