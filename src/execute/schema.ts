import { z } from "zod";
import type {
  ExecuteArtifact,
  ExecuteWorkstream,
  ExecuteWorkstreamState,
  StateTransition,
  ChangeMade,
  AIModelInfo,
  ExecuteArtifactSummary,
} from "./types.js";

export const ExecuteWorkstreamStateSchema = z.enum([
  "queued",
  "running",
  "completed",
  "failed",
  "blocked",
]);

export const ChangeMadeSchema = z.object({
  file: z.string(),
  action: z.enum(['create', 'modify', 'delete']),
  diffHash: z.string(),
  linesAdded: z.number().int().nonnegative(),
  linesRemoved: z.number().int().nonnegative(),
  beforeHash: z.string().optional(),
  afterHash: z.string().optional().nullable(),
  error: z.string().optional(),
}).strict();

export const AIModelInfoSchema = z.object({
  provider: z.string(),
  modelName: z.string(),
  baseUrl: z.string().optional(),
}).strict();

export const ExecuteWorkstreamSchema = z.object({
  workstreamId: z.string(),
  title: z.string(),
  state: ExecuteWorkstreamStateSchema,
  startedAt: z.string().optional(),
  completedAt: z.string().optional(),
  failedAt: z.string().optional(),
  error: z.string().optional(),
  mergeOrderViolations: z.array(z.string()).optional(),
  aiModelUsed: z.string().optional(),
  aiPromptHash: z.string().optional(),
  aiProvider: z.string().optional(),
  changesMade: z.array(ChangeMadeSchema).optional(),
  aiExecutionDurationMs: z.number().optional(),
  aiChangesCount: z.number().optional(),
  aiLinesAdded: z.number().optional(),
  aiLinesRemoved: z.number().optional(),
}).strict();

export const MergeOrderGateSchema = z.object({
  workstreamId: z.string(),
  prerequisites: z.array(z.string()),
  prerequisitesMet: z.boolean(),
}).strict();

export const StateTransitionSchema = z.object({
  workstreamId: z.string(),
  from: ExecuteWorkstreamStateSchema,
  to: ExecuteWorkstreamStateSchema,
  timestamp: z.string(),
  reason: z.string().optional(),
});

export const ExecuteArtifactSummarySchema = z.object({
  total: z.number(),
  queued: z.number(),
  running: z.number(),
  completed: z.number(),
  failed: z.number(),
  blocked: z.number(),
  aiExecutedCount: z.number().int().nonnegative().optional(),
  totalChangesMade: z.number().int().nonnegative().optional(),
});

export const ExecuteArtifactSchema = z
  .object({
    schemaVersion: z.string(),
    forgeVersion: z.string(),
    createdAt: z.string(),
    splitSource: z.string(),
    workstreams: z.array(ExecuteWorkstreamSchema),
    mergeOrderGates: z.array(MergeOrderGateSchema),
    summary: ExecuteArtifactSummarySchema,
    transitions: z.array(StateTransitionSchema),
    aiConfig: AIModelInfoSchema.optional(),
  })
  .strict();

export function validateExecuteArtifact(artifact: unknown): ExecuteArtifact {
  return ExecuteArtifactSchema.parse(artifact) as ExecuteArtifact;
}
