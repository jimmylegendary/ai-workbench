"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  SIM_GRANULARITY_INFO,
  type AxisStatus,
  type HwConfigRef,
  type SimGranularity,
  type SimMetric,
} from "@caw/core";
import { useWorkbenchStore } from "@/store/workbenchStore";
import { useWorkloadStore } from "@/features/workload/store";
import {
  runServingPipeline,
  type ServingInput,
} from "@/features/serving/model/orchestrator";
import { useServingRunStore } from "@/features/serving/store";
import { useLogStore } from "@/features/simulation/model/logStore";
import { useResultStore } from "@/features/sim-result/model/resultStore";
import type { ResultMetric } from "@/features/sim-result/model/types";
import { c3PartsById } from "../model/fixtures/c3";
import {
  hwCapability,
  defaultHwNode,
  powersOfTwoUpTo,
  type HwCapability,
} from "../model/hwCapability";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/* ----------------------------------------------------------------------- *
 * Serving / representation options with HW-DERIVED ranges (Canvas 2).
 *
 * Reads the live Canvas-3 selection (store → c3PartsById → hwCapability) and
 * recomputes every control's valid range when the selected hardware changes.
 * Chosen values are kept in local state (a future change_blob target). The
 * batch/context caps apply the serving research's capacity equation in a
 * compact form: usable HBM, freed by the chosen quant and sharded by TP, is the
 * KV/token budget that batch × context trade against.
 * ----------------------------------------------------------------------- */

interface ServingState {
  framework: string;
  tp: number;
  pp: number;
  maxBatch: number;
  maxContext: number;
  quant: string;
  kvOffload: boolean;
  continuous: boolean;
  chunked: boolean;
  spec: boolean;
  specMethod: string;
  specTokens: number;
}

const FRAMEWORKS = ["vLLM", "SGLang", "TensorRT-LLM", "TGI", "LLMServingSim"];
const SPEC_METHODS = ["EAGLE-3", "draft model", "Medusa", "n-gram", "MTP"];

/** Memory freed (relative to BF16) by the chosen weight quantization. */
const QUANT_FREE: Record<string, number> = {
  bf16: 1,
  fp8: 1.6,
  nvfp4: 2,
  "awq-int4": 2,
};

/** Derived numeric ranges from the HW capability + current quant/TP choice. */
function ranges(cap: HwCapability, quant: string, tp: number) {
  const usableHbm = cap.hbmGbPerGpu * 0.9; // gpu-memory-utilization headroom
  const freed = QUANT_FREE[quant] ?? 1;
  // More TP shards weights → more room for KV on each GPU (mild, capped).
  const tpBoost = 1 + Math.min(tp - 1, 7) * 0.25;
  const kvBudgetGb = usableHbm * 0.55 * freed * tpBoost;
  // ~0.5 GB of KV per concurrent sequence (moderate context); ~1 MB/token.
  const maxBatchCap = Math.max(1, Math.round(kvBudgetGb / 0.5));
  const maxContextCap = Math.min(
    262144,
    Math.max(2048, Math.round((kvBudgetGb * 1024) / 4 / 256) * 256),
  );
  return { maxBatchCap, maxContextCap, usableHbm: Math.round(usableHbm) };
}

const clamp = (v: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, v));

const GRANULARITIES: SimGranularity[] = ["L0", "L1", "L2"];

