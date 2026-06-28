# Prototype brief — Runs & data management

Use the **active CAW-01 design system** (compact, mono readouts, light+dark). Build **one screen**: the team's
window on **all simulation data** — a dense runs/experiments browser with a detail pane. This is a data-table
surface (think a CI runs list or a query console), not a card grid.

**Top nav bar:** `Simulation` · `Module Design` · `User` · `Setting`. A breadcrumb/title row: "Runs".

**Layout:** left a **filterable table** (≈65%), right a **detail panel** (≈35%) for the selected run.

**`RunFilters`** (toolbar): search, status filter (queued/running/succeeded/failed/cancelled), experiment
filter, axis filter, date range. Compact, inline.

**`RunsTable`** (mono, tabular, 28–32px rows): columns — Status (chip+icon), Run ID (mono, middle-truncated),
Experiment, Axis (real/synthetic/sim), Projection (key metric), Started, Duration. Sortable headers; a running
row shows the cyan pulse. Show ~8 rows incl. one running, one failed.

**`RunDetail`** (right panel for a selected succeeded run):
- Header: run ID (mono, copy affordance) + status chip + branch ref.
- `MetricsPanel`: a tight mono table of metrics (name / value / unit), tabular numerals.
- `IrOpenButton`: "Open IR (L1)" — note it dereferences a pointer (`ir_uri`), heavy data loaded lazily.
- `EvidenceList`: evidence rows with trust + boundary badges.
- `ProjectionReadout` + a small `DiffView` ("compare to branch `baseline`").

**States:** loading skeleton (matches density), empty ("No runs yet · start one from Simulation"), error
(engine down → "showing cached metadata, IR unavailable").

Output a single high-fidelity HTML or JSX file using the tokens, in **both light and dark**.
