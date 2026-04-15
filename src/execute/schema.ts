import { z } from "zod";
import type {
  ExecuteArtifact,
  ExecuteWorkstream,
  ExecuteWorkstreamState,
  StateTransition,
} from "./types.js";

export const ExecuteWorkstreamStateSchema = z.enum([
  "queued",
  "running",
  "completed",
  "failed",
  "blocked",
]);

export const ExecuteWorkstreamSchema = z.object({
  workstreamId: z.string(),
  title: z.string(),
  state: ExecuteWorkstreamStateSchema,
  startedAt: z.string().optional(),
  completedAt: z.string().optional(),
  failedAt: z.string().optional(),
  error: z.string().optional(),
  mergeOrderViolations: z.array(z.string()).optional(),
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

export const ExecuteArtifactSchema = z
  .object({
    schemaVersion: z.string(),
    forgeVersion: z.string(),
    createdAt: z.string(),
    splitSource: z.string(),
    workstreams: z.array(ExecuteWorkstreamSchema),
    mergeOrderGates: z.array(MergeOrderGateSchema),
    summary: z.object({
      total: z.number(),
      queued: z.number(),
      running: z.number(),
      completed: z.number(),
      failed: z.number(),
      blocked: z.number(),
    }),
    transitions: z.array(StateTransitionSchema),
  })
  .strict();

export function validateExecuteArtifact(artifact: unknown): ExecuteArtifact {
  return ExecuteArtifactSchema.parse(artifact) as ExecuteArtifact;
}
