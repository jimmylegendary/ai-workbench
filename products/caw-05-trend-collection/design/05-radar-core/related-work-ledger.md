# Radar Core — Related-Work Ledger & Verification

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF.md) (source of truth — §5, §7, §8, §12)
  - [../_meta/DOC-CONVENTIONS.md](../_meta/DOC-CONVENTIONS.md)
  - [../01-decisions/ADR-0005-related-work-ledger.md](../01-decisions/ADR-0005-related-work-ledger.md) (the decision this elaborates)
  - [../01-decisions/ADR-0004-classification-and-triage.md](../01-decisions/ADR-0004-classification-and-triage.md) (relation vocabulary = classes minus noise)
  - [../01-decisions/ADR-0006-storage-and-scheduling.md](../01-decisions/ADR-0006-storage-and-scheduling.md) (where the ledger physically lives; dedup across runs)
  - [../01-decisions/ADR-0007-export-boundaries.md](../01-decisions/ADR-0007-export-boundaries.md) (the ledger is the single producer of export bundles)
  - [../02-research/related-work-ledger.md](../02-research/related-work-ledger.md) (full method, decision tables, citations)
  - sibling: [./classification-and-triage.md](./classification-and-triage.md) (produces the `Finding` + class this ledger persists)
  - CAW-03 (a separate product) — novelty/radar importer of our signals (no shared store)
  - CAW-02 (a separate product) — knowledge importer of our `caw05-signal` bundles (no shared store)
  - [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md) (TODO: create)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
This is the **radar-core build contract** for the related-work ledger: the concrete entities, the append-only
write discipline, the Semantic Scholar verification pipeline (normalize → key lookup → title match → Levenshtein +
year gate → multi-key dedup), the provenance-complete `LedgerLink`, and how confirmed links project to exports. It
elaborates [../01-decisions/ADR-0005-related-work-ledger.md](../01-decisions/ADR-0005-related-work-ledger.md) and
[../02-research/related-work-ledger.md](../02-research/related-work-ledger.md) into something codeable. It does NOT
define the classification rubric (see [./classification-and-triage.md](./classification-and-triage.md)), the
physical storage substrate / scheduling (ADR-0006), or the full export envelope contract (ADR-0007 — summarized in
§5 only as far as the ledger is its producer). It assumes a **classified, review-eligible `Finding`** exists.

## 1. The invariants this core enforces (do not relax)
1. **CAW-05 owns its ledger.** It is our store. CAW-02 concepts / CAW-03 claims are referenced **by opaque URI**
   only; we never reach into their stores and they never reach into ours (brief §1, §8). Every export is a file
   artifact a consumer pulls.
2. **Generated summaries are never evidence.** An LLM abstract/digest may *prompt* a link or *explain* a verdict;
   the backing is always the `VerifiedSource` + a concrete `evidence_locator` into the source — never the summary.
   Summaries are tagged `kind=generated-summary` and excluded from every evidence field (brief §5, §12).
3. **High recall on the narrow watch list.** Verification and linking **never silently drop a real near-collision**;
   precision is paid down by human review, not by quiet filtering (brief §1, §11).
4. **Legal/ToS-safe verification only.** Public scholarly APIs (Semantic Scholar, arXiv, DOI); no paywall scraping
   (brief §12).
5. **Public/internal separation.** Findings are `boundary=public`; the ledger never fuses a public finding with an
   internal Samsung/SAIT claim — `WatchedTarget`s are *referenced*, not copied as internal text (brief §12).

## 2. Ledger entities
Four CAW-05-owned entities; all identities are CAW-05-local. The ledger is an **append-only set of link records**.

| Entity | What it is | Identity |
|---|---|---|
| **Finding** | one triaged item `source → signal → classification` with provenance (from [./classification-and-triage.md](./classification-and-triage.md)) | `caw05:fnd-<uuid>` |
| **VerifiedSource** | the bibliographic entity a Finding resolved to (content-addressed by canonical key, §3) | `caw05:src-<sha>` |
| **WatchedTarget** | a **local anchor** holding an opaque `foreign_ref` + human `label` + originating watch-list topic | `caw05:tgt-<slug>` |
| **LedgerLink** | the audited edge `(Finding, WatchedTarget, relation, rationale, provenance)` | `caw05:lnk-<uuid>` |

The **WatchedTarget is the seam** to the rest of the family without a shared store: it carries `foreign_ref` (e.g.
`caw03://claim/CLM-2031`, `caw02://concept/memory-wall`), a `label`, and the watch-list line it came from. The radar
links Findings to *our* targets; export (§5) projects those onto the foreign refs the consumer understands. If CAW-03
renames a claim, **only the target row updates** — no cascade.

## 3. The LedgerLink (provenance-complete, append-only)
`LedgerLink` is the **single auditable unit**. Corrections create a new row with `superseded_by`; rows are **never
mutated in place**, so the radar's full history — including later-rejected false positives — stays inspectable.

