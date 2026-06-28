# Radar Core — Source Ingestion & Dedup

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [overview.md](overview.md) — where collect + dedup sit in the Run
  - [interest-model.md](interest-model.md) — consumes the structured metadata the entity lane needs
  - [../01-decisions/ADR-0003-source-adapters-and-ingestion.md](../01-decisions/ADR-0003-source-adapters-and-ingestion.md) — the decision this elaborates
  - [../02-research/source-ingestion.md](../02-research/source-ingestion.md) — per-source access table, contract (research)
  - [../01-decisions/ADR-0006-storage-and-scheduling.md](../01-decisions/ADR-0006-storage-and-scheduling.md) — cursors + seen index live in the core
  - [../01-decisions/ADR-0004-classification-and-triage.md](../01-decisions/ADR-0004-classification-and-triage.md) — consumes deduped findings + per-source `trust` prior
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
This doc is the **build-facing elaboration** of CAW-05's ingestion core (ADR-0003): the **`SourceAdapter`
contract**, the **v1 source set** (arXiv / Semantic Scholar / GitHub / blog RSS / HN-light + stubs), **incremental
cursors**, and **multi-layer dedup** — all **legal/ToS-safe**. Adapters **fetch + normalize only**; cursors and
dedup live in the **core** so every family inherits them. It does NOT score (see
[interest-model.md](interest-model.md)), classify/route (ADR-0004), or export (ADR-0007). All v1 sources are
**public, read-only**; CAW-05 never mixes them with internal Samsung/SAIT claims (brief §12).

## Design posture
The watch list (brief §6) is narrow and **academic-heavy**, so the dominant signal lives in **papers (arXiv/conf),
code (GitHub), and lab blogs** — v1 ingestion weight goes there. HN/Reddit/securities/newsletters are *adjacent
confirmation* channels with lower recall and ToS/cost friction. The mission is **high recall on the narrow list**
(brief §1): the posture is **"ingest broadly within the *safe* families, filter later" — never drop at the
source.** Two hard constraints frame every adapter: **legal/ToS-safe only** (official APIs + publisher feeds;
metadata-only-link where only HTML exists) and **provenance always**.

## 1. v1 source set
Weighted to the narrow academic list, maximizing recall on safe families, deferring cost/ToS-friction ones.

| Tier | Adapter(s) | Access mechanism | Auth | Rate limit (core-enforced) | Legal mode |
|---|---|---|---|---|---|
| **v1 core** | `ArxivAdapter` | Query API + OAI-PMH harvest + `cs.AR`/`cs.LG`/`cs.DC`(+`cs.PF`) RSS | none | **1 req / 3 s, single connection** (serialize) | `api` |
| **v1 core** | `SemanticScholarAdapter` | Academic Graph REST; enrichment + citation cross-ref | key (free, recommended) | backoff mandatory; unauth shared pool | `api` |
| **v1 core** | `GithubAdapter` | per-repo `releases/tags/commits.atom` + REST (`since`, ETag) | PAT recommended | core 5k/h auth; **Search 30/min** (prefer Atom) | `api` |
| **v1 core** | `BlogRssAdapter` | generic Atom/RSS, conditional GET, driven by vetted `feeds.yaml` | none | per-site polite | `publisher_feed` |
| **v1 light** | `HackerNewsAdapter` | Algolia `search_by_date`; **metadata + link only** | none | polite | `metadata_only_link` |
| **v1 stub** | `RedditAdapter` | Data API (OAuth) | OAuth (pre-approval) | — | `api` (disabled) |
| **v1 stub** | `EdgarAdapter` | SEC EDGAR filings | none (UA header) | **≤10 req/s, IP-block on breach** | `api` (disabled) |
| **v1 stub** | `NewsletterAdapter`, `InternalFeedAdapter` | RSS / bridges | varies | — | varies (disabled) |

Stubs are **registered + discoverable but config-disabled**; preflight **refuses an `active` stub** (no live
fetch, returns a documented "blocked: ToS/approval/scope" health status). Paywalled analyst reports are out of
scope (brief §11). See per-source rate limits + ToS verdicts in
[../02-research/source-ingestion.md](../02-research/source-ingestion.md) §2.

