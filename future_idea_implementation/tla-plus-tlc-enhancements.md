# TLA+/TLC Formal Verification Enhancements

## Problem Statement

Forge's formal verification lane is its most distinctive feature — it uses actual TLA+ specifications and the TLC model checker to catch coordination bugs before code is written. But the current implementation has three significant limitations:

### 1. Template-Based Spec Generation Is Too Rigid

The current `formal.ts` generates TLA+ specs from predefined templates per scenario kind:

```typescript
type FormalTemplate = {
  actors: string[];
  entities: string[];
  states: string[];
  transitions: Array<[string, string]>;
  unsafeStates: string[];
  unsafeConditions: string[];
  invariants: string[];
  initialConditions: string[];
  initialState: string;
};
```

This means every verification case is forced into the same shape: "here are actors, here are states, here are transitions." Real coordination logic is more complex:

- **Typed variables** — token counts, queue depths, version numbers
- **Conditional transitions** — "transition to state B only if condition X holds"
- **Temporal properties** — "eventually", "always", "until"
- **Fairness constraints** — "if an agent can perpetually retry, it eventually succeeds"

A template can't express these. The current system would miss bugs in anything that doesn't fit the template's mold.

### 2. No Validation Before TLC

The current flow is:

```
Generate TLA+ spec from template
  ↓
Run TLC immediately
  ↓
Parse results
```

If the TLA+ spec has a syntax error or a logical contradiction, TLC spends compute cycles before failing. For large state spaces, this can be expensive and slow down the verification step significantly.

### 3. Counterexamples Are Incomprehensible

TLC output on failure looks like:

```
/statesaving @2025-04-13T03:21:44.120: queue.contents <- [Event:E1]
/statesaving @2025-04-13T03:21:44.121: queue.contents <- [Event:E1, Event:E2]
/statesaving @2025-04-13T03:21:44.122: queue.contents <- [Event:E2]
```

An engineer seeing this for the first time has no idea what happened. The trace shows state mutations but doesn't explain **why** those mutations violated the invariant or **what** the root cause was.

## Proposed Architecture

```
forge verify (formal lane)
├── tla-generator/       # Generates TLA+ from verification targets
│   ├── generator.ts     # Main generator orchestrator
│   ├── templates.ts     # Base templates (extensible, not rigid)
│   ├── inferrer.ts      # Infers invariants from code patterns
│   ├── type-builder.ts  # Builds typed variables from context
│   └── temporal.ts      # Generates temporal operators
├── tla-validator/       # Validates before TLC
│   ├── parser.ts        # Syntactic validation of TLA+
│   ├── type-checker.ts  # Type and scope checking
│   └── linter.ts        # Common TLA+ anti-patterns
├── tlc-runner/          # Runs TLC with smart configuration
│   ├── runner.ts        # Spawns TLC, manages timeouts
│   ├── config.ts        # Generates TLC config (workers, depth limits)
│   └── result-parser.ts # Parses TLC stdout/stderr
├── explainer/            # Makes counterexamples human-readable
│   └── explainer.ts     # LLM-assisted trace explanation
└── types.ts             # Step 3 type definitions
```

## Component 1: Smarter TLA+ Generation

### Base Template System (Extensible, Not Rigid)

```typescript
// src/verify/tla-generator/templates.ts

// The base template is no longer a rigid schema — it's a builder pattern
export interface TlaTemplate {
  name: string;
  description: string;
  
  // Variables with types, not just string arrays
  variables: TlaVariable[];
  
  // State predicates for initial condition
  initialCondition: TlaExpression;
  
  // Next-state relation
  nextRelation: TlaExpression;
  
  // Invariants (safety properties)
  invariants: TlaExpression[];
  
  // Temporal properties (liveness)
  temporalProperties?: TlaTemporalProperty[];
  
  // Fairness constraints
  fairness?: TlaFairnessConstraint[];
}

export interface TlaVariable {
  name: string;
  type: TlaType;
  initialValue: TlaExpression;
  comment?: string;
}

export type TlaType =
  | { kind: "scalar" }
  | { kind: "set", elementType: TlaType }
  | { kind: "function", domain: TlaType, range: TlaType }
  | { kind: "record", fields: Record<string, TlaType> }
  | { kind: "tuple", elements: TlaType[] };

export interface TlaExpression {
  toTLA(): string;
}

// Example: a typed queue variable
const queueVariable: TlaVariable = {
  name: "queue",
  type: { kind: "function", domain: { kind: "scalar" }, range: { kind: "scalar" } },
  initialValue: { toTLA: () => "{}" },
  comment: "Maps queue position to event ID"
};
```

