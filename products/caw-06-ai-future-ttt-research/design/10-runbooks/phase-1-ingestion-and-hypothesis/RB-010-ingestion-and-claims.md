# RB-010: Build the 5-stage ingestion sub-pipeline (Discover → Import → Canonicalize+Dedup → Extract claims → Persist)

- Status: ready
- Phase: phase-1-ingestion-and-hypothesis
- Depends on: [RB-001 (store layout + record schemas), RB-002 (port interfaces + documented stubs)]
- Implements design:
  - [../../05-ttt-research-core/experiment-scout-pipeline.md](../../05-ttt-research-core/experiment-scout-pipeline.md) (§3 the five-stage ingestion, §1 idempotent+resumable, §4 CAW-05 boundary)
  - [../../01-decisions/ADR-0005-source-and-claim-ingestion.md](../../01-decisions/ADR-0005-source-and-claim-ingestion.md) (the decision)
  - [../../09-roadmap/dependency-graph.md](../../09-roadmap/dependency-graph.md) (R1, R2, R3 ordering)
- Produces: the ingestion core (`run_ingestion(thread)`); `SourceAdapter` v1 implementations (`ArxivAdapter`, `SemanticScholarAdapter`, `CAW05ImportAdapter`); `sources.yaml` registry; `Source` + `CandidateClaim` records persisted under `store/sources` and `store/claims`.

## Objective
A single `ExperimentScout` ingestion pass advances one thread through the five stages **S1 Discover → S2 Import(CAW-05) → S3 Canonicalize+Dedup → S4 Extract claims → S5 Persist**, behind the `SourceAdapter` port, writing provenance-stamped `Source` and `CandidateClaim` records to CAW-06's OWN file store. "Done" means: running the pipeline on at least one real public TTT source yields ≥1 deduped `Source` and ≥1 attributed `CandidateClaim` (verbatim `evidence_span` + `source_locator`, `status=unverified`), and **re-running the same pass produces no duplicates and no rewrites** (idempotent + resumable). Ingestion asserts nothing true and stops at S5 — it never enters the hypothesis stage.

## Preconditions
- [ ] RB-001 done: `store/{sources,claims,hypotheses,ledger,implications}` exist; `Source` and `CandidateClaim` schemas + validators are importable and round-trip.
- [ ] RB-002 done: the `SourceAdapter` Protocol and `SourceCapabilities`/`FetchCursor`/typed-failure (`SourceUnavailable`, retryable-vs-terminal) types compile; documented stubs (`GithubAdapter`, `BlogRssAdapter`, `HackerNewsAdapter`) return empty `fetch()`.
- [ ] Tree is green (compiles, lint passes) at the RB-002 acceptance checkpoint.
- [ ] Network egress to arXiv + Semantic Scholar is permitted in the build/test environment, OR a recorded fixture is available for offline test runs.
- [ ] A CAW-05 `action-brief` sample bundle (or a documented fixture matching the expected `caw05.action-brief/v1` shape) is available at a configured boundary path. CAW-05 is a **separate product**; this is a file/API drop, not a shared store.

## Steps

### 1. Define the ingestion stage contract and checkpoint model
- **Do:** Create `run_ingestion(thread, adapters, store)` orchestrating five ordered stages, each a pure function with one typed output: `S1 raw_sources`, `S2 imported_items`, `S3 deduped Source[]`, `S4 CandidateClaim[]`, `S5 persisted ids`. Record a per-stage checkpoint per thread (last completed stage + `FetchCursor`) so a crash resumes at the last completed stage (pipeline doc §1, §5). Stages communicate only via typed values, never by mutating shared globals.
- **Verify:** A unit test drives `run_ingestion` over a stub adapter and asserts the stages execute in order and that interrupting after S3 then resuming starts at S4 (not S1) and yields identical output.

### 2. Implement S1 Discover behind `SourceAdapter` (thin adapters only)
- **Do:** Implement `ArxivAdapter` (Query API + per-category RSS, strict ≥3 s rate limiter, TTT seed queries) and `SemanticScholarAdapter` (metadata enrichment + citation cross-ref, mandatory exponential backoff). Each honors the six contract obligations from ADR-0005 §2: idempotent+incremental via `FetchCursor`; rate-limit/backoff **inside** the adapter; legal-mode (public, ToS-safe only); complete provenance (origin URL + `retrieved_at` + native id + `boundary`); typed failures (retryable vs terminal); **no claim extraction or ranking in the adapter**. Bind families in `sources.yaml` (`family → adapter + query + schedule`).
- **Verify:** Against a recorded fixture (or a live call), `ArxivAdapter.fetch(cursor)` returns raw source records each carrying provenance + native id and advances the cursor; a second `fetch` with the advanced cursor returns only new items. A test asserts the adapter performs no extraction (output contains raw metadata, zero `CandidateClaim`s).

### 3. Implement S2 Import from CAW-05 (read-only, non-evidential boundary)
- **Do:** Implement `CAW05ImportAdapter` reading the `caw05.action-brief/v1` bundle from the configured boundary path (file drop / pull endpoint). Treat it read-only, public, provenance-bearing, and **non-evidential**: CAW-05 synthesis prose is `evidence:false`. Map each `open_question` to a **seed `CandidateClaim`** of type `mechanism`/`memory-traffic`, `status=unverified`, `writes_back=unknown` — never `supported`. Carry CAW-05 `classification`/`relevance` as **priority hints only**, never truth verdicts. Use `bundle_id` as the import watermark. On unknown `schema` major, raise typed `SourceUnavailable` — **never guess** the shape.
- **Verify:** Importing the sample bundle yields seed items with `evidence:false`, `status=unverified`, `writes_back=unknown`; a bundle with a bumped major `schema` raises `SourceUnavailable` and writes nothing. A test confirms no read/write touches any CAW-05 internal store path — only the boundary file is read.

