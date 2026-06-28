# RB-010: Implement v1 SourceAdapters (arXiv, Semantic Scholar, GitHub, curated RSS, HN-light) + documented stubs

- Status: ready
- Phase: phase-1-ingestion
- Depends on: [RB-00X (P0 foundations: pipeline core/Run, SourceAdapter port + registry stub, FILES-AS-TRUTH store, SQLite index)]
- Implements design: [../../05-radar-core/source-ingestion-and-dedup.md](../../05-radar-core/source-ingestion-and-dedup.md), [../../07-backend-api/ingestion-service.md](../../07-backend-api/ingestion-service.md), [../../01-decisions/ADR-0003-source-adapters-and-ingestion.md](../../01-decisions/ADR-0003-source-adapters-and-ingestion.md)
- Produces: `ArxivAdapter`, `SemanticScholarAdapter`, `GithubAdapter`, `BlogRssAdapter`, `HackerNewsAdapter` (v1); `RedditAdapter`, `EdgarAdapter`, `NewsletterAdapter`, `InternalFeedAdapter` (registered, disabled stubs); `sources.yaml` registry + `feeds.yaml`; per-adapter rate-limit + typed-failure handling; adapter conformance test suite.

## Objective
Implement the v1 set of `SourceAdapter`s behind the single ingestion port (ADR-0003 §3) so a real Run can fetch
raw findings from arXiv, Semantic Scholar, GitHub, a curated lab-blog RSS allow-list, and HN-light — **legally /
ToS-safe only**, each emitting fully-provenanced `RawFinding`s and honoring the **six contract obligations**.
Adapters **fetch + normalize only** — they never dedup, score, classify, or rank (that is RB-011 and later
phases). The remaining families (Reddit, SEC/EDGAR, newsletters, internal feeds) ship as **registered but
config-disabled stubs** that preflight refuses to run live. "Done" = each v1 adapter passes the conformance suite,
`sources.yaml` binds family→adapter→query, and a Run can invoke all v1 adapters to produce `RawFinding`s with
complete provenance; cursors + dedup are wired in RB-011.

## Preconditions
- [ ] P0 foundations merged: the pipeline core (a Run), the `SourceAdapter` port/Protocol, the config-driven
      registry, and the FILES-AS-TRUTH store (`findings/`, `state/`, `artifacts/`) + SQLite index exist as stubs.
- [ ] The `RawFinding`, `Provenance`, `SourceCapabilities`, `FetchCursor`, `RateLimitSpec`, `HealthStatus`, and
      typed-error (`SourceTransient`/`SourceTerminal`, plus `RateLimited`/`Unauthorized`/`SourceUnavailable`)
      types exist from P0 (or are added here to match ADR-0003 §3).
- [ ] Tree is green (compiles, lint-passes) at HEAD.
- [ ] No secrets in the repo: a Semantic Scholar key and a GitHub PAT are read from env / a local untracked config,
      never committed.

## Steps

### 1. Define the shared adapter base + legal/ToS guard
- **Do:** Add a thin `BaseSourceAdapter` (or mixin) that all adapters use for: an HTTP client with default
  timeouts, a per-host **token-bucket limiter** hook (limiter itself is built in RB-011 — here just call it),
  **exponential-backoff-with-jitter** retry on transient HTTP (429/5xx, honoring `Retry-After` / GitHub
  secondary-rate-limit headers), provenance stamping, and a `legal_mode` declaration. Add a `preflight()` helper
  that asserts the adapter's `legal_mode ∈ {api, publisher_feed, metadata_only_link}` and that a stub marked
  `active` is **refused** (raises `SourceTerminal` "blocked: ToS/approval/scope").
- **Verify:** Unit test: an adapter declaring an unknown `legal_mode` fails preflight; a disabled stub set
  `active: true` is refused; a transient 429 triggers backoff-with-jitter then succeeds on retry.

### 2. Implement `ArxivAdapter` (v1 core)
- **Do:** Implement `fetch()` over the arXiv **Query API + OAI-PMH harvest** (and per-category `cs.AR`/`cs.LG`/
  `cs.DC`(+`cs.PF`) RSS as a complementary feed), filtered by watch-list keyword/author queries (brief §6).
  `legal_mode="api"`/`publisher_feed`. Enforce **1 req / 3 s, single connection, serialized** (no per-host
  parallelism). Cursor kind = OAI-PMH `from=<datestamp>` + `resumptionToken` paging (set `from`, **never set
  `until`**). Normalize each item to `RawFinding` with `canonical_id` = arXiv id (DOI when present), authors,
  `published_at`/`updated_at`, abstract as `summary_or_body` (`body_is_full_text=false`), and full `provenance`
  (`origin` URL, `retrieved_at`, `source_native_id` = arXiv id+version, `boundary="public"`, `trust`). Keep arXiv
  **versions distinct** (id includes version). Store the native payload in `raw` for audit.
