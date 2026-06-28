# 소스 수집(Source Ingestion)

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF_ko.md), [../_meta/DOC-CONVENTIONS.md](../_meta/DOC-CONVENTIONS_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose

이 문서는 CAW-05가 수집하는 각 소스 계열에 대한 **API, feed, rate limit, 법적/ToS 제약**을 조사한 뒤, **v1 source set**을 권고하고 모든 adapter가 구현하는 **`SourceAdapter` 포트 계약**을 정의한다. 이 문서는 *어떤 소스가 수집하기에 안전하며 어떻게 재pull 없이 incremental하게 fetch하는가*를 결정한다. classification/triage(별도 문서), interest 랭킹, related-work ledger 스키마, 또는 storage/scheduling 세부사항(별도 ADR)은 결정하지 않는다. 여기의 모든 소스는 **공개, read-only**이다; CAW-05는 이들을 내부 Samsung/SAIT 주장과 절대 섞지 않는다 (brief §12).

## 1. 설계 맥락

watch list(brief §6)는 **좁고 학술 중심**이다: memory-centric DSE, memory-for-LLM, DeepStack, Minsoo Rhu / MC-DLA / memory-wall, MemOS, SECDA-DSE, TTT writeback, Chakra/trace workload modeling, LLM-serving & memory-hierarchy simulation. 지배적 signal은 **논문(arXiv/conf), 코드(GitHub), 랩 블로그**에 있다 — 그래서 v1 수집 가중치가 그쪽에 간다. HN/Reddit/증권/뉴스레터는 *인접 확인(adjacent confirmation)* 채널로, 가치 있지만 이 list에 대해서는 recall이 더 낮고, 몇몇은 ToS/비용 마찰을 가진다. brief는 breadth보다 **좁은 list에 대한 높은 recall**을 우선한다 (§1, §11), 이것이 "안전한 계열 내에서 넓게 수집하고, 나중에 필터링"을 추동한다.

두 가지 교차적(cross-cutting) 원칙:
- **법적/ToS-safe만** (§5, §12). HTML 스크래핑보다 공식 API와 publisher 제공 feed를 선호. 소스가 HTML만 제공하면, 라이선스가 허용하지 않는 한 전문(full text) 재현이 아니라 **metadata + link**를 수집한다.
- **생성된 요약은 evidence가 아니다** (§5). 수집된 모든 항목은 raw provenance(origin URL, retrieval timestamp, source-native ID)를 유지하므로 finding을 항상 그 공개 소스로 추적할 수 있다.

## 2. 소스별 역량 / 접근 테이블

| 소스 계열 | 접근 메커니즘 | Auth | Rate limit | Incremental fetch | Native dedup key | Full text? | 법적/ToS 판정 |
|---|---|---|---|---|---|---|---|
| **arXiv** | Query API (Atom) + OAI-PMH metadata harvest + 카테고리별 RSS | None | **1 req / 3 s, single connection**, 모든 머신 합산 | OAI-PMH `from`/`until` date; RSS daily; query는 `submittedDate`로 정렬 | `arXiv id` (예: `2406.01234`) + version | API로 abstract+metadata; bulk로 PDF/source (S3, requester-pays) | **안전.** metadata는 공개; 3 s 제한 준수. linking 이상의 전문 재배포 금지. |
| **Semantic Scholar** | Academic Graph REST API (`/paper`, `/paper/search`, `/paper/{id}/citations`) | API key (무료, 권장) | 비인증: **5,000 req / 5 min 공유 풀** (부하 시 throttle); key: 기본 1 RPS, 요청 시 상향; `partner.semanticscholar.org`가 더 빠름 | `publicationDateOrYear` 필터; paper ID로 poll; bulk search | `paperId`; `externalIds`로 cross-ref (DOI, arXivId) | Abstract + TLDR + citation graph; 전문 PDF 없음 | **안전.** 연구용 무료. ToS가 **exponential backoff 필수**. primary discovery가 아니라 enrichment/cross-ref 계층. |
| **랩/회사 블로그 + RSS/Atom** | 사이트별 RSS/Atom feed (publisher 제공) | None | 사이트별 (정중하게; conditional GET) | HTTP `ETag` / `Last-Modified`; entry별 feed `<updated>` | Entry `<id>`/`<guid>` 또는 canonical URL | 보통 feed에 full 또는 summary | **feed로 대체로 안전.** publisher가 제공하는 feed 사용. v1에서 feed/license 없는 사이트의 **HTML 스크래핑 금지**. |
| **GitHub (repos/releases/commits)** | REST API + repo별 `releases.atom`, `tags.atom`, `commits.atom`; Search API | PAT 권장 | Core: **5,000 req/h** (auth) vs 비인증 60/h; **Search: 30 req/min**; Atom feed 비인증, 정중한 poll | `since` param (commits); ETag conditional request; feed `<updated>` | `owner/repo` + release tag / commit SHA | Metadata, release note, README | GitHub ToS 하 API 사용은 **안전.** secondary-rate-limit 헤더 준수; ETag로 캐시. |
| **Hacker News** | Algolia search API (`hn.algolia.com/api/v1/search`, `search_by_date`) + 공식 Firebase API | None | Algolia: 명문화된 hard cap 없음 (~10k req/h 보고됨); Firebase: 정중하게 | `search_by_date` + `numericFilters=created_at_i>…`; Firebase `maxitem` cursor | HN `objectID` / item id; target URL로 해소 | Title + URL + points + comments | **안전.** 공개 무료 API, key 없음. metadata + 원문 link 수집. |
| **Reddit** | 공식 Data API (OAuth) | OAuth client (2024/25 이후 사전 승인 필요) | 무료 tier: **OAuth client_id당 100 QPM**; 비인증 거부; 상업적 = 유료 계약 | `new` listing + `before`/`after` fullname cursor | post `fullname` (`t3_…`) | Selftext + link | **조건부.** 비상업적 무료는 *승인 시* OK; ToS가 미승인/상업적 사용 금지. **v1 = stub** 승인 전까지. |
| **증권 / 산업 보고서** | 혼합: SEC EDGAR (filings) 무료; analyst report (paywall) | EDGAR: 없음 (User-Agent 필요); analyst: 라이선스 | EDGAR: **10 req/s, 모든 머신 합산**, 위반 시 IP block | EDGAR full-text search `efts.sec.gov` by date; daily index | EDGAR accession no.; report DOI/title | EDGAR: 전체 filing; analyst: license-gated | **EDGAR 안전** (무료, UA 헤더). **유료 analyst report는 수집 안 함** (paywall/ToS, §11). **v1 = stub.** |
| **뉴스레터 / 미디어** | 제공되는 곳에서 publisher RSS; email→feed bridge (Kill-the-Newsletter); 라이선스 API | None / 서비스별 | 소스별 정중하게 | Feed `<updated>`; email 도착 | Entry `<id>` / message-id | 다양; 종종 summary | **조건부.** RSS/자체 구독 feed는 OK; **paywall 미디어 스크래핑 금지**, 전문 재배포 금지. **v1 = light/stub.** |

출처: arXiv [API ToU](https://info.arxiv.org/help/api/tou.html) · [bulk data](https://info.arxiv.org/help/bulk_data.html);
Semantic Scholar [API](https://www.semanticscholar.org/product/api) · [release notes](https://github.com/allenai/s2-folks/blob/main/API_RELEASE_NOTES.md);
GitHub [rate limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api);
[HN Search API](https://hn.algolia.com/api); [Reddit Data API Wiki](https://support.reddithelp.com/hc/en-us/articles/16160319875092-Reddit-Data-API-Wiki);
[SEC EDGAR rate limits](https://www.sec.gov/filergroup/announcements-old/new-rate-control-limits).

## 3. 교차적 우려사항

### 3.1 Rate limiting
- 각 adapter가 자신의 limit을 선언; 런타임은 **per-source token bucket** + 전역 politeness를 강제.
- 429/503에 대한 **jitter 포함 exponential backoff**는 필수 (S2가 요구; GitHub는 secondary limit 있음).
- arXiv (3 s)와 SEC (10 req/s, 위반 시 IP-block)가 가장 엄격 — 직렬화하고, host당 절대 병렬화하지 않음.
- GitHub Search (30/min)가 가장 희소한 GitHub 예산 — 반복 search보다 Atom feed + `since` polling 선호.

### 3.2 Incremental fetch (재pull 회피)
- per-source **watermark**(high-water `updated`/date cursor 또는 `maxitem` id)를 CAW-05 자체 store에 영속화.
- feed/GitHub에 HTTP **conditional request**(`ETag`, `Last-Modified`, `If-None-Match`) 사용 → 저렴한 304.
- 다운타임 후 catch-up을 위한 date-windowed pull (arXiv OAI `from/until`, S2 `publicationDate`, HN `created_at_i>`, EDGAR date); rate limit 준수를 위해 window 크기 제한.

### 3.3 중복 제거(Deduplication)
- 두 계층:
  1. **Intra-source:** native ID (arXiv id+version, `paperId`, `owner/repo`+tag, HN objectID, accession no.).
  2. **Cross-source identity:** **DOI ▸ arXiv id ▸ normalized title+author**로 정규화. arXiv, S2, 블로그, HN에서 발견된 논문은 네 개가 아니라 여러 `provenance` 항목을 가진 **하나의 finding**.
- 블로그/HN/뉴스레터 dedup을 위해 hashing 전에 URL 정규화 (tracker 제거, redirect 해소).
- arXiv **version**은 구별하되 연결 유지 (v2가 새 novelty signal일 수 있음).

### 3.4 경계 & provenance (brief §7)
방출되는 모든 레코드는 `origin` URL, `retrieved_at`, source-native id, `boundary = public`, 그리고 `trust`(per-source 기본값, override 가능)를 담는다. 이것이 finding을 CAW-02/03으로 Source/Claim으로 감사 가능한 lineage와 함께 깨끗이 export하게 하고, "공개 research"를 내부 주장과 분리되게 유지한다 (§12).

## 4. 권고 v1 source set

좁은 학술 watch list에 가중치를 두어, 안전한 계열에서 recall을 최대화하고, 비용/ToS 마찰이 있는 것들은 연기.

| Tier | 소스 | 이유 |
|---|---|---|
| **v1 core** | arXiv (query API + OAI-PMH + cs.AR/cs.LG/cs.DC RSS), Semantic Scholar (enrich + citation cross-ref), GitHub (watch-list된 repo/org에 Atom feed + REST), 큐레이션된 랩/회사 블로그 RSS set | memory-centric DSE / LLM-memory / simulation 작업에 최고 recall; 모두 무료 + ToS-safe; DOI/arXiv id로 깨끗한 dedup. |
| **v1 light** | Hacker News (Algolia, keyword + watch-list 저자/도메인) | 무료, key 없음, systems/serving 논의에 좋은 조기 경보; metadata+link만. |
| **v1 stub (port + config, live fetch 없음)** | Reddit, SEC EDGAR / 증권, 뉴스레터/미디어, 내부 feed | ToS 승인 (Reddit), 낮은 signal/높은 noise 또는 paywall 마찰; adapter 계약 + config registry를 wiring하고 stub으로 문서화 (brief §9). |

v1 core를 위한 watch-list seeding:
- **arXiv 카테고리:** `cs.AR`, `cs.LG`, `cs.DC` (+ `cs.PF`), watch-list keyword/author query로 필터.
- **GitHub:** MemOS, Chakra, MC-DLA/DeepStack 라인의 명명된 org/repo 추적 + topic/keyword search (절약해서, 30/min 예산). `TODO(open-question: 각 watch-list 프로젝트의 canonical repo URL 확인)`.
- **블로그:** 검증된 랩/회사 RSS의 `feeds.yaml` 유지 (예: 주요 AI-systems 랩). `TODO(open-question: v1 블로그 feed allow-list 확정)`.

## 5. `SourceAdapter` 계약

Ports & adapters (brief §9): core는 이 인터페이스에 의존; 각 소스 계열은 config 기반 registry에 등록된 교체 가능한 adapter다. adapter는 **fetch + normalize만** — classify나 rank를 하지 않는다.

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

모든 adapter가 지켜야 하는(MUST) 계약 의무:
1. **멱등 + incremental:** 같은 cursor가 주어지면, 재실행이 downstream에 중복을 내지 않음 (`source_native_id`로 dedup); 항상 전진된 cursor를 반환.
2. **adapter 내부에서 rate-limit & backoff** — 선언된 `RateLimitSpec`에 따라 (jitter 포함 exponential backoff).
3. **legal mode 준수:** `metadata_only_link` adapter는 fair-use snippet 이상으로 재현된 전문을 저장하지 않음.
4. **provenance 완전:** origin URL + `retrieved_at` + native id + `boundary` 없는 `RawFinding`은 없음.
5. **typed failure:** transient(재시도 가능)과 terminal(auth/ToS) 오류를 구별하여 scheduler가 반응하도록.
6. **classification/ranking 없음** — 그것은 triage stage의 몫; adapter는 얇고 교체 가능하게 유지.

## Open Questions

[../08-research-plan/open-questions.md](../08-research-plan/open-questions_ko.md) 참조.
- `TODO(open-question: 각 watch-list 프로젝트의 canonical GitHub org/repo 확인 — MemOS, Chakra, MC-DLA/DeepStack, SECDA-DSE)`.
- `TODO(open-question: v1 랩/회사 블로그 RSS allow-list 확정 및 각각이 스크래핑 대신 feed를 제공하는지 검증)`.
- `TODO(open-question: >1 RPS를 위해 Semantic Scholar API key를 추구할 것인가, 아니면 v1 볼륨에는 공유 비인증 풀에 머물 것인가?)`.
- `TODO(open-question: Reddit watch-list signal이 OAuth 사전 승인 과정을 거칠 가치가 있는가, 아니면 v1에서는 완전히 건너뛸 것인가?)`.
- `TODO(open-question: 실제로 범위에 있는 "증권 보고서"는 무엇인가 — SEC EDGAR filing (무료) vs paywall analyst report (범위 밖)? brief의 의도를 명확히 하라.)`.
- `TODO(open-question: requester-pays S3 버킷을 통한 arXiv PDF/source 전문 — triage에 필요한가, 아니면 v1에는 abstract+link로 충분한가?)`.

## Runbook에 대한 함의

- **RB (v1 core adapters):** `ArxivAdapter` (query API + OAI-PMH harvest, 3 s limiter), `SemanticScholarAdapter` (enrichment + citation cross-ref, backoff), `GithubAdapter` (Atom feed + ETag/`since` 포함 REST), `BlogRssAdapter` (`feeds.yaml` 구동의 conditional GET 포함 generic Atom/RSS) 구현. 각각 6개 계약 의무를 통과해야 함.
- **RB (HN light):** Algolia API 위의 `HackerNewsAdapter`, metadata+link만, `created_at_i` watermark.
- **RB (stubs):** `RedditAdapter`, `EdgarAdapter`, `NewsletterAdapter`를 `SourceAdapter` + `capabilities()`를 구현하되 빈 `fetch()`를 반환하고 문서화된 "blocked: ToS/approval/scope" health status를 가진 등록된 stub으로 출하 (brief §9 documented-stubs 패턴).
- **RB (ingestion runtime):** per-source token-bucket limiter, CAW-05 자체 store에 cursor/watermark 영속화, cross-source dedup (DOI ▸ arXiv id ▸ normalized title), provenance 스탬핑. 각 단계에서 트리를 green으로 유지.
- **Config:** `sources.yaml` registry가 family → adapter + query + schedule을 바인딩하므로, 계열이 core 변경 없이 plug-in (ports & adapters).
