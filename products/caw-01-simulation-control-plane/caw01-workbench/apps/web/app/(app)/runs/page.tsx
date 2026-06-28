/**
 * Runs & data management — the team's window on all simulation data
 * (routes-and-screens.md). Reads run index from Supabase (RLS); IR/trace are
 * dereferenced lazily via pointer (ADR-0008). STUB.
 */
export default function RunsPage() {
  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold">Runs</h1>
      <p className="mt-1 text-sm text-text-muted">
        Filter/sort runs across experiments; open one run&apos;s metrics, IR, and evidence.
      </p>
      <p className="mt-4 font-readout text-xs text-text-muted">
        TODO: RunFilters · RunsTable · RunDetail (see prototype-briefs/03-runs-data-management.md)
      </p>
    </div>
  );
}
