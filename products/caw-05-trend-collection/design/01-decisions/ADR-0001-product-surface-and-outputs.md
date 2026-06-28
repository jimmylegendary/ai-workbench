# ADR-0001: Product surface — scheduled pipeline core + CLI + MCP + multi-format outputs

- **Status:** proposed
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:**
  - [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF.md) (source of truth)
  - [../_meta/DOC-CONVENTIONS.md](../_meta/DOC-CONVENTIONS.md)
  - [ADR-0002-interest-model.md](ADR-0002-interest-model.md) (load-bearing)
  - [ADR-0003-source-adapters-and-ingestion.md](ADR-0003-source-adapters-and-ingestion.md)
  - [ADR-0004-classification-and-triage.md](ADR-0004-classification-and-triage.md)
  - [../02-research/scheduling-and-ports.md](../02-research/scheduling-and-ports.md) (Run wrapper, ports)
  - [../02-research/synthesis-and-formats.md](../02-research/synthesis-and-formats.md) (the five formats, provenance marking)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
Decide the **surfaces** through which the weekly radar is driven and inspected, and the **output formats** it
emits. It fixes that there is **one pipeline core** (the `Run`) behind three thin driving surfaces — a
**cron-scheduled automation pipeline**, a **CLI**, and an **MCP server** — and that synthesis emits **five
markdown-first formats** (memo, digest, slide outline, paper-card, action brief) through a `FormatRenderer` port.
It does NOT decide the interest model (ADR-0002), ingestion/adapters (ADR-0003), the classification/triage rubric
(ADR-0004), the related-work ledger schema, storage internals, or the export-bundle wire schema — it consumes
those as a stable core boundary.

## Context
- The brief (§4) fixes the **primary surface** as "a scheduled automation pipeline (cron-driven) + a CLI and MCP
  to run/inspect it" and the **outputs** as "memo, digest, slide outline, paper-card, action brief (markdown-first)",
  plus an optional read view of the ledger/digests (§4 secondary).
- The mission is **high recall on a narrow weekly watch list** (§1, §3): the pipeline must run unattended and
  **never silently skip a week** (a missed close paper is an existential novelty risk). The scheduling research
  ([scheduling-and-ports.md](../02-research/scheduling-and-ports.md) §2) shows cron lacks catch-up/overlap/heartbeat,
  so those properties live in the **Run wrapper**, not in the scheduler.
- Findings are **proposals; Jimmy reviews and routes** (§11). No surface may auto-publish a strategic decision;
  surfaces propose, the human confirms (consistent with ADR-0004 §5 review gate).
- **Independence** (§1): CAW-05 has its own core, data, deploy; **no shared runtime substrate**. Outputs cross to
  CAW-01/02/03/06 only as export bundles over explicit boundaries, never a shared store.
- One product core behind all surfaces, mirroring the family pattern (CAW-03 ADR-0001 "one core; thin surfaces").

## Options considered

### A. Surface architecture
| Option | Pros | Cons | Fit |
|---|---|---|---|
| **One pipeline core (`Run`); cron/CLI/MCP are thin driving surfaces over one operation set** | Single place enforces dedup, recall floor, review gate, provenance; surfaces provably equal | Op-manifest discipline | **Chosen** |
| Independent logic per surface | Each ships alone | Governance/dedup drift; weakest surface re-collects or double-exports | Rejected |
| Pipeline only, no CLI/MCP | Minimal | Brief §4 explicitly wants CLI (humans) + MCP (agents) to run/inspect | Rejected |

### B. Scheduler binding
| Option | Pros | Cons | Fit |
|---|---|---|---|
| **cron v1 via `SchedulerAdapter`; Run wrapper owns lock/catch-up/heartbeat** | Brief-mandated; correct even on weak cron; swappable to systemd/cloud later | Wrapper reimplements what cron lacks | **Chosen** |
| Raw crontab calling the pipeline directly | Zero code | No overlap guard, no catch-up, silent skips → violates recall mission | Rejected |
| Require systemd/Airflow in v1 | Native catch-up | Contradicts brief §9 (cron is v1; others are stubs) | Rejected |

### C. Output formats
| Option | Pros | Cons | Fit |
|---|---|---|---|
| **Five markdown-first formats as `FormatRenderer` adapters over one `Finding` set** | Brief §4 exactly; views over one data set; new format = one adapter | Five templates to maintain | **Chosen** |
| One digest only | Cheapest | Misses paper-card→CAW-02/03 and action-brief→CAW-01/06 export surfaces (§8) | Rejected |
| Rich HTML/app outputs | Pretty | Violates markdown-first (§4); heavy; rendering is downstream/optional | Rejected |

