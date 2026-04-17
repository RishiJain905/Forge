// Workstream execution states
export type ExecuteWorkstreamState = "queued" | "running" | "completed" | "failed" | "blocked";

// A single workstream's execution state
export interface ExecuteWorkstream {
  workstreamId: string;
  title: string;
  state: ExecuteWorkstreamState;
  startedAt?: string;       // ISO timestamp when marked running
  completedAt?: string;     // ISO timestamp when marked completed
  failedAt?: string;        // ISO timestamp when marked failed
  error?: string;           // error message if failed
  mergeOrderViolations?: string[];  // list of prerequisite workstream ids that blocked completion
  aiModelUsed?: string;       // e.g. "openai/gpt-4o"
  aiPromptHash?: string;       // SHA256 of the prompt sent
  aiChangesCount?: number;     // number of files changed
  aiLinesAdded?: number;       // total lines added
  aiLinesRemoved?: number;     // total lines removed
}

// AI execution result for a single workstream
export interface AIExecutionResult {
  workstreamId: string;
  success: boolean;
  changes: {
    path: string;
    action: "create" | "modify" | "delete";
    linesAdded: number;
    linesRemoved: number;
  }[];
  modelUsed: string;
  error?: string;
}

// The execute step artifact
export interface ExecuteArtifact {
  schemaVersion: string;
  forgeVersion: string;
  createdAt: string;
  splitSource: string;           // path to split.json
  workstreams: ExecuteWorkstream[];
  mergeOrderGates: {
    workstreamId: string;
    prerequisites: string[];      // workstream ids that must merge first
    prerequisitesMet: boolean;
  }[];
  summary: {
    total: number;
    queued: number;
    running: number;
    completed: number;
    failed: number;
    blocked: number;
  };
  transitions: StateTransition[];
}

// State transition event for the log
export interface StateTransition {
  workstreamId: string;
  from: ExecuteWorkstreamState;
  to: ExecuteWorkstreamState;
  timestamp: string;
  reason?: string;
}

// Options for the execute command
export interface ExecuteCommandOptions {
  repo?: string;
  outputDir?: string;
  force?: boolean;  // restart even with existing execute.json
  resume?: boolean; // continue from existing execute.json state
  auto?: boolean;   // auto-execute all unblocked workstreams
}

// Result of the execute command
export interface ExecuteCommandResult {
  status: "ready" | "failed";
  summary: string;
  artifactPath: string;
  reportPath?: string;
  outputRoot: string;
  exitCode?: number;
  failure?: {
    code: string;
    message: string;
  };
}