```yaml
ledger_link:
  link_id: caw05:lnk-7f3a                 # CAW-05-local, stable
  finding_ref: caw05:fnd-0c12
  verified_source_ref: caw05:src-9b…      # resolved bibliographic entity (§4); null if unverified
  target_ref: caw05:tgt-mc-dla-novelty    # WatchedTarget (local anchor → foreign URI)
  relation: novelty-threat | support | adjacent   # 'noise' is NEVER linked (discarded at triage)
  strength: { score: 0.0-1.0, basis: "title+abstract overlap vs target claim text" }
  rationale: "WHY this source bears on this target (human-readable, for audit)"
  evidence_locator: "p.4 §3.2 / fig 2 / abstract"  # concrete pointer INTO the source — never the summary
  generated_summary_ref: caw05:sum-… | null         # kind=generated-summary, NEVER the backing
  provenance:
    discovered_via: "arxiv-adapter | rss | github | s2-search"
    discovered_at: "<RFC3339>"
    run_id: caw05:run-2026-26             # which radar Run produced it
    verification_status: verified | ambiguous | unverified   # from §4
  review_status: proposed | confirmed | rejected   # findings are proposals (brief §11)
  superseded_by: caw05:lnk-… | null       # append-only correction pointer
```

### 3.1 Relation vocabulary = triage classes minus noise
Three relations only. **`noise` is never a link** — it is discarded at triage, not recorded as a zero-strength edge —
keeping the ledger about *bearing* items.

| Triage class ([./classification-and-triage.md](./classification-and-triage.md)) | LedgerLink `relation` | Drives |
|---|---|---|
| novelty-threat | `novelty-threat` | load-bearing → CAW-03 export |
| support | `support` | → CAW-02 RelatedWork |
| adjacent | `adjacent` | context, neither threat nor support |
| noise | *(none — discarded)* | — |

## 4. Verification pipeline (raw hit → VerifiedSource)
A radar hit is an **unverified candidate** until resolved against a scholarly graph. Verification (a) confirms the
work exists and pins canonical metadata, and (b) **dedups** so weekly re-runs and multi-adapter discovery don't
create twins. Reuses the PaperOrchestra / CAW-03 Semantic Scholar pattern (S2 + Levenshtein title gate).

```
candidate(title, authors?, year?, arxiv?/doi?/url)
  └─1. NORMALIZE   lowercase, strip punctuation/diacritics, collapse whitespace, drop arXiv version suffix (vN)
  └─2. KEY LOOKUP  if doi/arxiv present → S2 /paper/DOI:{doi} or /paper/arXiv:{id} (exact, cheapest)
  └─3. TITLE MATCH else → S2 /paper/search/match?query={norm_title}   (single best match)
  └─4. FUZZY GATE  accept iff Levenshtein-ratio(norm_title, match_title) ≥ 0.70  AND  year within ±1
  └─5. DEDUP       canonical-key precedence: DOI > arXiv > S2 paperId > DBLP/ACL > normalized-title+author hash
  └─6. EMIT        VerifiedSource (content-addressed by canonical key) | mark ambiguous | mark unverified
```

### 4.1 Decision table (recall-first)
| Case | Condition | `verification_status` | Action |
|---|---|---|---|
| Exact ID | DOI/arXiv resolves on S2 | `verified` | pin metadata + `externalIds`; dedup by ID |
| Strong title | ratio ≥ 0.70 **and** year ±1 | `verified` | pin S2 paperId; dedup by paperId |
| Weak/near | 0.55 ≤ ratio < 0.70, **or** year off | `ambiguous` | keep; **route to human**; never drop |
| No match | ratio < 0.55 or empty | `unverified` | keep raw metadata; flag "could not verify" |
| API down | S2 unreachable / 429 | `unverified` | retry w/ backoff; cache; **never block the run** |

### 4.2 Dedup keys & precedence
Identifiers are missing/duplicated in the wild, so dedup is **multi-key with precedence**, not single-id.

| Priority | Key | Why |
|---|---|---|
| 1 | DOI (normalized) | most stable cross-version identity |
| 2 | arXiv id (version-stripped) | our primary family; preprint ↔ published linked via S2 `externalIds` |
| 3 | S2 `paperId` | covers items lacking DOI/arXiv |
| 4 | DBLP / ACL id | venue-native fallback |
| 5 | normalized-title hash + author-surname set | last resort when all ids absent |

A preprint and its published version **collapse to one** `VerifiedSource` (S2 `externalIds` links them); the ledger
keeps **both locators** on that source so a link can point at the exact version it was found in.

### 4.3 Thresholds are config
`0.70` ratio and `±1` year are starting defaults, not constants — measure the false-negative rate on the narrow
corpus before fully trusting auto-`verified`. S2 keyed limit ≈ 1 rps → use the batch endpoint + cache + backoff; a
weekly narrow run fits. TODO(open-question: tuned thresholds; secondary verifier — Crossref/OpenAlex — as failover).

