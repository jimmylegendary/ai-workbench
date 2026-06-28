# Open Questions — the radar's tracked unknowns

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [./research-plan.md](./research-plan.md) (the tracks/phases that resolve these)
  - [./validation-and-tests.md](./validation-and-tests.md) (how a resolved answer is proven)
  - [../01-decisions/](../01-decisions/) (the ADRs that raised them)
  - [../02-research/](../02-research/) (the research docs that raised them)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
This is the **single aggregated register** of every open question raised across CAW-05's research docs
(`02-research/`) and decision records (`01-decisions/`), deduped and tracked. It is the source the
[research plan](./research-plan.md) schedules and the [test plan](./validation-and-tests.md) closes. It does NOT
decide anything — it tracks. Each row: a stable `id`, the question, the **owning ADR/doc**, a **resolve-by**
(phase + research track), and a **status**. `resolve-by` phases/tracks (T1–T7) are defined in
[research-plan.md](./research-plan.md). No row may be closed by asserting an unmeasured number — closure requires
the eval/spike artifact named in its track.

## Status legend
`open` = unresolved · `in-track` = assigned to a research track, not yet answered · `blocked` = waiting on another
product (CAW-02/CAW-03) · `deferred` = post-v1 by decision · `resolved` = answered + test green.

## Register

### Interest model & relevance (ADR-0002 / interest-modeling.md)
| id | question | owning ADR/doc | resolve-by | status |
|---|---|---|---|---|
| OQ-01 | Author/venue disambiguation — S2 `authorId` vs ORCID vs name-string for *Minsoo Rhu*; handle homonyms + unaffiliated reposts | ADR-0002 / interest-modeling.md | P2 · T3 | in-track |
| OQ-02 | Which embedding model for the optional lane — local vs API — given legal/ToS + own-store constraints; is added recall worth the opacity? | ADR-0002 / interest-modeling.md | P5 · T4 | deferred |
| OQ-03 | Labeled eval set defining "high recall" for the narrow list, and the default α/threshold values it yields | ADR-0002 + ADR-0004 / interest-modeling.md | P2 · eval-set spike | in-track |
| OQ-04 | Feedback-nudge step size + clamps (±0.1? [0.1,2.0]?) — tune against real digest interaction | ADR-0002 / interest-modeling.md | P2 | open |
| OQ-05 | Decay function shape / half-life per `decay` tier (none/slow/fast → what concretely?) | ADR-0002 / interest-modeling.md | P2 | open |
| OQ-06 | May negative-polarity interests ever hard-suppress, or always only demote, given recall-first? | ADR-0002 / interest-modeling.md | P2 | open |

### Source adapters & ingestion (ADR-0003 / source-ingestion.md / scheduling-and-ports.md)
| id | question | owning ADR/doc | resolve-by | status |
|---|---|---|---|---|
| OQ-07 | Confirm canonical GitHub orgs/repos for each watch-list project — MemOS, Chakra, MC-DLA/DeepStack, SECDA-DSE | ADR-0003 / source-ingestion.md | P1 · T1 | in-track |
| OQ-08 | Finalize the v1 lab/company blog RSS allow-list; verify each offers a feed vs requiring scraping | ADR-0003 / source-ingestion.md | P1 · T1 | in-track |
| OQ-09 | Pursue a Semantic Scholar API key for >1 RPS, or stay on the shared unauth pool for v1 volume? | ADR-0003 + ADR-0005 / source-ingestion.md | P1/P3 · T2 | in-track |
| OQ-10 | Is Reddit watch-list signal worth the OAuth pre-approval, or skip for v1? (and does "legal/ToS-safe only" permit Reddit at all, HN-first?) | ADR-0003 / source-ingestion.md + scheduling-and-ports.md | P1 · T1 | open |
| OQ-11 | Scope of "securities reports" — SEC EDGAR filings (free, in-scope stub) vs paywalled analyst reports (out of scope §11)? Clarify the brief's intent | ADR-0003 / source-ingestion.md | P1 · T1 | open |
| OQ-12 | arXiv PDF/source full text via requester-pays S3 — needed for triage, or is abstract+link enough for v1? | ADR-0003 / source-ingestion.md | P1 · T1 | open |
| OQ-13 | SimHash Hamming threshold + body normalization for layer-4/3 near-dup — acceptable false-merge rate; is it even on in v1? | ADR-0003 + ADR-0006 / source-ingestion.md + scheduling-and-ports.md | P5 | deferred |

