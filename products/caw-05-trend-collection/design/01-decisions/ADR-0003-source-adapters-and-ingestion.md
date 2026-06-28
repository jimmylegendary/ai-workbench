# ADR-0003: Source adapters & ingestion — legal/ToS-safe families, the SourceAdapter port, incremental fetch + dedup

- **Status:** proposed
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:**
  - [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF.md) (source of truth)
  - [../_meta/DOC-CONVENTIONS.md](../_meta/DOC-CONVENTIONS.md)
  - [ADR-0001-product-surface-and-outputs.md](ADR-0001-product-surface-and-outputs.md) (the Run consumes these adapters)
  - [ADR-0002-interest-model.md](ADR-0002-interest-model.md) (scores the `RawFinding`s produced here; needs structured metadata)
  - [ADR-0004-classification-and-triage.md](ADR-0004-classification-and-triage.md) (consumes deduped findings + trust priors)
  - [../02-research/source-ingestion.md](../02-research/source-ingestion.md) (per-source access table, SourceAdapter contract)
  - [../02-research/scheduling-and-ports.md](../02-research/scheduling-and-ports.md) (registry, cursors, dedup layers, stub pattern)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
Decide **which source families CAW-05 ingests**, **how it ingests them legally/ToS-safely without re-pulling**,
**how it deduplicates across sources and runs**, and the **`SourceAdapter` port** + registry every family plugs
into (incl. documented stubs). It fixes the v1 source set, the per-source-cursor + multi-layer dedup core, and the
six adapter contract obligations. It does NOT decide interest scoring (ADR-0002), classification/triage (ADR-0004),
the ledger, or export boundaries — adapters **fetch + normalize only**, never classify or rank. All v1 sources are
**public, read-only**; CAW-05 never mixes them with internal Samsung/SAIT claims (brief §12).

## Context
- The watch list (§6) is **narrow and academic-heavy**, so the dominant signal lives in **papers (arXiv/conf),
  code (GitHub), and lab blogs** — v1 ingestion weight goes there (source-ingestion research §1). HN/Reddit/
  securities/newsletters are adjacent confirmation channels with lower recall and ToS/cost friction.
- The mission is **high recall on the narrow list** (§1, §3): the posture is "ingest broadly within the *safe*
  families, filter later" — never drop at the source.
- Two hard constraints (§5, §12): **legal/ToS-safe only** (prefer official APIs and publisher feeds over HTML
  scraping; metadata + link where only HTML exists) and **provenance always** (every item keeps origin URL,
  retrieval timestamp, source-native id, `boundary=public`, trust).
- **Ports & adapters** (§9): v1 = arXiv/Semantic Scholar + RSS/blogs + GitHub; stubs = HN/Reddit, securities,
  newsletters, internal feeds; a config-driven registry, same pattern as sibling CAW-03 (no shared registry).
- Re-runs must not re-collect or re-emit; the weekly cron must absorb a missed week (ADR-0001 / scheduling research
  §2–3). So **incremental cursor + content-addressed dedup live in the core**, inherited by every adapter.

## Options considered

### A. v1 source set
| Option | Pros | Cons | Fit |
|---|---|---|---|
| **Core: arXiv (query API + OAI-PMH + cs.AR/cs.LG/cs.DC RSS) + Semantic Scholar (enrich/cross-ref) + GitHub (Atom + REST) + curated lab-blog RSS; light: HN (Algolia); stub: Reddit/EDGAR/newsletters/internal** | Highest recall on the narrow list; all free + ToS-safe; clean DOI/arXiv dedup; seams proven via stubs | Curating the blog allow-list + watch-list repos is manual | **Chosen** |
| Everything live in v1 (incl. Reddit/securities/media) | Broad coverage | Reddit needs OAuth pre-approval; analyst reports paywalled (§11); low signal/high noise; ToS risk | Rejected |
| arXiv only | Simplest | Misses code (GitHub) + lab blogs where watch-list work first appears → recall gap | Rejected |

### B. Legal/ToS posture
| Option | Pros | Cons | Fit |
|---|---|---|---|
| **Official APIs + publisher feeds; metadata-only-link where only HTML exists; no scraping in v1** | ToS-safe (§12); respects rate limits; provenance clean | Some sources excluded until they offer a feed | **Chosen** |
| HTML scraping to maximize coverage | More text | ToS/legal risk; redistribution risk; brittle — violates §12 | Rejected |

### C. Dedup strategy
| Option | Pros | Cons | Fit |
|---|---|---|---|
| **Multi-layer: (1) native id, (2) cross-source canonical DOI▸arXiv▸normalized-title, (3) SHA-256 of normalized title+body, (4) SimHash near-dup behind a flag** | A paper on arXiv+S2+blog+HN is ONE finding with many provenance entries; recall-safe defaults | SimHash threshold risks false-merge (drops a finding) | **Chosen; SimHash opt-in only** |
| Single-id dedup | Trivial | Creates twins when ids missing/inconsistent (common in the wild) | Rejected |

### D. Where cursor + dedup live
| Option | Pros | Cons | Fit |
|---|---|---|---|
| **In the core; adapters are thin + stateless on dedup** | Every family inherits incremental + dedup for free; adapters stay replaceable | Core owns more state | **Chosen** |
| Per-adapter | Adapter autonomy | Each reimplements cursors/dedup → drift, twins, re-spam | Rejected |

## Decision
**A safe, academic-weighted v1 source set behind one `SourceAdapter` port; incremental cursors + multi-layer
dedup in the core; documented stubs for the rest.**