/** Read a numeric value from a step's free-form meta bag, if present. */
function metaNum(
  meta: Record<string, unknown> | undefined,
  key: string,
): number | undefined {
  const v = meta?.[key];
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

/** Pull a serving-pipeline tier-total map out of a step's meta, if present. */
function metaTierTotals(
  meta: Record<string, unknown> | undefined,
): ServingInput["tierTotals"] {
  const raw = meta?.tier_totals;
  if (!raw || typeof raw !== "object") return undefined;
  const src = raw as Record<string, unknown>;
  const pick = (k: string) =>
    typeof src[k] === "number" ? (src[k] as number) : undefined;
  const out = {
    HBM: pick("HBM"),
    DRAM: pick("DRAM"),
    SSD: pick("SSD"),
    MISS: pick("MISS"),
  };
  return Object.values(out).some((v) => v !== undefined) ? out : undefined;
}

/** SimResult metric → in-session ResultMetric (stamp absolute ts from offset). */
function toResultMetrics(
  runId: string,
  metrics: SimMetric[],
  baseMs: number,
): ResultMetric[] {
  return metrics.map((m) => ({
    runId,
    axis: m.axis,
    name: m.name,
    value: m.value,
    unit: m.unit ?? null,
    ts: new Date(baseMs + (m.tsOffsetMs ?? 0)).toISOString(),
  }));
}

const RUN_AXES = ["real", "synthetic", "sim"] as const;
const allAxes = (status: AxisStatus["status"], progress: number): AxisStatus[] =>
  RUN_AXES.map((axis) => ({ axis, status, progress }));

export function ServingOptions() {
  const partId = useWorkbenchStore((s) => s.selection.partId);
  const canvas = useWorkbenchStore((s) => s.selection.canvas);
  const setAxisStatus = useWorkbenchStore((s) => s.setAxisStatus);
  const setRun = useWorkbenchStore((s) => s.setRun);
  const appendLog = useLogStore((s) => s.append);
  const setLogRunning = useLogStore((s) => s.setRunning);
  const clearLog = useLogStore((s) => s.clear);
  const registerRun = useServingRunStore((s) => s.register);

  // Only a Canvas-3 selection drives the HW model; otherwise the default rack.
  const node = useMemo(() => {
    const picked = canvas === "c3" && partId ? c3PartsById[partId] : undefined;
    return picked ?? defaultHwNode();
  }, [canvas, partId]);

  const cap = useMemo(() => hwCapability(node), [node]);
  const tpLadder = useMemo(() => powersOfTwoUpTo(cap.nvlinkDomain), [cap.nvlinkDomain]);

  const [st, setSt] = useState<ServingState>({
    framework: "vLLM",
    tp: 1,
    pp: 1,
    maxBatch: 64,
    maxContext: 8192,
    quant: "bf16",
    kvOffload: false,
    continuous: true,
    chunked: true,
    spec: false,
    specMethod: "EAGLE-3",
    specTokens: 5,
  });

  const r = useMemo(() => ranges(cap, st.quant, st.tp), [cap, st.quant, st.tp]);

  // ── Phase-3 pipeline: granularity (local) + run against the workload turn ──
  const [granularity, setGranularity] = useState<SimGranularity>("L0");
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const session = useWorkloadStore((s) => s.session);
  const selectedTurnId = useWorkloadStore((s) => s.selectedTurnId);
  const addRun = useResultStore((s) => s.addRun);

  const selectedTurn = useMemo(
    () => session?.turns.find((t) => t.id === selectedTurnId) ?? null,
    [session, selectedTurnId],
  );

  // Serving inputs = the selected turn's llm/server steps mapped to the contract.
  const servingInputs = useMemo<ServingInput[]>(() => {
    if (!selectedTurn) return [];
    return selectedTurn.steps
      .filter((s) => s.kind === "llm" || s.kind === "server")
      .map((s) => ({
        label: s.name,
        promptTokens: s.tokensIn ?? 0,
        outTokens: s.tokensOut,
        hashBlocks: metaNum(s.meta, "n_prompt_hash_blocks"),
        chunkSize: metaNum(s.meta, "chunk_size"),
        tierTotals: metaTierTotals(s.meta),
      }));
  }, [selectedTurn]);

  const canRun = !!selectedTurn && !running;

  const runPipeline = async () => {
    if (!selectedTurn || running) return;
    if (servingInputs.length === 0) {
      setStatus("no llm/server steps in the selected turn");
      return;
    }
    const hw: HwConfigRef = {
      partId: canvas === "c3" && partId ? partId : undefined,
      summary: {
        gpuName: cap.gpuName,
        gpus: cap.gpus,
        hbmGbPerGpu: cap.hbmGbPerGpu,
        nvlinkDomain: cap.nvlinkDomain,
        nodes: cap.nodes,
        fp8: cap.fp8,
        fp4: cap.fp4,
        hasCxl: cap.hasCxl,
        framework: st.framework,
        tp: st.tp,
        pp: st.pp,
        quant: st.quant,
      },
    };
    setRunning(true);
    setStatus(`running ${granularity} · ${servingInputs.length} step(s)…`);
    // Feed the shared run loop so the ControlPanel Run-status + SimLog reflect it.
    clearLog();
    setLogRunning(true);
    appendLog({ level: "info", msg: `serving pipeline ${granularity} — ${servingInputs.length} step(s)` });
    setAxisStatus(allAxes("running", 0.1));
    try {
      const res = await runServingPipeline(servingInputs, hw, granularity);
      const runId =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `run-${Date.now()}`;
      const label = `${selectedTurn.label ?? `turn ${selectedTurn.index}`} · ${granularity}`;
      addRun(runId, toResultMetrics(runId, res.metrics, Date.now()), label);
      setAxisStatus(allAxes("succeeded", 1));
      setRun(runId);
      setStatus(`done · ${res.metrics.length} metric(s) → results`);
    } catch (e) {
      setAxisStatus(allAxes("failed", 0));
      setStatus(`failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLogRunning(false);
      setRunning(false);
    }
  };

  // Publish the run to the shared registry so the ControlPanel's primary Run
  // drives THIS configured pipeline (stable wrapper → latest runPipeline).
  const runRef = useRef(runPipeline);
  runRef.current = runPipeline;
  useEffect(() => {
    registerRun(() => runRef.current(), canRun);
    return () => registerRun(null, false);
  }, [registerRun, canRun]);

  // Re-clamp / reset choices into the new valid ranges when the HW changes.
  useEffect(() => {
    setSt((s) => {
      const tp = tpLadder.includes(s.tp)
        ? s.tp
        : tpLadder.filter((d) => d <= cap.nvlinkDomain).at(-1) ?? 1;
      const quantOk =
        s.quant === "fp8" ? cap.fp8 : s.quant === "nvfp4" ? cap.fp4 : true;
      return {
        ...s,
        tp,
        pp: clamp(s.pp, 1, cap.nodes),
        quant: quantOk ? s.quant : "bf16",
        kvOffload: cap.hasCxl ? s.kvOffload : false,
        maxBatch: clamp(s.maxBatch, 1, r.maxBatchCap),
        maxContext: clamp(s.maxContext, 2048, r.maxContextCap),
      };
    });
  }, [cap, tpLadder, r.maxBatchCap, r.maxContextCap]);

  const set = <K extends keyof ServingState>(k: K, v: ServingState[K]) =>
    setSt((s) => ({ ...s, [k]: v }));

  const quantOpts: { v: string; label: string; ok: boolean; why: string }[] = [
    { v: "bf16", label: "BF16 / FP16", ok: true, why: "Ampere+" },
    { v: "fp8", label: "FP8", ok: cap.fp8, why: cap.fp8 ? "Hopper/Ada/Blackwell" : "no FP8 tensor cores" },
    { v: "nvfp4", label: "NVFP4 / FP4", ok: cap.fp4, why: cap.fp4 ? "Blackwell 5th-gen" : "needs Blackwell" },
    { v: "awq-int4", label: "AWQ-INT4", ok: true, why: "Ampere+ (weight-only)" },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[var(--radius-md)] border border-border bg-surface">
      <div className="flex shrink-0 items-center justify-between border-b border-border px-2 py-1">
        <span className="font-readout text-[10px] uppercase tracking-wide text-text-muted">
          Serving options · HW-aware
        </span>
        <span className="font-readout text-[10px] text-text-muted">{cap.gpuName}</span>
      </div>

      {/* HW capability summary the ranges are derived from. */}
      <div className="flex shrink-0 flex-wrap gap-1 border-b border-border px-2 py-1.5">
        <Badge>{cap.gpus} GPU</Badge>
        <Badge>{cap.hbmGbPerGpu} GB HBM</Badge>
        <Badge>NVLink ×{cap.nvlinkDomain}</Badge>
        <Badge>{cap.nodes} nodes</Badge>
        {cap.fp8 ? <Badge tone="success">FP8</Badge> : null}
        {cap.fp4 ? <Badge tone="success">FP4</Badge> : null}
        {cap.hasCxl ? <Badge tone="success">CXL</Badge> : null}
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-auto p-2">
        <SelectField
          label="Serving framework"
          value={st.framework}
          options={FRAMEWORKS.map((f) => ({ v: f, label: f }))}
          why="all engines available on NVIDIA GPUs"
          onChange={(v) => set("framework", v)}
        />

        <SelectField
          label="Tensor parallel (TP)"
          value={String(st.tp)}
          options={tpLadder.map((d) => ({ v: String(d), label: `${d}×` }))}
          why={`powers of 2 · ≤ ${cap.nvlinkDomain} GPUs in NVLink domain`}
          onChange={(v) => set("tp", Number(v))}
        />

        <RangeField
          label="Pipeline parallel (PP)"
          value={st.pp}
          min={1}
          max={cap.nodes}
          why={`≤ ${cap.nodes} nodes (cross-node, over IB)`}
          onChange={(v) => set("pp", v)}
        />

        <RangeField
          label="Max batch (max-num-seqs)"
          value={st.maxBatch}
          min={1}
          max={r.maxBatchCap}
          why={`≤ ${r.maxBatchCap} · ${r.usableHbm} GB usable HBM / KV-per-seq`}
          onChange={(v) => set("maxBatch", v)}
        />

        <RangeField
          label="Max context (max-model-len)"
          value={st.maxContext}
          min={2048}
          max={r.maxContextCap}
          step={256}
          why={`≤ ${r.maxContextCap.toLocaleString()} tok · KV budget (batch × ctx trade)`}
          onChange={(v) => set("maxContext", v)}
        />

        {/* Quantization — option set gated by GPU tensor-core support. */}
        <div className="space-y-1">
          <FieldLabel label="Weight quantization" />
          <div className="flex flex-wrap gap-1">
            {quantOpts.map((q) => (
              <button
                key={q.v}
                type="button"
                disabled={!q.ok}
                onClick={() => set("quant", q.v)}
                title={q.why}
                className={cn(
                  "rounded-[var(--radius-sm)] border px-1.5 py-0.5 font-readout text-[11px]",
                  q.ok
                    ? st.quant === q.v
                      ? "border-accent text-accent"
                      : "border-border text-text hover:bg-surface-muted"
                    : "border-border text-text-muted opacity-50",
                )}
              >
                {q.label}
              </button>
            ))}
          </div>
          <Why text={quantOpts.find((q) => q.v === st.quant)?.why ?? ""} />
        </div>

        <ToggleField
          label="Continuous batching"
          checked={st.continuous}
          why="iteration-level scheduling (baseline)"
          onChange={(v) => set("continuous", v)}
        />
        <ToggleField
          label="Chunked prefill"
          checked={st.chunked}
          why="mixes prefill + decode; best on high-FLOP GPUs"
          onChange={(v) => set("chunked", v)}
        />
        <ToggleField
          label="KV-cache offload"
          checked={st.kvOffload}
          disabled={!cap.hasCxl}
          why={cap.hasCxl ? "CXL memory tier present" : "needs a CXL memory tier"}
          onChange={(v) => set("kvOffload", v)}
        />

        {/* Speculative decoding — method + draft-token range. */}
        <div className="space-y-1">
          <ToggleField
            label="Speculative decoding"
            checked={st.spec}
            why="2-6× at low batch; shrinks when batch is large"
            onChange={(v) => set("spec", v)}
          />
          {st.spec ? (
            <div className="space-y-2 pl-1">
              <SelectField
                label="Method"
                value={st.specMethod}
                options={SPEC_METHODS.map((m) => ({ v: m, label: m }))}
                why="needs spare HBM for the draft head/model"
                onChange={(v) => set("specMethod", v)}
              />
              <RangeField
                label="num-speculative-tokens"
                value={st.specTokens}
                min={1}
                max={8}
                why="1-8 draft tokens per step"
                onChange={(v) => set("specTokens", v)}
              />
            </div>
          ) : null}
        </div>
      </div>

      {/* Phase-3 run: granularity + pipeline against the selected workload turn. */}
      <div className="shrink-0 space-y-2 border-t border-border p-2">
        <div className="space-y-1">
          <FieldLabel label="Simulation granularity" />
          <div className="flex gap-1">
            {GRANULARITIES.map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setGranularity(g)}
                title={SIM_GRANULARITY_INFO[g].why}
                className={cn(
                  "flex-1 rounded-[var(--radius-sm)] border px-1.5 py-1 text-left font-readout",
                  granularity === g
                    ? "border-accent text-accent"
                    : "border-border text-text hover:bg-surface-muted",
                )}
              >
                <span className="block text-[11px] font-medium">{g}</span>
                <span className="block text-[9px] leading-tight text-text-muted">
                  {SIM_GRANULARITY_INFO[g].title}
                </span>
              </button>
            ))}
          </div>
          <Why
            text={`${SIM_GRANULARITY_INFO[granularity].why} · fidelity ↔ time`}
          />
        </div>

        <Button
          type="button"
          variant="primary"
          disabled={!canRun}
          onClick={runPipeline}
          className="w-full py-1 text-[12px]"
        >
          {running ? "Running…" : "Run serving pipeline"}
        </Button>

        <p className="font-readout text-[10px] text-text-muted">
          {status ??
            (selectedTurn
              ? `${servingInputs.length} llm/server step(s) in the selected turn`
              : "select a workload turn to run")}
        </p>
      </div>
    </div>
  );
}

/* --- compact field primitives ------------------------------------------- */

function FieldLabel({ label }: { label: string }) {
  return (
    <span className="font-readout text-[11px] font-medium text-text">{label}</span>
  );
}

function Why({ text }: { text: string }) {
  return <p className="font-readout text-[10px] text-text-muted">{text}</p>;
}

function SelectField({
  label,
  value,
  options,
  why,
  onChange,
}: {
  label: string;
  value: string;
  options: { v: string; label: string }[];
  why: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1">
      <FieldLabel label={label} />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-[var(--radius-sm)] border border-border bg-background px-1.5 py-1 font-readout text-[11px] text-text"
      >
        {options.map((o) => (
          <option key={o.v} value={o.v}>
            {o.label}
          </option>
        ))}
      </select>
      <Why text={why} />
    </div>
  );
}

function RangeField({
  label,
  value,
  min,
  max,
  step = 1,
  why,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  why: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between">
        <FieldLabel label={label} />
        <span className="font-readout text-[11px] tabular-nums text-text">
          {value.toLocaleString()}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={Math.max(min, max)}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-accent"
      />
      <div className="flex items-baseline justify-between">
        <Why text={why} />
        <span className="font-readout text-[10px] text-text-muted">
          {min.toLocaleString()}–{max.toLocaleString()}
        </span>
      </div>
    </div>
  );
}

function ToggleField({
  label,
  checked,
  why,
  disabled = false,
  onChange,
}: {
  label: string;
  checked: boolean;
  why: string;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-center justify-between gap-2",
        disabled && "cursor-not-allowed opacity-50",
      )}
    >
      <span className="min-w-0">
        <FieldLabel label={label} />
        <Why text={why} />
      </span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="size-3.5 shrink-0 accent-accent"
      />
    </label>
  );
}