### Classification & triage (ADR-0004 / classification-and-triage.md)
| id | question | owning ADR/doc | resolve-by | status |
|---|---|---|---|---|
| OQ-14 | Initial `τ_high` / `τ_low` and `N` for self-consistency — set empirically from the override log; do not hard-code | ADR-0004 / classification-and-triage.md | P2 · T5 | in-track |
| OQ-15 | Is signal-vs-hype a single score or a per-feature vector surfaced to the reviewer? (lean: score + top features) | ADR-0004 / classification-and-triage.md | P2 | open |
| OQ-16 | Which LLM/model + prompt for the judge stage, local or API? cross-cuts cost/latency + the claude-api decision | ADR-0004 / classification-and-triage.md | P2 · T5 | in-track |
| OQ-17 | Do `task`/`experiment` routes export anywhere in v1, or only appear in the digest until CAW-01/CAW-06 contracts firm up? | ADR-0004 / classification-and-triage.md | P4 | blocked |
| OQ-18 | Retention / TTL for `discard` tombstones — how long for dedup memory + audit? | ADR-0004 / classification-and-triage.md | P2 | open |
| OQ-19 | Multi-label relevance — can one finding be both `support` AND `novelty-threat`? (lean: yes, store a set, route the union) | ADR-0004 / classification-and-triage.md | P2 | open |
| OQ-20 | Capturing calibration data without leaking confidential review context into a public-facing model | ADR-0004 / classification-and-triage.md | P2 · T5 | open |

