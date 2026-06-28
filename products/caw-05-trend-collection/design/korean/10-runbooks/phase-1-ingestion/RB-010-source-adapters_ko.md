# RB-010: v1 SourceAdapter 구현 (arXiv, Semantic Scholar, GitHub, 큐레이션된 RSS, HN-light) + 문서화된 stub

- Status: ready
- Phase: phase-1-ingestion
- Depends on: [RB-00X (P0 foundations: pipeline core/Run, SourceAdapter port + registry stub, FILES-AS-TRUTH store, SQLite index)]
- Implements design: [../../05-radar-core/source-ingestion-and-dedup.md](../../05-radar-core/source-ingestion-and-dedup_ko.md), [../../07-backend-api/ingestion-service.md](../../07-backend-api/ingestion-service_ko.md), [../../01-decisions/ADR-0003-source-adapters-and-ingestion.md](../../01-decisions/ADR-0003-source-adapters-and-ingestion_ko.md)
- Produces: `ArxivAdapter`, `SemanticScholarAdapter`, `GithubAdapter`, `BlogRssAdapter`, `HackerNewsAdapter` (v1); `RedditAdapter`, `EdgarAdapter`, `NewsletterAdapter`, `InternalFeedAdapter` (등록되었으나 비활성화된 stub); `sources.yaml` registry + `feeds.yaml`; adapter별 rate-limit + 타입화된 실패 처리; adapter conformance 테스트 스위트.

## Objective
단일 ingestion port (ADR-0003 §3) 뒤에서 v1 `SourceAdapter` 집합을 구현하여 실제 Run이 arXiv, Semantic Scholar,
GitHub, 큐레이션된 lab-blog RSS allow-list, HN-light로부터 raw finding을 가져올 수 있게 한다 — **법적으로 /
ToS-안전한 것만**, 각 adapter는 완전한 provenance를 갖춘 `RawFinding`을 emit하고 **여섯 가지 계약 의무**를 준수한다.
Adapter는 **가져오기 + 정규화만** 한다 — dedup, scoring, classify, ranking은 절대 하지 않는다 (이는 RB-011 및
이후 phase의 몫). 나머지 계열(Reddit, SEC/EDGAR, newsletter, internal feed)은 **등록되었으나 config로
비활성화된 stub**으로 제공되며, preflight가 라이브 실행을 거부한다. "Done" = 각 v1 adapter가 conformance 스위트를
통과하고, `sources.yaml`이 family→adapter→query를 바인딩하며, Run이 모든 v1 adapter를 호출하여 완전한 provenance를
갖춘 `RawFinding`을 생성할 수 있다; cursor + dedup은 RB-011에서 연결된다.

## Preconditions
- [ ] P0 foundations 머지됨: pipeline core (a Run), `SourceAdapter` port/Protocol, config 기반 registry,
      FILES-AS-TRUTH store (`findings/`, `state/`, `artifacts/`) + SQLite index가 stub으로 존재한다.
- [ ] `RawFinding`, `Provenance`, `SourceCapabilities`, `FetchCursor`, `RateLimitSpec`, `HealthStatus`, 그리고
      타입화된 에러(`SourceTransient`/`SourceTerminal`, 추가로 `RateLimited`/`Unauthorized`/`SourceUnavailable`)
      타입이 P0에 존재한다 (또는 ADR-0003 §3에 맞게 여기서 추가된다).
- [ ] Tree가 HEAD에서 green이다 (컴파일됨, lint 통과).
- [ ] 레포에 비밀값 없음: Semantic Scholar key와 GitHub PAT는 env / 로컬 untracked config에서 읽으며,
      절대 커밋하지 않는다.

## Steps

### 1. 공유 adapter base + 법적/ToS 가드 정의
- **Do:** 모든 adapter가 사용하는 얇은 `BaseSourceAdapter` (또는 mixin)를 추가한다: 기본 timeout을 가진 HTTP
  client, host별 **token-bucket limiter** hook (limiter 자체는 RB-011에서 구축 — 여기서는 호출만), transient
  HTTP (429/5xx, `Retry-After` / GitHub secondary-rate-limit 헤더 준수)에 대한 **exponential-backoff-with-jitter**
  재시도, provenance 스탬핑, `legal_mode` 선언. adapter의 `legal_mode ∈ {api, publisher_feed,
  metadata_only_link}`임을 검증하고 `active`로 표시된 stub은 **거부**(raises `SourceTerminal`
  "blocked: ToS/approval/scope")하는 `preflight()` helper를 추가한다.
