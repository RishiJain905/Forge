# Implementation Execution Workflow (TDD-Enforced)

## 1. Plan Intake

- Read the approved implementation plan and any referenced specs before touching code.
- If an approved plan already exists, execute against that plan instead of writing a replacement plan.
- If the plan is incomplete or conflicts with the current repo state, update it briefly and continue.
- Before implementation begins, identify:
  - shared files
  - overlap between workstreams
  - integration/conflict zones
  - ordering or migration dependencies
  - the verification strategy.

---

## 2. Multi-Stream Execution

- If the work can be split safely, create separate implementation streams in separate git worktrees and branches.
- Use one stream per feature/domain when practical.
- Define ownership per stream up front so overlapping edits are minimized.
- Call out expected conflict zones before coding begins.
- Keep streams isolated until integration.

---

## 3. Subagent Delegation - Required For Separable Streams

- Do not treat subagent delegation as optional when the work is clearly separable by domain.
- Always instantiate implementation work through the designated subagents when a matching stream exists.
- Work should be handed to the appropriate subagent to perform and finish, not kept local by default when the stream maps cleanly to one of the delegated roles.

- Use the appropriate delegated specialist for each stream:
  - backend work: `.codex/agents/backendeng.toml`
  - frontend work: `.codex/agents/frontendeng.toml`
  - automated test creation or expansion: `.codex/agents/testautomator.toml`
  - security-sensitive work or review: `.codex/agents/securityrev.toml`
  - performance-related work: `.codex/agents/optimizer.toml`

- Assign one owner per file/domain and avoid overlapping write ownership unless there is an explicit handoff.
- Prefer parallel investigation and parallel implementation when streams are independent.

- If a relevant subagent is not used for a separable stream, the reason must be a concrete blocking constraint tied to:
  - coupling
  - risk
  - lack of delegation surface
  - an integration-critical dependency that makes delegation unsafe

  The reason must **not** be convenience or personal preference.

---

### Test-Driven Development Enforcement

All implementation streams must follow a **strict TDD feedback loop when practical**.

#### Required TDD Loop

1. Write or extend a failing test that captures the intended behavior or reproduces the bug.
2. Run the relevant test suite and confirm the test fails (**Red**).
3. Implement the **minimal code change required** to satisfy the test.
4. Run the test again until it passes (**Green**).
5. Refactor the implementation while keeping all tests passing.
6. Repeat in small increments.

#### Additional Rules

- Bug fixes must **always start with a regression test** that reproduces the issue before applying the fix.
- Feature work must introduce tests that **define the expected behavior** before the implementation is considered complete.
- Subagents responsible for implementation should collaborate with the `testautomator` agent when new coverage is required.
- If the codebase lacks a test harness or the behavior cannot yet be tested, the stream must first implement the **minimal testing scaffolding** required before continuing.

---

## 4. Integration

- Integrate all completed streams back into the user-specified target branch.
- Do not blindly merge in branch creation order if cherry-picking or curated conflict resolution is safer.
- Resolve conflicts centrally and verify that no stream's intended behavior is lost.
- Preserve all approved functionality from every stream during integration.

---

## 5. Verification (TDD-Aware)

Verification must be performed **continuously during implementation** through TDD feedback loops.

### Per-Stream Verification

- Tests must be introduced or updated **before implementing new behavior when feasible**.
- Each implementation step should follow a **Red → Green → Refactor cycle**:

  - Write failing test (**Red**)
  - Implement minimal fix (**Green**)
  - Refactor safely while keeping tests passing

- Run targeted tests during development within each stream.
- Ensure **regression coverage exists for all bug fixes**.
- Ensure **new functionality has corresponding test coverage**.

### Integration Verification

After integrating streams into the target branch:

- Run the **full relevant test suite**.
- Confirm that integration does **not break behavior introduced in any stream**.
- Report the **exact commands executed and their results**.

### Verification Reports Must Include

- tests added or modified
- failing test evidence when applicable
- passing test confirmation
- full suite results after integration

Do not claim completion without **fresh passing test results on the integrated branch**.

---

## 6. Cleanup

- Remove completed temporary worktrees when finished.
- Delete merged local source branches after integration.
- Delete merged remote source branches when appropriate and safe.
- Summarize:
  - the final target branch state
  - merged or cherry-picked branches
  - verification status
  - any remaining cleanup blockers.

---

## Behavioral Expectations

- Do not stop at planning if implementation is requested.
- Surface merge vs cherry-pick tradeoffs explicitly.
- Avoid overlapping ownership across streams unless integration requires it.
- Think through failures and continue working toward completion unless the user explicitly wants to pause.
- Do not claim completion without fresh verification evidence.

### Test Safety Rule

- Production code should **not be modified without either**:
  - an existing failing test, or
  - a newly introduced test that defines the intended behavior.

The only exception is when building or repairing **test infrastructure itself**.