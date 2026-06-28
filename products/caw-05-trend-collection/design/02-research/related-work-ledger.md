# Related-Work Ledger & Verification

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF.md)
  - [../_meta/DOC-CONVENTIONS.md](../_meta/DOC-CONVENTIONS.md)
  - sibling: `./classification-and-triage.md` (novelty-threat/support/adjacent/noise) — TODO(link once written)
  - sibling: `./ports-and-adapters.md` (SourceAdapter / ExportAdapter registry) — TODO(link once written)
  - sibling: `./interest-model.md` (watch list → watched targets) — TODO(link once written)
  - CAW-03 (a separate product) — `02-research/novelty-priorart-and-venue.md` (Novelty/Radar port; the importer of our signals)
  - CAW-02 (a separate product) — `02-research/import-export-boundaries.md` (Boundary B: it imports our `caw05-signal`)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
This doc decides CAW-05's **related-work ledger**: the auditable record that links each triaged finding to the
**claim or strategy element it threatens or supports**, the **paper-verification method** (Semantic Scholar fuzzy
title match + multi-key dedup) that turns a raw hit into a trustworthy bibliographic entity, and the **export
bundle shape** by which the ledger emits signals to **CAW-03** (novelty) and **CAW-02** (knowledge). It delivers
three artifacts: (1) the **ledger model**, (2) the **verification method**, (3) the **export bundle shape**. It
does NOT define the classification rubric itself (see `classification-and-triage.md`), the interest/relevance
ranking (see `interest-model.md`), or the internals of CAW-02/CAW-03 (we emit file artifacts; they pull).

## 1. Non-negotiable rules (inherited from the brief)
1. **CAW-05 owns its ledger.** It is our store. We reference CAW-02 concepts / CAW-03 claims **by opaque URI**;
   we never reach into their stores and they never reach into ours (brief §1, §8). Every export is a file artifact.
2. **Generated summaries are never evidence.** The radar's LLM abstract/digest can *prompt* a link or *explain*
   a verdict, but the link's backing is always the **verified source** + a concrete locator, never the summary
   (brief §5, §12). Summaries cross the boundary tagged `kind=generated-summary`, excluded from evidence.
3. **High recall on the narrow watch list.** A missed close paper can erase novelty (brief §1). The ledger and
   verification path are tuned to **not drop a real near-collision**; precision losses are paid down by human
   review, not by silent filtering.
4. **Only legal/ToS-safe ingestion.** Verification uses public scholarly APIs (Semantic Scholar, arXiv, DOI);
   no scraping behind paywalls or ToS-violating crawls (brief §12).
5. **Public-source / internal separation.** Findings are `boundary=public`; the ledger never fuses a public
   finding with an internal Samsung/SAIT claim (brief §12). Targets are referenced, not internal text copies.

## 2. The ledger model

### 2.1 Entities
The ledger is an append-only set of **link records** between two anchor types it does not own outright:

| Entity | Owner | What it is | Identity |
|---|---|---|---|
| **Finding** | CAW-05 | one triaged item: `source → signal → classification` with provenance | `caw05:fnd-<uuid>` |
| **VerifiedSource** | CAW-05 | the bibliographic entity a Finding resolved to (after §3) | `caw05:src-<sha>` (content-addressed) |
| **WatchedTarget** | CAW-05 *mirror* | the claim/strategy element a Finding bears on; a **local anchor** holding an opaque foreign URI + a human label | `caw05:tgt-<slug>` |
| **LedgerLink** | CAW-05 | the audited edge: `(Finding, WatchedTarget, relation, rationale, provenance)` | `caw05:lnk-<uuid>` |

A **WatchedTarget** is the seam to the rest of the family without a shared store: it is a CAW-05-local row that
carries `foreign_ref` (e.g. `caw03://claim/CLM-2031` or `caw02://concept/memory-wall`), a human-readable
`label`, and the watch-list topic it came from. The radar links Findings to *our* targets; export then projects
those onto the foreign refs the consumer understands. If CAW-03 renames a claim, only the target row updates.

### 2.2 LedgerLink schema (the heart)
```yaml
ledger_link:
  link_id: caw05:lnk-7f3a                 # CAW-05-local, stable
  finding_ref: caw05:fnd-0c12             # the triaged finding
  verified_source_ref: caw05:src-9b…      # resolved bibliographic entity (§3); null if unverified
  target_ref: caw05:tgt-mc-dla-novelty    # WatchedTarget (local anchor → foreign URI)
  relation: novelty-threat | support | adjacent   # 'noise' is never linked (it is discarded)
  strength: { score: 0.0-1.0, basis: "title+abstract overlap vs target claim text" }
  rationale: "string — WHY this source bears on this target (human-readable, audit)"
  evidence_locator: "p.4 §3.2 / fig 2 / abstract"  # concrete pointer INTO the source, never the summary
  generated_summary_ref: caw05:sum-… | null         # kind=generated-summary, NEVER the backing
  provenance:
    discovered_via: "arxiv-adapter | rss | github | s2-search"
    discovered_at: "<RFC3339>"
    run_id: caw05:run-2026-26             # which radar run produced it
    verification_status: verified | unverified | ambiguous   # from §3
  review_status: proposed | confirmed | rejected   # human-in-the-loop (brief §11: findings are proposals)
  superseded_by: caw05:lnk-… | null       # append-only: corrections add a row, never mutate
```

