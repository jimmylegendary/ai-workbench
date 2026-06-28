# Research Plan — open tracks before/while building the radar

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [./open-questions.md](./open-questions.md) (the tracked question register this plan schedules)
  - [./validation-and-tests.md](./validation-and-tests.md) (how each resolved track is proven)
  - [../01-decisions/ADR-0002-interest-model.md](../01-decisions/ADR-0002-interest-model.md)
  - [../01-decisions/ADR-0003-source-adapters-and-ingestion.md](../01-decisions/ADR-0003-source-adapters-and-ingestion.md)
  - [../01-decisions/ADR-0004-classification-and-triage.md](../01-decisions/ADR-0004-classification-and-triage.md)
  - [../01-decisions/ADR-0005-related-work-ledger.md](../01-decisions/ADR-0005-related-work-ledger.md)
  - [../01-decisions/ADR-0006-storage-and-scheduling.md](../01-decisions/ADR-0006-storage-and-scheduling.md)
  - [../01-decisions/ADR-0007-export-boundaries.md](../01-decisions/ADR-0007-export-boundaries.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
This doc schedules the **open research/spike tracks** CAW-05 must resolve so the narrow weekly radar ships
correctly — each track tied to its owning ADR, a build phase, and an **exit criterion** that the test plan can
check. It does NOT re-decide anything the ADRs fix (it elaborates their open questions into work) and it does NOT
specify test mechanics (see [validation-and-tests.md](./validation-and-tests.md)). The governing constraints are
the brief's fixed pieces: **high recall on the watch list**, **legal/ToS-safe sources only**, **generated
summaries are never evidence**, **ports & adapters with documented stubs**, and **export boundaries with no shared
store**. No track may be closed by asserting a benchmark number that has not been measured — every threshold below
is a `TODO(open-question)` until an eval produces it.

## Phasing (build order the tracks attach to)
| Phase | Theme | Gate to exit |
|---|---|---|
| **P0 Foundations** | storage layout, Run wrapper, ports, registry, preflight, cursors/dedup core | tree green with fakes; preflight rejects stubs/ToS-unsafe wiring |
| **P1 Ingest (narrow)** | v1 core adapters (arXiv/S2/GitHub/blog-RSS) + HN-light; allow-lists vetted | a real weekly window collects + dedups the watch list |
| **P2 Score & triage** | interest scorer + recall gate; LF→LLM→human cascade; review queue | recall floor + abstain-to-human demonstrably hold on an eval set |
| **P3 Ledger & verify** | append-only ledger; S2 verification (Levenshtein + year gate) | weekly re-run yields one VerifiedSource; ambiguous routes to human |
| **P4 Synthesis & export** | five FormatRenderers; ExportAdapters to CAW-02/03/01/06; signing | bundles validate against consumer intake; evidence:false survives |
| **P5 Harden** | embedding lane (alpha) eval; calibration; SimHash decision; heartbeat | each post-v1 lane gated on its own eval before default-on |

## Track register
Each track: **goal**, **owning ADR/doc**, **phase**, **method (spike)**, **exit criterion / artifact**. IDs are
stable and reused by [open-questions.md](./open-questions.md).

### T1 — Source allow-list verification (feeds + repos)
- **Owning:** ADR-0003 · [../02-research/source-ingestion.md](../02-research/source-ingestion.md) · **Phase P1**
- **Goal:** turn the seed watch list (brief §6) into a concrete, **ToS-verified** `feeds.yaml` (lab/company blog
  RSS) and a canonical GitHub org/repo set for MemOS, Chakra, MC-DLA/DeepStack, SECDA-DSE.
- **Method:** for each candidate source, confirm a publisher-provided feed exists (no scraping); record
  `legal_mode` (`api | publisher_feed | metadata_only_link`) and `tos_class`; resolve canonical repo URLs by
  cross-checking paper↔repo links. Drop any source lacking a safe access path.
- **Exit:** a committed `feeds.yaml` + `sources.yaml` repo block where every entry has a verified `legal_mode`;
  preflight passes; **no entry marked `metadata_only_link` stores reproduced full text** (checked by test
  [validation §Ingestion](./validation-and-tests.md)).

### T2 — Semantic Scholar API key & rate posture
- **Owning:** ADR-0003 + ADR-0005 · **Phase P1 (ingest enrich) / P3 (verify)**
- **Goal:** decide whether v1 pursues a keyed S2 client (~1 RPS, higher on request) or rides the shared unauth
  pool, given weekly narrow volume; S2 is used both for enrichment (ADR-0003) and verification (ADR-0005).
- **Method:** estimate per-run S2 call budget from the watch-list size × adapters; load-test backoff/cache against
  the unauth pool; request a key if the weekly window cannot complete within the shared throttle.
- **Exit:** a documented decision + a working client with **mandatory exponential backoff + cache** that completes
  a weekly verification pass without 429-induced data loss; failover question (Crossref/OpenAlex) recorded if
  unmet. `TODO(open-question: measured per-run S2 call count vs limit)`.

### T3 — Author / venue disambiguation
- **Owning:** ADR-0002 · [../02-research/interest-modeling.md](../02-research/interest-modeling.md) · **Phase P2**
- **Goal:** populate `canonical_id` for author/venue interests (e.g. *Minsoo Rhu*) so the entity lane fires without
  homonym false hits or unaffiliated reposts.
- **Method:** spike S2 `authorId` vs ORCID vs name-string matching on the seed authors; measure homonym collisions;
  pick the identifier precedence and a fallback when none resolves.
- **Exit:** each author/venue interest carries a resolved `canonical_id` (or an explicit `name-string-only` flag);
  a labeled mini-set shows the entity lane does not fire on a known homonym. `TODO(open-question: false-author-hit
  rate)`.

### T4 — Embedding-lane eval set (alpha)
- **Owning:** ADR-0002 · **Phase P5 (gated; lane wired in P2 with α=0)**
- **Goal:** decide whether to raise `α` (enable the optional embedding lane) and which model (local vs API), only
  after measuring recall gain vs added opacity/noise on a **labeled eval set**.
- **Method:** build the labeled relevance eval set (see T-shared below); run BM25-only vs BM25+embedding; compare
  recall on watch-list-adjacent items and precision cost; check the model choice against legal/ToS + own-store
  constraints.
- **Exit:** a recorded α (possibly 0) **justified by the eval**, not by intuition; the lane stays default-off until
  the eval shows net recall gain. Pairs with [validation §Recall](./validation-and-tests.md).
  `TODO(open-question: embedding model + measured α)`.

### T5 — Classification thresholds & judge model
- **Owning:** ADR-0004 · [../02-research/classification-and-triage.md](../02-research/classification-and-triage.md)
  · **Phase P2**
- **Goal:** set `τ_high` / `τ_low` / self-consistency `N` and choose the LLM judge model + prompt, from real data,
  not constants; fit the confidence calibration.
- **Method:** run the cascade in shadow for the first weeks; collect Jimmy's confirm/override log (≈50–100 labels);
  fit a small logistic calibration; track ECE; sweep `N` for self-consistency stability. Model/prompt choice
  cross-cuts the claude-api decision (read it before fixing a provider).
- **Exit:** thresholds + `N` committed to the triage profile config (start conservative, tuned from the override
  log); calibration fit checked in; **the invariant holds in every config**: rationale `evidence=false` and
  `novelty-threat` never silent-discarded. `TODO(open-question: initial τ/N values)`.

### T6 — `related_to` keying with CAW-03
- **Owning:** ADR-0005 + ADR-0007 · **Phase P4**
- **Goal:** resolve whether CAW-05 keys `related_to` to **CAW-03 claim ids** directly or only to CAW-02
  concept/claim ids that CAW-03 re-maps; and who maintains `WatchedTarget.foreign_ref` against renames.
- **Method:** joint design handshake with CAW-03 (a separate product) — mirrors their open question; define a
  staleness-detection check (periodic re-validation vs accept drift). No shared store; ids cross only as opaque
  URIs in the export envelope.
- **Exit:** a documented keying contract + a stale-ref detection plan; export projection maps `WatchedTarget →
  foreign_ref` so consumers never re-map our internal ids. `TODO(open-question: keying authority + staleness
  handshake)`.

### T7 — Export signature scheme
- **Owning:** ADR-0007 + ADR-0005 · **Phase P4**
- **Goal:** pick the signing scheme for the `caw05-signal` export envelope, aligned with CAW-02's choice so one
  verifier works across the family (candidates noted in research: minisign / cosign / DSSE).
- **Method:** confirm CAW-02's signature decision (a separate product); prototype signing + verification over the
  canonicalized payload (`payload_sha256`); ensure consumers reject an unknown `contract_version` major and a bad
  signature.
- **Exit:** a signed bundle that CAW-02 and CAW-03 both verify; the verifier is shared-format, not a CAW-05-only
  scheme. Pairs with [validation §Export](./validation-and-tests.md). `TODO(open-question: chosen scheme)`.

### Shared spike — the labeled eval set (feeds T4 + T5 + recall tests)
- **Owning:** ADR-0002 + ADR-0004 · **Phase P2**
- **Goal:** a small, Jimmy-labeled corpus over the narrow watch list — each item tagged relevant/irrelevant and
  (where applicable) relevance class — that **defines "high recall"** for the radar and yields default α/τ values.
- **Exit:** a versioned eval set checked into CAW-05's own store; it is the ground truth for the recall test and
  the gate for every post-v1 lane. `TODO(open-question: eval-set composition + recall target)`.

## Track → ADR → phase → exit (summary)
| Track | Owning ADR/doc | Phase | Exit artifact |
|---|---|---|---|
| T1 source allow-list | ADR-0003 | P1 | vetted `feeds.yaml` + repo set, all `legal_mode` verified |
| T2 S2 key & rate | ADR-0003/0005 | P1/P3 | keyed-or-not decision + backoff/cache client |
| T3 author disambiguation | ADR-0002 | P2 | `canonical_id` per author/venue + homonym test |
| T4 embedding-lane eval | ADR-0002 | P5 | measured α + model choice (default-off until proven) |
| T5 thresholds & judge model | ADR-0004 | P2 | τ/N config + calibration fit + invariant held |
| T6 `related_to` keying | ADR-0005/0007 | P4 | keying contract + staleness handshake |
| T7 export signature | ADR-0007/0005 | P4 | signed bundle verifiable by CAW-02/03 |
| eval set (shared) | ADR-0002/0004 | P2 | versioned labeled corpus = recall ground truth |

## Cross-cutting research guardrails
- **Recall over precision in every spike.** When a threshold trades recall for precision (T4 α, T5 τ, S2
  Levenshtein gate, SimHash), the default must be the recall-safe side; precision is paid down by human review.
- **Legal/ToS first.** No track adopts a source/verifier path that requires scraping or violates a ToS (T1, T2).
- **Evidence separation.** No track lets a generated summary become backing — verification (T2) and synthesis use
  the verified source + locator only (brief §12).
- **No measured number is invented.** Every α/τ/ratio above stays `TODO(open-question)` until its eval produces it.

## Implications for runbooks
- P0–P1 runbooks must land the registry/preflight + cursor/dedup core **before** any track that needs real fetches
  (T1, T2), so a half-vetted source can never run live.
- T3/T5 runbooks gate on the shared eval set existing; sequence the eval-set spike first in P2.
- T4/T7 runbooks are explicitly **post-v1 / gated** — wired but default-off until their exit criterion is met.
