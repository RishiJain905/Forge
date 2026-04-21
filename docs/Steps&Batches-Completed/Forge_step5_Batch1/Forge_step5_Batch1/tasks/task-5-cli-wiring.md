# Task 5: CLI Wiring

## Goal

Wire `forge execute` into `src/cli.ts`, following the pattern used for `forge intake`, `forge plan`, `forge verify`, and `forge split`.

## Details

### Wire into CLI

In `src/cli.ts`:

1. Import the execute module:
```typescript
import { runExecute } from './execute/cli';
```

2. Add the `execute` subcommand to Commander. Look at how `forge split` is wired:

```typescript
program
  .command('execute')
  .description('Track workstream execution and enforce merge_order constraints')
  .action(async () => {
    try {
      await runExecute();
    } catch (error) {
      console.error('Execute failed:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });
```

3. Add the execute directory to TypeScript compilation by creating `src/execute/index.ts`:

```typescript
export * from './types';
export * from './schema';
export * from './state-machine';
export * from './artifact';
export { runExecute } from './cli';
```

## Acceptance

- `forge execute --help` shows the command
- Running `forge execute` triggers the interactive CLI
- CLI is properly wired with error handling