### 2.3 Why this shape
- **Auditable by construction.** Every link carries *who/when/how* (`provenance`), *why* (`rationale` +
  `evidence_locator`), and *what it means* (`relation` + `strength`). The question "what threatens MC-DLA
  novelty, and on what evidence?" is a query over `target_ref + relation`.
- **Append-only.** Corrections create a new row with `superseded_by`; the radar's history (including false
  positives we later reject) stays inspectable. This mirrors CAW-03's "persist blocked claims" lean.
- **Relation vocabulary is the classification minus noise.** The four triage classes map to three link
  relations; **noise is never a link** (it is discarded at triage, not recorded as a zero-strength edge),
  keeping the ledger about *bearing* items only.

| Triage class (brief §5) | Becomes LedgerLink `relation` | Notes |
|---|---|---|
| **novelty-threat** | `novelty-threat` | the load-bearing one; drives CAW-03 export |
| **support** | `support` | corroborates a claim/strategy; → CAW-02 RelatedWork |
| **adjacent** | `adjacent` | relevant context, not a direct threat/support |
| **noise** | *(none)* | discarded; not linked |

## 3. Verification method (raw hit → VerifiedSource)
A radar hit (from arXiv/RSS/GitHub) is an **unverified candidate** until resolved against a scholarly graph.
Verification does two jobs: (a) confirm the work exists and pin canonical metadata; (b) **dedup** so weekly
re-runs and multi-adapter discovery don't create twins. We reuse the PaperOrchestra literature-review pattern
(Semantic Scholar verification with a Levenshtein title gate) because CAW-03's engine already trusts it.

### 3.1 Pipeline
```
candidate(title, authors?, year?, arxiv?/doi?/url)
  └─1. NORMALIZE   lowercase, strip punctuation/diacritics, collapse whitespace, drop version suffix (arXiv vN)
  └─2. KEY LOOKUP  if doi/arxiv present → S2 /paper/DOI:{doi} or /paper/arXiv:{id} (exact, cheapest)
  └─3. TITLE MATCH else → S2 /paper/search/match?query={norm_title}  (returns single best match)
  └─4. FUZZY GATE  accept iff Levenshtein-ratio(norm_title, norm_match_title) ≥ 0.70  AND year within ±1
  └─5. DEDUP       canonical key precedence: DOI > arXiv > S2 paperId > DBLP/ACL > normalized-title-hash
  └─6. EMIT        VerifiedSource(content-addressed by canonical key) | mark ambiguous | mark unverified
```

### 3.2 Decision table
| Case | Condition | `verification_status` | Action |
|---|---|---|---|
| Exact ID | DOI/arXiv resolves on S2 | `verified` | pin S2 metadata + `externalIds`; dedup by ID |
| Strong title | match ratio ≥ 0.70 **and** year ±1 | `verified` | pin S2 paperId; dedup by paperId |
| Weak/near | 0.55 ≤ ratio < 0.70, or year off | `ambiguous` | keep candidate; **route to human** (recall-first); do not silently drop |
| No match | ratio < 0.55 or API empty | `unverified` | keep finding with raw metadata; flag "could not verify" |
| API down | S2 unreachable / 429 | `unverified` | retry w/ backoff; cache; never block the run |

### 3.3 Dedup keys & precedence
Identifiers are missing/duplicated in the wild, so dedup is **multi-key with precedence**, not single-id:

| Priority | Key | Why first |
|---|---|---|
| 1 | DOI (normalized) | most stable cross-version identity |
| 2 | arXiv id (version-stripped) | our primary source family; preprint ↔ published linked via S2 `externalIds` |
| 3 | S2 `paperId` | covers items lacking DOI/arXiv |
| 4 | DBLP / ACL id | venue-native fallback |
| 5 | normalized-title hash + author-surname set | last resort when all ids absent |

A preprint and its published version collapse to **one** VerifiedSource (S2 links them); the ledger keeps both
locators on that source so a link can point at the exact version it was found in.

