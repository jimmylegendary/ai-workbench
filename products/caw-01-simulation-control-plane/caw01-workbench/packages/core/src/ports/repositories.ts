import type { Experiment, HwNode, Project } from "../schemas/experiment.js";
import type { Evidence, Metric, SimulationRun } from "../schemas/run.js";

/**
 * Repository ports. @caw/db provides the Supabase implementation; @caw/core
 * depends only on these interfaces (no supabase-sdk import in core — ADR-0008 §4).
 * Reads may be served RLS-direct from the web ViewModel; writes that touch the
 * work-tree invariant go through services here.
 */
export interface ProjectRepository {
  list(): Promise<Project[]>;
  get(id: string): Promise<Project | null>;
}

export interface ExperimentRepository {
  listByProject(projectId: string): Promise<Experiment[]>;
  get(id: string): Promise<Experiment | null>;
  create(input: Pick<Experiment, "project_id" | "name">): Promise<Experiment>;
  hwTree(experimentId: string): Promise<HwNode[]>; // adjacency → built into a tree client-side
}

export interface RunRepository {
  listByExperiment(experimentId: string): Promise<SimulationRun[]>;
  get(id: string): Promise<SimulationRun | null>;
  /** metadata-only insert; ir_uri/artifact_uri filled by the engine callback */
  createQueued(experimentId: string, configId?: string): Promise<SimulationRun>;
  metrics(runId: string): Promise<Metric[]>;
  evidence(runId: string): Promise<Evidence[]>;
}