- **Verify:** Unit test: 알 수 없는 `legal_mode`를 선언한 adapter는 preflight에 실패; `active: true`로 설정된
  비활성화 stub은 거부; transient 429는 backoff-with-jitter를 트리거한 뒤 재시도에 성공.

### 2. `ArxivAdapter` 구현 (v1 core)
- **Do:** arXiv **Query API + OAI-PMH harvest** (그리고 category별 `cs.AR`/`cs.LG`/`cs.DC`(+`cs.PF`) RSS를
  보완 feed로) 위에서 `fetch()`를 구현하고, watch list 키워드/저자 query로 필터링한다 (brief §6).
  `legal_mode="api"`/`publisher_feed`. **1 req / 3 s, 단일 connection, 직렬화**를 강제한다 (host별 병렬화 없음).
  Cursor kind = OAI-PMH `from=<datestamp>` + `resumptionToken` 페이징 (`from`은 설정, **`until`은 절대 설정
  안 함**). 각 항목을 `RawFinding`으로 정규화한다: `canonical_id` = arXiv id (DOI 있으면 사용), 저자,
  `published_at`/`updated_at`, abstract를 `summary_or_body` (`body_is_full_text=false`)로, 완전한 `provenance`
  (`origin` URL, `retrieved_at`, `source_native_id` = arXiv id+version, `boundary="public"`, `trust`). arXiv
  **version은 구별**된 채로 유지한다 (id에 version 포함). audit를 위해 native payload를 `raw`에 저장한다.
- **Verify:** 작은 날짜 범위에 대한 라이브(또는 recorded-cassette) 가져오기가 `RawFinding`을 반환; 모든 항목이
  `assert_provenance_complete`를 통과; limiter가 요청 간격을 ≥3 s로 둔다; `resumptionToken` 페이징이 실행됨;
  `until`은 절대 전송되지 않음 (request log에서 assert).

### 3. `SemanticScholarAdapter` 구현 (v1 core)
- **Do:** Academic Graph REST API 위에서 **enrichment + citation cross-reference** (paperId, DOI, externalIds,
  저자, venue, year)를 위한 `fetch()`를 구현한다. `legal_mode="api"`; API key가 있으면 env에서 읽음 (없으면 공유
  unauth pool). 429에 대한 **필수 exponential backoff**. `canonical_id` = `DOI ▸ arXiv id ▸ normalized
  title+author`로 하여 RB-011 dedup이 arXiv 항목과 collapse할 수 있게 한다. time cursor 없음 (id/cross-ref
  enrich) — capabilities가 이를 광고한다. 완전한 provenance를 스탬핑한다. 참고: 이 S2 client는 ledger의 S2
  verification (ADR-0005)에서 **나중에 재사용**된다 — 깔끔하고 import 가능한 단위로 유지한다.
- **Verify:** arXiv id / title이 주어지면 adapter가 `externalIds`를 포함한 enriched metadata를 반환; 강제된
  429가 backoff를 트리거 (stub transport로 테스트); provenance 누락은 불가능 (assert됨).

### 4. `GithubAdapter` 구현 (v1 core)
- **Do:** 지정된 watch list org/repo (MemOS, Chakra, MC-DLA/DeepStack, SECDA-DSE 라인)에 대해 repo별
  `releases.atom` / `tags.atom` / `commits.atom` feed + `since=`와 **ETag conditional request**를 사용하는 REST를
  선호하는 `fetch()`를 구현한다. `legal_mode="api"`/`publisher_feed`. core 5k/h (env의 PAT로 auth)와 **Search
  30/min**을 준수한다 — 예산 절약을 위해 Search보다 Atom을 선호한다. Cursor = `since=` + repo `pushed_at`
  watermark + ETag. release/tag/commit를 `RawFinding`(canonical_id = `owner/repo@tag`)으로 정규화, 완전한
  provenance. `TODO(open-question: confirm canonical repo URLs for each watch-list project)` — repo 목록은
  `sources.yaml`에서 구동하고, 하드코딩하지 않는다.