## 5. Export (ledger → CAW-03 + CAW-02)
The ledger is the **single producer**; exports are **projections of confirmed links** through the `ExportAdapter`
port (full envelope in [../01-decisions/ADR-0007-export-boundaries.md](../01-decisions/ADR-0007-export-boundaries.md)).
Both consumers ingest the **same** `boundary_kind=caw05-signal` artifact family — no bespoke schema per consumer,
no shared store. Transport is **file drop; consumers pull**.

### 5.1 Relation → consumer classification
| Ledger `relation` | CAW-03 (novelty) | CAW-02 (knowledge) | Routed? |
|---|---|---|---|
| `novelty-threat` | `threat` → NoveltyVerdict input | `threat` RelatedWork → Claim | **both** |
| `support` | `support` (corroboration) | `support` RelatedWork | **both** |
| `adjacent` | `neutral` | `neutral` RelatedWork (context) | CAW-02 primarily |
| *(unverified link)* | `unknown` | `unknown` (curator review, not auto-linked) | flagged, not gated |
| `noise` | — | — | **never exported** |

`related_to` carries the **WatchedTarget's `foreign_ref`** so each consumer sees ids in *its* namespace
(`caw03-claim:` vs `caw02-concept:`). CAW-05 does the projection; consumers never re-map our internal ids.

### 5.2 Export rules (fail-closed)
- **Only `review_status=confirmed` links export by default** (findings are proposals; Jimmy confirms). A
  `propose-only` profile may emit `proposed` links flagged `auto` to a low-stakes digest — **never to CAW-03's gate**.
- **`raw_summary`/`generated_summary` is `kind=generated-summary`**, excluded from every evidence field; backing is
  always `source` + `evidence_locator` (§1.2). Consumers re-enforce on import.
- **`boundary=public` only**; redaction sweep runs before emit; a non-public item **aborts** the bundle.
- **Content-addressed**: `payload_sha256` lets consumers dedup re-imports; `canonical_key` lets CAW-02 dedup our
  Source against an existing one.
- **Empty bundle refused** (nothing to export → error + report, never a silent empty file).

## 6. Builder acceptance — negative tests (must hold)
| ID | Scenario | Required behavior |
|---|---|---|
| N1 | a generated summary offered as a link's backing | **refused** (`evidence=false`) |
| N2 | a sub-0.55 match auto-`verified` | **must not happen** (→ `unverified`) |
| N3 | a non-public link in a public bundle | bundle **aborts** |
| N4 | a weekly re-run of the same paper | **one** `VerifiedSource` (dedup), no twin |
| N5 | a `noise`-classified finding appears as a link or in a bundle | **must not happen** |
| N6 | S2 unreachable / 429 | retry + cache; the Run **does not block** |
| N7 | a correction to a link | new row with `superseded_by`; original **not mutated** |

## Open Questions
- TODO(open-question: emit `related_to` keyed to CAW-03 claim ids directly, or only CAW-02 concept/claim ids that CAW-03 re-maps? resolve jointly with CAW-03.)
- TODO(open-question: who maintains `WatchedTarget.foreign_ref`, and how do we detect a stale ref on a CAW-02/CAW-03 rename/merge — periodic handshake vs accept drift?)
- TODO(open-question: Levenshtein 0.70 / year ±1 — measured false-negative rate on the narrow corpus before trusting auto-`verified`?)
- TODO(open-question: dedup authority when DOI and arXiv disagree — trust S2 `externalIds` or require human adjudication?)
- TODO(open-question: do we export `ambiguous`/`unverified` links at all? lean: flagged `unknown` to CAW-02 for curator review, never to CAW-03's gate.)
- TODO(open-question: S2 rate/availability — is keyed ~1 rps + cache enough, or add Crossref/OpenAlex failover?)
- TODO(open-question: signature scheme for the export envelope — align with CAW-02's choice — owned by ADR-0007.)
- See [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md) (to be created).

## Implications for runbooks
- **RB (ledger store):** append-only `LedgerLink` + `Finding` + `VerifiedSource` + `WatchedTarget` on the ADR-0006
  substrate; corrections via `superseded_by`, never in-place mutation; `relation` vocabulary excludes `noise`.
  Acceptance: N5, N7.
- **RB (verification adapter):** S2 client — normalize → key lookup → `/paper/search/match` → Levenshtein ≥ 0.70 +
  year ±1 → multi-key dedup; cache + backoff for ~1 rps; emit `verified | ambiguous | unverified`; route ambiguous
  to human, never drop. Acceptance: N2, N4, N6.
- **RB (export projection):** project confirmed links into the `caw05-signal` envelope (ADR-0007); map
  `relation → classification`; foreign refs in `related_to`; exclude generated summary from evidence; fail-closed on
  non-public/empty; content-address. Acceptance: N1, N3.
- **RB (ports):** `ExportAdapter` registry with CAW-02/CAW-03 v1 adapters + documented CAW-01/CAW-06 stubs; core
  depends only on the port, not concrete consumers (brief §9).