### Related-work ledger, verification & export (ADR-0005 / ADR-0007 / related-work-ledger.md)
| id | question | owning ADR/doc | resolve-by | status |
|---|---|---|---|---|
| OQ-21 | Key `related_to` to CAW-03 claim ids directly, or only to CAW-02 concept/claim ids that CAW-03 re-maps? Resolve jointly with CAW-03 | ADR-0005 + ADR-0007 / related-work-ledger.md | P4 · T6 | blocked |
| OQ-22 | Who maintains `WatchedTarget.foreign_ref`, and how to detect a stale ref on a CAW-02/CAW-03 rename/merge — re-validation handshake vs accept drift? | ADR-0005 / related-work-ledger.md | P4 · T6 | blocked |
| OQ-23 | Levenshtein 0.70 / year ±1 — measured false-negative rate on the narrow corpus before trusting auto-`verified` | ADR-0005 / related-work-ledger.md | P3 · T2 | in-track |
| OQ-24 | Dedup authority when DOI and arXiv disagree — trust S2 `externalIds`, or require human adjudication? | ADR-0005 / related-work-ledger.md | P3 | open |
| OQ-25 | Do we export `ambiguous`/`unverified` links at all, or hold until verified? (lean: flag `unknown` to CAW-02 for curator review, never to CAW-03's gate) | ADR-0005 + ADR-0007 / related-work-ledger.md | P4 | open |
| OQ-26 | S2 rate/availability — is keyed ~1 rps + cache enough for a growing watch list, or add Crossref/OpenAlex failover? | ADR-0005 / related-work-ledger.md | P3 · T2 | in-track |
| OQ-27 | Signature scheme for the export envelope — align with CAW-02's choice (minisign/cosign/DSSE) so one verifier works family-wide | ADR-0007 + ADR-0005 / related-work-ledger.md | P4 · T7 | blocked |

### Synthesis & output formats (synthesis-and-formats.md)
| id | question | owning ADR/doc | resolve-by | status |
|---|---|---|---|---|
| OQ-28 | Citation granularity — per-sentence or per-paragraph `[S#]` for the gate to be enforceable yet not over-strict on synthesized prose? | synthesis-and-formats.md (ADR: surface/outputs) | P4 | open |
| OQ-29 | Exact export-bundle wire schema for paper-card → CAW-02/CAW-03 and action-brief → CAW-01/CAW-06 (owned by ADR-0007; synthesis fixes only surviving manifest fields) | ADR-0007 / synthesis-and-formats.md | P4 | open |
| OQ-30 | Should the LLM synthesizer be allowed for the paper-card "novelty implication", or extractive-only to avoid hallucinated novelty claims feeding CAW-03? | synthesis-and-formats.md / ADR-0004 | P4 | open |
| OQ-31 | Hallucination guard — beyond per-claim citation, do we need an automated entailment check (NLI/quote-overlap), or is cite-gate + human review enough for v1? | synthesis-and-formats.md | P4 | open |
| OQ-32 | Digest cadence/size caps, template-engine default (Jinja2/Python vs Handlebars/Node), and whether slide rendering (Marp vs Pandoc) is invoked in v1 | synthesis-and-formats.md (ADR-0001) | P4 | open |

### Scheduling, storage & ports (ADR-0006 / scheduling-and-ports.md)
| id | question | owning ADR/doc | resolve-by | status |
|---|---|---|---|---|
| OQ-33 | Heartbeat / dead-man's-switch sink — local "no receipt in N days" check vs external dead-man service; alert channel given "no shared substrate" | ADR-0006 / scheduling-and-ports.md | P5 | open |
| OQ-34 | When multiple `SourceAdapter`s surface the same item, which provenance wins on merge, and is the dropped source still recorded in the ledger? | ADR-0003 + ADR-0006 / scheduling-and-ports.md | P1 | open |
| OQ-35 | Where do per-adapter secrets/rate-budgets live given "no shared runtime substrate" — per-adapter config + env refs only? | ADR-0006 / scheduling-and-ports.md | P0 | open |
| OQ-36 | Is a long-running Run one synchronous process or resumable stage-jobs with a job handle? affects crash-resume + CLI/MCP `status` contract | ADR-0006 / scheduling-and-ports.md | P0 | open |
| OQ-37 | Exact entry-point group names + adapter SemVer/compat policy — how does the core reject an adapter built against an old port version? | ADR-0006 / scheduling-and-ports.md | P0 | open |
| OQ-38 | Append-only ledger growth — compaction/index story for the JSONL ledger (owned by ADR-0006) | ADR-0005 + ADR-0006 / related-work-ledger.md | P3 | open |

## Dedup notes (questions that appeared in more than one doc, merged)
- **S2 key & rate** — raised in ADR-0003, ADR-0005, source-ingestion.md, related-work-ledger.md → merged into
  **OQ-09** (ingest enrichment) + **OQ-26** (verification failover); both resolved by track **T2**.
- **Author disambiguation** — ADR-0002 + interest-modeling.md → **OQ-01** (track T3).
- **Eval set / α / "high recall" definition** — ADR-0002 + ADR-0004 + interest-modeling.md → **OQ-03** (shared
  eval-set spike), feeding **OQ-02** (T4) and **OQ-14** (T5).
- **SimHash near-dup threshold** — ADR-0003 + ADR-0006 + source-ingestion.md + scheduling-and-ports.md →
  **OQ-13**.
- **Reddit ToS/OAuth** — ADR-0003 + source-ingestion.md + scheduling-and-ports.md → **OQ-10**.
- **`related_to` keying + foreign-ref staleness** — ADR-0005 + ADR-0007 + related-work-ledger.md → **OQ-21** +
  **OQ-22** (track T6, blocked on CAW-03).
- **Export wire schema / signature** — ADR-0005 + ADR-0007 + synthesis + related-work-ledger.md → **OQ-27**
  (signature, T7) + **OQ-29** (wire schema).

## Resolution discipline
- A question moves to `resolved` only when its research-plan track produces the named artifact **and** the
  matching test in [validation-and-tests.md](./validation-and-tests.md) is green.
- `blocked` rows (OQ-17, OQ-21, OQ-22, OQ-27) depend on a sibling product (CAW-02/CAW-03, separate products) and
  are resolved by a joint handshake, never by reaching into their stores.
- Any new open question raised in a future ADR/research edit is added here with a fresh `OQ-NN` id — this register
  is the one place they are tracked.
