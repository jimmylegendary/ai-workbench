# System Architecture — CAW-05 Early-Warning Radar

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [component-boundaries.md](component-boundaries.md) (module ownership + service signatures + ports)
  - [../01-decisions/ADR-0001-product-surface-and-outputs.md](../01-decisions/ADR-0001-product-surface-and-outputs.md) (the Run; surfaces; formats)
  - [../01-decisions/ADR-0003-source-adapters-and-ingestion.md](../01-decisions/ADR-0003-source-adapters-and-ingestion.md) (SourceAdapter; cursors; dedup in core)
  - [../01-decisions/ADR-0004-classification-and-triage.md](../01-decisions/ADR-0004-classification-and-triage.md) (cascade; selective-review gate; routing)
  - [../01-decisions/ADR-0006-storage-and-scheduling.md](../01-decisions/ADR-0006-storage-and-scheduling.md) (files-as-truth + SQLite; cron)
  - [../01-decisions/ADR-0007-export-boundaries.md](../01-decisions/ADR-0007-export-boundaries.md) (ExportAdapter; no shared store)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
This doc describes the **container-level architecture** of CAW-05: the runtime building blocks (pipeline core,
source adapters, the files+SQLite store, export adapters, scheduler, CLI/MCP), how they connect, and the **one-way
dependency rule** that keeps the product independent and the invariants enforceable. It fixes that
**classification, triage, dedup, the recall floor, and the review gate live in the core** — adapters cannot bypass
them. It does NOT redefine the surface/output decisions (ADR-0001), the source set (ADR-0003), the triage rubric
(ADR-0004), the ledger schema (ADR-0005), storage internals (ADR-0006), or the export wire schema (ADR-0007) — it
assembles those into one picture. Service signatures live in [component-boundaries.md](component-boundaries.md).

## 1. Containers at a glance

| Container | Role | Owns state? | Depends on |
|---|---|---|---|
| **Pipeline core (the Run)** | the one operation set: `ingest → relevance → classify → triage/route → synthesize → export`; enforces dedup, recall floor, review gate, provenance | yes (orchestration + checkpoints) | ports only |
| **Source adapters** | fetch + normalize one source family into `RawFinding`s (arXiv, S2, GitHub, blog RSS, HN-light; stubs) | no (cursors held by core) | external public sources |
| **Files + SQLite store** | files-as-truth (`interests.yaml`, `findings/*.json`, `ledger/*.jsonl`) + SQLite index/ledger-cache | yes (the truth) | filesystem |
| **Export adapters** | project confirmed LedgerLinks into signed `caw05-signal` bundles; file-drop, consumer pulls | no | boundary filesystem |
| **Scheduler** | fires `caw05 run --window weekly` via cron; no logic beyond firing | no | OS cron |
| **CLI / MCP surfaces** | thin drivers over one vetted typed op-set (`run`, `status`, `list/show`, `render`, `confirm`, `export`) | no | core op-set |

Independence (brief §1): every container is CAW-05's OWN; **no shared runtime substrate** with CAW-01/02/03/06.
The only cross-product seam is the **ExportAdapter** writing files a sibling later **pulls** (ADR-0007).

## 2. Container diagram

