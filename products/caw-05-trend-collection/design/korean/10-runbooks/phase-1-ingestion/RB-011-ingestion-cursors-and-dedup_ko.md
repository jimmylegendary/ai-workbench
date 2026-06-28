# RB-011: core ingestion runtime 구현 — incremental cursor + multi-layer dedup

- Status: ready
- Phase: phase-1-ingestion
- Depends on: [RB-010-source-adapters_ko.md]
- Implements design: [../../05-radar-core/source-ingestion-and-dedup.md](../../05-radar-core/source-ingestion-and-dedup_ko.md), [../../07-backend-api/ingestion-service.md](../../07-backend-api/ingestion-service_ko.md), [../../01-decisions/ADR-0003-source-adapters-and-ingestion.md](../../01-decisions/ADR-0003-source-adapters-and-ingestion_ko.md)
- Produces: Run의 core collect+dedup 단계 — host별 token-bucket limiter, source별 **cursor store** (date/ETag/token watermark, advance-on-success), **multi-layer dedup** (native id ▸ canonical ▸ SHA-256; SimHash는 flag off), `seen` index (`state/seen.idx`를 `index.sqlite`로 projection), provenance/boundary assertion, 그리고 `findings/*.json`의 deduped `Finding`.

## Objective
RB-010 adapter를 감싸는 **core** ingestion runtime을 구축하여 주간 재실행이 **저렴하고 중복 없게** 하고
놓친 주가 **self-heal**되게 한다. Cursor와 dedup은 **core**에 있으며 (ADR-0003 §D, ADR-0006 §4), 모든 adapter가
상속한다 — adapter는 이 state를 절대 소유하지 않는다. "Done" = Run이 active source를 순회하고, host별 rate
limiting을 적용하며, source별 cursor를 **완전히 성공한 pass에서만** 영속화하고, 여러 source에 걸친 동일 항목을
**여러 provenance entry를 가진 하나의 `Finding`**으로 collapse하며, provenance가 불완전한 raw를 core 경계에서
거부하고, deduped `Finding`을 `findings/*.json`에 쓴다; 두 번째 동일 Run은 `new=0, dup=all`을 가져온다. 태세는
**recall-first**다: 의심스러우면 재가져오고 dedup이 overlap을 흡수하게 한다 — source에서 절대 drop하지 않으며,
default false-merge가 finding을 drop하게 두지 않는다.

## Preconditions
- [ ] RB-010 머지됨: v1 adapter가 provenance를 갖춘 `RawFinding`을 emit하고, `capabilities()`를 통해
      `cursor_kind` + `rate_limit`을 광고하며, host별 limiter hook을 노출한다.
- [ ] P0의 FILES-AS-TRUTH 레이아웃 존재: `findings/`, `state/`, `artifacts/`, 그리고 `index.sqlite`.
- [ ] collect loop skeleton + `cursor_store` / `seen_index` 인터페이스가 P0 stub으로 존재한다 (또는 여기서 추가).
- [ ] Tree가 HEAD에서 green이다.

## Steps

### 1. host별 token-bucket limiter
- **Do:** 각 adapter의 `RateLimitSpec` (max_calls, per_seconds, concurrency)에서 구성되는, **host를 key로 하는
  공유 token-bucket limiter**를 구현한다. arXiv (1 req/3 s, 단일 connection)와 EDGAR (≤10 req/s, breach 시
  IP-block)는 **host별로 직렬화** — 동일 host는 절대 병렬화하지 않는다. Backoff-with-jitter는 adapter 안에 머문다
  (RB-010 의무 2); limiter는 steady-state 페이싱 + concurrency를 관장한다.
- **Verify:** 동시 source 가져오기 하에서, 한 host로의 요청이 그 bucket을 절대 초과하지 않음; arXiv 호출은
  ≥3 s 간격 + 단일 connection; 서로 다른 두 host는 병렬 실행.

### 2. advance-on-success를 갖춘 cursor store
- **Do:** source별 opaque `FetchCursor`를 `state/<source>.cursor` 아래 (watermark + extra)에 영속화하는
  `cursor_store.load(source_id)` / `save(source_id, cursor)`를 구현한다. 모든 v1 cursor kind 지원: arXiv/S2
  OAI-PMH `from=<datestamp>` + `resumptionToken`; RSS `guid`/`id` + `ETag`/`Last-Modified`; GitHub
  `since=`/`pushed_at` + ETag; HN `created_at_i`. **cursor는 완전히 성공한 source pass에서만 advance한다.**
  `SourceTransient` 시 **cursor 유지** (recall bias: 다음 run에서 재가져오기 + dedup); `SourceTerminal` 시
  source를 quarantine + alert, cursor 불변. cursor를 **무시하는** `caw05 run --since <date>` **backfill**과
  downtime 후 date-windowed catch-up 지원 (rate limit 준수를 위해 window 크기 제한).
