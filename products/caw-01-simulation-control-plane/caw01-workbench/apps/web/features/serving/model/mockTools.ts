import type {
  AbstractTilingPlan,
  AstraSimPort,
  AstraSimResult,
  ChakraNode,
  ChakraTrace,
  HwConfigRef,
  LlmServingSimPort,
  ServingCall,
  ServingObservation,
  SimGranularity,
  SimMetric,
  SyntorchPort,
  VllmPort,
} from "@caw/core";

/**
 * MOCK serving tools (VllmPort / LlmServingSimPort / SyntorchPort / AstraSimPort).
 *
 * These synthesize a plausible Chakra trace + serving/timing metrics so the whole
 * C2 serving pipeline runs end-to-end locally with no real REST tools — mirroring
 * the current engine stub. Everything is DETERMINISTIC: values are pure functions
 * of the call's tokens, the HW capability summary (HwConfigRef.summary, from
 * hwCapability), and the run granularity. No randomness — the same inputs always
 * produce the same trace + numbers. The real REST clients are [AI] runbook work
 * (ADR-0005 §8, phase-4-trace-pipeline).
 *
 * Fidelity ladder (mirrors SIM_GRANULARITY_INFO):
 *   L0 — torch-level op DAG + syntorch ANALYTICAL cost (no ASTRA-sim).
 *   L1 — L0 + ASTRA-sim network timing (adds a collective/network penalty).
 *   L2 — L1 + kernel + memory model: a small AbstractTilingPlan on each COMP node
 *        and per-tier memory traffic (ADR-0009).
 */

// ── HW capability summary reader ────────────────────────────────────────────

interface Cap {
  gpuName: string;
  gpus: number;
  hbmGbPerGpu: number;
  nvlinkDomain: number;
  nodes: number;
  fp8: boolean;
  fp4: boolean;
  hasCxl: boolean;
  tp: number;
  pp: number;
  quant: string;
}

const numOr = (v: unknown, d: number): number =>
  typeof v === "number" && Number.isFinite(v) ? v : d;
const boolOr = (v: unknown, d: boolean): boolean =>
  typeof v === "boolean" ? v : d;
const strOr = (v: unknown, d: string): string =>
  typeof v === "string" ? v : d;

/** Denormalise the HwConfigRef.summary bag into a typed capability struct. */
function readCap(hw: HwConfigRef): Cap {
  const s = hw.summary ?? {};
  return {
    gpuName: strOr(s.gpuName, "gpu"),
    gpus: Math.max(1, numOr(s.gpus, 8)),
    hbmGbPerGpu: Math.max(1, numOr(s.hbmGbPerGpu, 80)),
    nvlinkDomain: Math.max(1, numOr(s.nvlinkDomain, 8)),
    nodes: Math.max(1, numOr(s.nodes, 1)),
    fp8: boolOr(s.fp8, false),
    fp4: boolOr(s.fp4, false),
    hasCxl: boolOr(s.hasCxl, false),
    tp: Math.max(1, numOr(s.tp, 1)),
    pp: Math.max(1, numOr(s.pp, 1)),
    quant: strOr(s.quant, "bf16"),
  };
}

/** Bytes freed per element by the chosen weight quantization (BF16 = 2 bytes). */
const QUANT_BYTES: Record<string, number> = {
  bf16: 2,
  fp8: 1,
  nvfp4: 0.5,
  "awq-int4": 0.5,
};

// ── shared analytical model (used by all mock tools, deterministic) ──────────

/** Nominal transformer hidden width — fixes a plausible bytes/FLOP scale. */
const HIDDEN = 8192;
/** KV bytes per token per GPU (nominal, before quant), for footprint/traffic. */
const KV_BYTES_PER_TOKEN = 512 * 1024; // ~0.5 MiB/token

interface Shape {
  prompt: number;
  out: number;
  /** effective prefill tokens after prefix-cache reuse. */
  effPrompt: number;
  /** aggregate compute throughput proxy from the HW. */
  flopScale: number;
  /** collective bytes moved for TP all-reduce (per layer, folded). */
  commBytes: number;
  /** total bytes moved across the hierarchy. */
  bytesMoved: number;
  cap: Cap;
}

