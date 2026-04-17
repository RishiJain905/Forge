// Workstream execution states
export type ExecuteWorkstreamState = "queued" | "running" | "completed" | "failed" | "blocked";

// A single change made by the AI
export interface ChangeMade {
  file: string;                   // Absolute path to the file
  action: 'create' | 'modify' | 'delete';
  diffHash: string;               // SHA-256 of the diff
  linesAdded: number;
  linesRemoved: number;
  beforeHash?: string;           // SHA-256 of file before change
  afterHash?: string | null;      // SHA-256 of file after change (or null if deleted)
  error?: string;                 // If the write failed, the error
}

// AI model information for artifact-level config
export interface AIModelInfo {
  provider: string;              // e.g., "openai", "anthropic", "google"
  modelName: string;             // e.g., "gpt-4o", "claude-3-5-sonnet-4"
  baseUrl?: string;              // Optional base URL for the API
}

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
  aiModelUsed?: string;           // e.g. "openai/gpt-4o"
  aiPromptHash?: string;          // SHA256 of the prompt sent
  aiProvider?: string;            // e.g. "openai", "anthropic", "google"
  changesMade?: ChangeMade[];     // Actual file changes the AI made
  aiExecutionDurationMs?: number; // How long the AI call took
  aiChangesCount?: number;       // number of files changed
  aiLinesAdded?: number;          // total lines added
  aiLinesRemoved?: number;       // total lines removed
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

// Summary statistics for execute artifact
export interface ExecuteArtifactSummary {
  total: number;
  queued: number;
  running: number;
  completed: number;
  failed: number;
  blocked: number;
  aiExecutedCount?: number;      // How many workstreams were AI-executed
  totalChangesMade?: number;     // Total file changes across all workstreams
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
  summary: ExecuteArtifactSummary;
  transitions: StateTransition[];
  aiConfig?: AIModelInfo;        // AI configuration used for execution
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
