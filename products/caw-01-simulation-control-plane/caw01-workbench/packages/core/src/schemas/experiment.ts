import { z } from "zod";

/**
 * Zod schemas = the one validation contract shared by web (Server Actions),
 * MCP, and CLI (ADR-0001). Mirrors design/04-data-layer/data-model.md.
 */

export const Boundary = z.enum(["public", "internal", "confidential"]);
export type Boundary = z.infer<typeof Boundary>;

export const HwLevel = z.enum([
  // digital-twin roots (ADR-0008 forward / canvas-3-hw-design.md): server entry
  // == data_center root; client entry == client root.
  "data_center",
  "client",
  "cluster",
  "rack",
  "tray",
  "package",
  "die",
  "chip",
  "component",
]);

/** Cluster taxonomy inside a data center (canvas-3-hw-design.md). */
export const ClusterType = z.enum([
  "gpu",
  "cpu",
  "cxl",
  "storage",
  "cxmt",
  "special",
  "custom",
]);
export type ClusterType = z.infer<typeof ClusterType>;
export type HwLevel = z.infer<typeof HwLevel>;

export const Project = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  created_at: z.string(),
  created_by: z.string().uuid(),
});
export type Project = z.infer<typeof Project>;

export const Experiment = z.object({
  id: z.string().uuid(),
  project_id: z.string().uuid(),
  name: z.string().min(1),
  head_ref: z.string().nullable().optional(), // → work-tree branch
  created_at: z.string(),
  created_by: z.string().uuid(),
});
export type Experiment = z.infer<typeof Experiment>;

export const HwNode = z.object({
  id: z.string().uuid(),
  experiment_id: z.string().uuid(),
  parent_id: z.string().uuid().nullable(), // null = root
  level: HwLevel,
  name: z.string(),
  spec: z.record(z.unknown()).default({}),
  part_id: z.string(), // stable picking identity (Canvas 3)
});
export type HwNode = z.infer<typeof HwNode>;

/** Input shapes for mutations (validated in Server Actions). */
export const CreateExperimentInput = Experiment.pick({ project_id: true, name: true });
export type CreateExperimentInput = z.infer<typeof CreateExperimentInput>;