### LLM-Assisted Spec Generation

```typescript
// src/verify/tla-generator/generator.ts
export async function generateTlaSpec(params: {
  verificationTarget: VerifyVerificationTarget;
  verificationCase: VerifyVerificationCase;
  context: {
    candidateFiles: string[];
    existingCode: Map<string, string>;  // path → content
  };
  model?: string;
}): Promise<GeneratedTlaSpec> {
  
  // Step 1: Read relevant source files for context
  const relevantCode = await readRelevantCode(params.context);
  
  // Step 2: Infer invariants from code patterns
  const inferredInvariants = await inferInvariantsFromCode(
    relevantCode,
    params.verificationCase.scenarioKind
  );
  
  // Step 3: Build typed variables from the verification model
  const typedVariables = buildTypedVariables(params.verificationCase);
  
  // Step 4: Generate the TLA+ string with LLM assistance
  const tlaSource = await llmGenerateTlaModule({
    scenarioKind: params.verificationCase.scenarioKind,
    variables: typedVariables,
    naturalLanguage: params.verificationTarget.description,
    inferredInvariants,
    existingInvariants: params.verificationCase.invariants,
    existingCode,
  });
  
  return {
    source: tlaSource,
    variables: typedVariables,
    inferredInvariants,
    generationMethod: "llm_assisted",
  };
}

async function llmGenerateTlaModule(params: {
  scenarioKind: VerifyFormalScenarioKind;
  variables: TlaVariable[];
  naturalLanguage: string;
  inferredInvariants: string[];
  existingInvariants: string[];
  existingCode: Map<string, string>;
}): Promise<string> {
  const systemPrompt = `You are an expert TLA+ specifier. Generate a TLA+ module for the given coordination scenario.

RULES:
- Use the variables provided — do not invent new ones
- Express invariants as TLA+ formulas using []
- Express liveness with <> or ~[]
- Keep the spec minimal — focus on the coordination logic, not full system behavior
- Use INSTANCE statements to import standard modules (Sequences, FiniteSets)
- Add meaningful comments explaining each invariant

Output ONLY the TLA+ module — no markdown, no explanation.`;

  const userPrompt = `
SCENARIO: ${params.scenarioKind}
DESCRIPTION: ${params.naturalLanguage}

VARIABLES (with types):
${params.variables.map((v) => `${v.name}: ${JSON.stringify(v.type)}`).join("\n")}

ALREADY-INFERRED INVARIANTS (from code analysis):
${params.inferredInvariants.map((i) => `- ${i}`).join("\n")}

EXPLICIT INVARIANTS FROM VERIFICATION CASE:
${params.existingInvariants.map((i) => `- ${i}`).join("\n")}

RELEVANT CODE (for context):
${formatCodeForPrompt(params.existingCode)}

Generate the TLA+ module:`;

  const response = await callLLM({
    model: params.model ?? "claude-opus-4",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.3,  // Low temperature for deterministic output
  });

  return stripMarkdownCodeFences(response.content);
}
```

### Invariant Inference from Code

