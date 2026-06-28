import { SimulationScreen } from "@/features/simulation/view/SimulationScreen";

/**
 * Server shell → client island (ADR-0003 §1). A real implementation fetches the
 * active experiment (+ work-tree snapshot) via @caw/core / Supabase here and
 * passes it as props. STUB: a placeholder experiment id.
 */
export default async function SimulationPage() {
  // TODO: resolve the user's active experiment (Supabase, RLS) on the server.
  const experimentId = "00000000-0000-0000-0000-000000000000";
  return <SimulationScreen experimentId={experimentId} />;
}
