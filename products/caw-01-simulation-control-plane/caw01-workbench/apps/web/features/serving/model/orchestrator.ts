import type {
  ChakraTrace,
  HwConfigRef,
  ServingObservation,
  SimGranularity,
  SimMetric,
  SimResult,
} from "@caw/core";
import type { SimLogLevel } from "@/features/simulation/model/fixtures/simlog";
import { useLogStore } from "@/features/simulation/model/logStore";
import {
  mockAstraSim,
  mockLlmServingSim,
  mockSyntorch,
  mockVllm,
} from "./mockTools";

/**
 * Serving-pipeline orchestrator (TASK E) — the C2 seam that turns a workload
 * turn's server/LLM calls into a 3-axis SimResult.
 *
 * It walks the L0/L1/L2 path over the (mock) tool ports and, as it goes, appends
 * human-readable log lines to the live SimLog (features/simulation/model/logStore)
 * so the run is visible in the console strip. It RETURNS a SimResult whose metrics
 * live on the `synthetic` (syntorch analytical, always) and `sim` (LLMServingSim +
 * ASTRA-sim, L1/L2 only) evidence axes — the `real` axis is the OTel workload
 * anchor and is filled by the workload viewer, not here (ADR-0005 §6).
 *
 *   L0 — syntorch capture → syntorch analytical (synthetic axis). No ASTRA-sim.
 *   L1 — L0 + LLMServingSim serving dynamics + ASTRA-sim network timing (sim axis).
 *   L2 — L1 + kernel + memory model (AbstractTilingPlan side-channel) → richer sim.
 *
 * Pure-ish: the only side effect is appending to logStore. The mock tools are
 * deterministic, so the same inputs + HW + granularity always yield the same
 * SimResult. Real REST clients replace the mocks in the [AI] runbook.
 */

/** One server/LLM call the pipeline runs — the serving-relevant contract. */
export interface ServingInput {
  /** Step name / label (for logs + metric provenance). */
  label?: string;
  /** Prompt (prefill) token count. */
  promptTokens: number;
  /** Decode/output token count. */
  outTokens?: number;
  /** #prefix-cache hash blocks hit (lmcache) — trims prefill work. */
  hashBlocks?: number;
  /** Chunked-prefill chunk size, if used. */
  chunkSize?: number;
  /** KV-cache residency by memory tier. */
  tierTotals?: { HBM?: number; DRAM?: number; SSD?: number; MISS?: number };
}

/** Series spacing so per-call samples render as a timeline in Sim Result. */
const STEP_MS = 60_000;

const round1 = (v: number) => Math.round(v * 10) / 10;

/** Map a serving-engine observation onto the shared metric names, at an axis. */
function obsMetrics(
  axis: SimMetric["axis"],
  obs: ServingObservation,
  tsOffsetMs: number,
): SimMetric[] {
  return [
    { axis, name: "ttft_ms", value: round1(obs.ttftMs), unit: "ms", tsOffsetMs },
    { axis, name: "throughput_tok_s", value: Math.round(obs.throughputTokS), unit: "tok/s", tsOffsetMs },
    { axis, name: "gpu_util_pct", value: round1(obs.gpuUtilPct), unit: "%", tsOffsetMs },
    { axis, name: "bytes_moved", value: obs.bytesMoved, unit: "bytes", tsOffsetMs },
  ];
}

/** Count Chakra node types for a compact "chakra: …" log line. */
function nodeSummary(chakra: ChakraTrace): string {
  const by = { COMP: 0, COMM: 0, MEM: 0 };
  for (const n of chakra.nodes) by[n.type] += 1;
  return `${chakra.nodes.length} nodes (${by.COMP} COMP · ${by.COMM} COMM · ${by.MEM} MEM)`;
}

/**
 * Run the serving pipeline over `inputs` on `hw` at `granularity`.
 * Appends log lines to the live SimLog and returns the 3-axis SimResult.
 */
export async function runServingPipeline(
  inputs: ServingInput[],
  hw: HwConfigRef,
  granularity: SimGranularity,
): Promise<SimResult> {
  const store = useLogStore.getState();
  const logs: string[] = [];
  const emit = (level: SimLogLevel, msg: string) => {
    logs.push(msg);
    store.append({ level, msg });
  };

  const hwName =
    typeof hw.summary?.gpuName === "string" ? hw.summary.gpuName : "hw";
  const runsAstra = granularity !== "L0";
  const metrics: SimMetric[] = [];

  emit(
    "info",
    `serving pipeline — ${granularity} · ${inputs.length} call(s) · ${hwName}` +
      (runsAstra ? " · syntorch + ASTRA-sim" : " · syntorch analytical only"),
  );

  for (let i = 0; i < inputs.length; i++) {
    const input = inputs[i];
    const at = i * STEP_MS;
    const label = input.label ?? `call ${i}`;

    // 1. syntorch: below-torch capture → Chakra ET (fill depends on granularity).
    emit("info", `syntorch capture — ${label} (${granularity})`);
    const chakra = await mockSyntorch.captureChakra(input, hw, granularity);
    emit("debug", `chakra: ${nodeSummary(chakra)}`);

    // 2. synthetic axis: vLLM-shaped harness + syntorch analytical cost model.
    const synObs = await mockVllm.serve(input, hw);
    metrics.push(...obsMetrics("synthetic", synObs, at));
    emit(
      "info",
      `synthetic — ttft ${round1(synObs.ttftMs)} ms · ${Math.round(synObs.throughputTokS)} tok/s · ${(synObs.bytesMoved / 1e9).toFixed(2)} GB`,
    );

    // 3. sim axis (L1/L2 only): LLMServingSim dynamics + ASTRA-sim timing.
    if (runsAstra) {
      const simObs = await mockLlmServingSim.serve(input, hw);
      emit(
        "debug",
        `LLMServingSim — ttft ${round1(simObs.ttftMs)} ms · ${Math.round(simObs.throughputTokS)} tok/s`,
      );
      const astra = await mockAstraSim.simulate(chakra, hw);
      astra.logs?.forEach((l) => emit("debug", l));
      metrics.push(...astra.metrics.map((m) => ({ ...m, tsOffsetMs: at })));
    }

    // 4. L2: the kernel/memory tiling side-channel (ADR-0009), read-only IR.
    if (granularity === "L2") {
      const tiling = Array.isArray(chakra.meta?.tiling)
        ? (chakra.meta?.tiling as unknown[]).length
        : 0;
      emit("debug", `abstract tiling plans: ${tiling} COMP op(s) folded`);
    }
  }

  emit("ok", `serving pipeline complete — ${metrics.length} metric(s) · ${granularity}`);

  const artifacts: Record<string, string> = {
    "chakra.0.et": `mock://chakra/${granularity}`,
  };
  if (granularity === "L2") artifacts["tiling.sidecar"] = `mock://tiling/${granularity}`;

  return { granularity, metrics, logs, artifacts };
}