```typescript
// src/verify/tla-generator/inferrer.ts
export async function inferInvariantsFromCode(
  codeByPath: Map<string, string>,
  scenarioKind: VerifyFormalScenarioKind
): Promise<string[]> {
  const inferred: string[] = [];
  
  for (const [path, code] of codeByPath) {
    // Pattern: FIFO queue operations
    if (code.includes("enqueue") && code.includes("dequeue")) {
      inferred.push("Queue depth >= 0");
      inferred.push("No event is dequeued before being enqueued");
      
      // Check for race condition patterns
      if (code.includes("concurrent") || code.includes("lock")) {
        inferred.push("Dequeuing from empty queue blocks or returns null");
      }
    }
    
    // Pattern: Token bucket rate limiter
    if (code.includes("acquireToken") && code.includes("releaseToken")) {
      inferred.push("Token count never negative");
      inferred.push("No agent exceeds burst limit");
      inferred.push("Tokens are released in the same quantity acquired");
    }
    
    // Pattern: Ownership transfer
    if (code.includes("claimOwnership") && code.includes("releaseOwnership")) {
      inferred.push("At most one agent owns a resource at any time");
      inferred.push("An agent cannot claim ownership it already has");
      inferred.push("Ownership transfer is atomic");
    }
    
    // Pattern: Distributed counter
    if (code.match(/counter\s*\+=/ ) && code.includes("atomic")) {
      inferred.push("Counter increments are not lost under concurrency");
      inferred.push("Counter value equals sum of all increments");
    }
    
    // Pattern: Retry loop
    if (code.includes("retry") && code.includes("maxAttempts")) {
      inferred.push("Retry loop terminates after maxAttempts");
      inferred.push("No infinite retry under permanent failure");
    }
  }
  
  // Filter out duplicates and generic statements
  return [...new Set(inferred)].filter((i) => !isGenericStatement(i));
}

function isGenericStatement(invariant: string): boolean {
  const generic = [
    "true",
    "always true",
    "nothing bad happens",
  ];
  return generic.some((g) => invariant.toLowerCase().includes(g.toLowerCase()));
}
```

## Component 2: TLA+ Validation Before TLC

### Syntactic Validation (Parse Check)

```typescript
// src/verify/tla-validator/parser.ts
import { parse } from "@tla-tools/tla-parser";  // Hypothetical TLA+ parser

export interface ParseResult {
  valid: boolean;
  errors: TlaParseError[];
  ast?: TlaAST;
}

export interface TlaParseError {
  line: number;
  column: number;
  message: string;
  code: string;
}

export function parseTLA(source: string): ParseResult {
  try {
    const ast = parse(source);
    return { valid: true, errors: [], ast };
  } catch (error) {
    if (error instanceof TlaSyntaxError) {
      return {
        valid: false,
        errors: [{
          line: error.line,
          column: error.column,
          message: error.message,
          code: "TLA_SYNTAX_ERROR",
        }],
      };
    }
    return {
      valid: false,
      errors: [{
        line: 0,
        column: 0,
        message: `Unknown parse error: ${error}`,
        code: "UNKNOWN_PARSE_ERROR",
      }],
    };
  }
}
```

### Type and Scope Checking

```typescript
// src/verify/tla-validator/type-checker.ts
export interface TypeCheckResult {
  valid: boolean;
  errors: TypeError[];
  warnings: TypeWarning[];
}

export interface TypeError {
  location: string;
  message: string;
  code: "UNDEFINED_VARIABLE" | "TYPE_MISMATCH" | "MISSING_INSTANCE" | "INVALID_OPERATOR";
}

export function typeCheckTLA(
  ast: TlaAST,
  knownVariables: TlaVariable[]
): TypeCheckResult {
  const errors: TypeError[] = [];
  const warnings: TypeWarning[] = [];
  
  const variableScope = new Map<string, TlaType>();
  for (const v of knownVariables) {
    variableScope.set(v.name, v.type);
  }
  
  // Check all variable references are defined
  for (const node of ast.variableReferences) {
    if (!variableScope.has(node.name)) {
      errors.push({
        location: `line ${node.line}`,
        message: `Undefined variable: ${node.name}`,
        code: "UNDEFINED_VARIABLE",
      });
    }
  }
  
  // Check operator arities
  for (const op of ast.operatorApplications) {
    const arity = getOperatorArity(op.name);
    if (op.arguments.length !== arity) {
      errors.push({
        location: `line ${op.line}`,
        message: `Operator ${op.name} expects ${arity} arguments, got ${op.arguments.length}`,
        code: "TYPE_MISMATCH",
      });
    }
  }
  
  // Check fairness constraints are only on external actions
  for (const fairness of ast.fairnessConstraints) {
    if (!isExternalAction(fairness.action, ast)) {
      warnings.push({
        location: `line ${fairness.line}`,
        message: `Fairness constraint on internal action may cause spurious counterexamples`,
      });
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
```

### Linter for Common Anti-Patterns

