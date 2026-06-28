# Radar Core — Source Ingestion & Dedup (소스 수집 & 중복 제거)

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [overview_ko.md](overview_ko.md) — collect + dedup이 Run 안에서 어디에 위치하는가
  - [interest-model_ko.md](interest-model_ko.md) — entity lane이 필요로 하는 구조화 메타데이터를 소비
  - [../01-decisions/ADR-0003-source-adapters-and-ingestion_ko.md](../01-decisions/ADR-0003-source-adapters-and-ingestion_ko.md) — 이 문서가 구체화하는 결정
  - [../02-research/source-ingestion_ko.md](../02-research/source-ingestion_ko.md) — 소스별 access 표, 계약 (research)
  - [../01-decisions/ADR-0006-storage-and-scheduling_ko.md](../01-decisions/ADR-0006-storage-and-scheduling_ko.md) — cursor + seen index는 core에 산다
  - [../01-decisions/ADR-0004-classification-and-triage_ko.md](../01-decisions/ADR-0004-classification-and-triage_ko.md) — dedup된 finding + 소스별 `trust` prior를 소비
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
이 문서는 CAW-05 수집 core(ADR-0003)의 **빌드 지향 구체화**이다: **`SourceAdapter` 계약**, **v1 source
집합**(arXiv / Semantic Scholar / GitHub / blog RSS / HN-light + stubs), **incremental cursor**, 그리고
**multi-layer dedup** — 모두 **legal/ToS-safe**하다. 어댑터는 **fetch + normalize만** 한다. cursor와 dedup은
**core**에 살기 때문에 모든 family가 이를 상속받는다. 이 문서는 점수화(see
[interest-model_ko.md](interest-model_ko.md)), 분류/라우팅(ADR-0004), export(ADR-0007)를 하지 **않는다**. 모든
v1 source는 **공개, 읽기 전용**이다. CAW-05는 이들을 절대 내부 Samsung/SAIT claim과 섞지 않는다(brief §12).

## 설계 자세
watch list(brief §6)는 좁고 **학술 중심**이므로 지배적 신호는 **논문(arXiv/conf), 코드(GitHub), lab 블로그**에
살아있다 — v1 수집 가중치는 거기에 간다. HN/Reddit/securities/newsletter는 recall이 낮고 ToS/cost 마찰이 있는
*인접 확인(adjacent confirmation)* 채널이다. 사명은 **좁은 list에 대한 높은 recall**이다(brief §1): 자세는
**"*안전한* family 안에서 폭넓게 수집하고 나중에 필터링한다 — 소스에서 절대 버리지 않는다"**이다. 두 개의 엄격한
제약이 모든 어댑터를 규정한다: **legal/ToS-safe only**(공식 API + publisher feed; HTML만 있는 곳은
metadata-only-link)와 **항상 provenance**.

## 1. v1 source 집합
좁은 학술 list에 가중치를 두고, 안전한 family에서 recall을 극대화하며, cost/ToS 마찰이 있는 것은 연기한다.

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

stub은 **등록되고 발견 가능하지만 config-disabled**이다. preflight는 **`active` stub을 거부**한다(live fetch
없음, documented "blocked: ToS/approval/scope" health status를 반환). 페이월 analyst report는 범위 밖이다
(brief §11). 소스별 rate limit + ToS 판정은
[../02-research/source-ingestion_ko.md](../02-research/source-ingestion_ko.md) §2를 보라.

## 2. Legal/ToS-safe 수집
- **공식 API + publisher 제공 feed만.** 소스가 HTML만 제공하는 경우 **metadata + link**를 수집하며, 라이선스가
  허용하지 않는 한 fair-use snippet을 넘는 전체 텍스트는 절대 재현하지 않는다. **v1에서 HTML 스크래핑 없음.**
- 각 어댑터는 `legal_mode`(`api | publisher_feed | metadata_only_link`)와 `tos_class`를 선언한다. ToS 불안전
  어댑터는 **preflight에서 거부**된다(ADR-0003 §2).
- arXiv(3 s)와 SEC(10 req/s, IP-block)가 가장 엄격하다 — core는 이들을 **직렬화**하며 host당 절대 병렬화하지
  않는다. GitHub Search(30/min)는 Atom feed + `since`를 선호하여 절약한다.

## 3. The `SourceAdapter` 계약
core는 이 인터페이스에 의존한다. 각 family는 config 기반 레지스트리(`sources.yaml`)에서 교체 가능한
어댑터이다. 빌드 가이드 — 실제 어댑터는 빌더가 작성한다.

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

### 여섯 가지 계약 의무 (모든 어댑터가 반드시 준수)
| # | Obligation | Why |
|---|---|---|
| 1 | **Idempotent + incremental** — 같은 cursor ⇒ downstream 중복 없음; 항상 진전된 cursor 반환 | 주간 재실행이 저렴하고 중복 없이 유지 |
| 2 | **Rate-limit + jitter를 가진 exponential backoff를 어댑터 내부에서** | S2가 요구함; GitHub에 secondary limit 있음 |
| 3 | **Legal mode 준수** — `metadata_only_link`는 재현된 전체 텍스트를 절대 저장하지 않음 | brief §12 |
| 4 | **Provenance 완전** — origin + `retrieved_at` + native id + `boundary` 없이는 finding 없음 | CAW-02/03로의 감사 가능한 export |
| 5 | **Typed failure** — transient(재시도 가능) vs terminal(auth/ToS)로 구분해 스케줄러가 반응 | Recall: transient error가 조용히 skip되어선 안 됨 |
| 6 | **No classification/ranking** — 어댑터는 얇고 교체 가능하게 유지 | 그것은 score/triage에 속함 |