## 2. Legal/ToS-safe ingestion
- **Official APIs + publisher-provided feeds only.** Where a source offers only HTML, ingest **metadata + link**,
  never reproduced full text beyond a fair-use snippet, unless a license permits. **No HTML scraping in v1.**
- Each adapter declares a `legal_mode` (`api | publisher_feed | metadata_only_link`) and a `tos_class`; a
  ToS-unsafe adapter is **refused at preflight** (ADR-0003 §2).
- arXiv (3 s) and SEC (10 req/s, IP-block) are the strictest — the core **serializes** them, never parallelizing
  per host. GitHub Search (30/min) is conserved by preferring Atom feeds + `since`.

## 3. The `SourceAdapter` contract
The core depends on this interface; each family is a swappable adapter in a config-driven registry
(`sources.yaml`). Build guidance — the builder writes the real adapters.

```python
@dataclass(frozen=True)
class SourceCapabilities:
    family: str                 # "arxiv" | "semantic_scholar" | "github" | "blog_rss" | "hn" | ...
    supports_incremental: bool
    supports_full_text: bool    # API returns body vs metadata-only
    requires_auth: bool
    rate_limit: RateLimitSpec   # max_calls, per_seconds, concurrency, backoff policy
    legal_mode: str             # "api" | "publisher_feed" | "metadata_only_link"

@dataclass(frozen=True)
class FetchCursor:               # opaque; persisted by the core between runs
    watermark: str | None       # ISO date | HN created_at_i | GitHub ETag | OAI resumptionToken
    extra: dict[str, str]

@dataclass(frozen=True)
class RawFinding:                # adapter output; normalized, NOT yet classified or ranked
    source_native_id: str       # arXiv id | paperId | owner/repo@tag | objectID | accession
    canonical_id: str | None    # DOI ▸ arXiv id ▸ normalized title (cross-source dedup)
    title: str
    url: str                    # origin (provenance)
    authors: list[str]
    published_at: datetime | None
    updated_at: datetime | None
    summary_or_body: str | None
    body_is_full_text: bool
    provenance: Provenance      # origin, retrieved_at, source_native_id, boundary="public", trust
    raw: dict                   # source-native payload for audit/reprocessing

class SourceAdapter(Protocol):
    def capabilities(self) -> SourceCapabilities: ...
    def fetch(self, query: SourceQuery, cursor: FetchCursor | None
              ) -> tuple[Iterable[RawFinding], FetchCursor]:
        """Pull new/updated items since `cursor`; respect rate_limit; return an advanced
        cursor. Raise typed RateLimited/Unauthorized/SourceUnavailable, never swallow."""
    def healthcheck(self) -> HealthStatus: ...
```

### Six contract obligations (every adapter MUST honor)
| # | Obligation | Why |
|---|---|---|
| 1 | **Idempotent + incremental** — same cursor ⇒ no downstream dups; always return an advanced cursor | Weekly re-runs stay cheap + duplicate-free |
| 2 | **Rate-limit + exponential backoff with jitter inside the adapter** | S2 requires it; GitHub has secondary limits |
| 3 | **Legal mode honored** — `metadata_only_link` never stores reproduced full text | brief §12 |
| 4 | **Provenance complete** — no finding without origin + `retrieved_at` + native id + `boundary` | Auditable export to CAW-02/03 |
| 5 | **Typed failures** — transient (retryable) vs terminal (auth/ToS) so the scheduler reacts | Recall: a transient error must not silently skip |
| 6 | **No classification/ranking** — adapters stay thin + replaceable | That belongs to score/triage |

> Revisit trigger (ADR-0003): if classification or the core needs a **source-specific branch**, the contract is
> leaking — extend the contract/value object, not the pipeline.

## 4. Incremental cursors (don't re-fetch)
Cursors live in the **core** (ADR-0006 §4); adapters advertise a cursor kind, the core persists it under
`state/<source>.cursor`. **Advance the cursor only on a fully successful source pass** — recall bias: when in
doubt, re-fetch and dedup rather than advance.

