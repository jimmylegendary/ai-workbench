# RB-042: Build the CLI and MCP surfaces over the one pipeline core (read vs mutating)

- Status: ready
- Phase: phase-4-export-and-schedule
- Depends on: [RB-041 (Run wrapper + receipts), RB-040 (ExportAdapter + idempotency), RB-032 (FormatRenderer/digest), RB-021 (classification review gate), RB-003 (core op-set)]
- Implements design: [../../06-interfaces/cli-and-mcp.md](../../06-interfaces/cli-and-mcp.md), [../../01-decisions/ADR-0001-product-surface-and-outputs.md](../../01-decisions/ADR-0001-product-surface-and-outputs.md), [../../06-interfaces/scheduled-pipeline.md](../../06-interfaces/scheduled-pipeline.md), [../../01-decisions/ADR-0007-export-boundaries.md](../../01-decisions/ADR-0007-export-boundaries.md)
- Produces: the `caw05` CLI (humans/CI) and the MCP server (agents) — both thin wrappers over the same vetted typed op-set: `run`/`backfill`/`status`/`list-findings`/`show-finding`/`render`/`mark-feedback`/`confirm`/`export`; the read-vs-mutating contract; the proposal-only terminal rule on MCP.

## Objective
Two surfaces — a CLI for humans/CI and an MCP server for AI agents — drive and inspect the radar through the
**same core operations**, so a rule (dedup, recall floor, review gate, provenance stamping, `evidence:false`
marking) cannot drift between them. "Done" = both surfaces call the identical op-set; read ops never mutate;
mutating terminals (`confirm`/`export`) execute on the CLI (operator is the gate) but are **proposal-only on
MCP** (an agent can never export an unconfirmed novelty-threat to CAW-03); `render` always stamps the "generated
summary — not evidence" banner; and `status` surfaces the dead-man "radar went dark" state.

## Preconditions
- [ ] RB-003 fixed the typed core op-set; both surfaces will call it, never reimplement logic.
- [ ] RB-041 provides the Run (`run`/`backfill`) + `run-receipt` (for `status`/dead-man).
- [ ] RB-040 provides the gated `export` with idempotency keys.
- [ ] RB-021 provides the review gate (`confirm` completes it) and `mark-feedback` feeds the versioned interest update (ADR-0002 §3).
- [ ] RB-032 provides `render` over the digest tree; tree is green.

## Steps

### 1. Define the shared op-set binding
- **Do:** Bind all nine ops to single core functions: `run`(mutating), `backfill`(mutating), `status`(read), `list-findings`(read), `show-finding`(read), `render`(read*), `mark-feedback`(mutating), `confirm`(mutating, gated), `export`(mutating, gated) — per cli-and-mcp.md "operation set". Both surfaces import these; neither adds branch logic. If a surface needs logic the op-set lacks, **extend the op-set, not the surface** (ADR-0001 revisit trigger).
- **Verify:** A test asserts the CLI and MCP both dispatch to the identical core function per op (e.g. shared dispatch table); no op has surface-specific business logic.

### 2. Implement the CLI read ops
- **Do:** Implement `caw05 status [--run <id>] [--json]` (last receipt + dead-man state), `caw05 list-findings [--window][--class][--quality][--min-score][--unreviewed][--json]` (redacted view; recall-floor hits never hidden), `caw05 show-finding <id> [--json]` (full provenance manifest), `caw05 render <format> <id|--window> [--out]`. `render` writes a derived/regenerable artifact to the digest tree → read-class for governance. `--json` on every read op.
- **Verify:** Read ops never advance a cursor, append to the ledger, or emit a bundle (assert via no state change). `render` output always carries the "generated summary — not evidence" banner. `list-findings` never hides a recall-floor hit.

### 3. Implement the CLI mutating ops
- **Do:** Implement `caw05 run [--window weekly][--dry-run][--resume][--source ...]`, `caw05 run --since <date>` (backfill, ignores cursors), `caw05 mark-feedback <id> --label ... [--note]` (versioned interest-feedback record), `caw05 confirm <id>` (completes the review gate), `caw05 export <id> --target <caw-02|caw-03|caw-01|caw-06> [--dry-run]`. On CLI, `confirm`/`export` **execute** (the operator IS the human gate) — but the core still enforces the export idempotency key so a repeat is a no-op, never a double-route.
- **Verify:** `run` holds the single-flight lock; `mark-feedback` writes a versioned record; CLI `export` of a confirmed novelty-threat emits exactly one bundle and a repeat is a no-op.

