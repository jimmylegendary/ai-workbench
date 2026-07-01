import type {
  ChakraTrace,
  HwConfigRef,
  SimGranularity,
  SimMetric,
} from "../schemas/simulation-pipeline.js";

/**
 * Serving-tool ports (the C2 pipeline seam, ADR-0005 + workload-serving-trace-plan §B).
 *
 * The serving pipeline stacks four tools, each owned by one port:
 *   vLLM (real serving) / LLMServingSim (simulated serving) → syntorch (below-torch
 *   capture → Chakra ET exporter) → ASTRA-sim (distributed-system timing).
 * They are NOT alternatives — they compose. These interfaces are REST-shaped
 * (a `baseUrl` from env, an async call) but transport-agnostic: the app depends
 * only on the interface, never on a wire format. The concrete REST clients are
 * [AI] runbook work (phase-4-trace-pipeline); the mock stubs in
 * features/serving/model/mockTools.ts satisfy them for the local demo.
 *
 * Every port is HW-schema-aware: it takes a `HwConfigRef` (the Canvas-3 selection
 * + its denormalised capability summary) so one HW model parameterizes all tools
 * (ADR-0005 §4 — one HW model, two consumers: syntorch compute/memory, ASTRA-sim
 * network).
 */

/** Common shape shared by every serving tool port. */
export interface ToolPort {
  /** Human name for logs (e.g. "vLLM", "syntorch"). */
  readonly name: string;
  /** REST base URL (from env). Undefined for mock stubs. */
  readonly baseUrl?: string;
}

/**
 * One server/LLM call to drive through the pipeline — the serving-relevant subset
 * of a workload turn's llm/server step (ADR-0005 §6: the real axis's server calls
 * feed the synthetic/sim serving pipeline). Mirrors the OTel-joined trace fields
 * that matter for serving (prompt/output tokens, prefix-cache hash blocks, chunked
 * prefill size, KV-tier residency).
 */
export interface ServingCall {
  /** Step name / label, for logs + metric provenance. */
  label?: string;
  /** Prompt (prefill) token count — drives prefill compute + KV footprint. */
  promptTokens: number;
  /** Decode/output token count (defaults derived when absent). */
  outTokens?: number;
  /** #prefix-cache hash blocks hit (lmcache) — reduces prefill work. */
  hashBlocks?: number;
  /** Chunked-prefill chunk size, if the engine used it. */
  chunkSize?: number;
  /** KV-cache residency by memory tier (blocks/bytes) — HBM/DRAM/SSD/MISS. */
  tierTotals?: { HBM?: number; DRAM?: number; SSD?: number; MISS?: number };
}

/**
 * Request-level serving dynamics a serving engine reports (vLLM real / LLMServingSim
 * simulated). These are the coarse, request-granularity numbers — the op DAG comes
 * from syntorch, the timing from ASTRA-sim.
 */
export interface ServingObservation {
  /** Time-to-first-token (ms). */
  ttftMs: number;
  /** Sustained decode throughput (tokens/s). */
  throughputTokS: number;
  /** Aggregate accelerator utilisation (0–100). */
  gpuUtilPct: number;
  /** Total bytes moved across the memory hierarchy for this call. */
  bytesMoved: number;
}

/** ASTRA-sim's output for one Chakra trace — a SimResult-ish metric bundle. */
export interface AstraSimResult {
  /** Timed metrics on the `sim` evidence axis. */
  metrics: SimMetric[];
  /** Human log lines emitted while simulating (optional). */
  logs?: string[];
}

/**
 * vLLM — the REAL serving engine. Under a thin vLLM-shaped harness it also drives
 * the synthetic axis's forward path (ADR-0005 §7, Axis B).
 */
export interface VllmPort extends ToolPort {
  serve(input: ServingCall, hw: HwConfigRef): Promise<ServingObservation>;
}

/**
 * LLMServingSim — the SIMULATED serving engine (embeds a modified ASTRA-sim;
 * ADR-0005 §7, Axis A). Same call surface as vLLM so they are swappable.
 */
export interface LlmServingSimPort extends ToolPort {
  serve(input: ServingCall, hw: HwConfigRef): Promise<ServingObservation>;
}

/**
 * syntorch — the below-torch capture + Chakra ET exporter. Captures the sub-torch
 * op stream for one call and emits a Chakra trace whose fill depends on the run
 * granularity (L0/L1 torch-level op DAG; L2 adds the tiling side-channel per
 * ADR-0009). syntorch populates num_ops / tensor_size / comm_size from first
 * principles against the HW schema (synthetic, not a measured GPU run).
 */
export interface SyntorchPort extends ToolPort {
  captureChakra(
    input: ServingCall,
    hw: HwConfigRef,
    granularity: SimGranularity,
  ): Promise<ChakraTrace>;
}

/**
 * ASTRA-sim — times a Chakra ET against the HW's system/network config (analytical
 * backend by default, ADR-0005 §4). Consumes the trace via the reused et_feeder;
 * owns network timing only.
 */
export interface AstraSimPort extends ToolPort {
  simulate(chakra: ChakraTrace, hw: HwConfigRef): Promise<AstraSimResult>;
}
