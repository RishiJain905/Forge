# Task 4: Execute Artifact Writer

## Goal

Create `src/execute/artifact.ts` that writes the execute.json artifact.

## Details

### Artifact Writer

```typescript
import { ExecuteArtifact } from './types';
import fs from 'fs/promises';
import path from 'path';

export async function writeExecuteArtifact(
  outputPath: string,
  artifact: ExecuteArtifact
): Promise<void> {
  // Write the artifact as formatted JSON
  // Follow the same pattern as other artifact writers in Steps 1-4
}
```

### Follow Pattern from Steps 1-4

Look at how `src/intake/artifact.ts`, `src/plan/artifact.ts`, `src/split/artifact.ts` write artifacts:

1. Ensure output directory exists
2. Write formatted JSON with `JSON.stringify(artifact, null, 2)`
3. Include schemaVersion, forgeVersion, createdAt

### Default Output Path

The artifact should be written to `.forge/execute.json` by default, unless an alternate path is provided via CLI flag.

## Acceptance

- `execute.json` is written with correct schema
- File is formatted as readable JSON
- Function is async and returns Promise
