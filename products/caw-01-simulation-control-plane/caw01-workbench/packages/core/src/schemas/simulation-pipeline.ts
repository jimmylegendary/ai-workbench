import { z } from "zod";
import { EvidenceAxis } from "./run.js";

/**
 * Serving-pipeline contracts: the data that flows through
 *   server call → (vLLM│LLMServingSim) → syntorch → Chakra ET → ASTRA-sim.
 * These are the TS types the ToolPorts + orchestrator + mock stubs share
 * (real REST clients are in-company AI runbook work). See
 * design/09-roadmap/workload-serving-trace-plan.md and ADR-0005 / ADR-0009.
 */

/**
 * RUN granularity (UI selector). Distinct from run.ts `FillLevel` (which is IR
 * annotation richness): this selects capture altitude + which simulators run.
 *   L0 = torch-level Chakra, syntorch analytical, no ASTRA-sim (fastest)
 *   L1 = torch-level Chakra → ASTRA-sim (network sim)
 *   L2 = os-level (kernel tiling + memory) → kernel/memory model + ASTRA-sim
 */
export const SimGranularity = z.enum(["L0", "L1", "L2"]);
export type SimGranularity = z.infer<typeof SimGranularity>;

export const SIM_GRANULARITY_INFO: Record<
  SimGranularity,
  { title: string; why: string }
> = {
  L0: { title: "torch · analytical", why: "syntorch analytical from HW schema; no ASTRA-sim — fastest" },
  L1: { title: "torch → ASTRA-sim", why: "torch-level Chakra timed by ASTRA-sim (network)" },
  L2: { title: "os · kernel + memory", why: "kernel tiling + memory model + ASTRA-sim — slowest, richest" },
};

/** How a tool references the Canvas-3 hardware it must be aware of. */
export const HwConfigRef = z.object({
  /** stable part id of the selected C3 node (resolves via c3PartsById). */
  partId: z.string().optional(),
  /** small denormalised capability summary (from hwCapability) for stubs/logging. */
  summary: z.record(z.string(), z.unknown()).optional(),
});
export type HwConfigRef = z.infer<typeof HwConfigRef>;

// ── Chakra ET (subset we model; full proto stays in the engine) ─────────────
export const ChakraNodeType = z.enum(["COMP", "COMM", "MEM"]);
export type ChakraNodeType = z.infer<typeof ChakraNodeType>;

export const ChakraNode = z.object({
  id: z.string(),
  type: ChakraNodeType,
  name: z.string(),
  /** data/ctrl dependency op ids (the DAG edges). */
  dataDeps: z.array(z.string()).default([]),
  numOps: z.number().optional(), // compute
  tensorSize: z.number().optional(), // bytes (IO)
  commType: z.string().optional(), // collective/p2p kind
  commSize: z.number().optional(), // bytes moved
  /** L2 only: op-id ref into the tiling side-channel (ADR-0005/0009). */
  tilingRef: z.string().optional(),
});
export type ChakraNode = z.infer<typeof ChakraNode>;

export const ChakraTrace = z.object({
  rank: z.number().optional(),
  nodes: z.array(ChakraNode),
  meta: z.record(z.string(), z.unknown()).optional(),
});
export type ChakraTrace = z.infer<typeof ChakraTrace>;

// ── Abstracted tiling IR (L2 side-channel, per ADR-0009) ────────────────────
/**
 * Accuracy-preserving repetition folding: cost ONE tile-unit exactly and count
 * how many times the iteration space repeats it; irregular remainders explicit.
 * NOT an instruction-level unroll. Fields permissive (exploration-grade, TBD).
 */
export const AbstractTilingPlan = z.object({
  opId: z.string(),
  /** logical loop dims as symbols, e.g. { M:4096, N:4096, K:4096 }. */
  iterationSpace: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
  /** the repeated tile unit, captured once + how many times it repeats. */
  tileUnit: z
    .object({
      /** tile factors per dim (functions-of-schema resolved to values). */
      tile: z.record(z.string(), z.number()).optional(),
      numOps: z.number().optional(),
      bytesPerTier: z.record(z.string(), z.number()).optional(),
    })
    .optional(),
  repetitionCount: z.number().optional(),
  /** irregular tail/boundary tiles kept explicit (accuracy). */
  remainders: z.array(z.record(z.string(), z.unknown())).optional(),
  /** derived by the kernel/memory cost model (not authored). */
  derived: z
    .object({
      numOps: z.number().optional(),
      bytesMovedPerTier: z.record(z.string(), z.number()).optional(),
      footprintBytes: z.number().optional(),
      occupancy: z.number().optional(),
      kernelTimeUs: z.number().optional(),
    })
    .optional(),
});
export type AbstractTilingPlan = z.infer<typeof AbstractTilingPlan>;

// ── Simulation result (ports/orchestrator output) ───────────────────────────
export const SimMetric = z.object({
  axis: EvidenceAxis, // real | synthetic | sim
  name: z.string(),
  value: z.number(),
  unit: z.string().nullish(),
  /** offset from run start in ms (series x-axis); repo stamps absolute ts. */
  tsOffsetMs: z.number().optional(),
});
export type SimMetric = z.infer<typeof SimMetric>;

export const SimResult = z.object({
  granularity: SimGranularity,
  metrics: z.array(SimMetric),
  logs: z.array(z.string()).default([]),
  /** URIs of heavy artifacts (chakra/ir/trace) — blobs stay out of PG. */
  artifacts: z.record(z.string(), z.string()).optional(),
});
export type SimResult = z.infer<typeof SimResult>;
