import { resultsRepository } from "@/features/sim-result/model/resultsRepository";
import { SimResultScreen } from "@/features/sim-result/view/SimResultScreen";

/**
 * Server shell → client island (ADR-0003 §1). Reads the accumulated results
 * from Supabase (RLS-guarded, via resultsRepository) on the server, falling
 * back to the example dataset when there are no rows yet — so the page always
 * renders. The 'use client' screen draws the charts and runs the AI report.
 *
 * TODO: resolve the user's active experiment id on the server and pass it to
 * getResults(experimentId) to scope the read.
 */
export default async function SimResultPage() {
  const dataset = await resultsRepository.getResults();
  return <SimResultScreen dataset={dataset} />;
}