- **Verify:** 성공한 pass는 cursor를 advance + 영속화; pass 중간의 강제된 transient는 cursor를 **unadvanced**로
  남기고 부분 pass를 폐기; terminal 에러는 cursor 불변으로 source를 quarantine; `--since` backfill은 저장된
  cursor를 무시.

### 3. collect loop 연결 (Run별)
- **Do:** core collect loop를 구현한다: 각 `registry.active()` source → `preflight()` (legal_mode ok, active
  stub 아님, healthcheck green) → cursor 로드 → `fetch(query=source_query(window), cursor)` → 각 raw에 대해
  `assert_provenance_complete(raw)` (누락 시 **거부 + 로그**; 절대 저장 안 함) → `stage_raw(raw)` (buffer, cursor는
  아직 advance 안 함) → 완전 성공 시 `cursor_store.save(advanced)`. Step 2의 타입화된 transient/terminal 처리로
  감싼다. 이 단계는 네트워크를 건드리는 **유일한** 단계다.
- **Verify:** 모든 v1 source에 대한 Run이 raw를 stage한 뒤 cursor를 advance; provenance field가 누락된 raw는
  경계에서 거부 (로그됨, 영속화 안 됨)되며, 그 거부가 나머지 pass를 막지 않음.

### 4. provenance & boundary 스탬핑 + large-payload-by-path
- **Do:** core에서 모든 `Finding`에 `boundary="public"`과 source별 `trust` prior를 assert한다 (signal-vs-hype를
  시드, ADR-0004). `metadata_only_link` source (HN)의 경우, fair-use 스니펫을 넘어서는 **재현된 full text 없음**을
  assert한다. 큰 가져온 payload (PDF, raw blob)는 `artifacts/<sha>/` 아래 **by path**로 저장하고 provenance에서
  참조한다 — 절대 `findings/*.json`에 inline하지 않는다.
- **Verify:** 영속화된 모든 `Finding`이 `boundary` + `trust`를 지님; HN finding은 full body 없음; 큰 payload는
  `artifacts/<sha>/` 아래 쓰여 참조됨, inline 아님.

### 5. multi-layer dedup (recall-safe)
- **Do:** core에서 dedup을 **가장 저렴한 layer 먼저** 구현하며, hit는 **여러 `provenance` entry를 가진 하나의
  `Finding`**으로 collapse한다:
  - **Layer 1 — native id (intra-source):** arXiv id+version, paperId, `owner/repo@tag`, Algolia objectID,
    accession. Exact match ⇒ known.
  - **Layer 2 — cross-source canonical identity:** `DOI ▸ arXiv id ▸ normalized title+author`. arXiv+S2+blog+HN에
    걸친 하나의 finding.
  - **Layer 3 — exact content hash:** 두 source를 통한 동일 항목에 대한 normalized title+abstract/body의 SHA-256.
  - **Layer 4 — SimHash near-dup (64-bit, Hamming threshold):** **구현되었으나 기본 OFF** — false-merge는
    finding을 *drop*시킬 것이다 (recall 위험). off일 때 **둘 다 유지**.
  blog/HN/newsletter dedup을 위해 hashing 전 URL을 정규화한다 (tracker 제거, redirect 해결). arXiv **version은
  구별하되 연결**한다 (v2는 새로운 novelty signal일 수 있다 — v1로 접지 않는다).
  `TODO(open-question: SimHash Hamming threshold + body normalization; is layer-4 on in v1 at all?)`.
- **Verify:** arXiv + S2 + blog + HN에 존재하는 같은 논문이 **네 개**의 provenance entry를 가진 **하나의**
  `Finding`으로 collapse; 같은 논문의 arXiv v1과 v2는 **두 개**의 연결된 finding으로 유지; layer 4 off 시,
  near-duplicate-but-distinct 두 항목 모두 생존.

### 6. `seen` index (rebuildable SQLite projection)
- **Do:** `merge_or_create(raw)`를 구현한다: `canonical_key(raw)` (또는 `content_hash` fallback)를 계산; 
  `seen_index.has(key)`이면 finding을 로드하고 새 provenance를 append; 아니면 새 finding 생성 + `add(key)`.
  `seen` 집합을 `state/seen.idx`에 영속화하고 빠른 lookup을 위해 `index.sqlite`로 projection한다. index는
  **file truth로부터 rebuild 가능**하다 — `index.sqlite`를 삭제하고 `findings/*.json`을 replay하면 `seen`
  집합이 재현된다 (ADR-0006 §A).