### D. Agent/automation interface style (MCP + CLI)
| Option | Pros | Cons | Fit |
|---|---|---|---|
| **Vetted typed ops** (`run`, `status`, `list-findings`, `show-finding`, `render <format>`, `mark-feedback`, `confirm`, `export`) shared by CLI + MCP | Each op carries one invariant; review gate + redaction server-side | More ops to define | **Chosen** |
| Generic CRUD / free-form prompt | Few ops | Leaks invariants; an agent could export an unconfirmed novelty-threat | Rejected |

## Decision
**One pipeline core (the `Run`); three thin surfaces over one set of vetted, typed operations; five markdown-first
output formats behind a `FormatRenderer` port.**

1. **The Run is the unit of work.** `caw05 run --window weekly` is an idempotent, resumable pipeline of stages
   `collect → dedup → classify → synthesize → export`, with per-stage checkpoints, a single-flight lock,
   cursor-based catch-up, and a `run-receipt` heartbeat (see [scheduling-and-ports.md](../02-research/scheduling-and-ports.md)
   §2.2). A crash resumes at the last completed stage; re-running a `done` Run is a no-op.
2. **Scheduled pipeline (primary).** `CronSchedulerAdapter` installs a crontab line that invokes `caw05 run
   --window weekly`. The scheduler only **fires** the Run; all catch-up/overlap/heartbeat guarantees live in the
   Run wrapper so the radar is correct on plain cron. A missing receipt past `cadence + grace` is an **alert**,
   not a no-op (brief "must not silently skip").
3. **CLI (humans + CI).** Thin wrapper over the core op-set: `run`, `status`, `list-findings`, `show-finding`,
   `render <format>`, `mark-feedback` (ADR-0002 §3), `confirm` (review gate, ADR-0004 §5), `export`, `backfill
   --since <date>`. Default surface for headless runs.
4. **MCP server (agents).** The same ops as MCP tools so AI-agent readers consume signals and drive inspection.
   **Mutating-terminal ops are proposal-only:** `confirm` and `export` of a `novelty-threat` create a pending
   human-gate event; an agent never executes the terminal route (brief §11; ADR-0004 §1/§5).
5. **Five output formats (markdown-first).** `memo` (1 finding), `digest` (weekly, N findings), `slide-outline`
   (Marp-compatible), `paper-card` (1 paper → CAW-02/CAW-03), `action-brief` (→ CAW-01/CAW-06). Each is a
   `FormatRenderer` adapter over the shared triaged `Finding`; all inherit one base template carrying the
   provenance manifest + the *"generated summary — not evidence"* banner (synthesis research §4, §6). `noise` is
   never synthesized.
6. **Secondary read view (optional).** A read-mostly view of the ledger + digest archive (brief §4 secondary);
   not load-bearing, ships after the first slice.

**Governance lives in the core, never the surface.** Dedup, the recall-first floor (watch-list hits are never
silently dropped), the review gate, provenance stamping, and the `evidence:false` marking on generated prose are
core logic. A surface may *request* a route; only the core (after the review gate) performs an export.

## Consequences
- **Easy:** add a surface, a format, or an agent without touching collection/triage; cron/CLI/MCP stay in lockstep
  over one op-set; the weekly run self-heals a missed week via cursors (ADR-0003 / scheduling research §3).
- **Easy:** outputs are views over one `Finding` set, so a finding can appear in several formats with one source of
  truth and one provenance manifest.
- **Hard / cost:** the Run wrapper must reimplement cron's missing catch-up/overlap/heartbeat; the MCP server must
  keep `confirm`/`export` proposal-only and resist "let the agent route it" pressure.
- **Follow-on:** ADR-0002 supplies the relevance score the digest renders; ADR-0003 supplies `RawFinding`s and the
  `SchedulerAdapter`; ADR-0004 supplies the routed, review-gated findings synthesis consumes. Runbooks: (1) Run
  wrapper + lifecycle; (2) CLI over the op-set; (3) MCP server (proposal-only terminals); (4) the base template +
  five `FormatRenderer` adapters; (5) optional read view.

## Open questions / revisit triggers
- TODO(open-question: heartbeat/dead-man's-switch sink — local "no receipt in N days" check vs external service,
  given "no shared substrate"? owned with the storage/scheduling ADR.) See [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md).
- TODO(open-question: is a Run one synchronous process or resumable stage-jobs with a handle? affects the CLI/MCP
  `status` contract — mirrors scheduling research §Open.)
- TODO(open-question: does the optional read view ship in v1 or is `caw05 status` + the digest archive enough for
  the first slice? lean: CLI/digest first, view later.)
- **Revisit trigger:** if any surface needs logic the core op-set does not express, extend the op-set (not the
  surface) — a surface-local rule is a contract leak.
