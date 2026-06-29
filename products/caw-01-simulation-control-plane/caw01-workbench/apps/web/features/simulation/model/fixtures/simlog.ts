/**
 * Sample simulation log stream for the live SimLog panel — the console-style
 * strip that replaces the work-tree at the bottom of the Simulation screen.
 * Local View/dev fixture ONLY: the real stream arrives from RunService/SSE once
 * the engine is wired. Never import into shared/global fixtures.
 *
 * Shape: the seed is rendered immediately as backlog; the stream pool is
 * appended one line per tick (SimLog.tsx) to feel live, then cycles to fake a
 * new run. Timestamps are stamped client-side at append time, never here.
 */

/** Console severity. Hue is reserved per level, but the level text is always
 * rendered too — so meaning is never carried by colour alone (DESIGN.md §9). */
export type SimLogLevel = "debug" | "info" | "ok" | "warn" | "error";

/** A level + message pair, before it is timestamped into a SimLogLine. */
export interface SimLogEntry {
  level: SimLogLevel;
  msg: string;
}

/** A rendered log line: a stable id + epoch-ms timestamp the View formats. */
export interface SimLogLine extends SimLogEntry {
  id: number;
  /** epoch ms — the View formats this as HH:MM:SS.mmm */
  t: number;
}

/** Backlog shown the instant the panel mounts (startup chatter). */
export const simLogSeed: SimLogEntry[] = [
  { level: "info", msg: "control-plane online — caw01-workbench build 0.4.1" },
  { level: "debug", msg: "loaded experiment tree astra-run@3b7e2d4" },
  { level: "info", msg: "topology: 1 dc · 8 racks · 64 trays · 512 packages" },
  { level: "ok", msg: "evidence verified — real HW capture run:7b3e9a12" },
];

/** The live run, appended one line per tick. Loops to simulate a fresh run. */
export const simLogStream: SimLogEntry[] = [
  { level: "info", msg: "run start — axis=sim strategy=PD-colocated" },
  { level: "debug", msg: "warmup: pinning 318 kernels across 8 SM partitions" },
  { level: "info", msg: "epoch 0 — injecting Llama-3-70B trace (L1)" },
  { level: "debug", msg: "NoC bisection 3.2 TB/s · HBM3e 4.8 TB/s/stack" },
  { level: "info", msg: "prefill pool 0–3 saturated — 74.2% HBM residency" },
  { level: "warn", msg: "decode pool 5 queue depth 128 — backpressure rising" },
  { level: "debug", msg: "kernel gemm_fp8 #204 — 1.83 GiB moved" },
  { level: "info", msg: "checkpoint @ step 1200 — p50 latency 12.4 ms" },
  { level: "warn", msg: "thermal: tray 41 package 2 throttling 3%" },
  { level: "error", msg: "link tray12→tray13 CRC retry storm (recovered)" },
  { level: "debug", msg: "rebalanced 6 kernels off accel/die0" },
  { level: "ok", msg: "axis=sim converged — projection ready" },
  { level: "info", msg: "run complete — 318 kernels · 12.4 ms p50 · 1.83 GiB" },
];
