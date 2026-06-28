import type { AxisStatus, FillLevel, StartRunInput } from "../schemas/run.js";

/**
 * The TS↔Python seam (ADR-0003 §6 / ADR-0005). Next.js NEVER runs the engine
 * in-process; it calls these ports. The concrete transport (HTTP/sidecar) is a
 * @caw/engine-adapters concern — the core only knows the interface.
 */
export interface SimEnginePort {
  /** Kick off a heavy Python simulation job; returns the run id immediately. */
  startRun(input: StartRunInput): Promise<{ runId: string }>;
  /** Request cancellation of a running job. */
  cancelRun(runId: string): Promise<void>;
  /** Async iterator of per-axis status for the SSE route handler. */
  streamStatus(runId: string, signal?: AbortSignal): AsyncIterable<AxisStatus[]>;
}

export interface StoragePort {
  /** Dereference a pointer (ir_uri / artifact_uri) to a readable URL/stream. */
  resolveBlob(uri: string): Promise<{ url: string; contentType: string }>;
  /** Open the memory-annotated IR at a fill level (lazy, heavy). */
  openIr(irUri: string, level: FillLevel): Promise<{ url: string }>;
}