- **Verify:** 테스트 repo에 대한 가져오기가 `RawFinding`을 반환; 반복 요청은 `If-None-Match`를 보내고 304를
  "신규 항목 없음"으로 처리; Atom으로 충분할 때 Search API는 호출되지 않음 (호출 횟수 assert); PAT는 env에서 읽음.

### 5. `BlogRssAdapter` 구현 (v1 core)
- **Do:** 검증된 `feeds.yaml` allow-list로 구동되는 **generic Atom/RSS** adapter를 구현하고, **conditional GET**
  (`ETag`/`Last-Modified` → 저렴한 304)과 last-seen `guid`/`id`를 사용한다. `legal_mode="publisher_feed"`.
  **feed가 제공하는 metadata + entry content**를 ingest (feed를 넘어서는 HTML scraping 없음). downstream dedup을
  깨끗하게 하기 위해 URL을 정규화한다 (tracker 제거, redirect 해결). entry별 완전한 provenance.
  `TODO(open-question: finalize the v1 lab/company blog feed allow-list; verify each offers a feed vs scraping)` —
  검증된 entry만으로 `feeds.yaml`을 제공한다; scraping이 필요한 entry는 scraping하지 않고 제외한다.
- **Verify:** 샘플 Atom + 샘플 RSS 2.0 feed 파싱이 `RawFinding`을 산출; 304는 신규 finding 0개를 산출; HTML
  링크만 있는 feed entry는 metadata+link를 저장하고 full body는 절대 재현하지 않음.

### 6. `HackerNewsAdapter` 구현 (v1 light, metadata-only-link)
- **Do:** Algolia `search_by_date` API 위에서 `numericFilters=created_at_i>cursor`로 `fetch()`를 구현한다.
  `legal_mode="metadata_only_link"` — **title + link + HN metadata만** 저장, 기사 본문은 절대 재현 안 함.
  공손한 rate 태세. Cursor = `created_at_i` watermark. 완전한 provenance, `boundary="public"`.
- **Verify:** 가져오기가 `body_is_full_text=false`인 metadata+link `RawFinding`을 반환하고 fair-use 스니펫을
  넘어서는 기사 본문 없음; 가드 테스트가 adapter의 full text 채우기 거부를 assert.

### 7. 문서화된 stub 등록 (Reddit, SEC/EDGAR, newsletter, internal feed)
- **Do:** `RedditAdapter` (OAuth pre-approval), `EdgarAdapter` (SEC filing, ≤10 req/s, IP-block 위험),
  `NewsletterAdapter`, `InternalFeedAdapter`를 **등록 + 발견 가능하지만 config로 비활성화된** stub으로 구현한다.
  각 `fetch()`는 empty를 반환; 각 `healthcheck()`는 문서화된 `"blocked: ToS/approval/scope"` status를 반환;
  각각 의도된 `legal_mode`/`tos_class`를 선언한다. Preflight는 `active`로 표시된 모든 stub을 **거부**한다.
  `EdgarAdapter`는 ≤10 req/s + IP-block 제약과 in-scope (filing) vs out-of-scope (유료 analyst report, brief §11)
  경계를 문서화한다. `InternalFeedAdapter`는 `boundary` 가드를 문서화한다 — public finding과 절대 섞이지 않음
  (brief §12). `TODO(open-question: securities scope; Reddit OAuth worth v1?)`.
- **Verify:** 네 stub 모두 registry에 나타나고 `healthcheck()`가 blocked status를 반환; 어떤 stub이든
  `active: true`로 설정하면 Run이 그 source의 시작을 거부 (preflight test).

### 8. `sources.yaml` registry + `feeds.yaml` 연결
- **Do:** 각 `family → adapter → query → schedule → enabled`를 바인딩하는 `sources.yaml`과 blog allow-list를
  위한 별도 `feeds.yaml`을 작성한다. v1 core + HN-light 활성화; 모든 stub 존재 + 비활성화. Query는 watch list를
  시드한다 (brief §6): arXiv category + 키워드/저자 필터, GitHub repo 목록, S2 enrich 타깃, HN 키워드 필터.
  source별 `trust` prior 기록 (signal-vs-hype를 시드, ADR-0004).