/** Reduce a call + HW into the derived scalars every mock tool shares. */
function shapeOf(input: ServingCall, cap: Cap): Shape {
  const prompt = Math.max(1, input.promptTokens || 1);
  const out = Math.max(1, input.outTokens ?? (Math.round(prompt * 0.25) || 1));
  // Prefix-cache reuse: each hash block (~16 tokens) trims prefill work.
  const reused = Math.min(prompt - 1, Math.max(0, (input.hashBlocks ?? 0) * 16));
  const effPrompt = Math.max(1, prompt - reused);

  const quantBytes = QUANT_BYTES[cap.quant] ?? 2;
  // Compute throughput proxy: #GPUs × per-GPU factor, lifted by low-precision paths.
  const precLift = cap.fp4 ? 2 : cap.fp8 ? 1.5 : 1;
  const flopScale = cap.gpus * precLift;

  // TP all-reduce traffic (folded across layers): hidden × bytes × domain hops.
  const hops = Math.max(0, cap.tp - 1);
  const commBytes = Math.round(HIDDEN * quantBytes * (effPrompt + out) * hops * 0.02);

  // KV + activation traffic; misses to slower tiers move more bytes.
  const misses = input.tierTotals?.MISS ?? 0;
  const missPenalty = 1 + Math.min(2, misses / 64);
  const bytesMoved = Math.round(
    (effPrompt + out) * KV_BYTES_PER_TOKEN * (quantBytes / 2) * missPenalty +
      commBytes,
  );

  return { prompt, out, effPrompt, flopScale, commBytes, bytesMoved, cap };
}

/** Analytical serving dynamics (syntorch/vLLM baseline; the `synthetic` axis). */
function analytical(sh: Shape): ServingObservation {
  const { effPrompt, out, flopScale, bytesMoved, cap } = sh;
  // Prefill dominates TTFT; more compute + wider NVLink domain → faster.
  const ttftMs =
    Math.round(((20 + effPrompt * 0.35) / (flopScale * 0.5)) * 10 * (10 / (cap.nvlinkDomain + 2))) /
    10;
  // Decode throughput scales with compute, softened by output length.
  const throughputTokS = Math.round(
    (350 * flopScale) / (1 + out / 4096),
  );
  const gpuUtilPct =
    Math.round(Math.min(98, 45 + effPrompt / 96 + out / 512) * 10) / 10;
  return { ttftMs, throughputTokS, gpuUtilPct, bytesMoved };
}

// ── Chakra ET synthesis ─────────────────────────────────────────────────────

/** Build a small but plausible Chakra op DAG for one call at a granularity. */
function synthChakra(
  input: ServingCall,
  cap: Cap,
  granularity: SimGranularity,
): ChakraTrace {
  const sh = shapeOf(input, cap);
  const quantBytes = QUANT_BYTES[cap.quant] ?? 2;
  const l2 = granularity === "L2";

  const weightsBytes = Math.round(HIDDEN * HIDDEN * quantBytes);
  const kvBytes = Math.round(sh.effPrompt * KV_BYTES_PER_TOKEN * (quantBytes / 2));
  const prefillOps = Math.round(sh.effPrompt * HIDDEN * 2);
  const decodeOps = Math.round(sh.out * HIDDEN * 2);

  const nodes: ChakraNode[] = [
    {
      id: "n0",
      type: "MEM",
      name: "load_weights",
      dataDeps: [],
      tensorSize: weightsBytes,
    },
    {
      id: "n1",
      type: "COMP",
      name: "prefill_gemm",
      dataDeps: ["n0"],
      numOps: prefillOps,
      ...(l2 ? { tilingRef: "tile:prefill_gemm" } : {}),
    },
    {
      id: "n2",
      type: "MEM",
      name: "kv_write",
      dataDeps: ["n1"],
      tensorSize: kvBytes,
    },
  ];

  // TP all-reduce only exists when the domain shards the model (tp > 1).
  if (cap.tp > 1 && sh.commBytes > 0) {
    nodes.push({
      id: "n3",
      type: "COMM",
      name: "all_reduce_tp",
      dataDeps: ["n1"],
      commType: "all_reduce",
      commSize: sh.commBytes,
    });
  }

  const decodeDeps = nodes.some((n) => n.id === "n3") ? ["n2", "n3"] : ["n2"];
  nodes.push({
    id: "n4",
    type: "COMP",
    name: "decode_gemm",
    dataDeps: decodeDeps,
    numOps: decodeOps,
    ...(l2 ? { tilingRef: "tile:decode_gemm" } : {}),
  });

  const meta: Record<string, unknown> = {
    granularity,
    label: input.label ?? "call",
    // Analytical rollups the orchestrator reads for the synthetic axis.
    numOps: prefillOps + decodeOps,
    bytesMoved: sh.bytesMoved,
    commBytes: sh.commBytes,
  };

  // L2: attach a tiny AbstractTilingPlan per COMP node (ADR-0009, read-only IR).
  if (l2) {
    meta.tiling = [
      tilingPlan("tile:prefill_gemm", sh.effPrompt, cap),
      tilingPlan("tile:decode_gemm", sh.out, cap),
    ];
  }

  return { rank: 0, nodes, meta };
}