```typescript
// src/verify/tla-validator/linter.ts
export interface LintResult {
  issues: LintIssue[];
  score: number;  // 0-100
}

export interface LintIssue {
  severity: "error" | "warning" | "info";
  rule: string;
  location: string;
  message: string;
  suggestion?: string;
}

const LINT_RULES = [
  {
    name: "no_naked existential",
    pattern: /\byour\b/gi,  // "your" in TLA+ is almost always wrong
    message: "Avoid existential quantifier over 'your' — use a named variable",
    severity: "error",
  },
  {
    name: "invariant always true",
    pattern: /^TRUE$/m,
    message: "Invariant is trivially true — remove or strengthen it",
    severity: "warning",
  },
  {
    name: "missing fairness",
    check: (ast: TlaAST) => {
      const hasExternalActions = ast.actions.some((a) => a.isExternal);
      const hasFairness = ast.fairnessConstraints.length > 0;
      return hasExternalActions && !hasFairness;
    },
    message: "Spec has external actions but no fairness constraints — liveness may not hold",
    severity: "warning",
  },
  {
    name: "state explosion risk",
    check: (ast: TlaAST) => {
      const variableCount = ast.variables.length;
      const setCardinalities = ast.variables
        .filter((v) => v.type.kind === "set")
        .map((v) => v.cardinality);
      const totalStates = variableCount > 0
        ? setCardinalities.reduce((a, b) => a * b, 1)
        : 0;
      return totalStates > 1_000_000;
    },
    message: "State space may exceed 1M states — consider symmetry reduction or state limiting",
    severity: "info",
  },
];

export function lintTLA(ast: TlaAST): LintResult {
  const issues: LintIssue[] = [];
  
  for (const rule of LINT_RULES) {
    if (rule.pattern) {
      // Simple regex pattern check
      const matches = ast.rawSource.matchAll(new RegExp(rule.pattern.source, rule.pattern.flags));
      for (const match of matches) {
        issues.push({
          severity: rule.severity,
          rule: rule.name,
          location: `offset ${match.index}`,
          message: rule.message,
        });
      }
    } else if (rule.check) {
      if (rule.check(ast)) {
        issues.push({
          severity: rule.severity,
          rule: rule.name,
          location: "module",
          message: rule.message,
        });
      }
    }
  }
  
  const errorCount = issues.filter((i) => i.severity === "error").length;
  const score = Math.max(0, 100 - (errorCount * 20));
  
  return { issues, score };
}
```

### Validation Pipeline

```typescript
// src/verify/tla-validator/validate.ts
export async function validateBeforeTLC(params: {
  source: string;
  variables: TlaVariable[];
}): Promise<ValidationResult> {
  
  // Step 1: Parse
  const parseResult = parseTLA(params.source);
  if (!parseResult.valid) {
    return {
      readyForTLC: false,
      stage: "parse",
      errors: parseResult.errors,
      suggestion: "Fix TLA+ syntax errors before running TLC",
    };
  }
  
  // Step 2: Type check
  const typeResult = typeCheckTLA(parseResult.ast!, params.variables);
  if (!typeResult.valid) {
    return {
      readyForTLC: false,
      stage: "type_check",
      errors: typeResult.errors,
      warnings: typeResult.warnings,
      suggestion: "Fix type errors before running TLC",
    };
  }
  
  // Step 3: Lint
  const lintResult = lintTLA(parseResult.ast!);
  const hasErrors = lintResult.issues.some((i) => i.severity === "error");
  
  if (hasErrors) {
    return {
      readyForTLC: false,
      stage: "lint",
      errors: lintResult.issues.filter((i) => i.severity === "error"),
      warnings: [
        ...lintResult.issues.filter((i) => i.severity === "warning"),
        ...typeResult.warnings,
      ],
      suggestion: "Fix lint errors before running TLC",
      lintScore: lintResult.score,
    };
  }
  
  return {
    readyForTLC: true,
    stage: "validated",
    warnings: [
      ...lintResult.issues.filter((i) => i.severity === "warning"),
      ...typeResult.warnings,
    ],
    lintScore: lintResult.score,
  };
}
```

## Component 3: Smart TLC Execution

### State Space Explosion Control