| Source family | Cursor mechanism |
|---|---|
| arXiv / Semantic Scholar | OAI-PMH `from=<last datestamp>` (never set `until`); carry `resumptionToken` to page; S2 `publicationDateOrYear` |
| RSS / blogs | last-seen `id`/`guid` + `Last-Modified`/`ETag` conditional GET (cheap 304s) |
| GitHub | `since=` + repo `pushed_at` watermark; ETag conditional requests |
| HN (light) | Algolia `numericFilters=created_at_i>cursor` |
| Securities (stub) | EDGAR RSS / full-text `dateRange`; cursor = last accession date |

Use HTTP conditional requests for cheap 304s; **date-windowed catch-up** after downtime (cap window size to
respect rate limits). A missed week self-heals: the next run's window simply spans more time.

## 5. Multi-layer dedup (don't re-process / re-emit)
Dedup lives in the **core** so a paper on arXiv + S2 + a blog + HN is **one finding with many provenance
entries, not four**. Cheapest layer first; **recall-safe defaults** (a false-merge would *drop* a finding).

| Layer | Mechanism | v1 | Note |
|---|---|---|---|
| 1 | **Intra-source native id** (arXiv id+version, paperId, owner/repo@tag, objectID, accession) | on | Exact ⇒ known |
| 2 | **Cross-source canonical identity** — `DOI ▸ arXiv id ▸ normalized title+author` | on | One finding, many `provenance` entries |
| 3 | **Exact content hash** — SHA-256 of normalized title+abstract/body | on | Same item via two sources |
| 4 | **SimHash near-dup** (64-bit, Hamming threshold) | **flag, default off** | A false-merge drops a finding ⇒ recall-safe default keeps both |

- Normalize URLs (strip trackers, resolve redirects) before hashing for blog/HN/newsletter dedup.
- arXiv **versions** stay **distinct but linked** — a v2 can be a fresh novelty signal.
- The `seen` index (`state/seen.idx`, projected into `index.sqlite`) is rebuildable from files (ADR-0006).
- **Export idempotency** (ADR-0004/ADR-0007): each bundle carries `idempotency_key = hash(finding_id + target +
  classification_version)` so a retry never double-routes a novelty-threat to CAW-03.

## 6. Watch-list seeding (brief §6) for v1 core
- **arXiv categories:** `cs.AR`, `cs.LG`, `cs.DC` (+ `cs.PF`) filtered by watch-list keyword/author queries.
- **GitHub:** track named orgs/repos for the MemOS, Chakra, MC-DLA/DeepStack lines + sparing topic search
  (30/min budget). `TODO(open-question: confirm canonical repo URLs for each watch-list project.)`
- **Blogs:** maintain a vetted `feeds.yaml` of lab/company RSS. `TODO(open-question: finalize the v1 blog feed
  allow-list; verify each offers a feed vs requiring scraping.)`
- A one-off `caw05 run --since <date>` backfill (ADR-0006) seeds history before the first weekly run.

## Open Questions
See [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md). Carried from ADR-0003:
canonical GitHub repos; the blog allow-list; S2 API key vs shared pool; Reddit OAuth worth it for v1?; EDGAR
filings vs paywalled analyst reports scope; arXiv full-text via requester-pays S3; SimHash threshold + whether
layer-4 is on at all in v1.

## Implications for runbooks
- **RB (v1 core adapters):** `ArxivAdapter` (query API + OAI-PMH, 3 s limiter), `SemanticScholarAdapter`
  (enrich + cross-ref, backoff), `GithubAdapter` (Atom + REST, ETag/`since`), `BlogRssAdapter` (conditional GET
  from `feeds.yaml`). Each passes the 6 obligations.
- **RB (HN light):** `HackerNewsAdapter` over Algolia, metadata+link only, `created_at_i` watermark.
- **RB (stubs):** `RedditAdapter`/`EdgarAdapter`/`NewsletterAdapter`/`InternalFeedAdapter` registered, returning
  empty `fetch()` + documented "blocked" health status (brief §9 documented-stubs pattern).
- **RB (ingestion runtime):** per-source token-bucket limiter, cursor persistence (advance-on-success),
  cross-source dedup (id ▸ canonical ▸ SHA-256; SimHash flagged), provenance stamping. Keep the tree green.
- **Config:** `sources.yaml` binds family → adapter + query + schedule so families plug in without core changes.