- **Verify:** A live (or recorded-cassette) fetch over a small date window returns `RawFinding`s; every one passes
  `assert_provenance_complete`; the limiter spaces requests ≥3 s; `resumptionToken` paging is exercised; `until`
  is never sent (assert in request log).

### 3. Implement `SemanticScholarAdapter` (v1 core)
- **Do:** Implement `fetch()` over the Academic Graph REST API for **enrichment + citation cross-reference**
  (paperId, DOI, externalIds, authors, venue, year). `legal_mode="api"`; read API key from env if present (else
  shared unauth pool). **Mandatory exponential backoff** on 429. `canonical_id` = `DOI ▸ arXiv id ▸ normalized
  title+author` so RB-011 dedup can collapse it against arXiv. No time cursor (id/cross-ref enrich) — capabilities
  advertise this. Stamp full provenance. Note: this S2 client is **reused later** by the ledger's S2 verification
  (ADR-0005) — keep it a clean, importable unit.
- **Verify:** Given an arXiv id / title, the adapter returns enriched metadata with `externalIds`; a forced 429
  triggers backoff (test with a stubbed transport); missing provenance is impossible (asserted).

### 4. Implement `GithubAdapter` (v1 core)
- **Do:** Implement `fetch()` preferring per-repo `releases.atom` / `tags.atom` / `commits.atom` feeds + REST with
  `since=` and **ETag conditional requests**, for the named watch-list orgs/repos (MemOS, Chakra, MC-DLA/DeepStack,
  SECDA-DSE lines). `legal_mode="api"`/`publisher_feed`. Honor core 5k/h (auth via PAT from env) and **Search
  30/min** — prefer Atom over Search to conserve budget. Cursor = `since=` + repo `pushed_at` watermark + ETag.
  Normalize releases/tags/commits to `RawFinding` (canonical_id = `owner/repo@tag`), full provenance.
  `TODO(open-question: confirm canonical repo URLs for each watch-list project)` — drive repo list from
  `sources.yaml`, do not hardcode.
- **Verify:** Fetch against a test repo returns `RawFinding`s; a repeat request sends `If-None-Match` and handles a
  304 as "no new items"; Search API is not called when Atom suffices (assert call counts); PAT is read from env.

### 5. Implement `BlogRssAdapter` (v1 core)
- **Do:** Implement a **generic Atom/RSS** adapter driven by a vetted `feeds.yaml` allow-list, using **conditional
  GET** (`ETag`/`Last-Modified` → cheap 304s) and last-seen `guid`/`id`. `legal_mode="publisher_feed"`. Ingest
  **metadata + entry content as provided by the feed** (no HTML scraping beyond the feed). Normalize URLs (strip
  trackers, resolve redirects) for clean downstream dedup. Full provenance per entry.
  `TODO(open-question: finalize the v1 lab/company blog feed allow-list; verify each offers a feed vs scraping)` —
  ship `feeds.yaml` with the verified entries only; an entry requiring scraping is excluded, not scraped.
- **Verify:** Parsing a sample Atom + a sample RSS 2.0 feed yields `RawFinding`s; a 304 yields zero new findings;
  a feed entry with only an HTML link stores metadata+link, never reproduced full body.

### 6. Implement `HackerNewsAdapter` (v1 light, metadata-only-link)
- **Do:** Implement `fetch()` over the Algolia `search_by_date` API with `numericFilters=created_at_i>cursor`.
  `legal_mode="metadata_only_link"` — store **title + link + HN metadata ONLY**, never reproduced article text.
  Polite rate posture. Cursor = `created_at_i` watermark. Full provenance, `boundary="public"`.
- **Verify:** A fetch returns metadata+link `RawFinding`s with `body_is_full_text=false` and no article body
  beyond a fair-use snippet; a guard test asserts the adapter refuses to populate full text.