```
                      EXTERNAL PUBLIC SOURCES (read-only, ToS-safe)
        arXiv API/OAI/RSS │ Semantic Scholar │ GitHub Atom/REST │ blog RSS │ HN (Algolia)
                          │        │                │              │          │
                          ▼        ▼                ▼              ▼          ▼
        ┌──────────────────────────────────────────────────────────────────────────┐
        │  SOURCE ADAPTERS  (SourceAdapter port)   fetch + normalize ONLY            │
        │  Arxiv │ SemanticScholar │ Github │ BlogRss │ HackerNews │ [stubs:         │
        │  Reddit, Edgar, Newsletter, InternalFeed — config-disabled]               │
        └──────────────────────────────────────────────────────────────────────────┘
                                   │ RawFinding (+ provenance)
   ┌── fires ──┐                   ▼
   │ SCHEDULER │   ┌──────────────────────────────────────────────────────────────┐
   │  (cron)   │──▶│                  PIPELINE CORE  (the Run)                      │
   └───────────┘   │                                                                │
                   │  Ingest ─▶ Dedup ─▶ Relevance ─▶ Classify ─▶ Triage/Route ─▶  │
                   │   (cursors)  (multi-layer)  (BM25+floor)  (LF→LLM→human)       │
                   │                                              │                 │
                   │              Synthesize ◀────────────────────┘                 │
                   │           (FormatRenderer port: 5 formats)                     │
                   │                     │                                          │
                   │            review gate (human-confirmed)                       │
                   │                     │                                          │
                   │                  Export ──▶ EXPORT ADAPTERS (ExportAdapter)    │
                   │                              CAW-02 │ CAW-03 │ CAW-01 │ CAW-06 │
                   └──────────────────────────────────────────────────────────────┘
                       ▲  reads/writes (StoragePort)        │ signed *.caw05.jsonl
                       │                                     ▼ (file drop; consumer PULLS)
        ┌──────────────────────────────────────┐   ╔══════════════════════════════╗
        │  FILES + SQLITE STORE (files-as-truth)│   ║  boundary drop location      ║
        │  interests.yaml │ findings/*.json     │   ║  (no shared store)           ║
        │  ledger/*.jsonl (append-only)         │   ╚══════════════════════════════╝
        │  caw05.sqlite (index / ledger-cache)  │
        └──────────────────────────────────────┘
                       ▲
                       │ same vetted op-set
        ┌──────────────────────────────────────┐
        │  SURFACES:  CLI (humans/CI) │ MCP (agents)  — thin; proposal-only terminals │
        └──────────────────────────────────────┘
```

## 3. The one-way dependency rule

**Dependencies point inward to the core through ports; nothing points back out.** The core defines the port
interfaces; adapters and surfaces implement/consume them. This is the architectural expression of "governance lives
in the core, never the surface" (ADR-0001 §Decision).

```
  surfaces (CLI/MCP) ──▶ core op-set ──▶ CORE SERVICES ──▶ PORTS ◀── adapters (source/export/scheduler/renderer)
                                              │
                                              └──▶ StoragePort ──▶ files + SQLite
```

| Rule | Why | Enforced by |
|---|---|---|
| Adapters depend on the core's port types; the core never imports a concrete adapter | swap a family with one file; no source-specific branch in the pipeline | config-driven registry (ADR-0003 §3) |
| Surfaces call only the vetted typed op-set; no surface-local logic | cron/CLI/MCP stay in lockstep; one place enforces invariants | one op manifest (ADR-0001 §D) |
| The core reaches the store only via `StoragePort` | files-as-truth swappable; SQLite is a rebuildable cache | ADR-0006 |
| Export only via `ExportAdapter`; the core never writes a sibling's store | independence; no shared substrate | ADR-0007 §1 |
| Adapters MUST NOT classify, rank, dedup, or export | those are core invariants (recall, audit) | §4 below |

A violation is detectable: a source-specific branch in the pipeline, or a surface enforcing a rule, is a **contract
leak** (ADR-0003 revisit trigger).

## 4. Why classification, triage, and dedup live in the core (not adapters)

These three are **invariant-bearing**, so they cannot be delegated to a swappable edge component:

| Concern | Lives in | Reason it cannot move to an adapter |
|---|---|---|
| **Dedup (multi-layer)** | core (Ingest) | a paper on arXiv+S2+blog+HN must collapse to ONE finding with many provenance entries; an adapter sees only its own family and would create twins (ADR-0003 §5) |
| **Relevance + recall floor** | core (Relevance) | the recall-first floor — a watch-list hit is never silently dropped — is the product's reason to exist (brief §1, §19); per-adapter ranking would drift |
| **Classification / triage** | core (Classify/Triage) | the LF→LLM→human cascade + selective-review gate + deterministic routing are auditable invariants; generated rationale is NEVER evidence (ADR-0004) |
| **Provenance stamping** | core + adapter contract | adapters MUST supply origin/retrieved_at/native-id/boundary; the core verifies completeness and refuses incomplete findings (ADR-0003 obligation 4) |
| **Review gate + export** | core | findings are proposals; only the human-gated core performs a terminal route; an MCP agent may only propose (ADR-0001 §4, ADR-0007 §4) |

