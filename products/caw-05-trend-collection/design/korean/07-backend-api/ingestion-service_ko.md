# Ingestion Service — source fetch, cursor, dedup, SourceAdapter 호출

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [./api-surface_ko.md](./api-surface_ko.md) (이 service가 구현하는 `ingest` op)
  - [./scheduler-and-persistence_ko.md](./scheduler-and-persistence_ko.md) (cursor + seen-index 영속화)
  - [./synthesis-service_ko.md](./synthesis-service_ko.md) (deduped finding을 소비)
  - [../01-decisions/ADR-0003-source-adapters-and-ingestion_ko.md](../01-decisions/ADR-0003-source-adapters-and-ingestion_ko.md)
  - [../01-decisions/ADR-0006-storage-and-scheduling_ko.md](../01-decisions/ADR-0006-storage-and-scheduling_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## 목적
Run의 **collect+dedup 단계**를 기술한다: 코어가 각 `SourceAdapter`를 어떻게 호출하고, source별 cursor를 전진시키며,
multi-layer dedup을 적용하고, provenance를 찍어서 relevance와 classification이 소비할 deduped `Finding` 집합을
만드는지. 이는 ADR-0003(어댑터/ingestion)과 ADR-0006(코어 내 cursor/dedup)의 결정에 따라
[./api-surface_ko.md](./api-surface_ko.md)의 `ingest` op를 구현한다. 각 어댑터의 source-특화 fetch(어댑터별 런북
작업), relevance 스코어링(ADR-0002), classification(ADR-0004)은 정의하지 **않는다**. 모든 v1 source는 **public,
read-only, ToS-safe**다. 이 service는 그것들을 내부(internal) 주장과 절대 섞지 않는다.

## Run에서의 위치
```
collect (this doc) → dedup (this doc) → relevance → classify → synthesize → export
```
`collect+dedup`은 네트워크에 접근하는 유일한 단계다. 이는 recall-first다: **안전한 source 계열 내에서 폭넓게
ingest하고 나중에 필터링한다** — source에서 절대 떨어뜨리지 않는다.

## SourceAdapter 포트 (유일한 ingestion 이음새)
코어는 단일 인터페이스에 의존한다. 각 source 계열은 config로 구동되는 레지스트리(`sources.yaml`) 안의 교체 가능한
어댑터다. 어댑터는 **fetch + normalize만** 한다 — 절대 classify, rank, dedup하지 않는다(ADR-0003 §3).

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

### 여섯 가지 계약 의무 (모든 어댑터가 반드시 지킨다 — ADR-0003 §3)
| # | 의무 | 강제 위치 |
|---|---|---|
| 1 | 멱등 + 증분(매 성공 run마다 cursor 전진) | adapter + core cursor store |
| 2 | Rate-limit + 지수 backoff-with-jitter를 어댑터 내부에서 | adapter |
| 3 | `legal_mode` 준수(metadata-only는 재현된 full text를 절대 저장 안 함) | adapter; core가 assert |
| 4 | Provenance 완전(origin + retrieved_at + native id + boundary) | adapter; 누락 시 core가 거부 |
| 5 | 타입이 지정된 실패(transient vs terminal)로 스케줄러가 반응하도록 | adapter가 타입 오류를 raise |
| 6 | classification/ranking 없음 — 어댑터는 얇게 유지 | review/seam test |

provenance 필드가 하나라도 빠진 `RawFinding`은 조용히 저장되지 않고 **core 경계에서 거부된다**.

## v1 source 레지스트리
ADR-0003 §1에서 가져옴. Stub은 등록되어 발견 가능하지만 config로 비활성화되어 있다. preflight는 `active`인 stub을
거부한다.

| Adapter | Tier | legal_mode | Cursor 메커니즘 | Rate 자세 |
|---|---|---|---|---|
| `ArxivAdapter` | v1 core | api/publisher_feed | OAI-PMH `from=<datestamp>` (+ `resumptionToken`) | 3 s 단일 연결, 직렬화 |
| `SemanticScholarAdapter` | v1 core | api | id/cross-ref enrich (시간 cursor 없음) | 지수 backoff 필수 |
| `GithubAdapter` | v1 core | api/publisher_feed | `since=` + repo `pushed_at`; `.atom`에 ETag | secondary-rate-limit 헤더 준수 |
| `BlogRssAdapter` | v1 core | publisher_feed | last `guid` + `ETag`/`Last-Modified` 304 | conditional GET, 예의 있게 |
| `HackerNewsAdapter` | v1 light | metadata_only_link | Algolia `created_at_i>cursor` | Algolia limits; link only |
| `RedditAdapter` | stub | api | (OAuth 사전 승인) | 비활성화 |
| `EdgarAdapter` | stub | api | last accession date | ≤10 req/s, IP-block 위험 |
| `NewsletterAdapter` | stub | publisher_feed | feed guid | 비활성화 |
| `InternalFeedAdapter` | stub | — | — | 비활성화 (boundary guard) |

## Collect 루프 (core, Run별)
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
핵심 규칙(ADR-0006 §4): **source 패스가 완전히 성공했을 때만 cursor를 전진시킨다.** 의심스러우면 재fetch하고 dedup이
중복을 흡수하게 하라 — 한 주 누락은 더 넓은 다음 window를 통해 자가 치유(self-heal)된다. `backfill`은 cursor를
무시한다.

### 호스트별 직렬화 & 리미터
- arXiv(3 s)와 SEC EDGAR(10 req/s, 위반 시 IP-block)는 **호스트별로 직렬화**되며 절대 병렬화되지 않는다.
- GitHub Search(30/min)는 Search API보다 `.atom` 피드 + `since`를 선호하여 보존한다.
- 공유 token-bucket 리미터는 호스트를 키로 한다. backoff-with-jitter는 각 어댑터 내부에 있다(의무 2).

## Dedup (core, multi-layer, recall-safe — ADR-0003 §5 / ADR-0006 §4)
가장 저렴한 레이어부터. hit은 **provenance 항목이 많은 Finding 하나**로 붕괴(collapse)된다.

| Layer | 메커니즘 | v1 | 비고 |
|---|---|---|---|
| 1 | Native id (intra-source) | on | 정확한 id 매치 ⇒ known |
| 2 | Cross-source canonical: `DOI ▸ arXiv id ▸ normalized title+author` | on | arXiv+S2+blog+HN 전반의 단일 finding |
| 3 | normalized title+abstract/body의 SHA-256 | on | 두 source를 통한 동일 항목 |
| 4 | SimHash near-dup (64-bit, Hamming threshold) | **flag (기본 off)** | false-merge는 finding을 *떨어뜨림* → recall 위험 |

```text
merge_or_create(raw):
    key = canonical_key(raw) or content_hash(raw)
    if seen_index.has(key):
        finding = load(key); finding.provenance.append(raw.provenance)  # merge, don't duplicate
    else:
        finding = new_finding(raw); seen_index.add(key)
    return finding
```
- **arXiv 버전은 구분되지만 링크된 상태로 유지된다** — v2는 새로운 novelty signal일 수 있다(v1로 접지 말 것).
- `seen` 인덱스는 파일 truth의 재구축 가능한 SQLite 투영(projection)이다(ADR-0006 §A). 삭제하고 파일을
  재생(replay)하면 재현된다.

## Provenance & boundary 보장
- 모든 Finding은 `boundary="public"`과 source별 `trust` prior를 지닌다(signal-vs-hype의 seed, ADR-0004).
- `metadata_only_link` source는 **metadata + link만** 저장하며, fair-use 스니펫을 넘어선 재현된 full text는 절대
  저장하지 않는다(의무 3). 크게 fetch된 payload(PDF, raw blob)는 `artifacts/<sha>/` 아래에 **경로로(by path)**
  저장되고 provenance에서 참조된다 — 절대 inline되지 않는다.

## 실패 처리
| Failure | Type | Effect | Cursor |
|---|---|---|---|
| network/5xx/rate-limit | `SOURCE_TRANSIENT` | backoff하며 retry; 부분 패스 폐기 | 미전진 |
| auth/ToS/4xx config | `SOURCE_TERMINAL` | 어댑터 격리; alert | 미전진 |
| provenance 누락 | 경계에서 거부 | raw 폐기; 로깅 | 영향 없음 |
| active stub 탐지 | preflight 거부 | Run이 해당 source 시작 거부 | n/a |

## Negative tests (반드시 성립 — ADR-0006)
- 동일 window 재실행은 `new=0, dup=all`을 fetch한다.
- 네 source에 걸친 동일 paper는 provenance 항목 네 개를 가진 하나의 finding으로 붕괴한다.
- transient 실패는 cursor를 미전진 상태로 둔다. 다음 run은 깔끔하게 재fetch하고 dedup한다.
- `index.sqlite`를 삭제하고 파일을 재생하면 `seen` 집합이 재현된다.

## Open Questions
- TODO(open-question: confirm canonical GitHub orgs/repos for each watch-list project — MemOS, Chakra, MC-DLA/
  DeepStack, SECDA-DSE.)
- TODO(open-question: finalize the v1 lab/company blog RSS allow-list — feed vs scraping.)
- TODO(open-question: Semantic Scholar API key for >1 RPS vs shared unauth pool for v1 volume.)
- TODO(open-question: SimHash Hamming threshold + body normalization for layer-4 — on for v1 at all?)
- TODO(open-question: arXiv PDF/source full text via requester-pays S3 — needed for triage, or abstract+link enough?)
- [../08-research-plan/open-questions_ko.md](../08-research-plan/open-questions_ko.md)를 참고하라.

## 런북에 대한 함의
- 계열별로 어댑터 파일 하나 + `sources.yaml` 블록 하나, 각각 여섯 의무를 통과한다.
- 코어 ingestion 런타임: token-bucket 리미터, cursor store(advance-on-success), cross-source dedup, provenance
  찍기, boundary assertion — 한 번 만들어 모든 어댑터가 상속한다.
- Stub은 등록 + 비활성화 상태로 출시되며, active stub을 거부하는 preflight를 포함한다.