### 7. Register documented stubs (Reddit, SEC/EDGAR, newsletters, internal feeds)
- **Do:** Implement `RedditAdapter` (OAuth pre-approval), `EdgarAdapter` (SEC filings, ≤10 req/s, IP-block risk),
  `NewsletterAdapter`, and `InternalFeedAdapter` as **registered + discoverable but config-disabled** stubs. Each
  `fetch()` returns empty; each `healthcheck()` returns a documented `"blocked: ToS/approval/scope"` status; each
  declares its intended `legal_mode`/`tos_class`. Preflight **refuses** any stub flagged `active`. `EdgarAdapter`
  documents the ≤10 req/s + IP-block constraint and the in-scope (filings) vs out-of-scope (paywalled analyst
  reports, brief §11) boundary. `InternalFeedAdapter` documents the `boundary` guard — never mixed with public
  findings (brief §12). `TODO(open-question: securities scope; Reddit OAuth worth v1?)`.
- **Verify:** All four stubs appear in the registry and `healthcheck()` returns the blocked status; setting any
  stub `active: true` makes the Run refuse to start that source (preflight test).

### 8. Wire the `sources.yaml` registry + `feeds.yaml`
- **Do:** Author `sources.yaml` binding each `family → adapter → query → schedule → enabled` and a separate
  `feeds.yaml` for the blog allow-list. v1 core + HN-light enabled; all stubs present + disabled. Queries seed the
  watch list (brief §6): arXiv categories + keyword/author filters, GitHub repo list, S2 enrich targets, HN
  keyword filter. Per-source `trust` prior recorded (seeds signal-vs-hype, ADR-0004).
- **Verify:** The registry loads; `caw05 sources list` (or equivalent) shows v1 adapters enabled and stubs
  disabled; an invalid `legal_mode` or an enabled stub fails load/preflight.

### 9. Adapter conformance test suite (the six obligations)
- **Do:** Add a parametrized conformance suite run against every v1 adapter asserting: (1) idempotent + incremental
  shape (returns an advanced cursor; cursor mechanics fully tested in RB-011); (2) backoff-with-jitter on a forced
  429; (3) `legal_mode` honored (metadata-only adapters never store reproduced full text); (4) provenance complete
  (reject any `RawFinding` missing origin/`retrieved_at`/native id/`boundary`); (5) typed failures (transient vs
  terminal raised correctly); (6) no classification/ranking (adapter output carries no score/class field).
- **Verify:** The suite passes for all five v1 adapters; a deliberately broken adapter (drops provenance) fails
  obligation 4; tree is green.

## Acceptance criteria
- [ ] `ArxivAdapter`, `SemanticScholarAdapter`, `GithubAdapter`, `BlogRssAdapter`, `HackerNewsAdapter` implemented
      behind the `SourceAdapter` port; each passes the six-obligation conformance suite.
- [ ] All v1 sources are **legal/ToS-safe**: official APIs / publisher feeds only; **no HTML scraping**; HN is
      metadata-only-link; arXiv serialized at 1 req/3 s; GitHub prefers Atom over Search.
- [ ] Every `RawFinding` carries complete provenance (`origin`, `retrieved_at`, `source_native_id`,
      `boundary="public"`, `trust`); the core rejects any finding missing a provenance field.
- [ ] Reddit / EDGAR / newsletter / internal-feed stubs are registered + discoverable, return empty `fetch()` +
      a documented blocked `healthcheck()`, and preflight refuses any stub marked `active`.
- [ ] Rate-limit handling (token-bucket hook + backoff-with-jitter + conditional GET/ETag) is present in every
      adapter; typed transient/terminal errors are raised, never swallowed.
- [ ] `sources.yaml` + `feeds.yaml` committed; v1 enabled, stubs disabled; queries seed the brief §6 watch list.
- [ ] Adapters do **no** dedup/scoring/classification (deferred to RB-011 / P2 / P3); tree is green.

## Rollback / safety
- Adapters are additive behind the registry; to roll back, set a family `enabled: false` in `sources.yaml` — the
  Run skips it cleanly (no schema migration).
- Never advance any cursor in this runbook (cursor persistence is RB-011); a half-built adapter therefore cannot
  corrupt incremental state.
- Secrets (S2 key, GitHub PAT) stay in env / untracked config; revert by unsetting env — adapters fall back to
  unauth/shared pools or quarantine via typed terminal error.
- If a live source misbehaves (rate-limit/IP-block), quarantine that adapter (terminal error path) without
  affecting the others; no shared store means blast radius is one family.

## Hand-off
- RB-011 can assume: a working set of v1 adapters that emit provenanced `RawFinding`s with `canonical_id`
  populated, advertise their `cursor_kind` via `capabilities()`, and expose the per-host limiter hook — ready for
  the core to add cursor persistence (advance-on-success) and multi-layer dedup.
- Downstream (P2 relevance, P3 classify) can assume adapters never leak source-specific branches into the core
  (revisit trigger: extend the contract, not the pipeline) and never emit classification/ranking fields.