### 4. Implement the CLI exit-code map
- **Do:** Map exit codes (cli-and-mcp.md): `0` ok; `2` lock held (another Run in flight, refused not stacked); `3` dead-man alert (no recent receipt); `4` gated op refused (unconfirmed terminal); `5` source/adapter error. `TODO(open-question: finalize codes on review.)`
- **Verify:** Each condition returns its mapped code (table-driven test): concurrent run→2, stale receipt→3, unconfirmed terminal→4, adapter error→5.

### 5. Implement the MCP server (one tool per op)
- **Do:** Expose each op as one MCP **tool** with a typed input/output schema (`caw05.run`, `caw05.backfill`, `caw05.status`, `caw05.list_findings`, `caw05.show_finding`, `caw05.render`, `caw05.mark_feedback`, `caw05.confirm`, `caw05.export`). Tools are vetted typed ops — **never generic CRUD or free-form prompts** (a generic seam would leak the invariants). Enforce server-side: redaction (no confidential/internal data ever leaves; brief §12), the review gate, and the proposal-only terminal rule. Output rows carry `evidence:false` on generated fields and the additive `relevance.explanation` (ADR-0002).
- **Verify:** Each tool has a typed schema; a free-form/non-vetted call is rejected. `list_findings` output marks generated fields `evidence:false` and includes the additive relevance explanation. Redaction strips any non-public field before return.

### 6. Implement the proposal-only terminal rule on MCP
- **Do:** On MCP, `confirm` and `export` of a `novelty-threat` **never execute the terminal route** — they create a *pending human-gate event* and return a handle (`{status:"pending-human-gate", gate_event_id, finding_id, target, idempotency_key, note}`); Jimmy completes it via CLI `confirm`/`export` (brief §11; ADR-0004 §1/§5). This is the single most important surface invariant: an agent must not export an unconfirmed novelty-threat to CAW-03. `TODO(open-question: gate notification channel given no shared substrate; per-tool auth scoping.)`
- **Verify:** MCP `caw05.export` of a novelty-threat returns `pending-human-gate` and emits NO bundle; the same finding only crosses the boundary after a CLI `confirm`/`export` by the operator. A read op via MCP is unaffected.

### 7. Wire the observability surface (`status`)
- **Do:** `status` reads the latest `run-receipt` (RB-041) and reports window, per-source `{fetched,new,dup}`, classified counts, exports, and **dead-man state**: if no receipt exists past `cadence + grace`, return the "radar went dark" alert (non-zero exit on CLI; alert field on MCP).
- **Verify:** With a fresh receipt `status` reports counts; with a stale/missing receipt it returns the dead-man alert (CLI exit 3).

## Acceptance criteria
- [ ] CLI and MCP both call the identical core op-set; no business logic in either surface.
- [ ] Read ops (`status`/`list-findings`/`show-finding`/`render`) never mutate cursors/ledger/exports; `--json` on every read.
- [ ] `render` always stamps "generated summary — not evidence"; generated fields are `evidence:false`.
- [ ] CLI `confirm`/`export` execute (operator is the gate) with idempotency; MCP `confirm`/`export` of a novelty-threat are proposal-only (pending gate event, no emit).
- [ ] MCP tools are vetted typed ops; free-form/generic calls rejected; server-side redaction enforced.
- [ ] CLI exit-code map implemented (0/2/3/4/5).
- [ ] `status` surfaces the dead-man "radar went dark" alert from the receipt.
- [ ] `list-findings` never hides recall-floor hits; tree is green.

## Rollback / safety
- Both surfaces are thin wrappers; disabling the MCP server or removing CLI subcommands leaves the core Run (cron) intact.
- The proposal-only terminal rule is a hard safety boundary — never make MCP `confirm`/`export` execute a novelty-threat route to pass a test; the agent path is always pending-gate.
- Redaction and `evidence:false` marking are enforced in the core, so even a buggy surface cannot leak confidential data or pass a generated summary as evidence.
- Read ops are side-effect-free; an interrupted read leaves no state to undo.

## Hand-off
- Operators and CI now drive the radar via CLI; AI agents consume signals via MCP read ops and request routes via proposal-only terminals.
- M2+ (RB-05x/06x) add more export targets and formats; both surfaces pick them up through the op-set with no surface change (extend the op-set, not the surface).
- The full M1 slice is now operable end-to-end by both a human (CLI) and an agent (MCP), over the one cron-scheduled Run.
