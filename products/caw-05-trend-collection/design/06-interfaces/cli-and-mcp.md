# CLI & MCP — driving and inspecting the radar

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [scheduled-pipeline.md](scheduled-pipeline.md) (the cron-fired Run this CLI/MCP also fires)
  - [digest-outputs.md](digest-outputs.md) (the formats `render` emits and the read view)
  - [../01-decisions/ADR-0001-product-surface-and-outputs.md](../01-decisions/ADR-0001-product-surface-and-outputs.md) (the op-set is fixed here)
  - [../01-decisions/ADR-0006-storage-and-scheduling.md](../01-decisions/ADR-0006-storage-and-scheduling.md) (Run lifecycle, lock, receipts)
  - [../01-decisions/ADR-0004-classification-and-triage.md](../01-decisions/ADR-0004-classification-and-triage.md) (review gate behind `confirm`)
  - [../01-decisions/ADR-0007-export-boundaries.md](../01-decisions/ADR-0007-export-boundaries.md) (the only export seam)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
This doc specifies the **two human/agent-facing surfaces** over the one pipeline core: the **CLI** (humans + CI)
and the **MCP server** (AI agents). Both are thin wrappers over the **same vetted, typed op-set** fixed in
ADR-0001 §D. It defines each operation, its read-vs-mutating classification, its arguments and output shape, and
the **proposal-only** constraint on terminal mutating ops. It does NOT define the Run internals (see
[scheduled-pipeline.md](scheduled-pipeline.md)), the output templates (see [digest-outputs.md](digest-outputs.md)),
or the export wire schema (ADR-0007). Governance lives in the **core**; these surfaces only request it.

## Principle: one op-set, two transports
CLI and MCP are **provably equal** — both call the same core operations, so a rule (dedup, recall floor, review
gate, provenance stamping, `evidence:false` marking) cannot drift between them. A surface may *request* a route;
only the core, after the review gate, performs an export. If a surface needs logic the op-set does not express,
**extend the op-set, not the surface** (ADR-0001 revisit trigger).

## The operation set

| Op | Kind | CLI form | MCP tool | One invariant it carries |
|---|---|---|---|---|
| `run` | mutating | `caw05 run --window weekly` | `caw05.run` | single-flight lock; resumable stages |
| `backfill` | mutating | `caw05 run --since <date>` | `caw05.backfill` | ignores cursors; one-off historical sweep |
| `status` | read | `caw05 status [--run <id>]` | `caw05.status` | last receipt; "radar went dark" alert state |
| `list-findings` | read | `caw05 list-findings [filters]` | `caw05.list_findings` | redacted view; recall-floor hits never hidden |
| `show-finding` | read | `caw05 show-finding <id>` | `caw05.show_finding` | full provenance manifest |
| `render` | read* | `caw05 render <format> <id\|--window>` | `caw05.render` | emits with "generated summary — not evidence" banner |
| `mark-feedback` | mutating | `caw05 mark-feedback <id> --label …` | `caw05.mark_feedback` | feeds interest update (ADR-0002 §3); versioned |
| `confirm` | mutating (gated) | `caw05 confirm <id>` | `caw05.confirm` | **proposal-only on MCP**; human-gate event |
| `export` | mutating (gated) | `caw05 export <id> --target <caw>` | `caw05.export` | **proposal-only on MCP**; idempotency key |

`render` is read in that it never mutates findings/ledger; it *writes an output artifact* to the digest tree
(see [digest-outputs.md](digest-outputs.md)) — a derived, regenerable file, so it is treated as read-class for
governance.

## Read vs mutating — the contract

### Read ops (safe for anyone, any surface)
`status`, `list-findings`, `show-finding`, `render`. These never advance a cursor, never append to the ledger,
never emit an export bundle. They are the default agent-facing surface: an AI reader consumes signals through
`list-findings` + `show-finding` + `render`, never through a write.

### Mutating ops (core-governed)
`run`/`backfill` change cursors, the `seen` index, findings, and the ledger; `mark-feedback` writes a
versioned interest-feedback record; `confirm`/`export` are the **terminal** mutators that can cross a product
boundary.

### The proposal-only rule (terminals)
On **MCP**, `confirm` and `export` of a `novelty-threat` finding **never execute the terminal route**. They
create a *pending human-gate event* and return a handle; Jimmy completes it via the CLI `confirm`/`export`
(brief §11; ADR-0004 §1/§5). This is the single most important surface invariant: an agent must not be able to
export an unconfirmed novelty-threat to CAW-03. On the **CLI**, `confirm`/`export` execute because the operator
*is* the human gate — but the core still enforces the export idempotency key (ADR-0006 §4.4) so a repeat is a
no-op, never a double-route.