- **Verify:** `index.sqlite`를 삭제하고 파일을 replay하면 동일한 `seen` 집합이 재현됨; 알려진 key의 반복된
  `merge_or_create`는 중복 생성 대신 provenance를 append.

### 7. export idempotency key (forward-compat)
- **Do:** finding별 `idempotency_key = hash(finding_id + target + classification_version)` scaffolding을
  계산하고 저장하여 나중의 retry가 novelty-threat를 CAW-03로 절대 이중 route하지 않게 한다 (ADR-0004/ADR-0007).
  Classification field는 P3에서 채운다 — 여기서는 finding 측 입력만 reserve/derive한다.
- **Verify:** key는 고정된 finding/target/version triple에 대해 deterministic하며 입력이 변경되면 변함;
  이 runbook에서는 export 수행 없음 (그것은 P4).

### 8. negative-test 스위트 (반드시 성립)
- **Do:** ADR-0006 negative test를 추가한다: (a) 같은 window 재실행 ⇒ `new=0, dup=all`; (b) 네 source에 걸친
  같은 논문 ⇒ 하나의 finding, 네 provenance entry; (c) transient 실패는 cursor를 unadvanced로 남기고 다음 run이
  깨끗하게 재가져오기 + dedup; (d) `index.sqlite` 삭제 + 파일 replay가 `seen`을 재현.
- **Verify:** 네 negative test 모두 통과; tree가 green.

## Acceptance criteria
- [ ] host별 token-bucket limiter가 arXiv (1 req/3 s) + EDGAR (≤10 req/s)를 직렬화하고 서로 다른 host를
      병렬화; backoff-with-jitter는 adapter 안에 머문다.
- [ ] source별 cursor가 `state/<source>.cursor` 아래 영속화되고 **완전히 성공한 pass에서만** advance;
      transient 실패는 cursor 유지; terminal 실패는 quarantine + alert; `--since` backfill은 cursor 무시.
- [ ] multi-layer dedup (native id ▸ canonical ▸ SHA-256)이 여러 source에 걸친 동일 항목을 **여러 provenance
      entry를 가진 하나의 `Finding`**으로 collapse; SimHash layer-4는 구현되었으나 **기본 off** (recall-safe);
      arXiv version은 구별되되 연결됨.
- [ ] provenance field가 누락된 `RawFinding`은 **core 경계에서 거부**되고 저장 안 됨; 영속화된 모든 `Finding`이
      `boundary="public"` + `trust` prior를 지님; 큰 payload는 `artifacts/<sha>/` 아래 by path로 저장.
- [ ] `seen` index는 file truth의 rebuildable SQLite projection (삭제 + replay가 재현).
- [ ] 두 번째 동일 Run이 `new=0, dup=all`을 산출; 네 ADR-0006 negative test 모두 통과; tree가 green.
- [ ] dedup/cursor는 **core**에만 존재 — adapter는 dedup에 대해 얇고 stateless 유지 (source별 분기가 pipeline에
      누출 안 됨).

## Rollback / safety
- collect+dedup runtime은 RB-010 위에 additive하다; 비활성화하려면 Run이 cursor를 영속화하지 않고 adapter를
  실행할 수 있다 (full 재가져오기 + dedup으로 degrade) — 절대 일관성 없는 부분 state가 아님.
- cursor는 완전 성공에서만 advance하므로, 중단된 Run은 watermark를 ingest된 data보다 앞에 stranding하지 않음;
  재실행이 같은 window를 재가져오고 dedup이 overlap을 흡수 (recall-first self-heal).
- `seen` index는 처분 가능하다: 손상 의심 시 `index.sqlite`를 삭제하고 `findings/*.json`을 replay하여 rebuild —
  file truth가 authoritative.
- SimHash는 open-question threshold가 설정되지 않는 한 **off** 유지; 이는 P1 동안 false-merge로 인한 조용한
  recall 손실이 없음을 보장한다.

## Hand-off
- P2 (relevance)는 `findings/*.json`에 안정적인 deduped `Finding` 집합을 가정할 수 있다 — 완전한 provenance,
  `boundary`, `trust`를 갖춘 실제 항목당 하나의 finding — 파일로부터 incremental하고 reproducible하게 생성됨.
- P3/P4는 export-idempotency 입력이 각 finding에 reserve되어 있어, novelty-threat를 CAW-03로 routing하는 것을
  ingestion을 재차 건드리지 않고 retry-safe하게 만들 수 있음을 가정할 수 있다.
- Operator는 주간 cron 재실행이 저렴하고 (conditional GET / cursor) 놓친 주가 다음의 더 넓은 window를 통해
  self-heal됨을 가정할 수 있다.
