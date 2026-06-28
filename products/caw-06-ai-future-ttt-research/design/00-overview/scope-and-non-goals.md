# Scope & Non-Goals — CAW-06

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [vision.md](vision.md)
  - [personas-and-use-cases.md](personas-and-use-cases.md)
  - [../01-decisions/ADR-0001-product-surface-and-scout.md](../01-decisions/ADR-0001-product-surface-and-scout.md)
  - [../01-decisions/ADR-0004-writeback-traffic-schema.md](../01-decisions/ADR-0004-writeback-traffic-schema.md)
  - [../01-decisions/ADR-0008-export-boundaries.md](../01-decisions/ADR-0008-export-boundaries.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
Draw the v1 boundary: what CAW-06 **does** (one checkable TTT claim → toy experiment → implication; one analytic L0
writeback estimate), what it **does not** do (no large training, no settled claims, not CAW-01/02/05, no full
syntorch/vLLM), and the **export boundaries** that keep it an independent product. It elaborates the brief's §11
non-goals; it does not redefine any ADR.

## In scope (v1)
| # | Capability | Anchor |
|---|---|---|
| S-1 | **ExperimentScout pipeline** (one core) behind three thin surfaces: scheduled/triggered pipeline + CLI + MCP | [ADR-0001](../01-decisions/ADR-0001-product-surface-and-scout.md) |
| S-2 | **Ingestion**: discover → import from CAW-05 → canonicalize+dedup → extract claims → persist (5 stages, idempotent, resumable, behind `SourceAdapter`) | [ADR-0005](../01-decisions/ADR-0005-source-and-claim-ingestion.md) |
| S-3 | **Hypothesis representation**: three separated record kinds + reversible 4-state lifecycle + capped qualitative uncertainty | [ADR-0002](../01-decisions/ADR-0002-hypothesis-representation.md) |
| S-4 | **Small-experiment ledger**: one minimal/toy reproduction via a local runner; one run = one append-only entry; pre-registered decision rule; reproducibility gate; failures retained | [ADR-0003](../01-decisions/ADR-0003-experiment-ledger.md) |
| S-5 | **Writeback-traffic schema** `wbtraffic.v0`: one per-variant **analytic L0 estimate** (optionally grounded by one toy reproduction) | [ADR-0004](../01-decisions/ADR-0004-writeback-traffic-schema.md) |
| S-6 | **Implication mapping**: one `ImplicationMap` per finding across domains; generated summary marked not-evidence | [ADR-0006](../01-decisions/ADR-0006-implication-mapping.md) |
| S-7 | **Exports** via the single `ExportAdapter`: `Caw01WritebackAdapter` (wbtraffic + open questions → CAW-01) and `Caw02ClaimAdapter` (claims+evidence → CAW-02) | [ADR-0008](../01-decisions/ADR-0008-export-boundaries.md) |
| S-8 | **Own file-based store**: `store/{sources,claims,hypotheses,ledger/EXP-XXXX,implications,exports}` | [ADR-0007](../01-decisions/ADR-0007-storage-and-scheduling.md) |

**Vertical-slice discipline:** v1 = prove the *full thread on one TTT claim*, not broad coverage of the seed themes
(brief §12). 5–10 themes are *tracked*; only one is driven end-to-end with a toy experiment in v1.

## Non-goals (v1) — and why
| Non-goal | Why excluded | What we do instead |
|---|---|---|
| **Large-scale training / running real TTT at scale** | infra-heavy; not needed to make a claim checkable (brief §11) | minimal reproductions / toy experiments only ([ADR-0003](../01-decisions/ADR-0003-experiment-ledger.md)) |
| **Asserting settled claims about future AI** | the field is volatile; the headline claim is itself unverified (brief §12) | everything carries explicit `status` + `confidence`; a hypothesis is never a fact ([ADR-0002](../01-decisions/ADR-0002-hypothesis-representation.md)) |
| **Becoming the simulator (CAW-01)** | CAW-01 is a separate product owning its IR/store | we **export** a `wbtraffic.v0` bundle + open questions across a file boundary ([ADR-0004](../01-decisions/ADR-0004-writeback-traffic-schema.md), [ADR-0008](../01-decisions/ADR-0008-export-boundaries.md)) |
| **Becoming the knowledge repo (CAW-02)** | CAW-02 owns curated knowledge | we **export** claim+evidence (only `supported/refuted/inconclusive`) |
| **Becoming the radar (CAW-05)** | CAW-05 owns signal discovery | we **import** TTT signals as `external` evidence, never auto-promoted |
| **Full syntorch/vLLM integration** | heavy; CAW-01's domain (brief §11) | model writeback at **L0/L1 analytically first**; a real trace is CAW-01's later Option-C validation ([ADR-0004](../01-decisions/ADR-0004-writeback-traffic-schema.md)) |
| **Inventing benchmark numbers** | violates DOC-CONVENTIONS §3 | every unknown numeric is `null` + `basis: TODO(open-question)` |
| **Confidential / non-ToS-safe sources** | inherited guardrail (brief §12, §100-line guardrails) | only legally/ToS-safe public sources; never conflate public research with internal claims |

## Export boundaries (independence contract)
CAW-06 is **independent**: own core, data, deploy; **no shared runtime substrate** with any sibling product. All
cross-product flow is an explicit import/export boundary; the **`ExportAdapter` is the only export seam**.

```
                 ┌─────────────────── CAW-06 (this product, own store) ───────────────────┐
   CAW-05  ─────▶│  SourceAdapter (import)   ExperimentScout core   ExportAdapter (only seam)│
  (radar,        │  arXiv/SemSch + CAW-05    one pipeline           ├─ Caw01WritebackAdapter ─┼──▶ CAW-01 (file drop)
   separate      │  signal import            5 outputs              ├─ Caw02ClaimAdapter ─────┼──▶ CAW-02 (file drop)
   product)      │                                                  └─ Caw03Novelty / Http ⋯  │    (documented stubs)
                 └────────────────────────────────────────────────────────────────────────┘
```

| Boundary | Direction | Payload | Gate |
|---|---|---|---|
| CAW-05 → CAW-06 | import | TTT radar signal | opens a `Hypothesis` at `status=hypothesis`, `confidence=very-low`; signal stored as `external` evidence; never auto-promoted |
| CAW-06 → CAW-01 | export (one-way push) | `wbtraffic.v0` schema + typed open questions | `domain ∈ {memory-centric-systems, hardware}` AND has writeback payload or typed open question |
| CAW-06 → CAW-02 | export (one-way push) | claim + evidence + uncertainty + `not_evidence[]` | `status ∈ {supported, refuted, inconclusive}` AND ≥1 resolving evidence AND provenance — **bare `hypothesis` rejected** |
| CAW-06 → CAW-03 | export (stub) | novelty cues | `Caw03NoveltyAdapter` documented, not built |

**Hard boundary rules** (ADR-0008): self-describing bundle (`schema_version` + `producer` + `content_hash`);
one-way push (CAW-06 is not a store for others); `validate()` runs the gate **before** any write; a rejected/failed
export is logged and the finding **stays exportable**; CAW-06 **never writes into another product's store** and
never assumes a shared schema registry. CAW-01's IR object names are owned by CAW-01 — re-verify at the boundary.

## Open questions
- The v1 file-drop location/auth per receiving product is unsettled — see ADR-0008 and
  [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md).
- Whether CAW-01's IR accepts `null`+`basis` fields and a directional read/write split is `wbq-002` (an export ask,
  CAW-01's decision).

## Implications for runbooks
- The `ExportAdapter` registry must ship with the two v1 adapters **and** the documented `Caw03Novelty` / `Http`
  stubs so a third target is a registration, not a redesign.
- Build the gate inside `validate()` so the no-overclaim and failures-useful invariants are machine-checked at the
  boundary, not assumed.