Adapters are deliberately **thin and stateless on dedup/ranking** (ADR-0003 §D): `fetch + normalize ONLY`. The
recall mission depends on a single chokepoint where dedup-then-floor runs, so a missed week or a multi-source
duplicate cannot slip a watch-list hit.

## 5. The Run lifecycle (data flow across containers)

```
cron fires ──▶ Run wrapper acquires single-flight lock ──▶
  Ingest:     for each active SourceAdapter: fetch(query, cursor) → RawFinding[]; advance cursor on full pass only
  Dedup:      native-id ▸ canonical (DOI▸arXiv▸title) ▸ SHA-256 ▸ [SimHash flag] → one Finding, many provenance
  Relevance:  BM25-first additive explainable score + recall-first floor (watch-list hit kept regardless)
  Classify:   LF → LLM → (abstain → human) cascade → two-axis label (threat/support/adjacent/noise × signal/hype)
  Route:      deterministic config-driven → knowledge | task | experiment | open-question | discard
  Ledger:     append LedgerLink (+ S2 verification record) to ledger/*.jsonl; index into SQLite
  Synthesize: FormatRenderer over confirmed Findings → memo/digest/slide/paper-card/action-brief (evidence:false banner)
  Export:     confirmed-only → ExportAdapter → signed *.caw05.jsonl (idempotent; fail-closed)
  Receipt:    write run-receipt heartbeat (missing receipt past cadence+grace = ALERT, not a no-op)
```

Properties the **Run wrapper** owns (cron lacks them): single-flight lock, cursor-based **catch-up** so a missed
week self-heals, per-stage checkpoints (a crash resumes at the last completed stage), and the heartbeat receipt
(ADR-0001 §Decision 1–2). Idempotency: re-running a `done` Run is a no-op; export idempotency keys prevent
double-routing (ADR-0006/0007).

## 6. Storage topology (files-as-truth + SQLite)

| Artifact | Path | Role | Authority |
|---|---|---|---|
| Interest model | `interests.yaml` | typed, tiered, versioned watch list (ADR-0002) | truth |
| Findings | `findings/*.json` | one triaged finding + provenance | truth |
| Ledger | `ledger/*.jsonl` | append-only LedgerLink + verification records | truth |
| Index / cache | `caw05.sqlite` | query index, dedup keys, ledger-cache, cursors | **rebuildable** from files |
| Boundary drops | `*.caw05.jsonl` (boundary dir) | signed export bundles a sibling pulls | truth (export) |

SQLite is a **derived index**, never the source of truth — it can be rebuilt by replaying the files (ADR-0006). The
core reaches all of this only through `StoragePort` (§3).

## 7. Cross-product boundaries (no shared substrate)

CAW-05 ingests **public sources** (read-only) and **exports** signed file bundles that consumers **pull**
(ADR-0007). It never writes into CAW-01/02/03/06 stores; consumers re-redact and re-classify on import
(defense-in-depth). The relation→consumer projection (novelty-threat → CAW-03 gate, Source/Claim → CAW-02,
open-question → CAW-01/CAW-06) and the fail-closed rules (confirmed-only to the novelty gate; generated summary
never an evidence field; public-only; empty bundle refused) are fixed in ADR-0007 §3–4.

## Open Questions
- TODO(open-question: heartbeat/dead-man's-switch sink — local "no receipt in N days" vs external service, given
  "no shared substrate"; owned with ADR-0006.) See [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md).
- TODO(open-question: is a Run one synchronous process or resumable stage-jobs with a handle? affects `status`.)
- TODO(open-question: family-wide bundle signature scheme so one verifier works across products — ADR-0007.)

## Implications for runbooks
- **RB (Run wrapper + lifecycle):** lock, catch-up via cursors, per-stage checkpoints, heartbeat receipt.
- **RB (ports registry):** Source/Export/Scheduler/FormatRenderer/Classifier as config-driven registries; core
  depends only on ports; stubs registered + discoverable but config-disabled (preflight refuses an active stub).
- **RB (ingestion runtime):** token-bucket limiter, cursor persistence, multi-layer dedup, provenance stamping in
  the core — adapters stay thin.
- **RB (store):** files-as-truth layout + SQLite index rebuildable from files (`reindex`).
- **RB (negative tests):** adapter cannot classify/rank/dedup/export; surface cannot enforce a rule (contract-leak
  tests); ADR-0007 N1–N6.
