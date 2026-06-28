# Outputs — the five artifact kinds and where they land

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF.md) (§4 outputs, §7 data, §12 guardrails)
  - [./cli-and-mcp.md](./cli-and-mcp.md) (`render` / `show-*` ops)
  - [./scout-pipeline.md](./scout-pipeline.md) (which stage emits which artifact)
  - [../01-decisions/ADR-0001-product-surface-and-scout.md](../01-decisions/ADR-0001-product-surface-and-scout.md) (five artifacts as views of one thread)
  - [../01-decisions/ADR-0002-hypothesis-representation.md](../01-decisions/ADR-0002-hypothesis-representation.md) (hypothesis cards)
  - [../01-decisions/ADR-0003-experiment-ledger.md](../01-decisions/ADR-0003-experiment-ledger.md) (ledger entries)
  - [../01-decisions/ADR-0004-writeback-traffic-schema.md](../01-decisions/ADR-0004-writeback-traffic-schema.md) (writeback schema / CAW-01 bridge)
  - [../01-decisions/ADR-0006-implication-mapping.md](../01-decisions/ADR-0006-implication-mapping.md) (implication maps)
  - [../01-decisions/ADR-0007-storage-and-scheduling.md](../01-decisions/ADR-0007-storage-and-scheduling.md) (store layout)
  - [../01-decisions/ADR-0008-export-boundaries.md](../01-decisions/ADR-0008-export-boundaries.md) (export adapters)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
Enumerate the **five output artifact kinds** CAW-06 emits (brief §4), where each **lands in the file store**
(ADR-0007), what **invariants** each carries (no-overclaim, failures-useful), and which cross a **product
boundary** as an export. It does NOT redefine the per-artifact schemas — those are owned by the ADRs linked per
row; this doc is the catalogue + landing map. All five are **renderings/derivations of one thread store**
(ADR-0001 §C): one finding appears as a card, a ledger trail, an implication map and an export bundle, sharing one
provenance manifest and one uncertainty value.

## Catalogue

| # | Artifact | Emitting stage | Owning ADR | Lands at | Crosses boundary? |
|---|---|---|---|---|---|
| 1 | **Research-thread record** | spine (all stages) | ADR-0001 | `store/threads/THR-XXXX.md` (+ links) | no — internal spine |
| 2 | **Small-experiment ledger entry** | log-result | ADR-0003 | `store/ledger/EXP-XXXX/` (+ `artifacts/EXP-XXXX/` by path) | no (evidence may export via card) |
| 3 | **Hypothesis card** | hypothesize | ADR-0002 | `store/hypotheses/HYP-XXXX.md` | via CAW-02 export (gated) |
| 4 | **Implication map** | map-implications | ADR-0006 | `store/implications/IMP-XXXX.md` | routing layer before export |
| 5 | **Writeback-traffic schema artifact** | (TTT finding) | ADR-0004 | `store/writeback/WB-XXXX.json` | **yes → CAW-01** (gated, ADR-0008) |

Store layout, append-only + supersede, large artifacts by path, and the derived index are all fixed by
[ADR-0007](../01-decisions/ADR-0007-storage-and-scheduling.md). Export receipts land in `store/exports/`.

## 1. Research-thread record (the spine)
Links one `source → claim → hypothesis → experiment → result → implication` chain with provenance, `status`/
`uncertainty`, and `boundary` (brief §2, §7). It is the durable unit; the other four artifacts hang off it.

```yaml
# store/threads/THR-0042.md (front-matter)
id: THR-0042
boundary: internal
provenance: {discovered_by: scout, run: RUN-0091, fetched_at: TODO}
source: SRC-0007            # → store/sources/
claim: CLM-0011            # → store/claims/
hypothesis: HYP-0042       # → store/hypotheses/
experiments: [EXP-0007]    # → store/ledger/
implication_map: IMP-0003  # → store/implications/
writeback: WB-0003         # → store/writeback/ (TTT threads only)
current_status: hypothesis  # resolver-computed; NEVER a bare claim
```

## 2. Small-experiment ledger entry
One toy reproduction = **one append-only entry** (ADR-0003). Carries a **four-value verdict** gated by a
**pre-registered decision rule** and a hard **reproducibility gate** (config+seed+env). **Negative results are
retained, classified, and surfaced by default** ([cli-and-mcp.md](./cli-and-mcp.md) `negative-results`).

```yaml
# store/ledger/EXP-0007/entry.md (front-matter)
id: EXP-0007
hypothesis: HYP-0042
verdict: supports | refutes | inconclusive | invalid   # against pre-registered rule
decision_rule: "metric M crosses T under config C"      # registered BEFORE the run
repro: {config: artifacts/EXP-0007/config.yaml, seed: 1234, env: artifacts/EXP-0007/env.lock}
artifacts_path: artifacts/EXP-0007/      # metrics/logs/plots by path, never inlined
negative: false                          # if true → still kept + surfaced
```

