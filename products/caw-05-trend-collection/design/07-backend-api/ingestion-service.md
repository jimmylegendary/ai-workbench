# Ingestion Service — source fetch, cursors, dedup, SourceAdapter invocation

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [./api-surface.md](./api-surface.md) (the `ingest` op this service implements)
  - [./scheduler-and-persistence.md](./scheduler-and-persistence.md) (cursor + seen-index persistence)
  - [./synthesis-service.md](./synthesis-service.md) (consumes deduped findings)
  - [../01-decisions/ADR-0003-source-adapters-and-ingestion.md](../01-decisions/ADR-0003-source-adapters-and-ingestion.md)
  - [../01-decisions/ADR-0006-storage-and-scheduling.md](../01-decisions/ADR-0006-storage-and-scheduling.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
Describes the **collect+dedup stage** of a Run: how the core invokes each `SourceAdapter`, advances per-source
cursors, applies multi-layer dedup, and stamps provenance to produce the deduped `Finding` set that relevance and
classification consume. It implements the `ingest` op of [./api-surface.md](./api-surface.md) under the decisions
of ADR-0003 (adapters/ingestion) and ADR-0006 (cursors/dedup in the core). It does NOT define each adapter's
source-specific fetch (that is per-adapter runbook work), relevance scoring (ADR-0002), or classification
(ADR-0004). All v1 sources are **public, read-only, ToS-safe**; the service never mixes them with internal claims.

## Position in the Run
```
collect (this doc) → dedup (this doc) → relevance → classify → synthesize → export
```
`collect+dedup` is the only stage that touches the network. It is recall-first: **ingest broadly within the safe
families, filter later** — never drop at the source.

## The SourceAdapter port (the only ingestion seam)
The core depends on one interface; each source family is a swappable adapter in a config-driven registry
(`sources.yaml`). Adapters **fetch + normalize only** — never classify, rank, or dedup (ADR-0003 §3).

```text
interface SourceAdapter:
  capabilities() -> SourceCapabilities
  fetch(query: SourceQuery, cursor: FetchCursor | null) -> (Iterable[RawFinding], FetchCursor)
  healthcheck() -> HealthStatus

SourceCapabilities = {
  source_id: string, family: string,
  legal_mode: "api" | "publisher_feed" | "metadata_only_link",
  tos_class: string, cursor_kind: CursorKind, rate_limit: RateLimitSpec,
}
RawFinding = {
  source_native_id, canonical_id?, title, url, authors[],
  published_at, updated_at,
  summary_or_body, body_is_full_text: bool,
  provenance: {origin, retrieved_at, source_native_id, boundary:"public", trust},
  raw_payload,                 # kept for audit; large blobs stored by path
}
```

### Six contract obligations (every adapter MUST honor — ADR-0003 §3)
| # | Obligation | Enforced where |
|---|---|---|
| 1 | Idempotent + incremental (advance cursor every successful run) | adapter + core cursor store |
| 2 | Rate-limit + exponential-backoff-with-jitter inside the adapter | adapter |
| 3 | `legal_mode` honored (metadata-only never stores reproduced full text) | adapter; core asserts |
| 4 | Provenance complete (origin + retrieved_at + native id + boundary) | adapter; core rejects if missing |
| 5 | Typed failures (transient vs terminal) so the scheduler reacts | adapter raises typed errors |
| 6 | No classification/ranking — adapters stay thin | review/seam test |

A `RawFinding` missing any provenance field is **rejected at the core boundary**, not silently stored.

## v1 source registry
From ADR-0003 §1. Stubs are registered + discoverable but config-disabled; preflight refuses an `active` stub.

| Adapter | Tier | legal_mode | Cursor mechanism | Rate posture |
|---|---|---|---|---|
| `ArxivAdapter` | v1 core | api/publisher_feed | OAI-PMH `from=<datestamp>` (+ `resumptionToken`) | 3 s single-connection, serialized |
| `SemanticScholarAdapter` | v1 core | api | id/cross-ref enrich (no time cursor) | exponential backoff mandatory |
| `GithubAdapter` | v1 core | api/publisher_feed | `since=` + repo `pushed_at`; ETag on `.atom` | honor secondary-rate-limit headers |
| `BlogRssAdapter` | v1 core | publisher_feed | last `guid` + `ETag`/`Last-Modified` 304 | conditional GET, polite |
| `HackerNewsAdapter` | v1 light | metadata_only_link | Algolia `created_at_i>cursor` | Algolia limits; link only |
| `RedditAdapter` | stub | api | (OAuth pre-approval) | disabled |
| `EdgarAdapter` | stub | api | last accession date | ≤10 req/s, IP-block risk |
| `NewsletterAdapter` | stub | publisher_feed | feed guid | disabled |
| `InternalFeedAdapter` | stub | — | — | disabled (boundary guard) |

## Collect loop (core, per Run)
```text
for source in registry.active():
    preflight(source)                      # legal_mode ok, not an active stub, healthcheck green
    cursor = cursor_store.load(source.id)  # null on first run / backfill
    try:
        for raw in source.fetch(query=source_query(window), cursor=cursor):
            assert_provenance_complete(raw) # obligation 4 — reject if missing
            stage_raw(raw)                  # buffer; do NOT advance cursor yet
        cursor_store.save(source.id, new_cursor)   # advance ONLY on full successful pass
    except SourceTransient as e:
        log(e); keep_cursor()               # recall bias: re-fetch + dedup next run
    except SourceTerminal as e:
        quarantine(source); alert(e)        # config/auth/ToS — needs human
```
Key rule (ADR-0006 §4): **advance the cursor only on a fully successful source pass.** When in doubt, re-fetch and
let dedup absorb the overlap — a missed week then self-heals via the wider next window. `backfill` ignores cursors.

### Per-host serialization & limiters
- arXiv (3 s) and SEC EDGAR (10 req/s, IP-block on breach) are **serialized per host**, never parallelized.
- GitHub Search (30/min) is conserved by preferring `.atom` feeds + `since` over the Search API.
- A shared token-bucket limiter keys on host; backoff-with-jitter is inside each adapter (obligation 2).

## Dedup (core, multi-layer, recall-safe — ADR-0003 §5 / ADR-0006 §4)
Cheapest layer first; a hit collapses to **one Finding with many provenance entries**.

| Layer | Mechanism | v1 | Note |
|---|---|---|---|
| 1 | Native id (intra-source) | on | exact id match ⇒ known |
| 2 | Cross-source canonical: `DOI ▸ arXiv id ▸ normalized title+author` | on | one finding across arXiv+S2+blog+HN |
| 3 | SHA-256 of normalized title+abstract/body | on | same item via two sources |
| 4 | SimHash near-dup (64-bit, Hamming threshold) | **flag (off by default)** | a false-merge *drops* a finding → recall risk |

```text
merge_or_create(raw):
    key = canonical_key(raw) or content_hash(raw)
    if seen_index.has(key):
        finding = load(key); finding.provenance.append(raw.provenance)  # merge, don't duplicate
    else:
        finding = new_finding(raw); seen_index.add(key)
    return finding
```
- **arXiv versions stay distinct but linked** — a v2 can be a fresh novelty signal (do not fold into v1).
- The `seen` index is a rebuildable SQLite projection of the file truth (ADR-0006 §A); deleting it and replaying
  files reproduces it.

## Provenance & boundary guarantees
- Every Finding carries `boundary="public"` and a `trust` prior per source (seeds signal-vs-hype, ADR-0004).
- `metadata_only_link` sources store **metadata + link only**, never reproduced full text beyond a fair-use
  snippet (obligation 3). Large fetched payloads (PDFs, raw blobs) are stored **by path** under `artifacts/<sha>/`,
  referenced from provenance — never inlined.

## Failure handling
| Failure | Type | Effect | Cursor |
|---|---|---|---|
| network/5xx/rate-limit | `SOURCE_TRANSIENT` | retry with backoff; partial pass discarded | not advanced |
| auth/ToS/4xx config | `SOURCE_TERMINAL` | adapter quarantined; alert | not advanced |
| missing provenance | reject at boundary | raw discarded; logged | unaffected |
| active stub detected | preflight refusal | Run refuses to start that source | n/a |

## Negative tests (must hold — ADR-0006)
- Re-running the same window fetches `new=0, dup=all`.
- The same paper across four sources collapses to one finding with four provenance entries.
- A transient failure leaves the cursor unadvanced; the next run re-fetches and dedups cleanly.
- Deleting `index.sqlite` and replaying files reproduces the `seen` set.

## Open Questions
- TODO(open-question: confirm canonical GitHub orgs/repos for each watch-list project — MemOS, Chakra, MC-DLA/
  DeepStack, SECDA-DSE.)
- TODO(open-question: finalize the v1 lab/company blog RSS allow-list — feed vs scraping.)
- TODO(open-question: Semantic Scholar API key for >1 RPS vs shared unauth pool for v1 volume.)
- TODO(open-question: SimHash Hamming threshold + body normalization for layer-4 — on for v1 at all?)
- TODO(open-question: arXiv PDF/source full text via requester-pays S3 — needed for triage, or abstract+link enough?)
- See [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md).

## Implications for runbooks
- One adapter file + one `sources.yaml` block per family, each passing the six obligations.
- Core ingestion runtime: token-bucket limiter, cursor store (advance-on-success), cross-source dedup, provenance
  stamping, boundary assertion — built once, inherited by every adapter.
- Stubs ship registered + disabled with a preflight that refuses an active stub.