```typescript
// src/verify/tlc-runner/config.ts
export interface TLCConfig {
  spec: string;
  config: {
    SPECIFICATION: string;
    INVARIANTS: string[];
    CONSTANTS?: Record<string, string>;
    VIEW?: string;  // Symmetry reduction view
    DEADLOCK?: boolean;
    WORKERS?: number;
    MAXSTATEQUEUE?: number;      // Stop exploring at N states in queue
    MAXDEPTH?: number;           // Max actions from initial state
    CHECK_DEADLOCK?: boolean;
    GENERATE_TRACES?: boolean;
    SNAPSHOT_INTERVAL?: number;
  };
}

export function buildTLCConfig(params: {
  specName: string;
  invariants: string[];
  variables: TlaVariable[];
  options: {
    workers?: number;
    maxStateQueueDepth?: number;
    maxDepth?: number;
    enableSymmetryReduction?: boolean;
    snapshotInterval?: number;
  };
}): TLCConfig {
  const workers = params.options.workers ?? Math.min(4, os.cpus().length);
  const maxStateQueueDepth = params.options.maxStateQueueDepth ?? 1000;
  const maxDepth = params.options.maxDepth ?? 500;
  
  return {
    spec: specName,
    config: {
      SPECIFICATION: specName,
      INVARIANTS: params.invariants,
      WORKERS: workers,
      DEADLOCK: true,
      CHECK_DEADLOCK: false,  // Disable if model has intentional deadlock states
      MAXSTATEQUEUE: maxStateQueueDepth,
      MAXDEPTH: maxDepth,
      GENERATE_TRACES: true,
      SNAPSHOT_INTERVAL: params.options.snapshotInterval ?? 500,
    },
  };
}
```

### Running TLC

```typescript
// src/verify/tlc-runner/runner.ts
export interface TLCResult {
  status: VerifyTlcStatus;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  trace?: TLCTrace;
  statistics?: TLCStatistics;
  durationMs: number;
  error?: string;
}

export interface TLCTrace {
  states: TLCState[];
  errorState?: TLCState;
  invariantViolated: string;
  depth: number;
}

export interface TLCState {
  name: string;
  variables: Record<string, string>;
  violatedInvariant?: string;
}

export async function runTLC(params: {
  specSource: string;
  specPath: string;
  config: TLCConfig;
  timeoutMs?: number;
}): Promise<TLCResult> {
  const startTime = Date.now();
  
  // Write spec to disk
  await writeFile(params.specPath, params.specSource);
  
  // Write TLC config
  const configPath = params.specPath.replace(".tla", ".cfg");
  await writeFile(configPath, formatTLCConfig(params.config));
  
  // Spawn TLC
  const tlcJarPath = process.env.FORGE_TLC_JAR_PATH ?? "tlc.jar";
  const args = [
    "-jar", tlcJarPath,
    "-specification", params.config.spec,
    "-config", configPath,
    "-workers", String(params.config.config.WORKERS),
    "-noFinalStateQueueDump",
  ];
  
  const child = spawn("java", args, {
    stdio: ["pipe", "pipe", "pipe"],
    timeout: params.timeoutMs,
  });
  
  let stdout = "";
  let stderr = "";
  
  child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
  child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
  
  const exitCode = await new Promise<number>((resolve, reject) => {
    child.on("close", resolve);
    child.on("error", reject);
    setTimeout(() => {
      child.kill();
      reject(new Error("TLC timed out"));
    }, params.timeoutMs ?? 600_000); // 10 min default
  });
  
  const durationMs = Date.now() - startTime;
  
  return parseTLCOutput({
    stdout,
    stderr,
    exitCode,
    durationMs,
  });
}
```

## Component 4: Counterexample Explanation

This is where the LLM earns its keep — turning incomprehensible TLC traces into actionable explanations:

```typescript
// src/verify/tlc-runner/result-parser.ts
export function parseTLCOutput(params: {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  durationMs: number;
}): TLCResult {
  // Parse the human-readable stdout for results
  const lines = params.stdout.split("\n");
  
  let status: VerifyTlcStatus = "not_run";
  let trace: TLCTrace | undefined;
  let error: string | undefined;
  
  if (params.exitCode === 0) {
    status = "passed";
  } else if (params.exitCode === 12) {
    status = "failed";
    trace = extractTraceFromOutput(lines);
    const invariant = extractViolatedInvariant(lines);
    trace!.invariantViolated = invariant;
  } else if (params.exitCode === 13) {
    status = "errored";
    error = extractErrorMessage(lines);
  } else if (params.exitCode === 14) {
    status = "inconclusive";
    error = "TLC ran out of resources";
  } else if (params.exitCode === 255) {
    status = "invalid_spec";
    error = extractErrorMessage(lines);
  }
  
  return {
    status,
    exitCode: params.exitCode,
    stdout: params.stdout,
    stderr: params.stderr,
    trace,
    durationMs: params.durationMs,
    error,
  };
}
```

