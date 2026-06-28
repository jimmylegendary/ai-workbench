# Prototype brief — Simulation (the 1:9 instrument screen)

Use the **active CAW-01 design system** (instrument blue + cyan signal, zinc neutrals, **compact**, light+dark,
mono for all readouts). Build **one screen**: the flagship Simulation control plane. It must read like an
**observability console / IDE**, dense and status-forward — NOT a SaaS dashboard with big cards and whitespace.

**Top nav bar:** `Simulation` (active) · `Module Design` · `User` · `Setting`. Thin, 1px bottom border.

**Body = a 1:9 left:right split** (resizable feel; firm min-widths):

**LEFT (1) — Control Panel** (narrow column, tight rows):
- `RunControls`: primary "Run", secondary "Stop", ghost "Configure".
- `RunStatus`: three **per-axis** rows — `real (OTel)`, `synthetic (syntorch→Chakra)`, `sim (LLMServingSim+ASTRA-sim)` — each with a status chip (queued/running/succeeded/failed). Show one axis **running** with a subtle **cyan pulse** + progress.
- `ProjectionReadout`: a compact comparable metric block (mono, tabular numerals) — e.g. latency / bytes-moved / HBM-residency.
- `SaveControls`: "Save item" + "Save full", dirty-aware (show a dirty dot).
- `EvidenceList`: 2–3 evidence rows with **trust** and **boundary** badges (color + icon, color-blind-safe).
- `NextActionHint`: one honest next-step line, e.g. "IR at L1 · next: run ASTRA-sim".

**RIGHT (9) — Workspace**, three coordinated dark canvases (`canvasBg #0E1116`, grid `#1C232B`) on a tabbed or
tiled layout, plus a work-tree strip:
- **Canvas 1 — AI workload flow:** node graph of `OpNode → TensorPort` (a few ops wired by tensors).
- **Canvas 2 — Serving / representation:** `ServingNode`s with typed handles (valid edge in primary, one invalid in danger).
- **Canvas 3 — Hardware:** a 3D-ish scene placeholder labeled `chip → die → package → tray → rack → cluster` with a `PartInspector` panel showing `partId: tray.cluster.01` and an editable spec.
- **Cross-canvas highlight:** show a selected hardware part highlighting (cyan) the ops in C1 and the path in C2.
- **Work-tree strip** (bottom or right edge): `BranchBar` (branch: `memory-diff`), `WorkTreeView` (3 subtrees with dirty markers), small `DiffView` + `HistoryList`.

**States:** show the screen mid-run (one axis running, others done), with one dirty edit pending. Include a
loading skeleton variant that matches the final density (no layout shift).

**Tone & rules:** every readout in **JetBrains Mono**; color only carries meaning; compact spacing (4/8/12). Show
**dark mode** as the primary canvas presentation and light chrome for the panels. Output a single high-fidelity
HTML or JSX file using the design-system tokens.
