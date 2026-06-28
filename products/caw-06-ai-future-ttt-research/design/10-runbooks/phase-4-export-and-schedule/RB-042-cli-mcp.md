# RB-042: Build the CLI + MCP surfaces over the ExperimentScout op-set

- Status: ready
- Phase: phase-4-export-and-schedule
- Depends on: [RB-041 (scout Run), RB-040 (ExportAdapter seam), RB-2XX (ledger), RB-3XX (implications + wbtraffic.v0)]
- Implements design: [../../06-interfaces/cli-and-mcp.md](../../06-interfaces/cli-and-mcp.md), [../../06-interfaces/scout-pipeline.md](../../06-interfaces/scout-pipeline.md), [../../01-decisions/ADR-0001-product-surface-and-scout.md](../../01-decisions/ADR-0001-product-surface-and-scout.md), [../../01-decisions/ADR-0002-hypothesis-representation.md](../../01-decisions/ADR-0002-hypothesis-representation.md), [../../01-decisions/ADR-0008-export-boundaries.md](../../01-decisions/ADR-0008-export-boundaries.md)
- Produces: the shared typed core op-set module, the `caw06` CLI, the MCP server, the review-queue commands (`review`/`confirm`/`reject`), and the read/propose/gated op classification enforced at both surfaces.

## Objective
Expose the **two thin driving surfaces** over the one pipeline core: the `caw06` **CLI** (Jimmy + headless CI) and the **MCP server** (the autonomous ExperimentScout agent). Both are 1:1 renderings of one vetted typed op-set; **no surface carries its own invariant logic**. "Done" means: every op is classed `read` / `propose` / `gated`; read ops never mutate; propose ops only append draft/floor-state records; **gated terminal routes (status→supported, export→CAW-01/02) execute only after Jimmy's `confirm`**; the MCP server does **not** register `confirm` and marks `export` as **stage-only**; no surface can print a hypothesis without `status` + `confidence`; and generated summaries are stamped `generated` and never treated as evidence.

## Preconditions
- [ ] RB-041 merged: the `Run` (and its review-queue staging) is callable from a single entrypoint.
- [ ] RB-040 merged: the ExportAdapter seam supports stage vs commit.
- [ ] `store/review-queue/` exists per ADR-0007.
- [ ] The artifact renderers for the five output kinds exist (P3 outputs).

## Steps

1. **Define the core op-set as one typed module.**
   - Do: Implement each op once with an explicit class: `run`/`extract-claims`/`propose-hypothesis`/`plan-experiment`/`run-experiment`/`log-result`/`map-implications`/`propose-status` = **propose**; `status`/`list-threads`/`show-thread`/`show-hypothesis`/`ledger`/`negative-results`/`render` = **read**; `confirm`/`export` = **gated**. CLI and MCP are thin wrappers — no surface-local rule.
   - Verify: Each op has exactly one class tag; a test asserts CLI subcommands and MCP tools map 1:1 onto the same op functions.

2. **Build the read ops (no mutation).**
   - Do: Implement `status`, `list-threads`, `show-thread`, `show-hypothesis`, `ledger`, `negative-results`, `render`. `show-hypothesis` and every render path MUST assert `status` + `confidence` are present before printing. `negative-results` surfaces failures by default.
   - Verify: Running any read op makes no store changes (hash store before/after); `show-hypothesis` refuses to print a record missing `status`/`confidence`; `negative-results` lists refuted/invalid/aborted entries by default.

3. **Build the propose ops (append at the floor state).**
   - Do: Implement the propose ops to append draft/proposal/ledger records only. `propose-hypothesis` creates at `status=hypothesis`, `confidence=very-low`. `run-experiment` always writes a ledger entry (incl. crash → `invalid`). `propose-status --to supported` enqueues a `StatusEvent` and **does not apply it**. `map-implications` marks the summary `generated`.
   - Verify: `propose-status --to supported` adds a queue item but the hypothesis stays at its current status; a generated summary is stamped `generated` and never enters an `evidence[]` list; no propose op promotes or exports.

4. **Build the human gate (review queue).**
   - Do: Implement `review` (list pending items with evidence + diff), `confirm <id>` (core applies one queued promotion/export), `reject <id> --reason …` (discard, kept for audit). No scheduled Run and no MCP session may drain this queue.
   - Verify: A staged promotion only takes effect after `confirm`; `reject` removes it from the active queue but retains it for audit; a Run cannot empty the queue.

5. **Build the CLI (`caw06`).**
   - Do: Render every op as a subcommand with text/markdown tables and a `--json` mode for CI. Expose `confirm` and `export … --commit` to the human operator. Wire `export <target> --id ID` to **stage** a bundle and `--commit` to emit it through the gate.
   - Verify: `caw06 export caw01-writeback --id WB-XXXX` stages a pending bundle; nothing is emitted until `--commit` (or `confirm`); `--json` output is machine-parseable for CI.

6. **Build the MCP server (proposal-only).**
   - Do: Register all `read` and `propose` ops as MCP tools. **Do NOT register `confirm`.** Register `export` as `export.stage` only (stages a pending bundle; cannot commit). Return structured JSON tool results.
   - Verify: The MCP tool list excludes `confirm`; `export.stage` produces a pending bundle and has no commit path; an agent session can fill the review queue but cannot drain it or emit a `supported` export.

7. **Assert the independence + no-overclaim contract across surfaces.**
   - Do: Confirm export ops write **bundles across the configured boundary** only (RB-040), never into a sibling store. Add cross-surface tests for the hard line: no read op mutates, no propose op promotes/exports, no MCP path reaches a gated terminal route.
   - Verify: All three classes behave per the table in cli-and-mcp.md §"Read vs mutating"; CAW-01/CAW-02 are reachable only as export boundaries.

## Acceptance criteria
- [ ] One typed op-set module backs both surfaces; CLI subcommands and MCP tools are 1:1 with it (ADR-0001).
- [ ] Read ops never mutate; propose ops only append floor-state/draft records; gated ops run only after `confirm`.
- [ ] MCP server excludes `confirm` and exposes `export` as stage-only; CLI exposes `confirm` + `export --commit` to the human.
- [ ] `show-hypothesis`/`render` assert `status` + `confidence` before printing; `negative-results` surfaces failures by default.
- [ ] Generated summaries are stamped `generated` and never treated as evidence.
- [ ] Export writes bundles across the boundary only — never into a sibling product's store.
- [ ] Tree green (compiles, lint-passing).

## Rollback / safety
- Surfaces are stateless wrappers; rolling back a surface change cannot corrupt the store (all mutation goes through the core op-set's append-only paths).
- The review queue is the single enforcement point for brief §12: if any surface path applies a promotion/export without `confirm`, treat it as a defect and revert before shipping.
- `reject` retains discarded items for audit; never hard-delete queue items.

## Hand-off
- The full ExperimentScout is now drivable end-to-end: scheduled/triggered Run (RB-041) + human/agent surfaces (this RB) + export seam (RB-040), closing the Milestone 1 acceptance spine.
- Later phases (M2+) add more SourceAdapters and activate export stubs by extending the op-set/registry — never by adding surface-local logic.
