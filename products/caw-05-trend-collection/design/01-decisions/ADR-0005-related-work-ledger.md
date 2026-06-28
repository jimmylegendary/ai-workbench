# ADR-0005: Related-work ledger, paper verification, and provenance

- Status: proposed
- Owner: Jimmy
- Last-reviewed: TODO(open-question: set on review)
- Related:
  - Source of truth: [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF.md) (§5, §7, §8, §12)
  - Conventions: [../_meta/DOC-CONVENTIONS.md](../_meta/DOC-CONVENTIONS.md) (§5 ADR format)
  - Research: [../02-research/related-work-ledger.md](../02-research/related-work-ledger.md)
  - ADR-0002 interest model — [./ADR-0002-interest-model.md](./ADR-0002-interest-model.md) (watch list → WatchedTarget anchors)
  - ADR-0003 source adapters & ingestion — [./ADR-0003-source-adapters-and-ingestion.md](./ADR-0003-source-adapters-and-ingestion.md) (RawFinding, provenance, dedup keys)
  - ADR-0004 classification & triage — [./ADR-0004-classification-and-triage.md](./ADR-0004-classification-and-triage.md) (relation vocabulary minus noise)
  - ADR-0006 storage & scheduling — [./ADR-0006-storage-and-scheduling.md](./ADR-0006-storage-and-scheduling.md) (where the ledger physically lives; dedup runs)
  - ADR-0007 export boundaries — [./ADR-0007-export-boundaries.md](./ADR-0007-export-boundaries.md) (the ledger is the single producer of export bundles)
  - CAW-03 (a separate product) — novelty/radar importer of our signals (no shared store)
  - CAW-02 (a separate product) — knowledge importer of our `caw05-signal` bundles (no shared store)

## Context

CAW-05 is the early-warning radar whose mission is **high recall on a narrow watch list**: a single missed
close paper can erase the novelty of the whole paper/control-plane strategy (brief §1). To make that recall
*auditable* and *defensible*, the radar needs a durable record that answers, for any claim or strategy axis,
"what bears on this, on what evidence, discovered how, and verified to what degree?" A raw adapter hit is not
trustworthy enough to answer that — the same paper arrives via arXiv, S2, a blog, and HN; titles drift across
preprint and published versions; some "papers" do not exist.

Forces:
- **Auditability** — every link must carry who/when/how (provenance), why (rationale + a concrete locator),
  and what it means (relation + strength). Corrections must be inspectable, not silent overwrites.
- **Recall-first** — verification and linking must not silently drop a real near-collision; precision is paid
  down by human review, never by quiet filtering (brief §1, §11).
- **Evidence/summary separation** — the LLM abstract/digest can *prompt* a link but never *back* it; the
  backing is always the verified source + a locator (brief §5, §12).
- **Independence** — CAW-05 owns its ledger; it references CAW-02/CAW-03 concepts by opaque URI and never
  reaches into their stores (brief §1, §8).
- **Legal/ToS-safe verification only** — public scholarly APIs (Semantic Scholar, arXiv, DOI), no scraping
  behind paywalls (brief §12).

## Options considered

### A. Ledger data model

| Option | Pros | Cons | Fit |
|---|---|---|---|
| **Append-only LedgerLink rows** (Finding × WatchedTarget × relation), local anchors carrying opaque foreign URIs | full audit history incl. rejected false-positives; no shared store; corrections add rows | requires `superseded_by` discipline + a target-mirror to maintain | **chosen** |
| Mutable link table (update in place) | simpler queries | destroys the radar's history; a later-rejected threat vanishes | rejected (un-auditable) |
| Store links directly against CAW-02/CAW-03 ids | no mirror to maintain | couples us to their id churn; reaches across the boundary | rejected (violates §8) |

### B. Paper verification

| Option | Pros | Cons | Fit |
|---|---|---|---|
| **Semantic Scholar key-lookup → `/paper/search/match` → Levenshtein ≥ 0.70 + year ±1 gate → multi-key dedup** | free, ToS-safe, `externalIds` link preprint↔published; same pattern CAW-03's engine already trusts | S2 rate/availability is a dependency | **chosen** |
| Crossref-only | strong DOIs | weak preprint linking (arXiv is our primary family) | rejected as primary; failover candidate |
| Embedding-only title match | catches paraphrase | opaque, can over-merge distinct works (recall-harming false merges) | rejected |
| Scrape Google Scholar | broad coverage | ToS-violating | rejected (§12) |

### C. Sub-threshold disposition

| Option | Pros | Cons | Fit |
|---|---|---|---|
| **Route ambiguous (0.55–0.70 / year off) to human; never auto-drop** | recall-first; matches existential cost | adds review load | **chosen** |
| Auto-discard below threshold | clean | a silent wrong discard = a missed paper | rejected (precision-over-recall is wrong here) |

## Decision

Adopt an **append-only related-work ledger of four entities**, a **Semantic Scholar verification pipeline with
a Levenshtein title gate + multi-key dedup**, and a **provenance-complete LedgerLink** as the single auditable
unit. The ledger is **the only producer** of the export bundles defined in ADR-0007.

**1. Entities** (all CAW-05-owned; identities are CAW-05-local):

| Entity | What it is | Identity |
|---|---|---|
| `Finding` | one triaged item `source → signal → classification` with provenance (from ADR-0004) | `caw05:fnd-<uuid>` |
| `VerifiedSource` | the bibliographic entity a Finding resolved to (content-addressed by canonical key) | `caw05:src-<sha>` |
| `WatchedTarget` | a **local anchor** holding an opaque `foreign_ref` (e.g. `caw03://claim/CLM-2031`, `caw02://concept/memory-wall`) + human `label` + originating watch-list topic | `caw05:tgt-<slug>` |
| `LedgerLink` | the audited edge `(Finding, WatchedTarget, relation, rationale, provenance)` | `caw05:lnk-<uuid>` |