### LLM-Powered Trace Explanation

```typescript
// src/verify/tlc-runner/explainer.ts
export async function explainTrace(params: {
  trace: TLCTrace;
  specSource: string;
  invariantViolated: string;
  model: string;
}): Promise<TraceExplanation> {
  
  const systemPrompt = `You are an expert in distributed systems debugging. A TLA+ model checker (TLC) found an invariant violation. Your job is to explain the counterexample trace in plain English.

RULES:
- Explain WHAT happened at each step, not just what the state variables were
- Identify the ROOT CAUSE — what was the first event that set off the violation
- Explain WHY the invariant was violated given the trace
- Be specific — use the actual variable names and values from the trace
- Do not be vague — avoid phrases like "a race condition occurred"
- If multiple agents are involved, clearly identify which agent did what

Format your response as:
EXPLANATION: [plain English explanation of what happened]
ROOT CAUSE: [one sentence identifying the root cause]
SUGGESTED FIX: [one sentence suggesting how to fix the underlying issue]`;

  const userPrompt = `
INVARIANT VIOLATED: ${params.invariantViolated}

TLA+ SPEC:
${params.specSource}

TRACE:
${formatTraceForPrompt(params.trace)}

Provide your explanation:`;

  const response = await callLLM({
    model: params.model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.4,
  });

  return parseTraceExplanation(response.content);
}

function formatTraceForPrompt(trace: TLCTrace): string {
  return trace.states.map((state, i) => {
    const vars = Object.entries(state.variables)
      .map(([k, v]) => `  ${k} = ${v}`)
      .join("\n");
    return `Step ${i}:\n${vars}`;
  }).join("\n\n");
}

export interface TraceExplanation {
  explanation: string;
  rootCause: string;
  suggestedFix: string;
  confidence: "high" | "medium" | "low";
}
```

**Example output:**

```
INVARIANT VIOLATED: queue_depth >= 0

TRACE:
Step 0:
  queue = {}
  processing = {}

Step 1:
  queue = {E1}
  processing = {}

Step 2:
  queue = {E1, E2}
  processing = {E1}

Step 3:
  queue = {E2}
  processing = {E1}

Step 4 (ERROR):
  queue = {}
  processing = {}   <-- queue underflow: E2 was lost when E1 completed

EXPLANATION: At Step 4, the error_handler attempted to drain the queue
when processing=E1 completed, but concurrent with the drain, ingestion-agent
was adding E2 to the queue. The drain operation grabbed the wrong iterator
state and skipped E2 entirely, removing only E1 from the queue and leaving
E2 orphaned in the processing set.

ROOT CAUSE: The drain operation in error_handler uses a stale iterator
snapshot taken before E2 was enqueued, causing E2 to be silently dropped.

SUGGESTED FIX: Add a lock around the queue drain + enqueue sequence, or
use an atomic swap operation instead of an iterator-based drain.
```

## Putting It Together: Enhanced Formal Lane

