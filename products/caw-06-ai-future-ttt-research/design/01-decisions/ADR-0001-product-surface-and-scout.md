# ADR-0001: Product surface — ExperimentScout pipeline core + CLI + MCP + thread outputs

- **Status:** proposed
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:**
  - [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF.md) (source of truth)
  - [../_meta/DOC-CONVENTIONS.md](../_meta/DOC-CONVENTIONS.md)
  - [ADR-0002-hypothesis-representation.md](ADR-0002-hypothesis-representation.md) (load-bearing)
  - [ADR-0003-experiment-ledger.md](ADR-0003-experiment-ledger.md)
  - [ADR-0004-writeback-traffic-schema.md](ADR-0004-writeback-traffic-schema.md) (load-bearing)
  - [../02-research/source-and-claim-ingestion.md](../02-research/source-and-claim-ingestion.md)
  - [../02-research/implication-mapping-and-export.md](../02-research/implication-mapping-and-export.md)
  - [../02-research/ttt-landscape.md](../02-research/ttt-landscape.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
Decide the **surfaces** that drive and inspect CAW-06 and the **outputs** it emits. It fixes that there is **one
pipeline core** — the `ExperimentScout` `Run` — behind three thin driving surfaces (a **scheduled/triggered
automation pipeline**, a **CLI**, and an **MCP server**), and that the core produces five output artifact kinds:
**research-thread records, a small-experiment ledger, hypothesis cards, implication maps, and writeback-traffic
schema artifacts** (brief §4). It does NOT decide hypothesis representation (ADR-0002), the ledger schema
(ADR-0003), the writeback-traffic schema/CAW-01 bridge (ADR-0004), the source/claim ingestion ports
([source-and-claim-ingestion.md](../02-research/source-and-claim-ingestion.md)), or storage/scheduling internals —
it consumes those as a stable core boundary.

## Context
- The brief (§4) fixes the **primary surface** as "the ExperimentScout pipeline (scheduled/triggered) + a CLI and
  MCP to run/inspect it" and the **outputs** as "research-thread records, a small-experiment ledger, hypothesis
  cards, implication maps, and writeback-traffic schema artifacts". One product core behind all surfaces; **no
  shared substrate** (§4, §1).
- The **unit of value** is one tracked research thread: `source → claim → hypothesis → small experiment → result
  (incl. failure) → implication`, with provenance and explicit uncertainty (§2). The thread, not the run, is the
  durable object; a Run advances threads.
- The brief fixes the **six pipeline stages** (§5): source discovery → claim extraction → hypothesis generation →
  minimal-reproduction planning → result logging → implication mapping. These already have research docs; this ADR
  binds them into one resumable Run and the surfaces over it.
- **Automatic scouting is proposal/hypothesis generation; Jimmy is the reviewer for strategic decisions** (§12).
  No surface may auto-promote a hypothesis to `supported`, auto-export a claim to CAW-02, or auto-commit a
  writeback schema to CAW-01 — surfaces propose, the human confirms.
- **Independence** (§1, §8): CAW-06 owns its core/data/deploy. It **imports** public research and CAW-05 signals
  and **exports** to CAW-01/CAW-02 across explicit file/API boundaries — never a shared store.
- Family pattern: one core, thin surfaces, vetted typed ops (CAW-05 ADR-0001; CAW-03 ADR-0001).

## Options considered

### A. Surface architecture
| Option | Pros | Cons | Fit |
|---|---|---|---|
| **One pipeline core (`ExperimentScout` Run); pipeline/CLI/MCP are thin driving surfaces over one typed op-set** | Single place enforces the anti-overclaim invariants (status, evidence separation), provenance, dedup, review gate; surfaces provably equal | Op-manifest discipline | **Chosen** |
| Independent logic per surface | Each ships alone | Invariant drift; a weak surface could export a bare hypothesis as a claim | Rejected |
| Pipeline only, no CLI/MCP | Minimal | Brief §4 explicitly wants CLI (Jimmy/CI) + MCP (the agent ExperimentScout) | Rejected |

### B. Run granularity / triggering
| Option | Pros | Cons | Fit |
|---|---|---|---|
| **`Run` = a resumable pass over the six stages, advancing threads; scheduled AND on-demand (triggered) via a `SchedulerAdapter`** | Brief §4 says "scheduled/triggered"; per-stage checkpoints; a crash resumes at the last stage; re-run of a `done` thread-stage is a no-op | Wrapper owns lock/cursor/heartbeat | **Chosen** |
| Pure cron weekly only | Simple | Misses "triggered" (e.g. a CAW-05 import or a new arXiv hit should be able to open a thread now) | Rejected |
| One monolithic synchronous job | Easy to write | No resume; a failed experiment loses the whole pass | Rejected |

### C. Output artifacts
| Option | Pros | Cons | Fit |
|---|---|---|---|
| **Five artifact kinds as renderings over one thread store: thread record, ledger entry, hypothesis card, implication map, writeback-traffic artifact** | Brief §4 exactly; all are views/derivations of one provenance-stamped thread; each owned by its sibling ADR/doc | Five schemas to keep consistent | **Chosen** |
| Just thread records + free-text notes | Cheapest | Loses the ledger (ADR-0003), the schema export (ADR-0004), the implication routing — the product's actual value | Rejected |
| Rich app/dashboard outputs | Pretty | Violates markdown/JSON-first (§7); rendering is downstream/optional | Rejected |

### D. Agent/automation interface style (MCP + CLI)
| Option | Pros | Cons | Fit |
|---|---|---|---|
| **Vetted typed ops** shared by CLI + MCP, with mutating-terminal ops proposal-only | Each op carries one invariant; review gate + uncertainty stamping server-side | More ops to define | **Chosen** |
| Generic CRUD / free-form prompt | Few ops | Leaks invariants; an agent could promote a hypothesis or export a bare hypothesis | Rejected |

## Decision
**One pipeline core — the `ExperimentScout` Run; three thin surfaces over one set of vetted typed operations; five
output artifact kinds derived from one thread store.**

1. **The thread is the durable unit; the Run advances it.** Each thread is a `source → claim → hypothesis →
   experiment → result → implication` record with provenance and explicit uncertainty (brief §2). A `Run` is a
   resumable pass over the six stages (`discover → extract → hypothesize → plan-repro → log-result → map-implications`)
   with per-stage checkpoints, a single-flight lock, cursor-based catch-up, and a run-receipt heartbeat. A crash
   resumes at the last completed stage; re-running a completed thread-stage is a no-op.
2. **Scheduled + triggered pipeline (primary).** A `SchedulerAdapter` (cron v1; stubs documented per brief §9)
   fires a periodic Run; on-demand triggers (`caw06 run --thread <id>`, or an import event from the
   `CAW05ImportAdapter`) open/advance a single thread immediately. The scheduler only **fires**;
   catch-up/overlap/heartbeat live in the Run wrapper so the pipeline is correct on plain cron.
3. **CLI (Jimmy + CI).** Thin wrapper over the core op-set: `run`, `status`, `list-threads`, `show-thread`,
   `show-hypothesis`, `plan-experiment`, `log-result`, `map-implications`, `render <artifact>`,
   `negative-results` (the failures view, ADR-0003), `confirm` (review gate), `export <target>`. Default surface
   for headless runs.
4. **MCP server (the ExperimentScout agent).** The same ops as MCP tools so the agent can discover sources,
   extract claims, propose hypotheses, and draft experiments. **Mutating-terminal ops are proposal-only:**
   promoting a hypothesis to `supported`, exporting to CAW-02, and committing a writeback schema to CAW-01 create a
   **pending human-gate event** — the agent never executes the terminal route (brief §12). Scouting is hypothesis
   generation, not adjudication.
5. **Five output artifacts (markdown/JSON-first).**
   - **Research-thread record** — the spine; links one source/claim/hypothesis/experiment/implication chain with
     provenance and `boundary`.
   - **Small-experiment ledger entry** — one toy reproduction run; schema and failures-useful discipline in
     [ADR-0003](ADR-0003-experiment-ledger.md).
   - **Hypothesis card** — a rendering of a `Hypothesis` that MUST display `status` + `confidence` and its full run
     history; never prints a hypothesis as a bare assertion (schema in [ADR-0002](ADR-0002-hypothesis-representation.md)).
   - **Implication map** — the stage-6 fan-out of typed, uncertainty-tagged implications by domain, the routing
     layer before export ([implication-mapping-and-export.md](../02-research/implication-mapping-and-export.md)).
   - **Writeback-traffic schema artifact** — the `wbtraffic` JSON/card, the CAW-01 L0/L1 bridge
     ([ADR-0004](ADR-0004-writeback-traffic-schema.md)).
6. **Ports & adapters seams (build v1, stub the rest; brief §9).** `SourceAdapter` (arXiv/Semantic Scholar +
   `CAW05ImportAdapter` v1), `ExperimentRunnerAdapter` (minimal local toy runner v1), `ExportAdapter` (CAW-01 +
   CAW-02 v1). A config-driven registry binds families; stubs implement the Protocol and report
   `HealthStatus="deferred"`.

**Governance lives in the core, never the surface.** The three-layer separation (source claim / hypothesis /
evidence), the `status` default-to-`hypothesis` floor, the `confidence ≤ evidence_strength` cap, the
`generated`-evidence-cannot-promote rule, provenance stamping, the failures-first ledger discipline, and the
per-target export gates are all core logic. A surface may *request* a route; only the core, after the review gate,
performs a promotion or an export.

## Consequences
- **Easy:** add a surface, an artifact renderer, a source/runner/export adapter, or wire in a new MCP tool without
  touching the stage logic; CLI/MCP/pipeline stay in lockstep over one op-set.
- **Easy:** every artifact is a view/derivation of one thread, so a finding appears as a hypothesis card, an
  implication map, and an export bundle with one provenance manifest and one uncertainty value.
- **Hard / cost:** the Run wrapper must reimplement cron's missing catch-up/overlap/heartbeat (mirrors CAW-05);
  the MCP server must keep promotions/exports proposal-only and resist "let the agent route it" pressure; five
  artifact schemas must stay consistent with their owning ADRs.
- **Follow-on:** ADR-0002 supplies the hypothesis/status model every card and export carries; ADR-0003 supplies
  ledger entries that become evidence; ADR-0004 supplies the writeback artifact and the CAW-01 bridge;
  ingestion + implication-mapping research docs supply the first and last stages. Runbooks: (1) Run wrapper +
  thread lifecycle; (2) CLI over the op-set; (3) MCP server (proposal-only terminals); (4) the five artifact
  renderers; (5) the adapter registry + documented stubs.

## Open questions / revisit triggers
- TODO(open-question: is a Run one synchronous process or resumable stage-jobs with a handle? affects the CLI/MCP
  `status` contract.) See [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md).
- TODO(open-question: heartbeat/dead-man's-switch sink given "no shared substrate" — local "no receipt in N days"
  check vs external service? owned with the storage/scheduling ADR.)
- TODO(open-question: does a CAW-05 import trigger an immediate single-thread Run, or just enqueue for the next
  scheduled pass? lean: enqueue + optional `--now`.)
- **Revisit trigger:** if any surface needs logic the core op-set does not express, extend the op-set (not the
  surface) — a surface-local rule is a contract leak (especially any rule that could weaken an anti-overclaim
  invariant).
