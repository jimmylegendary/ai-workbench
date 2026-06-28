# Source Ingestion

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF.md), [../_meta/DOC-CONVENTIONS.md](../_meta/DOC-CONVENTIONS.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose

This doc researches the **APIs, feeds, rate limits, and legal/ToS constraints** for each source family CAW-05
ingests, then recommends a **v1 source set** and defines the **`SourceAdapter` port contract** every adapter
implements. It decides *which sources are safe to ingest and how to fetch them incrementally without re-pulling*.
It does NOT decide classification/triage (separate doc), interest ranking, the related-work ledger schema, or
storage/scheduling specifics (separate ADRs). All sources here are **public, read-only**; CAW-05 never mixes them
with internal Samsung/SAIT claims (brief §12).

## 1. Design context

The watch list (brief §6) is **narrow and academic-heavy**: memory-centric DSE, memory-for-LLM, DeepStack,
Minsoo Rhu / MC-DLA / memory-wall, MemOS, SECDA-DSE, TTT writeback, Chakra/trace workload modeling, LLM-serving &
memory-hierarchy simulation. The dominant signal lives in **papers (arXiv/conf), code (GitHub), and lab blogs** —
so v1 ingestion weight goes there. HN/Reddit/securities/newsletters are *adjacent confirmation* channels, valuable
but lower-recall for this list, and several carry ToS/cost friction. The brief prioritizes **high recall on the
narrow list** over breadth (§1, §11), which drives "ingest broadly within the safe families, filter later."

Two cross-cutting principles:
- **Legal/ToS-safe only** (§5, §12). Prefer official APIs and publisher-provided feeds over HTML scraping. Where a
  source offers only HTML, ingest **metadata + link**, not full reproduced text, unless a license permits.
- **Generated summaries are not evidence** (§5). Every ingested item keeps raw provenance (origin URL, retrieval
  timestamp, source-native ID) so a finding can always be traced to its public source.

## 2. Per-source capability / access table

| Source family | Access mechanism | Auth | Rate limit | Incremental fetch | Native dedup key | Full text? | Legal/ToS verdict |
|---|---|---|---|---|---|---|---|
| **arXiv** | Query API (Atom) + OAI-PMH metadata harvest + per-category RSS | None | **1 req / 3 s, single connection**, all machines combined | OAI-PMH `from`/`until` date; RSS daily; query sort by `submittedDate` | `arXiv id` (e.g. `2406.01234`) + version | Abstract+metadata via API; PDF/source via bulk (S3, requester-pays) | **Safe.** Metadata is open; respect 3 s limit. Don't redistribute full text beyond linking. |
| **Semantic Scholar** | Academic Graph REST API (`/paper`, `/paper/search`, `/paper/{id}/citations`) | API key (free, recommended) | Unauth: **5,000 req / 5 min shared pool** (throttled under load); key: 1 RPS default, higher on request; `partner.semanticscholar.org` faster | `publicationDateOrYear` filter; poll by paper IDs; bulk search | `paperId`; cross-ref via `externalIds` (DOI, arXivId) | Abstracts + TLDR + citation graph; no full PDFs | **Safe.** Free for research. **Exponential backoff required** by ToS. Enrichment/cross-ref layer, not primary discovery. |
| **Lab/company blogs + RSS/Atom** | Per-site RSS/Atom feeds (publisher-provided) | None | Per-site (be polite; conditional GET) | HTTP `ETag` / `Last-Modified`; feed `<updated>` per entry | Entry `<id>`/`<guid>` or canonical URL | Usually full or summary in feed | **Mostly safe via feeds.** Use the feed the publisher offers. **No HTML scraping** of sites without a feed/license in v1. |
| **GitHub (repos/releases/commits)** | REST API + per-repo `releases.atom`, `tags.atom`, `commits.atom`; Search API | PAT recommended | Core: **5,000 req/h** (auth) vs 60/h unauth; **Search: 30 req/min**; Atom feeds unauth, polite poll | `since` param (commits); ETag conditional requests; feed `<updated>` | `owner/repo` + release tag / commit SHA | Metadata, release notes, README | **Safe** under GitHub ToS for API use. Honor secondary-rate-limit headers; cache with ETag. |
| **Hacker News** | Algolia search API (`hn.algolia.com/api/v1/search`, `search_by_date`) + official Firebase API | None | Algolia: no documented hard cap (~10k req/h reported); Firebase: polite | `search_by_date` + `numericFilters=created_at_i>…`; Firebase `maxitem` cursor | HN `objectID` / item id; resolve to target URL | Title + URL + points + comments | **Safe.** Public free API, no key. Ingest metadata + link to original. |
| **Reddit** | Official Data API (OAuth) | OAuth client (pre-approval required since 2024/25) | Free tier: **100 QPM per OAuth client_id**; unauth rejected; commercial = paid contract | `new` listing + `before`/`after` fullname cursors | post `fullname` (`t3_…`) | Selftext + link | **Conditional.** Free non-commercial OK *with approval*; ToS forbids unapproved/commercial use. **v1 = stub** until approval. |
| **Securities / industry reports** | Mixed: SEC EDGAR (filings) free; analyst reports (paywalled) | EDGAR: none (User-Agent required); analysts: licensed | EDGAR: **10 req/s, all machines combined**, IP block on breach | EDGAR full-text search `efts.sec.gov` by date; daily index | EDGAR accession no.; report DOI/title | EDGAR: full filings; analyst: license-gated | **EDGAR safe** (free, UA header). **Paid analyst reports NOT ingested** (paywall/ToS, §11). **v1 = stub.** |
| **Newsletters / media** | Publisher RSS where offered; email→feed bridges (Kill-the-Newsletter); licensed APIs | None / per-service | Per-source polite | Feed `<updated>`; email arrival | Entry `<id>` / message-id | Varies; often summary | **Conditional.** RSS/own-subscription feeds OK; **no scraping paywalled media**, no redistributing full text. **v1 = light/stub.** |

Sources: arXiv [API ToU](https://info.arxiv.org/help/api/tou.html) · [bulk data](https://info.arxiv.org/help/bulk_data.html);
Semantic Scholar [API](https://www.semanticscholar.org/product/api) · [release notes](https://github.com/allenai/s2-folks/blob/main/API_RELEASE_NOTES.md);
GitHub [rate limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api);
[HN Search API](https://hn.algolia.com/api); [Reddit Data API Wiki](https://support.reddithelp.com/hc/en-us/articles/16160319875092-Reddit-Data-API-Wiki);
[SEC EDGAR rate limits](https://www.sec.gov/filergroup/announcements-old/new-rate-control-limits).

## 3. Cross-cutting concerns

### 3.1 Rate limiting
- Each adapter declares its limit; the runtime enforces a **per-source token bucket** plus global politeness.
- **Exponential backoff with jitter** on 429/503 is mandatory (S2 requires it; GitHub has secondary limits).
- arXiv (3 s) and SEC (10 req/s, IP-block on breach) are the strictest — serialize, never parallelize per host.
- GitHub Search (30/min) is the scarcest GitHub budget — prefer Atom feeds + `since` polling over repeated search.

### 3.2 Incremental fetch (avoid re-pulling)
- Persist a per-source **watermark** (high-water `updated`/date cursor or `maxitem` id) in CAW-05's own store.
- Use HTTP **conditional requests** (`ETag`, `Last-Modified`, `If-None-Match`) for feeds/GitHub → cheap 304s.
- Date-windowed pulls (arXiv OAI `from/until`, S2 `publicationDate`, HN `created_at_i>`, EDGAR date) for catch-up
  after downtime; cap window size to respect rate limits.

### 3.3 Deduplication
- Two layers:
  1. **Intra-source:** native ID (arXiv id+version, `paperId`, `owner/repo`+tag, HN objectID, accession no.).
  2. **Cross-source identity:** canonicalize to **DOI ▸ arXiv id ▸ normalized title+author**. A paper found on
     arXiv, S2, a blog, and HN is **one finding** with multiple `provenance` entries, not four.
- Normalize URLs (strip trackers, resolve redirects) before hashing for blog/HN/newsletter dedup.
- Keep arXiv **versions** distinct but linked (a v2 can be a fresh novelty signal).

### 3.4 Boundary & provenance (brief §7)
Every emitted record carries `origin` URL, `retrieved_at`, source-native id, `boundary = public`, and `trust`
(per-source default, overridable). This is what lets findings export cleanly to CAW-02/03 as Source/Claim with
auditable lineage and keeps "public research" separate from internal claims (§12).

## 4. Recommended v1 source set

Weighted to the narrow academic watch list, maximizing recall on safe families, deferring cost/ToS-friction ones.

| Tier | Sources | Why |
|---|---|---|
| **v1 core** | arXiv (query API + OAI-PMH + cs.AR/cs.LG/cs.DC RSS), Semantic Scholar (enrich + citation cross-ref), GitHub (Atom feeds + REST for watch-listed repos/orgs), curated lab/company blog RSS set | Highest recall on memory-centric DSE / LLM-memory / simulation work; all free + ToS-safe; clean dedup via DOI/arXiv id. |
| **v1 light** | Hacker News (Algolia, keyword + watch-list authors/domains) | Free, no key, good early-warning on systems/serving discussion; metadata+link only. |
| **v1 stub (port + config, no live fetch)** | Reddit, SEC EDGAR / securities, newsletters/media, internal feeds | ToS approval (Reddit), low signal/high noise or paywall friction; wire the adapter contract + config registry, document as stub (brief §9). |

Watch-list seeding for v1 core:
- **arXiv categories:** `cs.AR`, `cs.LG`, `cs.DC` (+ `cs.PF`) filtered by watch-list keyword/author queries.
- **GitHub:** track named orgs/repos for MemOS, Chakra, MC-DLA/DeepStack lines + topic/keyword search (sparingly,
  30/min budget). `TODO(open-question: confirm canonical repo URLs for each watch-list project)`.
- **Blogs:** maintain a `feeds.yaml` of vetted lab/company RSS (e.g. major AI-systems labs). `TODO(open-question:
  finalize the v1 blog feed allow-list)`.

## 5. The `SourceAdapter` contract

Ports & adapters (brief §9): the core depends on this interface; each source family is a swappable adapter
registered in a config-driven registry. Adapters **fetch + normalize only** — they do not classify or rank.

```python
# Capability descriptor the adapter advertises to the registry/scheduler.
@dataclass(frozen=True)
class SourceCapabilities:
    family: str                 # "arxiv" | "semantic_scholar" | "github" | "blog_rss" | "hn" | ...
    supports_incremental: bool  # can resume from a watermark
    supports_full_text: bool    # feed/API returns body text vs metadata-only
    requires_auth: bool
    rate_limit: RateLimitSpec   # max_calls, per_seconds, concurrency, backoff policy
    legal_mode: str             # "api" | "publisher_feed" | "metadata_only_link"

@dataclass(frozen=True)
class FetchCursor:              # opaque, persisted by the core between runs
    watermark: str | None      # e.g. ISO date, HN max id, GitHub ETag, OAI resumptionToken
    extra: dict[str, str]

@dataclass(frozen=True)
class RawFinding:               # adapter output; normalized, NOT yet classified
    source_native_id: str      # arXiv id / paperId / owner/repo@tag / objectID / accession
    canonical_id: str | None   # DOI ▸ arXiv id ▸ normalized title (for cross-source dedup)
    title: str
    url: str                   # origin (provenance)
    authors: list[str]
    published_at: datetime | None
    updated_at: datetime | None
    summary_or_body: str | None
    body_is_full_text: bool
    provenance: Provenance     # origin, retrieved_at, source_native_id, boundary="public", trust
    raw: dict                  # source-native payload for audit/reprocessing

class SourceAdapter(Protocol):
    def capabilities(self) -> SourceCapabilities: ...

    def fetch(self, query: SourceQuery, cursor: FetchCursor | None
              ) -> tuple[Iterable[RawFinding], FetchCursor]:
        """Pull new/updated items since `cursor`. MUST respect rate_limit and
        return an advanced cursor for the next incremental run. MUST raise
        RateLimited/Unauthorized/SourceUnavailable (typed) rather than swallow."""

    def healthcheck(self) -> HealthStatus: ...  # auth valid? endpoint reachable?
```

Contract obligations every adapter MUST honor:
1. **Idempotent + incremental:** given the same cursor, re-running yields no duplicates downstream (dedup by
   `source_native_id`); always return an advanced cursor.
2. **Rate-limit & backoff inside the adapter** per its declared `RateLimitSpec` (exponential backoff + jitter).
3. **Legal mode honored:** `metadata_only_link` adapters never store reproduced full text beyond fair-use snippet.
4. **Provenance complete:** no `RawFinding` without origin URL + `retrieved_at` + native id + `boundary`.
5. **Typed failures:** distinguish transient (retryable) from terminal (auth/ToS) errors so the scheduler reacts.
6. **No classification/ranking** — that belongs to the triage stage; adapters stay thin and replaceable.

## Open Questions

See [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md).
- `TODO(open-question: confirm canonical GitHub orgs/repos for each watch-list project — MemOS, Chakra, MC-DLA/DeepStack, SECDA-DSE)`.
- `TODO(open-question: finalize the v1 lab/company blog RSS allow-list and verify each offers a feed vs requiring scraping)`.
- `TODO(open-question: do we pursue a Semantic Scholar API key for >1 RPS, or stay on the shared unauth pool for v1 volume?)`.
- `TODO(open-question: is Reddit watch-list signal worth the OAuth pre-approval process, or skip entirely for v1?)`.
- `TODO(open-question: which "securities reports" are actually in scope — SEC EDGAR filings (free) vs paywalled analyst reports (out of scope)? Clarify the brief's intent.)`.
- `TODO(open-question: arXiv PDF/source full-text via requester-pays S3 bucket — needed for triage, or is abstract+link sufficient for v1?)`.

## Implications for runbooks

- **RB (v1 core adapters):** implement `ArxivAdapter` (query API + OAI-PMH harvest, 3 s limiter), `SemanticScholarAdapter`
  (enrichment + citation cross-ref, backoff), `GithubAdapter` (Atom feeds + REST with ETag/`since`), `BlogRssAdapter`
  (generic Atom/RSS with conditional GET driven by `feeds.yaml`). Each must pass the 6 contract obligations.
- **RB (HN light):** `HackerNewsAdapter` over the Algolia API, metadata+link only, `created_at_i` watermark.
- **RB (stubs):** ship `RedditAdapter`, `EdgarAdapter`, `NewsletterAdapter` as registered stubs implementing
  `SourceAdapter` + `capabilities()` but returning empty `fetch()` with a documented "blocked: ToS/approval/scope"
  health status (brief §9 documented-stubs pattern).
- **RB (ingestion runtime):** per-source token-bucket limiter, cursor/watermark persistence in CAW-05's own store,
  cross-source dedup (DOI ▸ arXiv id ▸ normalized title), provenance stamping. Keep the tree green at each step.
- **Config:** a `sources.yaml` registry binds family → adapter + query + schedule, so families plug in without
  core changes (ports & adapters).
