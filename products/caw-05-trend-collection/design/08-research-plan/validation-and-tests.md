# Validation & Tests — how the radar's invariants are proven

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [./research-plan.md](./research-plan.md) (the tracks each test gates)
  - [./open-questions.md](./open-questions.md)
  - [../01-decisions/ADR-0002-interest-model.md](../01-decisions/ADR-0002-interest-model.md)
  - [../01-decisions/ADR-0003-source-adapters-and-ingestion.md](../01-decisions/ADR-0003-source-adapters-and-ingestion.md)
  - [../01-decisions/ADR-0004-classification-and-triage.md](../01-decisions/ADR-0004-classification-and-triage.md)
  - [../01-decisions/ADR-0005-related-work-ledger.md](../01-decisions/ADR-0005-related-work-ledger.md)
  - [../01-decisions/ADR-0006-storage-and-scheduling.md](../01-decisions/ADR-0006-storage-and-scheduling.md)
  - [../01-decisions/ADR-0007-export-boundaries.md](../01-decisions/ADR-0007-export-boundaries.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
This doc defines the **acceptance tests that prove CAW-05's load-bearing invariants** — the properties that, if
broken, defeat the radar (a missed close paper, a double-emit, a generated summary catalogued as evidence). It maps
each invariant to a concrete, objectively checkable test, its fixtures, and its pass condition. It does NOT define
build steps (runbooks) or schedule the open research (see [research-plan.md](./research-plan.md)). Tests bias to the
brief's fixed pieces: **high recall**, **legal/ToS-safe sources**, **generated summary ≠ evidence**, **export
boundaries (no shared store)**, **ports & adapters**. Where a pass threshold is a measured number, it is a
`TODO(open-question)` resolved by the eval set, not hard-coded here.

## Test taxonomy
| Layer | Scope | Runs against |
|---|---|---|
| **Unit** | one component (scorer, LF, dedup key, verifier gate) | fakes / fixtures |
| **Contract** | a port's obligations (SourceAdapter, ExportAdapter) | fake adapters + recorded payloads |
| **Pipeline** | a full Run on fixtures (collect→…→export) | recorded source responses, no live I/O |
| **Eval** | statistical properties (recall, calibration) | the labeled eval set (research-plan shared spike) |
| **Negative** | "must-not-happen" invariants | adversarial fixtures designed to break a rule |

## V1 — High recall on the watch list (the existential property)
**Invariant (ADR-0002 §3, ADR-0004 §4):** a finding matching any `recall_priority: high` watch-list interest is
**always surfaced** — never auto-discarded, never silent-dropped at score, classify, or verify.

| Test | Type | Fixture | Pass condition |
|---|---|---|---|
| V1.1 recall on eval set | Eval | labeled corpus (research-plan shared spike) | recall ≥ `TODO(open-question: recall target)` on watch-list-positive items; **0 watch-list positives dropped** |
| V1.2 score-floor surfacing | Unit | a watch-list hit with deliberately low BM25 score | item is surfaced for triage; score affects **order only**, not survival |
| V1.3 negative-polarity demote-not-delete | Unit | item matching a negative interest + a watch-list term | item demoted in digest, **still present** |
| V1.4 LF-miss falls through | Unit | watch-list term an LF fails to catch | routed to LLM, **never defaulted to `noise`** |
| V1.5 embedding lane is additive-only | Eval | BM25-only vs BM25+embedding on eval set | enabling the lane **never lowers recall**; gates T4 |

Recall is the headline metric; a single dropped watch-list positive is a **hard fail** regardless of aggregate
score. The recall number itself comes from the eval set (research-plan), not asserted here.

## V2 — Dedup correctness (cross-source, cross-run)
**Invariant (ADR-0003 §5, ADR-0006 §3.2):** the same work arriving via multiple sources or weekly re-runs is **one
finding with many provenance entries**, and dedup is **recall-safe** (never false-merges two distinct works).

| Test | Type | Fixture | Pass condition |
|---|---|---|---|
| V2.1 same paper, four sources | Pipeline | one paper recorded from arXiv + S2 + blog + HN | exactly **one** finding; four `provenance` entries |
| V2.2 weekly re-run | Pipeline | run the same window twice | second run: `new=0`, `dup=all`; no twin findings/ledger rows |
| V2.3 canonical precedence | Unit | DOI vs arXiv vs title-hash collisions | dedup key follows DOI ▸ arXiv ▸ S2 ▸ DBLP ▸ title+author hash |
| V2.4 arXiv versions stay distinct | Unit | v1 and v2 of one preprint | two linked findings, **not merged** (a v2 may be fresh novelty) |
| V2.5 SimHash false-merge guard | Negative | two distinct but lexically similar papers | layer-3 (flagged) must **not** merge them; default keeps both |

## V3 — Classification abstains → human at low confidence
**Invariant (ADR-0004 §5):** the cascade auto-accepts only high-confidence non-threat labels; it **abstains to the
review queue** on low confidence or self-consistency disagreement, and **always queues `novelty-threat`**.

| Test | Type | Fixture | Pass condition |
|---|---|---|---|
| V3.1 low-confidence abstains | Unit | finding with confidence < `τ_low` | `review.state = queued`, never auto-accepted/discarded |
| V3.2 self-consistency disagreement | Unit | N samples disagree | escalates to queue regardless of mean score |
| V3.3 novelty-threat always queued | Unit | high-confidence `novelty-threat` | still queued for human (existential cost) |
| V3.4 watch-list hit never auto-`noise` | Negative | high-confidence `noise` **with** a watch-list hit | **queues**, does not discard (recall floor) |
| V3.5 calibration sanity | Eval | confirm/override log (≈50–100 labels) | calibrated probability tracks observed accuracy; ECE recorded |
| V3.6 export blocked pre-confirm | Negative | export attempted with `review.state=queued` | **refused** (nothing exports until confirmed/accepted) |

`τ_high`/`τ_low`/`N` are config tuned from the override log (research-plan T5); tests assert **behavior**, not
specific numbers.

## V4 — Generated rationale never exported as evidence
**Invariant (ADR-0004 §6, ADR-0005 §1.2, synthesis research §4):** every generated span is `evidence=false`; the
backing of any link/claim is the verified source + a concrete locator, never the summary.

| Test | Type | Fixture | Pass condition |
|---|---|---|---|
| V4.1 rationale flag in record | Unit | a classified finding | `rationale_note.evidence == false` always |
| V4.2 summary offered as backing → refused | Negative | a LedgerLink whose `evidence_locator` points at the summary | **rejected** (ADR-0005 N1) |
| V4.3 export envelope tagging | Contract | a `caw05-signal` bundle | `raw_summary` carries `kind=generated-summary`, excluded from every evidence field |
| V4.4 synthesis cite-gate | Pipeline | an artifact with an uncited factual sentence | step-6 gate **rejects** the artifact (synthesis research §3) |
| V4.5 boundary never laundered | Negative | synthesis over a (hypothetical) non-public finding | stamper **fails loud**; no "launder by summary" path |

## V5 — Export bundles match CAW-02 / CAW-03 intake
**Invariant (ADR-0007, ADR-0005 §4):** the `ExportAdapter` is the only seam; bundles are self-contained, signed,
versioned projections of **confirmed** links that the consumers validate **without a shared store**.

| Test | Type | Fixture | Pass condition |
|---|---|---|---|
| V5.1 schema conformance | Contract | a generated bundle | validates against the `caw05-signal` envelope + per-signal payload schema |
| V5.2 CAW-02 intake round-trip | Contract | bundle → CAW-02's documented import validator | accepted as Source/Claim/RelatedWork; re-enforces `evidence:false` |
| V5.3 CAW-03 intake round-trip | Contract | bundle → CAW-03's `import_radar` shape | accepted as RadarSignal; `novelty-threat → threat` mapping holds |
| V5.4 relation → classification map | Unit | one link per relation | `novelty-threat→threat`, `support→support`, `adjacent→neutral`, `noise→never exported` |
| V5.5 confirmed-only gate | Negative | a `proposed` link to CAW-03's gate | **refused** (only confirmed exports to the novelty gate) |
| V5.6 foreign-ref projection | Unit | a link with a `WatchedTarget.foreign_ref` | `related_to` carries the consumer-namespace id; our internal ids never leak |
| V5.7 signature + version | Contract | a signed bundle (research-plan T7) | consumer verifies signature; rejects unknown `contract_version` major |
| V5.8 empty / non-public bundle | Negative | empty export, and a non-public item | empty → error (never silent empty file); non-public → bundle aborts |
| V5.9 no shared store | Contract | the export path | only writes a file/bundle; **never** opens a consumer's DB |

## V6 — Incremental cursors avoid re-emitting
**Invariant (ADR-0003 §4, ADR-0006 §2–3):** cursors advance **only on a fully successful source pass**; a missed
week self-heals; retries never double-fetch, double-classify, or double-route.

| Test | Type | Fixture | Pass condition |
|---|---|---|---|
| V6.1 advance-on-success only | Unit | a source pass that fails mid-way | cursor **not** advanced; next run re-fetches overlap, dedup absorbs it |
| V6.2 missed-week catch-up | Pipeline | skip a fire, then run | next run's window spans the gap; no items lost |
| V6.3 export idempotency | Negative | re-export the same `(finding, target, classification_version)` | second emit is a **no-op**; no double-route to CAW-03 |
| V6.4 resumable stages | Pipeline | kill a Run mid-stage, re-trigger | resumes at last checkpoint; re-running a `done` Run is a no-op |
| V6.5 heartbeat / dead-man | Pipeline | suppress a run-receipt past cadence+grace | an **alert** fires ("radar went dark"), not a silent skip |

## V7 — Ports, registry, preflight (independence & ToS)
**Invariant (scheduling research §5–8):** adapters are config-selected; preflight refuses an `active` stub, a
ToS-unsafe source, or an export that cannot accept a routed signal kind.

| Test | Type | Pass condition |
|---|---|---|
| V7.1 active-stub refused | Negative | preflight fails with an actionable message pointing at the stub file |
| V7.2 ToS-unsafe refused | Negative | a `tos-restricted` source set active is refused at preflight |
| V7.3 seam test | Contract | adding a source/export touches **one adapter file + one config block**; pipeline/classification untouched |
| V7.4 legal_mode honored | Negative | a `metadata_only_link` adapter storing reproduced full text → fail |

## Negative-test catalogue (must-not-happen, cross-referenced)
| ID | Rule it protects | Origin |
|---|---|---|
| N1 | generated summary offered as backing → refused | ADR-0005 N1 / V4.2 |
| N2 | sub-0.55 title match auto-`verified` → must not happen | ADR-0005 N2 |
| N3 | non-public link in a public bundle → bundle aborts | ADR-0005 N3 / V5.8 |
| N4 | weekly re-run of same paper → one VerifiedSource, no twin | ADR-0005 N4 / V2.2 |
| N5 | `noise`-classified finding appears in a bundle → must not happen | ADR-0005 N5 / V5.4 |
| N6 | high-conf `noise` with a watch-list hit auto-discarded → must not happen | ADR-0004 / V3.4 |
| N7 | export before review-confirmed → refused | ADR-0004 / V3.6 |

## Verification pipeline tests (ADR-0005 §3)
| Test | Case | Pass condition |
|---|---|---|
| VV.1 exact id | DOI/arXiv resolves on S2 | `verified`; dedup by id |
| VV.2 strong title | Levenshtein ≥ 0.70 **and** year ±1 | `verified`; dedup by paperId |
| VV.3 weak/near | 0.55 ≤ ratio < 0.70 or year off | `ambiguous` → **routed to human**, never dropped |
| VV.4 no match | ratio < 0.55 / empty | `unverified`; kept with raw metadata |
| VV.5 API down | S2 429 / unreachable | retry+backoff, cache, **never blocks the run** |
| VV.6 preprint↔published | both versions | collapse to **one** VerifiedSource; both locators kept |

The 0.70 / ±1 thresholds are tuned on the narrow corpus (research-plan T2) before auto-`verified` is fully trusted;
VV tests assert the **decision-table behavior**, not the threshold values.

## Test data & fixtures
- **Recorded source payloads** (arXiv Atom/OAI, S2 JSON, GitHub Atom, blog RSS, HN Algolia) so pipeline/contract
  tests run with **no live I/O** and no ToS exposure.
- **The labeled eval set** (research-plan shared spike) — the only ground truth for V1.1/V1.5/V3.5; versioned in
  CAW-05's own store.
- **Adversarial fixtures** purpose-built for the negative catalogue (a summary-as-evidence link, a sub-0.55 match,
  a non-public item, a twin paper).

## Implications for runbooks
- Every runbook's **Acceptance criteria** must cite the V-IDs it satisfies; the tree stays green at each checkpoint.
- Negative tests N1–N7 are **release-blocking** — they encode the brief's non-negotiable invariants.
- Eval-dependent tests (V1.1, V1.5, V3.5, VV thresholds) are gated on the eval-set spike landing first (P2).
