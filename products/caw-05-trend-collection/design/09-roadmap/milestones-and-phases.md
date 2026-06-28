# Milestones & Phases

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: review date)
- **Related:** [./dependency-graph.md](./dependency-graph.md), [./risks-and-mitigations.md](./risks-and-mitigations.md), [../01-decisions/ADR-0001-product-surface-and-outputs.md](../01-decisions/ADR-0001-product-surface-and-outputs.md), [../01-decisions/ADR-0006-storage-and-scheduling.md](../01-decisions/ADR-0006-storage-and-scheduling.md), [../01-decisions/ADR-0007-export-boundaries.md](../01-decisions/ADR-0007-export-boundaries.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
This doc sequences CAW-05 delivery into phases and milestones, each with explicit **entry/exit** gates, so an
interrupted build resumes cleanly (FILES-AS-TRUTH, small resumable runbooks per ADR-0006). It defines **what** ships
in what order; it does NOT define adapter internals (see [../06-interfaces/](../06-interfaces/)), ranking math
([../01-decisions/ADR-0002-interest-model.md](../01-decisions/ADR-0002-interest-model.md)), or the runbook steps
([../10-runbooks/](../10-runbooks/)). Phase folders here map 1:1 to runbook number ranges (`RB-0XX` = Phase 0, etc.).

## North star
**Milestone 1 = the narrow weekly radar, end-to-end**: fetch watch-list sources → relevance → classify → weekly
digest, with **at least one** novelty-threat finding exported to CAW-03. Everything before M1 is enabling
scaffolding; everything after M1 widens coverage and adds export targets. Per PRODUCT-BRIEF §12, we prefer a thin
vertical slice (narrow + weekly) over broad horizontal scaffolding.

## Phase map

| Phase | Folder / RB range | Theme | Milestone |
|-------|-------------------|-------|-----------|
| P0 | `RB-0XX` | Foundations: repo, ports, store, run skeleton | M0 |
| P1 | `RB-1XX` | Interest model + watch-list source adapters (ingest) | — |
| P2 | `RB-2XX` | Relevance (BM25-first, additive, recall-floor) | — |
| P3 | `RB-3XX` | Classification/triage cascade + routing | — |
| P4 | `RB-4XX` | Synthesis (digest first) + **M1 cut** | **M1** |
| P5 | `RB-5XX` | Ledger + Semantic Scholar verification + CAW-03 export | M2 |
| P6 | `RB-6XX` | Remaining exports (CAW-02/01/06) + more formats | M3 |
| P7 | `RB-7XX` | Scheduling hardening, embedding lane (alpha), stubs | M4 |

## Phase detail (entry → exit gates)

### P0 — Foundations (M0: a Run that does nothing, cleanly)
Stand up the **one pipeline core (a Run)** and the **three thin surfaces** (scheduled / CLI / MCP) as no-op
skeletons; define every **port** (SourceAdapter, classifier, routing, FormatRenderer, ExportAdapter,
SchedulerAdapter) with documented stubs; create the **FILES-AS-TRUTH** layout + SQLite index.

- **Entry:** ADRs 0001/0006/0007 accepted; repo created.
- **Exit:** `caw05 run --dry-run` executes the full pipeline shape end-to-end over zero findings; layout
  `interests.yaml`, `findings/*.json`, `ledger/*.jsonl` exists; SQLite index builds; CLI + MCP both reach the core;
  tree is green (compiles, lint-passes). No adapter fetches real data yet.

### P1 — Interest model + ingest (watch-list sources online)
Author the curated **typed interest artifact** (keywords/topics/entities/authors/venues, tiers + polarity), seeded
from the PRODUCT-BRIEF §6 watch list. Implement v1 SourceAdapters behind the port: arXiv + Semantic Scholar +
GitHub + curated blog RSS + HN-light, with incremental cursors (date/ETag watermarks) + multi-layer dedup in the
CORE. Legal/ToS-safe only.

- **Entry:** P0 exit; ADR-0002 + ADR-0003 accepted.
- **Exit:** `interests.yaml` v1 committed + human-gated/versioned; a real Run fetches raw findings from all v1
  adapters into `findings/*.json` with full provenance (origin/date/retrieval); cursors persist and a second Run is
  incremental (no re-fetch of seen items); dedup verified on a repeated Run.

### P2 — Relevance (recall-first, explainable)
Implement the **BM25-first additive explainable** relevance score with a **recall-first floor** (better to surface
than to drop). Each scored finding carries a human-readable score breakdown. Embedding lane stays OFF (P7, alpha).

- **Entry:** P1 exit (need interests + ingested findings).
- **Exit:** every finding gets a score + an additive explanation; the recall floor is configurable; on a manual
  watch-list spot-check no known close item is dropped below the floor (TODO(open-question: labeled recall target));
  ranking is reproducible from files.

### P3 — Classification / triage + routing
Implement the **two-axis taxonomy** (novelty-threat/support/adjacent/noise × signal/hype) via the
**LF → LLM → human cascade** with a recall-biased **selective-review** gate (abstain → human on low confidence).
Deterministic **config-driven routing** to knowledge / task / experiment / open-question / discard. Generated
rationale is recorded but is **never evidence**.

- **Entry:** P2 exit.
- **Exit:** findings carry both axes + confidence + cascade stage; low-confidence items are queued for human review,
  not auto-decided; routing is deterministic from config; rationale stored separately and flagged non-evidence.

### P4 — Synthesis + **Milestone 1**
Implement the FormatRenderer port and ship the **digest** format first (other four formats are stubs ready). Wire
the scheduled surface for a weekly cadence. **M1 cut**: a single weekly Run produces a digest covering the narrow
watch list AND emits **one novelty-threat** finding through to CAW-03.

- **Entry:** P3 exit; P5 CAW-03 export seam available in minimal form (may be developed in parallel — see DAG).
- **Exit (M1):** one command/cron Run produces the weekly digest from real watch-list sources; ≥1 finding is
  classified novelty-threat and a CAW-03 RadarSignal bundle is written across the export boundary; the whole Run is
  resumable from files after interruption.

### P5 — Ledger + verification + CAW-03 export (M2)
Implement the **append-only related-work ledger** (WatchedTarget, Finding/Signal, LedgerLink + verification record)
with **Semantic Scholar verification** (Levenshtein title gate + year±1 + multi-key dedup). A provenance-complete
LedgerLink is the single auditable record. Harden the CAW-03 novelty export.

- **Entry:** M1 shipped (digest proves the pipeline).
- **Exit (M2):** every exported novelty-threat traces to a provenance-complete LedgerLink with a verification
  record; ledger is append-only (`ledger/*.jsonl`); CAW-03 bundles are signed (ADR-0007).

### P6 — Remaining exports + formats (M3)
Add ExportAdapters for **CAW-02** (Source/Claim/RelatedWork) and **CAW-01/CAW-06** (open questions); fill out the
remaining four output formats (memo, slide outline, paper-card, action brief). No shared store — file/API bundles
only, signed.

- **Entry:** M2.
- **Exit (M3):** all four v1 export targets emit signed bundles via the single ExportAdapter seam; all five formats
  render from one finding; documented stubs remain for non-v1 targets.

### P7 — Hardening + alpha lanes (M4)
Scheduling hardening (retries, resumable cursors, rate-limit backoff); the **embedding relevance lane** as gated
**alpha** (requires a labeled eval set before any default-on); flesh out documented stubs (Reddit, SEC/EDGAR,
newsletters) without enabling unsafe ingestion.

- **Entry:** M3.
- **Exit (M4):** weekly cron runs unattended across a TODO(open-question: stability window); embedding lane behind a
  flag with an eval gate; stubs documented and disabled by default.

## Milestone summary

| Milestone | Definition of done | Proves |
|-----------|--------------------|--------|
| M0 | No-op Run across all surfaces; ports + store skeleton green | Architecture seams hold |
| **M1** | Weekly digest from watch-list sources + 1 novelty-threat → CAW-03 | The radar works end-to-end |
| M2 | Auditable ledger + verified, signed CAW-03 export | Novelty claims are defensible |
| M3 | All v1 exports + all 5 formats | Full synthesis + boundary fan-out |
| M4 | Unattended weekly cron; alpha embedding lane; safe stubs | Operational maturity |

## Open Questions
- Labeled recall target + eval set for the recall floor and embedding lane — TODO(open-question) →
  [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md).
- Weekly cadence start day/time and unattended stability window — TODO(open-question).

## Implications for runbooks
- One runbook range per phase (`RB-0XX`…`RB-7XX`); each leaves the tree green at its Acceptance checkpoint.
- M1 is the hard slice — keep P0–P4 runbooks small and resumable; defer breadth (extra sources/formats/exports) to
  P5+ so a build-budget interruption never strands the radar mid-pipeline.
