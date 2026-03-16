# GitHub CLI Notes

In this environment, `gh` may fail inside the sandbox even when it works in the user's normal PowerShell session.

For PR creation, PR review, PR comment replies, or any other GitHub CLI task, use escalated execution for `gh` commands.

Useful phrasing from the user:

- `Use escalated gh.`
- `Create the PR with escalated gh commands if needed.`
- `Reply to the PR comments; use escalated gh commands.`
- `Anything involving gh, run it outside the sandbox.`
