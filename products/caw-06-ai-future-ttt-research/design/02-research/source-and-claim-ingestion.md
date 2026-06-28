# Source & Claim Ingestion

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF.md), [../_meta/DOC-CONVENTIONS.md](../_meta/DOC-CONVENTIONS.md)
  - [./hypothesis-and-uncertainty.md](../05-ttt-research-core/hypothesis-and-uncertainty.md) (the consumer of extracted claims — TODO if not yet written)
  - [../01-decisions/ADR-0005-source-and-claim-ingestion.md](../01-decisions/ADR-0005-source-and-claim-ingestion.md) (authoritative for this decision — to be written; brief §10)
  - [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
This doc decides **how CAW-06 discovers public TTT research, extracts checkable claims from it, imports TTT radar
signals from CAW-05 (a separate product), deduplicates across all inputs, and exposes it all behind a ports &
adapters seam** (`SourceAdapter` + a `CAW05ImportAdapter`). It elaborates brief §5 (source discovery → claim
extraction stages), §8 (CAW-05 import boundary), and §9 (`SourceAdapter` v1 = arXiv/Semantic Scholar + CAW-05
import; stubs = others). It does NOT decide hypothesis generation/uncertainty tagging (separate doc/ADR), the
small-experiment ledger, the writeback-traffic schema, or export to CAW-01/CAW-02. The load-bearing constraints
it must never break (brief §5, §12): **sources, claims, and generated conclusions stay separate; a generated
summary is never evidence; a hypothesis is never a settled claim.** Ingestion produces **sources and candidate
claims with provenance** — nothing here asserts truth.

## 1. Design context
CAW-06's unit of value is one tracked research thread `source → claim → hypothesis → small experiment → result →
implication` (brief §2). Ingestion owns the first hop and a half: **getting sources in, and turning each source
into one or more *candidate claims*** that the hypothesis stage can pick up. Two input channels feed it:

1. **Public research discovery** — arXiv + Semantic Scholar (brief §9 v1), narrowed to the TTT theme (brief §6):
   test-time training / test-time compute variants that **write back** (update weights, fast weights, optimizer
   state, KV/memory) during inference. Grounding examples that motivate the schema (public, real work, *not*
   endorsed claims): TTT layers / TTT-Linear / TTT-MLP (Sun et al., 2024), "The Surprising Effectiveness of TTT
   for Few-Shot Learning" (arXiv:2411.07279), Titans neural long-term memory that updates weights at test time,
   and "Test-Time Training Done Right" (arXiv:2505.23884). These are **seeds for queries**, not a fixed corpus.
2. **CAW-05 import** — CAW-05 (the trend/radar product, a *separate product* with its own store) emits
   `action-brief` artifacts proposing an open question/task for CAW-06 (CAW-05 ADR-0007 / digest-outputs §"five
   formats"). We import those across an explicit file/API boundary — **no shared store** (brief §8).

This doc is the CAW-06 sibling of CAW-05's `source-ingestion.md`; we deliberately **reuse its `SourceAdapter`
shape** so the family stays consistent, but CAW-06's adapters are its OWN — independence contract (conventions §8).

## 2. The ingestion pipeline (stages)
Pipeline is linear, idempotent, and resumable; each stage has one responsibility and a typed output.

| Stage | Input | Output | Responsibility | Must NOT |
|---|---|---|---|---|
| S1 Discover | `SourceQuery` + `FetchCursor` | `RawSource[]` | pull new/updated public items via a `SourceAdapter`; respect rate limits; advance cursor | classify, judge truth, extract claims |
| S2 Import | CAW-05 export bundle | `RawSource[]` (origin=`caw05`) | adapt CAW-05 `action-brief` → CAW-06 `RawSource` over the boundary | treat the CAW-05 *summary* as evidence |
| S3 Canonicalize + Dedup | `RawSource[]` | `Source` (deduped) + `provenance[]` | resolve identity (DOI ▸ arXiv id ▸ norm title); merge multi-origin into one `Source` | drop provenance; collapse arXiv versions silently |
| S4 Extract claims | `Source` | `CandidateClaim[]` | pull atomic, attributable statements with span + locator; tag `claim_type`; default `status=unverified` | invent claims; assert a claim is true |
| S5 Persist | `Source`, `CandidateClaim[]` | files in CAW-06's own store | write provenance-stamped records; mark generated text `evidence:false` | mix public source text with internal claims |

The hypothesis stage (separate doc) reads `CandidateClaim` records; ingestion stops at S5. A `CandidateClaim` is
**not** a hypothesis and **not** a verified claim — it is "the paper *says* X", attributed and located, with
`status=unverified` until the hypothesis/experiment stages act on it.

### 2.1 Claim extraction detail (S4)
Each `Source` yields zero or more `CandidateClaim`s. Extraction is LLM-assisted but **constrained to be
extractive + attributable**, never generative-as-evidence:

- **Atomicity:** one checkable assertion per claim ("TTT-Linear updates fast weights via one gradient step per
  token" is one claim; a paragraph is not).
- **Locator + span:** every claim carries `source_locator` (section/figure/page or text offset) and the verbatim
  `evidence_span` it was drawn from, so a reviewer can trace claim → exact source text (brief §12 separation).
- **Typing for the TTT lens:** `claim_type ∈ {mechanism, quantitative-result, capability, efficiency,
  memory-traffic, reproducibility}`. `memory-traffic` is the load-bearing type for the CAW-01 bridge — claims
  about weight updates, gradients, optimizer-state residency, write bandwidth/endurance, updated-weight reuse.
- **Writeback flag:** `writes_back: bool | unknown` — does this variant actually modify state during inference?
  Default `unknown`; the brief explicitly flags "verify which TTT variants actually write back" (§6) as open.
- **Uncertainty at extraction:** every claim is `status=unverified` and `evidence:false` for any generated
  paraphrase; only the `evidence_span` (verbatim) is treated as source text. Extraction never sets `supported`.

## 3. Deduplication (S3)
Three identity layers, reusing CAW-05's canonicalization order so cross-product dedup composes:

1. **Intra-source:** native id (arXiv id+version, Semantic Scholar `paperId`, CAW-05 `finding_id`).
2. **Cross-source identity:** canonicalize to **DOI ▸ arXiv id ▸ normalized(title+first-author+year)**. A paper
   found on arXiv, enriched by Semantic Scholar, and arriving again as a CAW-05 action-brief is **one `Source`**
   with three `provenance` entries — not three sources.
3. **Claim-level dedup:** within a `Source`, near-duplicate claims (cosine over normalized text + same
   `source_locator`) merge; across sources, identical claims link but keep separate provenance.

Rules: keep arXiv **versions** distinct but linked (a v2 can carry a new quantitative claim). Normalize URLs
(strip trackers, resolve redirects) before hashing. **CAW-05 arriving for a paper we already discovered directly
does not create a new source** — it adds a `provenance{origin:"caw05"}` entry and may raise the thread's priority.

## 4. Ports & adapters design
Brief §9: config-driven registry + documented stubs. The core depends on the `SourceAdapter` Protocol; each input
family is a swappable adapter. The CAW-05 import is itself a `SourceAdapter` (origin `caw05`) so the pipeline has
one uniform path — discovery and import differ only in adapter, not in core code.

```python
# Capability descriptor advertised to the registry/scheduler.
@dataclass(frozen=True)
class SourceCapabilities:
    family: str                 # "arxiv" | "semantic_scholar" | "caw05_import" | "github" | ...
    supports_incremental: bool  # can resume from a watermark/cursor
    supports_full_text: bool    # returns body text vs metadata-only
    requires_auth: bool
    rate_limit: RateLimitSpec   # max_calls, per_seconds, concurrency, backoff
    legal_mode: str             # "api" | "publisher_feed" | "metadata_only_link" | "internal_import"

@dataclass(frozen=True)
class FetchCursor:               # opaque, persisted by the core between runs
    watermark: str | None        # ISO date, OAI resumptionToken, last-imported CAW-05 bundle id
    extra: dict[str, str]

@dataclass(frozen=True)
class RawSource:                 # adapter output; normalized, NOT classified, NOT yet claim-extracted
    source_native_id: str        # arXiv id / paperId / caw05 finding_id
    canonical_id: str | None     # DOI ▸ arXiv id ▸ normalized title (cross-source dedup)
    title: str
    url: str                     # origin (provenance)
    authors: list[str]
    published_at: datetime | None
    updated_at: datetime | None
    summary_or_body: str | None  # abstract / metadata; generated text marked evidence:false downstream
    body_is_full_text: bool
    theme_tags: list[str]        # e.g. ["ttt", "test-time-compute", "writeback"] — discovery hint only
    provenance: Provenance       # origin, retrieved_at, source_native_id, boundary="public", trust
    raw: dict                    # source-native payload for audit/reprocessing

class SourceAdapter(Protocol):
    def capabilities(self) -> SourceCapabilities: ...
    def fetch(self, query: SourceQuery, cursor: FetchCursor | None
              ) -> tuple[Iterable[RawSource], FetchCursor]:
        """Pull new/updated items since `cursor`. MUST respect rate_limit, return an
        advanced cursor, and raise typed RateLimited/Unauthorized/SourceUnavailable
        rather than swallow."""
    def healthcheck(self) -> HealthStatus: ...
```

Contract obligations (every adapter MUST honor — mirrors CAW-05 so the family composes):
1. **Idempotent + incremental** — same cursor ⇒ no downstream duplicates; always return an advanced cursor.
2. **Rate-limit & backoff inside the adapter** (arXiv = 1 req / 3 s single connection; Semantic Scholar requires
   exponential backoff per ToS).
3. **Legal mode honored** — `metadata_only_link` never stores reproduced full text beyond fair-use snippet;
   public sources only (brief §12).
4. **Provenance complete** — no `RawSource` without origin URL + `retrieved_at` + native id + `boundary`.
5. **Typed failures** — transient (retryable) vs terminal (auth/ToS) so the scheduler reacts.
6. **No claim extraction / no ranking inside the adapter** — adapters stay thin; S4 owns extraction.

### 4.1 v1 adapters and documented stubs (brief §9)
| Adapter | Status | Mechanism | Notes |
|---|---|---|---|
| `ArxivAdapter` | **v1** | Query API (Atom) + per-category RSS (`cs.LG`, `cs.AR`, `cs.CL`, `cs.DC`), TTT keyword/author queries | strict 3 s limiter; abstract+metadata; PDF by link |
| `SemanticScholarAdapter` | **v1** | Academic Graph REST (`/paper/search`, `/paper/{id}`, citations) | enrichment + citation cross-ref; backoff mandatory; cross-ref via `externalIds` |
| `CAW05ImportAdapter` | **v1** | reads CAW-05 export bundle (file drop / fetch endpoint) → `RawSource(origin="caw05")` | boundary import; see §5 |
| `GithubAdapter` | **stub** | Atom feeds + REST for TTT reference implementations | registered, `fetch()` empty, health = "deferred" |
| `BlogRssAdapter` | **stub** | lab/company RSS allow-list | deferred to a later slice |
| `HackerNewsAdapter` | **stub** | Algolia API, metadata+link | adjacent-confirmation only |

Config: a `sources.yaml` registry binds `family → adapter + query + schedule`, so families plug in without core
changes. Stubs implement `SourceAdapter` + `capabilities()` but return empty `fetch()` with a documented
`HealthStatus = "blocked/deferred: <reason>"` (brief §9 documented-stubs pattern, same as CAW-03/04/05).

## 5. The CAW-05 import shape (boundary contract)
CAW-05 is a **separate product**; we never touch its store. We import its **`action-brief`** export — the format
CAW-05 explicitly routes to "CAW-01 / CAW-06 (open questions)" (CAW-05 digest-outputs §"five formats", ADR-0007).
The wire is a signed JSON bundle delivered by file drop or a pull endpoint; CAW-06 treats it as **read-only,
public, provenance-bearing, and NON-evidential** (the CAW-05 synthesis prose is `evidence:false`).

Expected import bundle (CAW-06 reads only these fields; tolerant of extras — adapter, not core, owns the shape):
```jsonc
{
  "schema": "caw05.action-brief/v1",         // versioned; CAW06ImportAdapter pins major
  "bundle_id": "caw05-2026-W26-0007",         // dedup + import watermark
  "finding_id": "caw05-finding-abcd1234",     // CAW-05 native id → our source_native_id
  "title": "TTT variant updates fast weights per token during inference",
  "canonical_id": "arXiv:2505.23884",         // DOI/arXiv id when CAW-05 resolved one → cross-source dedup
  "provenance": {                              // CAW-05's auditable manifest (brief: provenance, not prose)
    "origin": "https://arxiv.org/abs/2505.23884",
    "retrieved_at": "2026-06-25T12:00:00Z",
    "boundary": "public",
    "trust": "…",
    "classification": "novelty-threat",        // CAW-05 taxonomy — a HINT to us, not a verdict
    "relevance": 7.4                            // CAW-05 explainable score — priority hint only
  },
  "open_question": "Does this variant's write traffic differ from read-dominant serving?",
  "summary": "…generated synthesis…",          // evidence:false; reading aid only
  "evidence": false                            // mandatory marking carried through
}
```

Mapping into CAW-06 (`CAW05ImportAdapter.fetch`):
- `finding_id → RawSource.source_native_id`; `canonical_id` passes straight into dedup (S3) — a CAW-05 import for
  an arXiv paper we already have merges into the existing `Source` as a new `provenance{origin:"caw05"}` entry.
- `open_question` becomes a **seed `CandidateClaim` of type `mechanism`/`memory-traffic` with
  `status=unverified` and `writes_back=unknown`** — never `supported`. CAW-05's `classification`/`relevance`
  ride along as **priority hints only**, never as a truth verdict (brief §12: never conflate products' judgments).
- `summary` is stored `evidence:false`; only `provenance.origin` is citable downstream.
- `bundle_id` is the import watermark in `FetchCursor` (idempotent re-import).

What the import MUST NOT do: treat CAW-05's synthesis as evidence; treat CAW-05's `classification` as a settled
claim; reach into any CAW-05 store; or assume a shared substrate. If the `schema` major version is unknown, the
adapter raises a typed `SourceUnavailable("unsupported caw05 schema")` rather than guess.

## Open Questions
- `TODO(open-question: confirm CAW-05's action-brief wire schema + delivery (file drop vs pull endpoint) with CAW-05's ADR-0007 — fields above are our expected shape, to be reconciled at the boundary)`.
- `TODO(open-question: which TTT variants actually write back during inference? — brief §6; drives the writes_back flag and the memory-traffic claim_type. Needs the first research run to populate)`.
- `TODO(open-question: claim-extraction method — single LLM extract+attribute pass vs a verify pass that re-checks each claim against its evidence_span; what false-claim rate is acceptable before review?)`.
- `TODO(open-question: do we need arXiv full text (PDF/source) for memory-traffic claim extraction, or is abstract+metadata enough for v1 candidate claims?)`.
- `TODO(open-question: Semantic Scholar — pursue an API key for >1 RPS, or stay on the shared unauth pool for v1 volume?)`.
- `TODO(open-question: dedup tie-breaks when CAW-05 canonical_id disagrees with our directly-discovered id — which wins?)`.
- See [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md).

## Implications for runbooks
- **RB (v1 discovery adapters):** implement `ArxivAdapter` (query API + RSS, 3 s limiter, TTT seed queries) and
  `SemanticScholarAdapter` (enrichment + citation cross-ref, mandatory backoff). Each passes the 6 contract
  obligations; no claim extraction inside the adapter.
- **RB (CAW-05 import adapter):** implement `CAW05ImportAdapter` reading the `caw05.action-brief/v1` bundle →
  `RawSource(origin="caw05")`; pin schema major; `bundle_id` watermark; map `open_question` → seed
  `CandidateClaim(status=unverified, writes_back=unknown)`; carry `evidence:false`; raise typed errors on
  unknown schema. **No shared store** — file drop / pull endpoint only.
- **RB (canonicalize + dedup):** DOI ▸ arXiv id ▸ normalized title; merge multi-origin into one `Source` with
  multiple provenance entries; keep arXiv versions distinct-but-linked; claim-level near-dup merge.
- **RB (claim extraction S4):** extractive + attributable extractor producing atomic `CandidateClaim`s with
  `evidence_span`, `source_locator`, `claim_type`, `writes_back`, `status=unverified`; generated paraphrase
  marked `evidence:false`. Unit tests assert no claim is emitted without a verbatim span + locator.
- **RB (persist + registry):** write provenance-stamped `Source` + `CandidateClaim` records to CAW-06's own
  store; `sources.yaml` registry binds families; register `Github`/`BlogRss`/`HackerNews` as documented stubs
  with `HealthStatus="deferred"`. Keep the tree green at each acceptance checkpoint.