> 재검토 트리거(ADR-0003): 분류나 core가 **소스 특화 분기(source-specific branch)**를 필요로 한다면 계약이 새고
> 있는 것이다 — 파이프라인이 아니라 계약/value object를 확장하라.

## 4. Incremental cursor (재fetch 금지)
cursor는 **core**에 산다(ADR-0006 §4). 어댑터는 cursor kind를 광고하고, core는 그것을
`state/<source>.cursor` 아래 영속화한다. **완전히 성공한 source pass에서만 cursor를 진전시켜라** — recall 편향:
의심스러우면 진전시키지 말고 재fetch하여 dedup하라.

| Source family | Cursor mechanism |
|---|---|
| arXiv / Semantic Scholar | OAI-PMH `from=<last datestamp>` (never set `until`); 페이징에 `resumptionToken` 운반; S2 `publicationDateOrYear` |
| RSS / blogs | last-seen `id`/`guid` + `Last-Modified`/`ETag` conditional GET (저렴한 304s) |
| GitHub | `since=` + repo `pushed_at` watermark; ETag conditional request |
| HN (light) | Algolia `numericFilters=created_at_i>cursor` |
| Securities (stub) | EDGAR RSS / full-text `dateRange`; cursor = last accession date |

저렴한 304s를 위해 HTTP conditional request를 사용하라. 다운타임 후에는 **date-windowed catch-up**(rate limit을
존중하기 위해 window 크기를 cap). 놓친 한 주는 스스로 치유된다: 다음 run의 window가 단순히 더 긴 시간을 포괄한다.

## 5. Multi-layer dedup (재처리 / 재emit 금지)
dedup은 **core**에 살기 때문에 arXiv + S2 + 블로그 + HN에 있는 논문은 네 개가 아니라 **여러 provenance 항목을 가진
하나의 finding**이다. 가장 저렴한 layer 먼저. **recall-safe 기본값**(false-merge는 finding을 *떨어뜨림*).

| Layer | Mechanism | v1 | Note |
|---|---|---|---|
| 1 | **Intra-source native id** (arXiv id+version, paperId, owner/repo@tag, objectID, accession) | on | Exact ⇒ known |
| 2 | **Cross-source canonical identity** — `DOI ▸ arXiv id ▸ normalized title+author` | on | One finding, many `provenance` entries |
| 3 | **Exact content hash** — SHA-256 of normalized title+abstract/body | on | Same item via two sources |
| 4 | **SimHash near-dup** (64-bit, Hamming threshold) | **flag, default off** | false-merge가 finding을 떨어뜨림 ⇒ recall-safe 기본값은 둘 다 유지 |

- 블로그/HN/newsletter dedup을 위한 해싱 전에 URL을 정규화하라(tracker 제거, redirect 해결).
- arXiv **버전**은 **구별되지만 연결**된 채 유지된다 — v2는 새로운 novelty signal일 수 있다.
- `seen` index(`state/seen.idx`, `index.sqlite`로 투영됨)는 파일로부터 재구축 가능하다(ADR-0006).
- **Export 멱등성**(ADR-0004/ADR-0007): 각 bundle은 `idempotency_key = hash(finding_id + target +
  classification_version)`를 담으므로 재시도가 novelty-threat를 CAW-03로 이중 라우팅하지 않는다.

## 6. v1 core를 위한 watch-list seeding (brief §6)
- **arXiv categories:** `cs.AR`, `cs.LG`, `cs.DC`(+ `cs.PF`)를 watch-list 키워드/저자 쿼리로 필터링.
- **GitHub:** MemOS, Chakra, MC-DLA/DeepStack line의 named org/repo 추적 + 절제된 topic search
  (30/min 예산). `TODO(open-question: 각 watch-list 프로젝트의 canonical repo URL 확인.)`
- **Blogs:** lab/company RSS의 vetted `feeds.yaml` 유지. `TODO(open-question: v1 blog feed allow-list 확정;
  각각이 스크래핑 요구가 아닌 feed를 제공하는지 검증.)`
- 일회성 `caw05 run --since <date>` backfill(ADR-0006)이 첫 주간 run 전에 이력을 seed한다.

## Open Questions
[../08-research-plan/open-questions_ko.md](../08-research-plan/open-questions_ko.md)를 보라. ADR-0003에서 이월됨:
canonical GitHub repo; blog allow-list; S2 API key vs shared pool; v1에 Reddit OAuth가 가치 있는가?; EDGAR
filing vs 페이월 analyst report 범위; requester-pays S3를 통한 arXiv 전체 텍스트; SimHash 임계값 + v1에서 layer-4가
애초에 켜져 있는가.

## 런북에 대한 함의
- **RB (v1 core adapters):** `ArxivAdapter`(query API + OAI-PMH, 3 s limiter), `SemanticScholarAdapter`
  (enrich + cross-ref, backoff), `GithubAdapter`(Atom + REST, ETag/`since`), `BlogRssAdapter`(`feeds.yaml`로부터의
  conditional GET). 각각 6개 의무를 통과한다.
- **RB (HN light):** Algolia 위의 `HackerNewsAdapter`, metadata+link만, `created_at_i` watermark.
- **RB (stubs):** `RedditAdapter`/`EdgarAdapter`/`NewsletterAdapter`/`InternalFeedAdapter` 등록, 빈
  `fetch()` + documented "blocked" health status 반환(brief §9 documented-stub 패턴).
- **RB (ingestion runtime):** 소스별 token-bucket limiter, cursor 영속화(advance-on-success),
  cross-source dedup(id ▸ canonical ▸ SHA-256; SimHash flagged), provenance stamping. 트리는 green 유지.
- **Config:** `sources.yaml`가 family → adapter + query + schedule을 바인딩하므로 family가 core 변경 없이 plug-in된다.