- **Verify:** registry가 로드됨; `caw05 sources list` (또는 동등물)가 v1 adapter 활성화 + stub 비활성화를 표시;
  유효하지 않은 `legal_mode`나 활성화된 stub은 load/preflight에 실패.

### 9. Adapter conformance 테스트 스위트 (여섯 가지 의무)
- **Do:** 모든 v1 adapter에 대해 실행되는 파라미터화된 conformance 스위트를 추가하여 다음을 assert: (1) idempotent
  + incremental 형태 (advance된 cursor를 반환; cursor 메커니즘은 RB-011에서 완전 테스트); (2) 강제된 429에 대한
  backoff-with-jitter; (3) `legal_mode` 준수 (metadata-only adapter는 재현된 full text를 절대 저장 안 함);
  (4) provenance 완전성 (origin/`retrieved_at`/native id/`boundary` 누락 `RawFinding` 거부); (5) 타입화된 실패
  (transient vs terminal이 올바르게 raise); (6) classification/ranking 없음 (adapter 출력에 score/class field 없음).
- **Verify:** 다섯 v1 adapter 모두 스위트 통과; 의도적으로 손상된 adapter (provenance drop)는 의무 4에 실패;
  tree가 green.

## Acceptance criteria
- [ ] `ArxivAdapter`, `SemanticScholarAdapter`, `GithubAdapter`, `BlogRssAdapter`, `HackerNewsAdapter`가
      `SourceAdapter` port 뒤에서 구현됨; 각각 여섯 의무 conformance 스위트 통과.
- [ ] 모든 v1 source는 **법적/ToS-안전**: 공식 API / publisher feed만; **HTML scraping 없음**; HN은
      metadata-only-link; arXiv는 1 req/3 s로 직렬화; GitHub는 Search보다 Atom 선호.
- [ ] 모든 `RawFinding`이 완전한 provenance (`origin`, `retrieved_at`, `source_native_id`,
      `boundary="public"`, `trust`)를 지님; core는 provenance field 누락 finding을 거부.
- [ ] Reddit / EDGAR / newsletter / internal-feed stub은 등록 + 발견 가능하며, empty `fetch()` +
      문서화된 blocked `healthcheck()`를 반환하고, preflight는 `active`로 표시된 모든 stub을 거부.
- [ ] Rate-limit 처리 (token-bucket hook + backoff-with-jitter + conditional GET/ETag)가 모든 adapter에 존재;
      타입화된 transient/terminal 에러가 raise되며 절대 삼켜지지 않음.
- [ ] `sources.yaml` + `feeds.yaml` 커밋됨; v1 활성화, stub 비활성화; query는 brief §6 watch list를 시드.
- [ ] Adapter는 dedup/scoring/classification을 **하지 않음** (RB-011 / P2 / P3로 연기); tree가 green.

## Rollback / safety
- Adapter는 registry 뒤에서 additive하다; 롤백하려면 `sources.yaml`에서 family `enabled: false`로 설정 — Run이
  깔끔하게 건너뛴다 (schema migration 없음).
- 이 runbook에서는 어떤 cursor도 advance하지 않는다 (cursor 영속화는 RB-011); 따라서 반쯤 구축된 adapter는
  incremental state를 손상시킬 수 없다.
- 비밀값 (S2 key, GitHub PAT)은 env / untracked config에 머문다; env를 unset하여 revert — adapter는
  unauth/공유 pool로 fallback하거나 타입화된 terminal 에러로 quarantine.
- 라이브 source가 오작동하면 (rate-limit/IP-block), 다른 source에 영향 없이 그 adapter를 quarantine (terminal
  에러 경로); 공유 store가 없으므로 blast radius는 한 family.

## Hand-off
- RB-011은 다음을 가정할 수 있다: `canonical_id`이 채워진 provenance를 갖춘 `RawFinding`을 emit하고,
  `capabilities()`를 통해 `cursor_kind`를 광고하며, host별 limiter hook을 노출하는 작동하는 v1 adapter 집합 —
  core가 cursor 영속화 (advance-on-success)와 multi-layer dedup을 추가할 준비가 됨.
- Downstream (P2 relevance, P3 classify)은 adapter가 source별 분기를 core로 누출하지 않으며 (revisit trigger:
  pipeline이 아니라 contract를 확장), classification/ranking field를 절대 emit하지 않음을 가정할 수 있다.
