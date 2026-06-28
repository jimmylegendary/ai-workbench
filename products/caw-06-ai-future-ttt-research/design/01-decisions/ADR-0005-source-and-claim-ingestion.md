# ADR-0005: Source discovery & claim ingestion behind a SourceAdapter port

- **Status:** proposed
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF.md) (§5 stages, §8 CAW-05 import, §9 SourceAdapter, §12 separation)
  - [../02-research/source-and-claim-ingestion.md](../02-research/source-and-claim-ingestion.md) (authoritative design narrative)
  - [../02-research/ttt-landscape.md](../02-research/ttt-landscape.md) (which variants write back — seeds the TTT query lens)
  - [./ADR-0002-hypothesis-representation.md](./ADR-0002-hypothesis-representation.md) (the `Claim`/`Hypothesis`/`Evidence` separation this ADR feeds)
  - [./ADR-0006-implication-mapping.md](./ADR-0006-implication-mapping.md), [./ADR-0007-storage-and-scheduling.md](./ADR-0007-storage-and-scheduling.md), [./ADR-0008-export-boundaries.md](./ADR-0008-export-boundaries.md)
  - [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Context

CAW-06's unit of value is the thread `source → claim → hypothesis → small experiment → result → implication`
(brief §2). This ADR fixes the **first hop and a half**: getting public TTT research in, importing TTT radar
signals from CAW-05 (a separate product), deduplicating across both, and extracting **candidate claims** — all
behind a ports & adapters seam. It binds brief §5 (discovery → extraction stages), §8 (CAW-05 import boundary),
§9 (`SourceAdapter` v1 = arXiv/Semantic Scholar + CAW-05 import; stubs = others).

Forces:
- **No overclaim (brief §12, load-bearing):** sources, claims, and generated conclusions must stay structurally
  separate; a generated summary is never evidence; a `CandidateClaim` is "the paper *says* X", attributed and
  located — never a verdict. Ingestion asserts nothing true.
- **Independence (conventions §8):** CAW-05 is a separate product with its own store. We import across an explicit
  file/API boundary; **no shared store, registry, or runtime**. We reuse CAW-05's `SourceAdapter` *shape* for
  family consistency but the adapters are CAW-06's OWN.
- **Family consistency (brief §9):** config-driven registry + documented stubs, same pattern as CAW-03/04/05.
- **Idempotency:** the ExperimentScout runs on a schedule (ADR-0007); re-runs must not duplicate sources/claims.

## Options considered

| Decision point | Option | Pros | Cons | Fit |
|---|---|---|---|---|
| Adapter seam | **One `SourceAdapter` Protocol; CAW-05 import is just another adapter** | uniform pipeline; one code path; discovery vs import differ only by adapter | CAW-05 bundle shape stretches the abstraction slightly | **chosen** |
| | Separate import subsystem for CAW-05 | tailored to bundle | second code path; drifts from family | rejected |
| Dedup identity | **DOI ▸ arXiv id ▸ normalized(title+author+year)**; multi-origin merges to one `Source` w/ many `provenance` | composes with CAW-05 canonicalization; cross-product dedup works | normalization edge cases | **chosen** |
| | Native id only | trivial | same paper from 3 origins = 3 sources | rejected |
| Claim extraction | **Extractive + attributable** (verbatim `evidence_span` + `source_locator`), `status=unverified`, LLM-assisted but never generative-as-evidence | traceable; enforces §12; reviewer can verify claim→source text | misses claims needing synthesis | **chosen** |
| | Free LLM summarization into claims | richer | generated text masquerades as evidence — violates §12 | rejected |
| Adapter scope | **Thin adapters** (fetch + provenance + rate-limit only; no extraction/ranking in adapter) | swappable; testable; S4 owns extraction | more core code | **chosen** |

## Decision

1. **One pipeline, five stages, idempotent + resumable** (brief §5): S1 Discover → S2 Import (CAW-05) →
   S3 Canonicalize+Dedup → S4 Extract claims → S5 Persist. Each stage has one responsibility and a typed output;
   ingestion **stops at S5** and never enters the hypothesis stage (ADR-0002).
2. **`SourceAdapter` Protocol is the only discovery/import seam.** Core depends on the Protocol; every input family
   (including CAW-05 import) is a swappable adapter advertising `SourceCapabilities` and honoring six contract
   obligations: idempotent+incremental (advance the `FetchCursor`); rate-limit & backoff inside the adapter;
   legal-mode honored (public, ToS-safe only, brief §12); provenance complete (origin URL + `retrieved_at` +
   native id + `boundary`); typed failures (retryable vs terminal); **no claim extraction or ranking inside the
   adapter**.
3. **v1 adapters:** `ArxivAdapter` (Query API + per-category RSS, strict 3 s limiter, TTT seed queries),
   `SemanticScholarAdapter` (enrichment + citation cross-ref, mandatory exponential backoff),
   `CAW05ImportAdapter` (reads `caw05.action-brief/v1` bundle by file drop / pull endpoint).
   **Documented stubs:** `GithubAdapter`, `BlogRssAdapter`, `HackerNewsAdapter` — implement the Protocol, return
   empty `fetch()`, `HealthStatus="deferred: <reason>"`. A `sources.yaml` registry binds `family → adapter +
   query + schedule` so families plug in without core changes.
4. **Dedup (S3):** canonicalize **DOI ▸ arXiv id ▸ normalized(title+first-author+year)**; merge multi-origin into
   **one `Source` with multiple `provenance` entries**; keep arXiv **versions** distinct-but-linked; claim-level
   near-dup merge within a source. A CAW-05 import for an already-discovered paper adds a
   `provenance{origin:"caw05"}` entry (may raise thread priority) — it does **not** create a new source.
5. **Claim extraction (S4):** each `Source` yields zero+ atomic `CandidateClaim`s, each carrying a verbatim
   `evidence_span`, a `source_locator`, `claim_type ∈ {mechanism, quantitative-result, capability, efficiency,
   memory-traffic, reproducibility}`, a `writes_back: bool|unknown` flag (default `unknown`, brief §6), and
   `status=unverified`. Any generated paraphrase is marked `evidence:false`. Extraction never emits `supported`
   and never invents a claim without a span+locator.
6. **CAW-05 boundary contract:** import the **`action-brief`** export only (the format CAW-05 routes to
   "CAW-01/CAW-06 open questions"). Treated read-only, public, provenance-bearing, **non-evidential** (CAW-05
   synthesis prose is `evidence:false`). `open_question` becomes a **seed `CandidateClaim`** of type
   `mechanism`/`memory-traffic`, `status=unverified`, `writes_back=unknown` — never `supported`. CAW-05's
   `classification`/`relevance` ride along as **priority hints only**, never truth verdicts. `bundle_id` is the
   import watermark. Unknown `schema` major ⇒ typed `SourceUnavailable`, never guess.

## Consequences

- **Easy:** add a new source family (write an adapter, register in `sources.yaml`); trace any claim back to exact
  source text; safely re-run the scheduled scout (idempotent cursors); compose dedup with CAW-05's canonicalization.
- **Hard / accepted cost:** claims requiring synthesis across sources are out of scope at S4 (the hypothesis stage,
  ADR-0002, does cross-claim reasoning); full-text claim extraction may need PDF fetch (open question); extractive
  discipline means lower recall in exchange for zero overclaim.
- **Follow-on:** ADR-0007 persists `Source` + `CandidateClaim` records (markdown/JSON, provenance-stamped) and
  schedules the discovery adapters; ADR-0002 consumes `CandidateClaim` into `Hypothesis`/`Evidence`; the
  `memory-traffic` `claim_type` + `writes_back` flag feed the writeback-traffic schema (ADR-0004) and the CAW-01
  export (ADR-0008).

## Open questions / revisit triggers

- `TODO(open-question: confirm CAW-05's action-brief wire schema + delivery (file drop vs pull endpoint) against CAW-05's own ADR-0007; fields are our expected shape, reconcile at the boundary)`.
- `TODO(open-question: which TTT variants actually write back during inference? — brief §6; drives writes_back + the memory-traffic claim_type; needs the first research run)`.
- `TODO(open-question: claim-extraction method — single extract+attribute pass vs a verify pass re-checking each claim against its span; acceptable false-claim rate before review?)`.
- `TODO(open-question: is abstract+metadata enough for memory-traffic claim extraction, or is arXiv full text/PDF required for v1?)`.
- `TODO(open-question: Semantic Scholar API key for >1 RPS vs the shared unauth pool for v1 volume?)`.
- `TODO(open-question: dedup tie-break when CAW-05 canonical_id disagrees with our directly-discovered id — which wins?)`.
- **Revisit when:** a non-API source (full-text scrape) is needed (legal-mode review), or a second importing
  product appears (generalize the import contract beyond CAW-05).