### 3.4 Verification tradeoffs
| Decision | Choice | Rationale | Rejected alternative |
|---|---|---|---|
| Verifier | **Semantic Scholar Graph API** (`/paper/search/match`, key lookups, batch) | free, ToS-safe, has `externalIds`, already trusted by CAW-03's engine | Crossref-only (weaker preprint linking); scraping (ToS risk) |
| Title gate | **Levenshtein ratio ≥ 0.70 + year ±1** | proven in PaperOrchestra; cheap, explainable | embedding-only match (opaque, can over-merge) |
| Recall posture | **ambiguous routed to human, never dropped** | brief: missing a close paper is existential | auto-discard sub-threshold (precision over recall — wrong here) |
| Rate handling | **batch endpoint + cache + backoff (S2 key ≈ 1 rps)** | weekly narrow run fits; resilient to 429 | hammer per-paper calls (throttled, brittle) |
| Dedup | **multi-key precedence (DOI>arXiv>S2>DBLP>title-hash)** | identifiers missing/inconsistent in practice | single-id dedup (creates twins) |

## 4. Export bundle shape (ledger → CAW-03 + CAW-02)
The ledger is the **single producer**; exports are **projections** of confirmed links through the `ExportAdapter`
port (brief §9). We **reuse the boundary envelope CAW-02 already consumes** (`boundary_kind=caw05-signal`) so
CAW-03 and CAW-02 ingest the *same artifact family* — no bespoke schema per consumer, no shared store.

### 4.1 Outer envelope (matches CAW-02 Boundary B / CAW-03 RadarSignal)
```json
{
  "contract_version": "1.0.0",
  "boundary_kind": "caw05-signal",
  "source_product": "CAW-05",
  "produced_at": "<RFC3339>",
  "producer_run_id": "caw05:run-2026-26",
  "declared_boundary": "public",
  "declared_audience": "team",
  "payload_sha256": "<hash of canonicalized payload>",
  "redaction_applied": ["rule ids stripped before emit"],
  "payload": { "signals": [ /* §4.2, one per exported LedgerLink */ ] }
}
```
Transport: **file drop** — `*.caw05.jsonl` (one signal per line) for CAW-02's intake; the **same** bundle URI is
what CAW-03's `import_radar(bundle_uri)` pulls. CAW-05 emits; consumers pull. We never write into their stores.

### 4.2 Per-signal payload (one exported LedgerLink)
```json
{
  "signal": {
    "signal_id": "caw05:lnk-7f3a",
    "signal_type": "paper | preprint | patent | blog | release",
    "source": {
      "title": "…", "authors": ["…"], "venue": "…", "year": 2026,
      "doi": "…|null", "url": "https://…",
      "external_ids": { "arxiv": "…", "s2": "…", "dblp": "…" }
    },
    "classification": "threat | support | neutral | unknown",
    "relevance": { "score": 0.0, "rationale": "why it bears on the target" },
    "related_to": ["caw03-claim:<id>", "caw02-concept:<id>"],
    "extracted_claims": [
      { "text": "what the source asserts", "evidence_locator": "p.4 §3.2 / fig 2" }
    ],
    "verification": { "status": "verified|ambiguous|unverified", "match_ratio": 0.0, "canonical_key": "doi:…" },
    "raw_summary": "generated abstract — NOT evidence"
  }
}
```

### 4.3 Relation → consumer classification mapping
Our four-class triage is wider than the consumers' vocabulary; the export maps deterministically:

| Ledger `relation` | CAW-03 (novelty) | CAW-02 (knowledge) | Routed? |
|---|---|---|---|
| `novelty-threat` | `threat` → NoveltyVerdict input | `threat` RelatedWork link to Claim | **both** |
| `support` | `support` (corroboration) | `support` RelatedWork link | **both** |
| `adjacent` | `neutral` | `neutral` RelatedWork (context) | CAW-02 primarily |
| *(unverified link)* | `unknown` | `unknown` (curator review, not auto-linked) | flagged, not gated |
| `noise` | — | — | **never exported** |

`related_to` carries the **WatchedTarget's `foreign_ref`** so each consumer sees ids in *its* namespace
(`caw03-claim:` vs `caw02-concept:`). CAW-05 does the projection; consumers do not re-map our internal ids.

### 4.4 Export rules (fail-closed, brief-aligned)
- **Only `review_status=confirmed` links export by default** (findings are proposals; Jimmy confirms). A
  `propose-only` profile may emit `proposed` links flagged `auto`, for a low-stakes digest — never to the
  novelty gate.
- **`raw_summary` is `kind=generated-summary`** and excluded from any evidence field; the backing is always
  `source` + `evidence_locator` (rule §1.2). CAW-02/03 both re-enforce this on import.
- **`boundary=public` only**; the redaction sweep runs before emit; a non-public item aborts the bundle
  (defense-in-depth — consumers also re-redact).