1. **v1 source set** (source-ingestion research §4):
   - **v1 core** — `ArxivAdapter` (query API + OAI-PMH harvest, 3 s single-connection limiter + per-category RSS),
     `SemanticScholarAdapter` (enrichment + citation cross-ref, mandatory exponential backoff), `GithubAdapter`
     (per-repo `releases/tags/commits.atom` + REST with ETag/`since`, honoring secondary-rate-limit headers),
     `BlogRssAdapter` (generic Atom/RSS with conditional GET driven by a vetted `feeds.yaml`).
   - **v1 light** — `HackerNewsAdapter` over the Algolia API, **metadata + link only**, `created_at_i` watermark.
   - **v1 stub** — `RedditAdapter` (OAuth pre-approval), `EdgarAdapter` (SEC filings, ≤10 req/s), `NewsletterAdapter`,
     `InternalFeedAdapter`: registered + discoverable but config-disabled; preflight refuses an `active` stub.
2. **Legal/ToS-safe ingestion.** Official APIs + publisher-provided feeds only; where a source offers only HTML,
   ingest **metadata + link**, never reproduced full text beyond a fair-use snippet, unless a license permits.
   Each adapter declares a `legal_mode` (`api | publisher_feed | metadata_only_link`) and a `tos_class`; a
   ToS-unsafe adapter is refused at **preflight** (scheduling research §5). Paywalled analyst reports are
   out of scope (§11).
3. **The `SourceAdapter` port.** The core depends on this interface; each family is a swappable adapter in a
   config-driven registry (`sources.yaml`/`caw05.config.toml`). The contract (source-ingestion research §5):
   `capabilities() -> SourceCapabilities`, `fetch(query, cursor) -> (Iterable[RawFinding], FetchCursor)`,
   `healthcheck() -> HealthStatus`. A `RawFinding` carries `source_native_id`, `canonical_id`, `title`, `url`,
   `authors`, `published_at`/`updated_at`, `summary_or_body` + `body_is_full_text`, `provenance`
   (`origin, retrieved_at, source_native_id, boundary="public", trust`), and the raw payload for audit.
   **Six contract obligations every adapter MUST honor:** (1) idempotent + incremental (advanced cursor every
   run); (2) rate-limit + exponential-backoff-with-jitter inside the adapter; (3) `legal_mode` honored
   (metadata-only never stores reproduced full text); (4) provenance complete (no finding without origin +
   `retrieved_at` + native id + boundary); (5) typed failures (transient vs terminal so the scheduler reacts);
   (6) **no classification/ranking** — adapters stay thin.
4. **Incremental fetch in the core.** Persist a per-source **watermark** (OAI `from`/`resumptionToken`, feed
   `ETag`/`Last-Modified`, HN `created_at_i`, GitHub `since`); advance the cursor **only on a fully successful
   source pass** (recall bias: when in doubt, re-fetch and dedup). Use HTTP conditional requests for cheap 304s;
   date-windowed catch-up after downtime. arXiv (3 s) and SEC (10 req/s, IP-block on breach) are serialized,
   never parallelized per host; GitHub Search (30/min) is conserved by preferring Atom feeds + `since`.
5. **Dedup in the core (multi-layer, recall-safe).** (1) intra-source native id; (2) cross-source canonical
   identity `DOI ▸ arXiv id ▸ normalized title+author` — one finding, many `provenance` entries; (3) SHA-256 of
   normalized title+abstract/body for the same item via two sources; (4) **SimHash** near-dup folding **behind a
   flag** with a conservative threshold (a false-merge would *drop* a finding, violating recall — default keeps
   both). arXiv **versions** stay distinct but linked (a v2 can be a fresh novelty signal). Export idempotency
   keys (ADR-0004 routing) prevent double-emission on retry.

## Consequences
- **Easy:** add a family (HN/Reddit, EDGAR, a new blog) by implementing one adapter file + one config block;
  classification and dedup never know the source (scheduling research §8 seam test).
- **Easy:** weekly re-runs are cheap and duplicate-free; a missed week self-heals via cursor catch-up; the same
  paper across four sources collapses to one auditable finding.
- **Hard / cost:** curating `feeds.yaml` + canonical watch-list repo URLs is manual and an open question; arXiv's
  3 s and SEC's IP-block limits force serialization; SimHash threshold tuning is deferred (recall risk).
- **Follow-on:** ADR-0002 relies on the structured author/venue metadata adapters supply for its entity lane;
  ADR-0004 consumes deduped findings + the per-source `trust` prior that seeds signal-vs-hype; the ledger's
  Semantic Scholar verification reuses the S2 client here. Runbooks: v1 core adapters (each passing the 6
  obligations); HN light; registered stubs; ingestion runtime (token-bucket limiter, cursor persistence,
  cross-source dedup, provenance stamping); `sources.yaml`/registry.

## Open questions / revisit triggers
- TODO(open-question: confirm canonical GitHub orgs/repos for each watch-list project — MemOS, Chakra, MC-DLA/
  DeepStack, SECDA-DSE.) See [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md).
- TODO(open-question: finalize the v1 lab/company blog RSS allow-list; verify each offers a feed vs requiring scraping.)
- TODO(open-question: pursue a Semantic Scholar API key for >1 RPS, or stay on the shared unauth pool for v1 volume?)
- TODO(open-question: is Reddit watch-list signal worth the OAuth pre-approval, or skip for v1?)
- TODO(open-question: scope of "securities reports" — SEC EDGAR filings (free, in scope as stub) vs paywalled
  analyst reports (out of scope §11)? Clarify the brief's intent.)
- TODO(open-question: arXiv PDF/source full text via requester-pays S3 — needed for triage, or abstract+link enough for v1?)
- TODO(open-question: SimHash Hamming threshold + body normalization for layer-4 — acceptable false-merge rate, and is it even on in v1?)
- **Revisit trigger:** if classification or the core needs a source-specific branch, the `SourceAdapter` contract
  is leaking — extend the contract/value object, not the pipeline.