```typescript
// src/verify/formal.ts (enhanced)
export async function buildVerifyFormalExecutionEnhanced(params: {
  foundation: VerifyFoundationResult;
  model: VerifyVerificationModel;
  outputRoot: string;
  currentWorkingDirectory: string;
}): Promise<VerifyFormalExecutionResult> {
  const cases: VerifyVerificationCase[] = [];
  const formalVerification: VerifyFormalVerification[] = [];
  const allFindings: string[] = [];
  const allConstraints: string[] = [];

  for (const target of params.model.targets) {
    // Skip if target doesn't qualify for formal lane
    if (!meetsFormalEntryCriteria(target)) {
      continue;
    }

    for (const verificationCase of target.verification_cases) {
      // Step 1: Generate TLA+ spec (LLM-assisted)
      const generated = await generateTlaSpec({
        verificationTarget: target,
        verificationCase,
        context: await loadContext(params.foundation),
      });

      // Step 2: Validate before TLC
      const validation = await validateBeforeTLC({
        source: generated.source,
        variables: generated.variables,
      });

      if (!validation.readyForTLC) {
        cases.push({
          ...verificationCase,
          status: "invalid_spec",
          summary: validation.suggestion ?? "Spec failed validation",
          errors: validation.errors,
        });
        continue;
      }

      // Step 3: Run TLC
      const tlcResult = await runTLC({
        specSource: generated.source,
        specPath: `${params.outputRoot}/formal/${verificationCase.id}.tla`,
        config: buildTLCConfig({ ... }),
        timeoutMs: 300_000, // 5 min per case
      });

      // Step 4: Parse and explain result
      if (tlcResult.status === "failed" && tlcResult.trace) {
        const explanation = await explainTrace({
          trace: tlcResult.trace,
          specSource: generated.source,
          invariantViolated: tlcResult.trace.invariantViolated,
        });

        cases.push({
          ...verificationCase,
          status: "failed",
          summary: explanation.rootCause,
          explanation: explanation.explanation,
          suggestedFix: explanation.suggestedFix,
          trace: tlcResult.trace,
        });

        allFindings.push(explanation.rootCause);
        allConstraints.push(`Fix: ${explanation.suggestedFix}`);
      } else {
        cases.push({
          ...verificationCase,
          status: tlcResult.status,
          summary: `TLC ${tlcResult.status}: ${verificationCase.summary}`,
        });
      }
    }
  }

  return { cases, formalVerification, findings: allFindings, constraints: allConstraints };
}
```

## Why This Matters

The current template-based TLA+ generation works for well-defined coordination patterns (retry, ownership, simple serialization). But real systems have:

- **Typed state** — queue depths, token counts, version vectors
- **Conditional transitions** — "advance only if buffer has room"
- **Temporal properties** — "every request eventually gets a response"
- **Complex invariants** — "sum of all agents' allocations never exceeds total capacity"

The LLM-assisted generation can infer typed variables and temporal properties from the actual code being analyzed. The validation pipeline catches bad specs before they waste TLC cycles. And the explanation system turns cold TLC output into actionable engineering feedback.

**The goal:** Make formal verification accessible to engineers who don't know TLA+ intimately — they get the formal verification **output** (the bug caught, the fix suggested) without needing to write the TLA+ themselves.

## Implementation Checklist

### TLA+ Generator
- [ ] Define `TlaTemplate`, `TlaVariable`, `TlaType` interfaces
- [ ] Implement `buildTypedVariables()` from verification model
- [ ] Implement `inferInvariantsFromCode()` with code pattern detection
- [ ] Implement `llmGenerateTlaModule()` with structured prompt
- [ ] Implement temporal property generation (`always`, `eventually`, `until`)
- [ ] Implement fairness constraint generation
- [ ] Add base templates for all 11 scenario kinds

### TLA+ Validator
- [ ] Implement `parseTLA()` using a TLA+ parser
- [ ] Implement `typeCheckTLA()` — variable scope, operator arity
- [ ] Implement `lintTLA()` — anti-pattern detection, state explosion warning
- [ ] Implement `validateBeforeTLC()` pipeline
- [ ] Add validation results to verification case output

### TLC Runner
- [ ] Implement `buildTLCConfig()` with explosion control options
- [ ] Implement `runTLC()` with timeout and resource limits
- [ ] Implement `parseTLCOutput()` — parse passed/failed/errored/inconclusive
- [ ] Implement trace extraction from TLC stdout
- [ ] Add snapshot/resume support for long-running verifications
- [ ] Add `--tlc-timeout` CLI flag

### Counterexample Explainer
- [ ] Implement `formatTraceForPrompt()` to humanize TLC traces
- [ ] Implement `explainTrace()` with structured output parsing
- [ ] Implement `TraceExplanation` with explanation, rootCause, suggestedFix
- [ ] Add confidence scoring to explanations
- [ ] Integrate explanations into verification report

### Integration
- [ ] Update `buildVerifyFormalExecution()` to use enhanced pipeline
- [ ] Update verification artifact to include trace explanations
- [ ] Update verification report to surface explanation to users
- [ ] Add `FORGE_TLC_TIMEOUT` env var
- [ ] Add `FORGE_TLC_MAX_STATES` env var
- [ ] Add `FORGE_TLC_WORKERS` env var
- [ ] Write tests for each component
- [ ] Test with real coordination scenarios (queue, rate limiter, ownership transfer)
- [ ] Document enhanced formal verification in docs/forge_step3_formal.md