| Surface | `run` | read ops | `mark-feedback` | `confirm` / `export` |
|---|---|---|---|---|
| **CLI** (human/CI) | executes | executes | executes (versioned) | **executes** (operator is the gate) |
| **MCP** (agent) | executes (still single-flight) | executes | executes (versioned) | **proposal-only** → pending gate event |

## CLI shape

```text
caw05 run        [--window weekly] [--dry-run] [--resume] [--source <name>...]
caw05 run        --since <YYYY-MM-DD>          # backfill: ignore cursors
caw05 status     [--run <run_id>] [--json]     # last receipt + dead-man state
caw05 list-findings [--window weekly] [--class novelty-threat|support|adjacent|noise]
                    [--quality signal|hype] [--min-score <f>] [--unreviewed] [--json]
caw05 show-finding  <finding_id> [--json]      # full provenance manifest
caw05 render        <memo|digest|slide-outline|paper-card|action-brief>
                    <finding_id | --window weekly> [--out <path>]
caw05 mark-feedback <finding_id> --label <relevant|irrelevant|threat|...> [--note <s>]
caw05 confirm       <finding_id>               # complete the review gate
caw05 export        <finding_id> --target <caw-02|caw-03|caw-01|caw-06> [--dry-run]
```

Exit codes (illustrative; finalize in runbook): `0` ok; `2` lock held (another Run in flight — refused, not
stacked); `3` dead-man alert (no recent receipt); `4` gated op refused (unconfirmed terminal); `5` source/adapter
error. `--json` on every read op for CI/agent parsing.

## MCP server shape
Each op above is one MCP **tool** with a typed input/output schema. The server enforces, server-side:
redaction (no confidential/internal data ever leaves; brief §12), the review gate, and the proposal-only
terminal rule. Tools are **vetted typed ops**, never generic CRUD or free-form prompts (ADR-0001 §D) — a generic
seam would leak the invariants.

```jsonc
// caw05.list_findings — input
{ "window": "weekly", "class": ["novelty-threat","support"],
  "quality": "signal", "min_score": 0.0, "unreviewed": false, "limit": 50 }
// caw05.list_findings — output (one row)
{ "finding_id": "f_…", "title": "…", "class": "novelty-threat", "quality": "signal",
  "relevance": { "score": 7.4, "explanation": ["bm25:…","keyword-tier1:…"] },  // ADR-0002 additive/explainable
  "source": { "family": "arxiv", "canonical_id": "arXiv:…" },
  "reviewed": false, "evidence": false }            // generated fields are evidence:false
```

```jsonc
// caw05.export — MCP (agent) result is ALWAYS a proposal, never an emit
{ "status": "pending-human-gate", "gate_event_id": "g_…",
  "finding_id": "f_…", "target": "caw-03",
  "idempotency_key": "hash(finding_id+target+classification_version)",
  "note": "agent-requested; awaiting Jimmy confirm on CLI" }
```

## Observability surface (`status`)
`status` reads the latest `run-receipt` (ADR-0006 §3) and reports: window, per-source `{fetched,new,dup}`,
classified counts, exports, and **dead-man state** — if no receipt exists past `cadence + grace`, `status`
returns the "radar went dark" alert (non-zero exit on CLI). This is how an operator or agent confirms the radar
is alive without opening files.

## Open Questions
- TODO(open-question: is `run` synchronous (blocks until `done`) or does it return a run handle that `status`
  polls? affects the CLI/MCP `status` contract — mirrors ADR-0006 open question.)
- TODO(open-question: does MCP `confirm`/`export` notification reach Jimmy via the heartbeat sink or a separate
  channel, given "no shared substrate"?)
- TODO(open-question: per-tool auth/scoping on the MCP server — is read-only a separate token from mutating?)
- See [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md).

## Implications for runbooks
- **RB (CLI):** thin wrapper over the core op-set; `--json` on reads; exit-code map; `--resume`/`--dry-run`.
- **RB (MCP server):** one tool per op; typed schemas; server-side redaction + review gate; **proposal-only
  terminals**; reject any non-vetted/free-form call.
- Both link back to ADR-0001 (op-set) and ADR-0006 (Run lifecycle, lock, receipts).