A crash/abort still writes an entry (`invalid`/`aborted`) — failures cannot be silently dropped
([scout-pipeline.md](./scout-pipeline.md) §failure handling).

## 3. Hypothesis card
A rendering of a `Hypothesis` that **MUST display `status` + `confidence`** and full run history (ADR-0002).
Three separated record kinds upstream (Source / Claim / Hypothesis); a four-state reversible lifecycle defaulting
to `hypothesis`. **A hypothesis is never printed as a settled claim**; **generated evidence cannot promote
status** (the hard evidence cap).

```yaml
# store/hypotheses/HYP-0042.md (front-matter)
id: HYP-0042
status: hypothesis | supported | refuted | inconclusive   # default hypothesis; reversible
confidence: very-low | low | moderate | high              # calibrated; ≤ evidence_strength
evidence: [EXP-0007]              # ledger links; generated summaries are NOT evidence
status_log: [{to: hypothesis, by: scout, run: RUN-0091}]  # append-only
claim: CLM-0011                  # kept separate from the hypothesis
```

## 4. Implication map
The stage-6 fan-out: one map per finding, typed uncertainty-tagged implications across **AI services, education,
dev platforms, models, hardware, memory-centric** domains (ADR-0006). Its **summary is explicitly marked
`generated`** and is **not evidence** (brief §12). This is the routing layer before export.

```yaml
# store/implications/IMP-0003.md (front-matter)
id: IMP-0003
finding: THR-0042
summary_kind: generated          # NOT evidence
implications:
  - {domain: hardware, text: "...", uncertainty: low}
  - {domain: memory-centric, text: "...", uncertainty: very-low}
```

## 5. Writeback-traffic schema artifact (the CAW-01 bridge — LOAD-BEARING)
A per-variant `wbtraffic.v0` schema (ADR-0004). Produced **v1 as an analytic L0 estimate** (optionally grounded by
one toy reproduction), exported as a **self-describing bundle lowered onto CAW-01's existing L0 objects + open
questions**. It models TTT write traffic; it does NOT assume any CAW-01 IR object name (those are owned by CAW-01, a
**separate product** — re-verify, no shared store).

```json
// store/writeback/WB-0003.json (wbtraffic.v0)
{
  "schema": "wbtraffic.v0",
  "variant": "TODO(open-question: which TTT variant; verify it actually writes back)",
  "level": "L0-analytic",
  "fields": {
    "write_bandwidth": "TODO(open-question)",
    "write_endurance": "TODO(open-question)",
    "near_memory_update": "TODO(open-question)",
    "updated_state_residency": "TODO(open-question)",
    "capacity_bandwidth_ratio": "TODO(open-question: over context length & update frequency)"
  },
  "grounding": "analytic | toy-repro:EXP-XXXX",
  "open_questions": ["..."],
  "boundary": "export:caw01"
}
```

No benchmark numbers are invented — every field is `TODO(open-question)` until grounded by an analytic model or a
toy reproduction in the ledger.

## Boundaries & exports (no shared store)
Exports leave only through the **`ExportAdapter`** seam (ADR-0008), config-driven, and only after the **human
gate** ([cli-and-mcp.md](./cli-and-mcp.md)):

| Bundle | Adapter (v1) | Carries | Boundary rule |
|---|---|---|---|
| Writeback schema + open questions → **CAW-01** | `Caw01WritebackAdapter` | artifact #5 lowered onto CAW-01 L0 objects | self-describing file bundle; **not** a shared store; re-verify IR names |
| Claims + evidence → **CAW-02** | `Caw02ClaimAdapter` | artifacts #2/#3 with status+evidence | nothing crosses stripped of `status`/`uncertainty` |
| Novelty cues → CAW-03, etc. | documented **stubs** | — | report `HealthStatus="deferred"` |

**Invariant across every boundary:** nothing exits without `status`/`uncertainty`; a hypothesis never exits as a
settled claim; generated summaries are marked and are not evidence (brief §12; ADR-0002, ADR-0008).

## Open Questions
- TODO(open-question: which TTT variants actually write back — gates the writeback artifact; brief §6.)
- TODO(open-question: can writeback traffic be modeled at L0/L1 before full syntorch/vLLM integration? — ADR-0004.)
- TODO(open-question: retention/GC for large failure artifacts under `artifacts/` — ADR-0003/0007.)
  See [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md).

## Implications for runbooks
- RB: five artifact renderers over one thread store; each asserts its ADR's invariants before emitting.
- RB: hypothesis-card renderer refuses to print without `status` + `confidence`.
- RB: writeback exporter emits a self-describing bundle (no CAW-01 object-name assumptions) gated behind `confirm`.
- RB: negative-results view reads the ledger and surfaces `refutes`/`invalid`/negative entries by default.