/** A small, HW-parameterized AbstractTilingPlan (repetition-folded, exploration-grade). */
function tilingPlan(opId: string, seqDim: number, cap: Cap): AbstractTilingPlan {
  const quantBytes = QUANT_BYTES[cap.quant] ?? 2;
  const tileM = 128;
  const tileN = 128;
  const tileK = 64;
  const repM = Math.max(1, Math.ceil(seqDim / tileM));
  const repN = Math.max(1, Math.ceil(HIDDEN / tileN));
  const repK = Math.max(1, Math.ceil(HIDDEN / tileK));
  const repetitionCount = repM * repN * repK;
  const tileOps = tileM * tileN * tileK * 2;
  const remainderM = seqDim % tileM;
  return {
    opId,
    iterationSpace: { M: seqDim, N: HIDDEN, K: HIDDEN },
    tileUnit: {
      tile: { M: tileM, N: tileN, K: tileK },
      numOps: tileOps,
      bytesPerTier: {
        REG: tileM * tileK * quantBytes,
        SHARED: (tileM * tileK + tileK * tileN) * quantBytes,
        HBM: tileM * tileN * quantBytes,
      },
    },
    repetitionCount,
    remainders:
      remainderM > 0 ? [{ dim: "M", size: remainderM, kind: "tail" }] : [],
    derived: {
      numOps: repetitionCount * tileOps,
      bytesMovedPerTier: {
        HBM: repetitionCount * tileM * tileN * quantBytes,
      },
      footprintBytes: (tileM * tileK + tileK * tileN + tileM * tileN) * quantBytes,
      occupancy: Math.min(1, cap.gpus / (cap.gpus + 2)),
    },
  };
}

// ── metric helpers ──────────────────────────────────────────────────────────

const round1 = (v: number) => Math.round(v * 10) / 10;

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

// ── the four mock ports ─────────────────────────────────────────────────────

/** vLLM (real engine / thin-harness synthetic forward path). */
export const mockVllm: VllmPort = {
  name: "vLLM",
  async serve(input, hw) {
    return analytical(shapeOf(input, readCap(hw)));
  },
};

/** LLMServingSim (simulated serving engine — embeds a modified ASTRA-sim). */
export const mockLlmServingSim: LlmServingSimPort = {
  name: "LLMServingSim",
  async serve(input, hw) {
    // The simulated engine sees a little more overhead than the analytical baseline.
    const base = analytical(shapeOf(input, readCap(hw)));
    return {
      ttftMs: round1(base.ttftMs * 1.08),
      throughputTokS: Math.round(base.throughputTokS * 0.94),
      gpuUtilPct: round1(Math.min(99, base.gpuUtilPct * 1.03)),
      bytesMoved: base.bytesMoved,
    };
  },
};

/** syntorch (below-torch capture → Chakra ET exporter). */
export const mockSyntorch: SyntorchPort = {
  name: "syntorch",
  async captureChakra(input, hw, granularity) {
    return synthChakra(input, readCap(hw), granularity);
  },
};

/** ASTRA-sim (times a Chakra ET on the HW's system/network config). */
export const mockAstraSim: AstraSimPort = {
  name: "ASTRA-sim",
  async simulate(chakra, hw) {
    const cap = readCap(hw);
    const meta = chakra.meta ?? {};
    const l2 = meta.granularity === "L2";
    const bytesMoved = numOr(meta.bytesMoved, 0);
    const commBytes = numOr(meta.commBytes, 0);
    const numOps = numOr(meta.numOps, 0);

    // Network timing: collective bytes over the NVLink domain's aggregate BW.
    const domainBwGBs = cap.nvlinkDomain * 200; // ~200 GB/s/link nominal
    const netMs = commBytes > 0 ? (commBytes / (domainBwGBs * 1e9)) * 1e3 : 0;
    // Compute time proxy from folded ops over the HW compute scale.
    const compScale = cap.gpus * (cap.fp4 ? 2 : cap.fp8 ? 1.5 : 1);
    const compMs = numOps / (compScale * 5e8);
    // L2 kernel/memory model adds memory-tier stall on top of network.
    const memMs = l2 ? (bytesMoved / (cap.hbmGbPerGpu * 3e9)) * 1e3 : 0;

    const ttftMs = round1(20 + compMs + netMs + memMs);
    const throughputTokS = Math.round(1000 / (ttftMs / 1000 + 0.001) + compScale * 40);
    const gpuUtilPct = round1(Math.min(99, 50 + compScale * 2 + (l2 ? 6 : 0)));

    const metrics = obsMetrics(
      "sim",
      { ttftMs, throughputTokS, gpuUtilPct, bytesMoved },
      0,
    );
    const logs = [
      `ASTRA-sim network: ${(commBytes / 1e6).toFixed(2)} MB over NVLink×${cap.nvlinkDomain} → ${netMs.toFixed(2)} ms`,
      ...(l2 ? [`ASTRA-sim kernel+memory: ${(bytesMoved / 1e9).toFixed(2)} GB moved → +${memMs.toFixed(2)} ms stall`] : []),
    ];
    const result: AstraSimResult = { metrics, logs };
    return result;
  },
};
