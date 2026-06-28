import type { AxisStatus } from "@caw/core";
import type {
  EvidenceRow,
  ProjectionRow,
} from "@/features/simulation/view/ControlPanel";

/**
 * Per-axis run status (View/dev fixture). Seeds a mid-run state so the
 * "running" cyan pulse is demonstrable without the engine wired — the real
 * path fills run.perAxis from the SSE stream once RunService lands.
 */
export const runStatus: AxisStatus[] = [
  { axis: "real", status: "succeeded", progress: 1 },
  { axis: "synthetic", status: "running", progress: 0.4 },
  { axis: "sim", status: "queued" },
];

/** Dev fixture: an unsaved edit so the dirty dot + Save affordances are visible. */
export const dirtyDemo = true;

/** Sample comparable readout for a finished run (View/dev fixture only). */
export const projection: ProjectionRow[] = [
  { name: "latency", value: "12.4", unit: "ms" },
  { name: "bytes-moved", value: "1.83", unit: "GiB" },
  { name: "HBM-residency", value: "74.2", unit: "%" },
  { name: "kernels", value: "318" },
];

/** Sample evidence pointers across all three trust boundaries. */
export const evidence: EvidenceRow[] = [
  {
    label: "real HW capture",
    boundary: "public",
    trust: 3,
    ref: "run:7b3e9a12",
  },
  {
    label: "synthetic replay",
    boundary: "internal",
    trust: 2,
    ref: "run:c41d0f55",
  },
  {
    label: "sim projection",
    boundary: "confidential",
    trust: 1,
    ref: "art://hbm/trace-318.bin",
  },
];