The `WatchedTarget` is the seam to the family without a shared store: the radar links Findings to *our*
targets; ADR-0007 export projects those onto the foreign refs the consumer understands. If CAW-03 renames a
claim, only the target row updates.

**2. LedgerLink is append-only and provenance-complete.** Corrections create a new row with `superseded_by`;
rows are never mutated. The schema (full form in the research doc §2.2) is fixed to carry: `finding_ref`,
`verified_source_ref` (nullable), `target_ref`, `relation`, `strength{score,basis}`, `rationale` (human-
readable WHY), `evidence_locator` (a concrete pointer **into the source** — never the summary),
`generated_summary_ref` (tagged `kind=generated-summary`, never the backing), `provenance{discovered_via,
discovered_at, run_id, verification_status}`, and `review_status`.

**3. Relation vocabulary = triage classes minus noise.** Three relations only; **noise is never linked** (it is
discarded at triage, not recorded as a zero-strength edge), keeping the ledger about *bearing* items.

| Triage class (ADR-0004) | LedgerLink `relation` |
|---|---|
| novelty-threat | `novelty-threat` (load-bearing; drives CAW-03 export) |
| support | `support` (→ CAW-02 RelatedWork) |
| adjacent | `adjacent` |
| noise | *(none — discarded)* |

**4. Verification pipeline** (raw hit → VerifiedSource): `NORMALIZE` (lowercase, strip punctuation/diacritics,
collapse whitespace, drop arXiv `vN`) → `KEY LOOKUP` (DOI/arXiv → S2 exact, cheapest) → `TITLE MATCH`
(`/paper/search/match`) → `FUZZY GATE` (accept iff Levenshtein-ratio ≥ 0.70 **and** year ±1) → `DEDUP`
(precedence DOI > arXiv > S2 paperId > DBLP/ACL > normalized-title+author hash) → `EMIT`
(`verified | ambiguous | unverified`).

| Case | Condition | `verification_status` | Action |
|---|---|---|---|
| Exact ID | DOI/arXiv resolves on S2 | `verified` | pin metadata + `externalIds`; dedup by ID |
| Strong title | ratio ≥ 0.70 and year ±1 | `verified` | pin S2 paperId; dedup by paperId |
| Weak/near | 0.55 ≤ ratio < 0.70, or year off | `ambiguous` | keep; **route to human**; never drop |
| No match | ratio < 0.55 or empty | `unverified` | keep raw metadata; flag "could not verify" |
| API down | S2 unreachable / 429 | `unverified` | retry w/ backoff; cache; never block the run |

A preprint and its published version **collapse to one** `VerifiedSource` (S2 `externalIds` links them); the
ledger keeps both locators so a link can point at the exact version it was found in. Verification reuses the
PaperOrchestra literature-review pattern (S2 + Levenshtein gate) that CAW-03's engine already trusts.

**5. Provenance & boundary invariants.** Every Finding/link is `boundary=public`; the ledger never fuses a
public finding with an internal Samsung/SAIT claim (targets are *referenced*, not copied). `generated_summary`
is excluded from every evidence field — the backing is always `VerifiedSource` + `evidence_locator`.

## Consequences

**Easy:** "what threatens MC-DLA novelty and on what evidence?" is a query over `target_ref + relation`;
weekly re-runs dedup to one `VerifiedSource`; a later-rejected threat stays inspectable; export (ADR-0007) is a
pure projection of confirmed links — no second source of truth.

**Hard / follow-on:** maintaining `WatchedTarget.foreign_ref` mappings against CAW-02/CAW-03 renames (a
staleness handshake is an open question); the S2 ~1 rps keyed limit constrains a growing watch list; the 0.70 /
±1 thresholds need tuning on the real corpus before auto-`verified` is fully trusted; append-only growth needs
a compaction/index story (owned by ADR-0006).

**Negative tests (must hold):** (N1) a generated summary offered as backing → refused; (N2) a sub-0.55 match
auto-`verified` → must not happen; (N3) a weekly re-run of the same paper → one `VerifiedSource`, no twin;
(N4) a `noise`-classified finding appears as a link → must not happen.

**Implications for runbooks:** an **RB (ledger store)** implements the append-only four-entity model on the
storage substrate of ADR-0006 (`superseded_by`, never in-place mutation); an **RB (verification adapter)**
implements the S2 client (normalize → key lookup → match → gate → multi-key dedup; cache + backoff; route
ambiguous to human); both feed the ADR-0007 export projection.

## Open questions / revisit triggers

- TODO(open-question: do we key `related_to` to CAW-03 claim ids directly or only to CAW-02 concept/claim ids
  that CAW-03 re-maps? resolve jointly with CAW-03 — mirrors their open question.)
- TODO(open-question: who maintains `WatchedTarget.foreign_ref`, and how do we detect a stale ref on a
  CAW-02/CAW-03 rename/merge — periodic re-validation handshake vs accept drift?)
- TODO(open-question: Levenshtein 0.70 / year ±1 — measured false-negative rate on the narrow corpus before we
  trust auto-`verified`?)
- TODO(open-question: dedup authority when DOI and arXiv disagree — trust S2 `externalIds` or require human
  adjudication?)
- TODO(open-question: S2 rate/availability — is keyed ~1 rps + cache enough, or add Crossref/OpenAlex failover?)
- **Revisit trigger:** if S2 coverage or rate forces a second verifier, or if any export consumer needs a link
  shape the ledger does not carry, reopen this ADR before changing the export contract (ADR-0007).
- See `../08-research-plan/open-questions.md` (to be created).
