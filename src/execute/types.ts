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
}

// Result of the execute command
export interface ExecuteCommandResult {
  status: "ready" | "failed";
  summary: string;
  artifactPath: string;
  reportPath?: string;
  outputRoot: string;
  failure?: {
    code: string;
    message: string;
  };
}
