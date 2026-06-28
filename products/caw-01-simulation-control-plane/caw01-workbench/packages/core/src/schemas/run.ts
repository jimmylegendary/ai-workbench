import { z } from "zod";
import { Boundary } from "./experiment.js";

export const RunStatus = z.enum([
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
]);
export type RunStatus = z.infer<typeof RunStatus>;

export const EvidenceAxis = z.enum(["real", "synthetic", "sim"]);
export type EvidenceAxis = z.infer<typeof EvidenceAxis>;

export const FillLevel = z.enum(["L0", "L1", "L2"]);
export type FillLevel = z.infer<typeof FillLevel>;

/**
 * SimulationRun row = METADATA + POINTERS only (ADR-0008 §3).
 * The heavy IR / trace bytes live in the engine/artifact store and are
 * referenced by ir_uri / artifact_uri — never stored in Supabase.
 */
export const SimulationRun = z.object({
  id: z.string().uuid(),
  experiment_id: z.string().uuid(),
  config_id: z.string().uuid().nullable(),
  status: RunStatus,
  started_at: z.string().nullable(),
  finished_at: z.string().nullable(),
  ir_uri: z.string().nullable(), // pointer → MemoryAnnotatedIR blob
  artifact_uri: z.string().nullable(), // pointer → trace blobs
  projection: z.record(z.unknown()).nullable(), // small comparable readout
  created_at: z.string(),
  created_by: z.string().uuid(),
});
export type SimulationRun = z.infer<typeof SimulationRun>;

export const Metric = z.object({
  id: z.string().uuid(),
  run_id: z.string().uuid(),
  name: z.string(),
  value: z.number(),
  unit: z.string().nullable(),
});
export type Metric = z.infer<typeof Metric>;

export const Evidence = z.object({
  id: z.string().uuid(),
  claim_id: z.string().uuid(),
  kind: z.enum(["run", "measurement", "artifact"]),
  ref: z.string(), // run_id or uri — never free text
  trust_level: z.number().int().min(0).max(3),
  boundary: Boundary,
});
export type Evidence = z.infer<typeof Evidence>;

/** Live per-axis status streamed over SSE (not persisted as a table). */
export const AxisStatus = z.object({
  axis: EvidenceAxis,
  status: RunStatus,
  progress: z.number().min(0).max(1).optional(),
});
export type AxisStatus = z.infer<typeof AxisStatus>;

export const StartRunInput = z.object({
  experiment_id: z.string().uuid(),
  config_id: z.string().uuid().optional(),
});
export type StartRunInput = z.infer<typeof StartRunInput>;