### 4. Implement S3 Canonicalize + Dedup (one identity across origins)
- **Do:** Canonicalize identity by **DOI ▸ arXiv id ▸ normalized(title + first-author + year)**. Merge multi-origin hits into **one `Source` with multiple `provenance` entries**; keep arXiv **versions** distinct-but-linked. A CAW-05 import of an already-discovered paper adds a `provenance{origin:"caw05"}` entry (may raise thread priority) — it does **not** create a new `Source`. Apply claim-level near-dup merge within a source.
- **Verify:** A test feeding the same paper from arXiv + Semantic Scholar + CAW-05 produces exactly one `Source` with three `provenance` entries. Two distinct arXiv versions of one paper stay distinct-but-linked. `TODO(open-question: dedup tie-break when CAW-05 canonical_id disagrees with our discovered id — record the chosen rule in the test as the current decision; see ADR-0005 open questions)`.

### 5. Implement S4 Extract claims (extractive + attributable only)
- **Do:** For each `Source`, emit zero+ atomic `CandidateClaim`s, each with a **verbatim** `evidence_span`, a `source_locator` (section/page), `claim_type ∈ {mechanism, quantitative-result, capability, efficiency, memory-traffic, reproducibility}`, a `writes_back: true|false|unknown` flag (default `unknown`, brief §6), `status=unverified`, `evidence:false`, and `asserted_by` = the source id. LLM assistance is allowed for spotting/normalizing spans, but any paraphrase is marked `evidence:false`; extraction **never emits `supported`** and **never invents a claim without a span+locator**. Render claims as "<source> claims …", never "it is true that …".
- **Verify:** A test asserts every emitted `CandidateClaim` has a non-empty verbatim `evidence_span` that is a substring of the fetched source text, a `source_locator`, `status=unverified`, and `evidence:false`; the validator rejects any claim with `status=supported` or a missing span. A `memory-traffic` claim retains its `writes_back` flag (default `unknown`).

### 6. Implement S5 Persist (idempotent upsert to CAW-06's own store)
- **Do:** Write `Source` records to `store/sources` and `CandidateClaim` records to `store/claims` as provenance-stamped markdown/JSON (ADR-0007 layout). Upsert keyed on canonical id: re-persisting a known id is a **no-op** (same bytes), not a duplicate or a rewrite. Advance and persist the `FetchCursor` as the S5 checkpoint.
- **Verify:** After one pass, `store/sources` and `store/claims` contain the records; running `run_ingestion` a **second** time on the same input adds zero new files and changes zero existing files (byte-identical), and the cursor does not regress.

### 7. Wire the registry and the resumability checkpoints end-to-end
- **Do:** Load adapters from `sources.yaml`; ensure each stage writes its checkpoint per the pipeline doc §5 table (cursor advanced + records upserted = ingestion done). Confirm stubs registered but inert (`HealthStatus="deferred: <reason>"`, empty `fetch()`).
- **Verify:** A full `run_ingestion` over one real source completes with the thread checkpoint at "S5 done"; killing the process mid-S4 and restarting resumes at S4 and finishes without duplicating S1–S3 output.

## Acceptance criteria
- [ ] `run_ingestion` advances one thread S1→S5 and stops at S5 (never enters the hypothesis stage).
- [ ] ≥1 `Source` and ≥1 `CandidateClaim` persisted from a real public TTT source, fully provenance-stamped.
- [ ] Every `CandidateClaim` is extractive + attributable: verbatim `evidence_span` (substring of source), `source_locator`, `claim_type`, `writes_back` (default `unknown`), `status=unverified`, `evidence:false`, `asserted_by`. No claim is `supported`; ingestion asserts nothing true.
- [ ] Multi-origin dedup yields one `Source` with multiple `provenance`; arXiv versions distinct-but-linked; a CAW-05 import of a known paper adds provenance, not a new source.
- [ ] CAW-05 import is read-only, non-evidential (`evidence:false`), watermarked by `bundle_id`; unknown `schema` major ⇒ `SourceUnavailable`; no access to any CAW-05 internal store (boundary only, no shared store).
- [ ] Re-running the full pass is idempotent: zero new/changed files, cursor non-regressing; resumable from the last completed stage.
- [ ] v1 adapters (`Arxiv`, `SemanticScholar`, `CAW05Import`) honor the six contract obligations; documented stubs registered but inert.
- [ ] Tree is green (compiles, lint passes) at this checkpoint.

## Rollback / safety
- The store is append/upsert-only; a failed pass leaves prior records untouched. To undo a bad pass, delete only the canonical ids written by that pass (records carry their provenance + `retrieved_at`/`bundle_id`) and reset the `FetchCursor` to the persisted pre-pass checkpoint; re-running then re-fetches idempotently.
- If an adapter mid-fetch fails, it raises a typed failure (retryable vs terminal); the orchestrator stops at the last good checkpoint and never writes partial/guessed records. Never invent a `Source`/`Claim` to "complete" a pass.
- Legal-mode guard: if a source is not confirmed public/ToS-safe, the adapter must skip it rather than ingest (brief §12).

## Hand-off
The next runbook (**RB-011**) can assume: a populated `store/claims` of attributed, unverified `CandidateClaim`s (each with `claim_type`, `writes_back`, verbatim span, `asserted_by`) and a deduped `store/sources`, ready to be consolidated into `Claim`s and reasoned over into `Hypothesis` records. No claim carries a truth verdict; the `memory-traffic` `claim_type` + `writes_back` flag are the seeds the downstream hypothesis, writeback schema (ADR-0004), and CAW-01 export (ADR-0008) consume. The pipeline is idempotent + resumable, so RB-011 may re-run ingestion safely as a precondition.
