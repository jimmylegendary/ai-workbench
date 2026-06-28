import { createClient } from "@/lib/supabase/client";
import { SimulationRun, type SimulationRun as Run } from "@caw/core";

/**
 * Model layer — the only place that knows Supabase rows exist (RLS-guarded
 * reads). Returns Zod-validated domain types, never raw rows or React.
 * Engine-touching mutations do NOT live here — they are Server Actions
 * (./actions.ts) that go through @caw/core (ADR-0008 §4).
 */
export const runRepository = {
  async listByExperiment(experimentId: string): Promise<Run[]> {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("simulation_run")
      .select("*")
      .eq("experiment_id", experimentId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map((row) => SimulationRun.parse(row));
  },

  async get(id: string): Promise<Run | null> {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("simulation_run")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data ? SimulationRun.parse(data) : null;
  },
};