- **Self-contained + content-addressed**: `payload_sha256` lets consumers dedup re-imports of weekly runs; the
  `canonical_key` lets CAW-02 dedup our Source against an existing one.
- **Empty bundle is refused** (nothing to export → error + report, never a silent empty file).

### 4.5 Export tradeoffs
| Decision | Choice | Rationale | Rejected alternative |
|---|---|---|---|
| Envelope | **reuse `caw05-signal` (CAW-02's existing contract)** | one schema both consumers already model; zero new coupling | per-consumer bespoke schemas (2× maintenance) |
| Id projection | **CAW-05 maps targets → foreign refs in `related_to`** | consumers stay decoupled from our ids | ship our ids, make consumers re-map (couples them to us) |
| Default gate | **confirmed-only to CAW-03** | novelty gate must not run on unreviewed auto-links | auto-export everything (false-threat noise into the gate) |
| Versioning | **semver `contract_version`, both consumers reject unknown major** | independent evolution | unversioned (silent breakage) |
| Transport | **file drop, consumer pulls** | no shared substrate; replayable/diffable | push/live API into consumer store (violates independence) |

## Open Questions
- TODO(open-question: does CAW-05 emit `related_to` keyed to **CAW-03 claim ids** directly, or only to CAW-02
  concept/claim ids that CAW-03 re-maps through its imported ledger? Mirrors CAW-03's open question; resolve jointly.)
- TODO(open-question: who maintains WatchedTarget `foreign_ref` mappings, and how do we detect a stale ref when
  CAW-03/CAW-02 rename or merge a claim/concept — periodic re-validation handshake vs accept drift?)
- TODO(open-question: Levenshtein 0.70 / year ±1 thresholds — tune on the narrow watch-list corpus; what is the
  measured false-negative rate before we trust auto-`verified`?)
- TODO(open-question: dedup authority when DOI and arXiv disagree (e.g. wrong DOI on a preprint) — trust S2's
  `externalIds` linkage, or require human adjudication?)
- TODO(open-question: do we export `ambiguous`/`unverified` links at all, or hold them until verified? Lean:
  export flagged `unknown` to CAW-02 for curator review, but never to CAW-03's gate.)
- TODO(open-question: Semantic Scholar rate/availability — is the ~1 rps keyed limit + cache enough for a growing
  watch list, or do we need a secondary verifier (Crossref/OpenAlex) as failover?)
- TODO(open-question: signature scheme for the export envelope — align with CAW-02's choice (minisign/cosign/DSSE)
  so one verifier works across the family.)
- See `../08-research-plan/open-questions.md` (to be created).

## Implications for runbooks
- **RB (ledger store):** implement the append-only LedgerLink + Finding + VerifiedSource + WatchedTarget model
  (md/JSON + lightweight index per brief §7); corrections via `superseded_by`, never in-place mutation; the
  `relation` vocabulary excludes `noise`.
- **RB (verification adapter):** Semantic Scholar client — normalize → key lookup → `/paper/search/match` →
  Levenshtein ≥ 0.70 + year ±1 gate → multi-key dedup; cache + backoff for ~1 rps; emit `verified | ambiguous |
  unverified`; **route ambiguous to human, never drop** (recall-first acceptance test).
- **RB (export adapter — CAW-03 + CAW-02):** project confirmed links into the `caw05-signal` envelope; map
  `relation → classification`; put foreign refs in `related_to`; exclude `raw_summary` from evidence; fail-closed
  on non-public/empty; content-address with `payload_sha256` + `canonical_key`. Ship as a vetted skill action so
  agents and humans hit the same redaction/confidentiality checks (no raw bypass).
- **RB (ports):** `ExportAdapter` registry with CAW-02/CAW-03 v1 adapters and documented CAW-01/CAW-06 stubs;
  core depends only on the port, not concrete consumers (brief §9).
- **RB (acceptance / negative tests):** (N1) generated summary offered as backing → refused; (N2) sub-0.55 match
  auto-`verified` → must not happen; (N3) non-public link in a public bundle → bundle aborts; (N4) weekly re-run
  of the same paper → one VerifiedSource (dedup), no twin; (N5) noise-classified finding appears in a bundle →
  must not happen.

Sources:
[Semantic Scholar Academic Graph API](https://www.semanticscholar.org/product/api),
[Semantic Scholar API Tutorial](https://www.semanticscholar.org/product/api/tutorial),
[The Semantic Scholar Open Data Platform (arXiv:2301.10140)](https://arxiv.org/pdf/2301.10140),
[Evaluating Deduplication Techniques for Research Paper Titles (arXiv:2410.01141)](https://arxiv.org/abs/2410.01141),
[PreprintResolver: Resolving Published Versions of arXiv Preprints (arXiv:2309.01373)](https://arxiv.org/pdf/2309.01373).
