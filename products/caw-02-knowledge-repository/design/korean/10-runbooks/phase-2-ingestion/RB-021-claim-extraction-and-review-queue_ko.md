# RB-021: Schema 제약 claim extraction, dedup, 그리고 review queue

- Status: ready
- Phase: phase-2-ingestion
- Depends on: [RB-020 (6-stage ingestion pipeline: stage-3 `extract_claims` hook, stage-4 gate)], [phase-1-core: core validator + evidence gate], [phase-0-foundations: Claim/Evidence frontmatter schemas]
- Implements design: [../../05-knowledge-core/ingestion-pipeline_ko.md](../../05-knowledge-core/ingestion-pipeline_ko.md) (A2, A4, A6, review state machine), [../../07-backend-api/ingestion-service_ko.md](../../07-backend-api/ingestion-service_ko.md) (review queue), [../../01-decisions/ADR-0005-ingestion-pipeline_ko.md](../../01-decisions/ADR-0005-ingestion-pipeline_ko.md)
- Produces: `supporting_block_ids`를 반드시 인용해야 하는 schema 제약 LLM claim-candidate extractor(A2); exact-hash + semantic union-merge dedup(A4); 그리고 review queue + state machine(`proposed → accepted/needs_evidence/rejected`) — 조용한 auto-accept 없음, reject은 audit용으로 보존.

## Objective
파싱된 block을, `supporting_block_ids`를 반드시 인용해야 하는 schema 제약 LLM을 통해 `ClaimCandidate`로 변환하고, 이를 dedup하고(exact source-hash + `Concept` neighborhood 내 semantic cosine, logging과 함께 merge-by-union), 모든 생성된 candidate를 curator가 승격하는 review queue에 보관한다. "완료" = agent가 provenance를 손상시키지 않으면서 candidate를 대량으로 제출할 수 있다: 모든 candidate가 extractor 신원과 block pointer를 지니고, v0에서는 어떤 candidate도 자동 승인되지 않으며, 거부된 candidate는 삭제되지 않고 **audit용으로 보존**된다.

## Preconditions
- [ ] RB-020이 green: `extract_claims`가 proposed/non-durable producer로 배선되어 있고 stage 4에 구조적 evidence gate가 존재한다.
- [ ] `ParsedDoc` block이 안정적인 `block_id`/`char_span` locator를 지닌다.
- [ ] core로부터 trust 재계산(파생, AI는 T2 상한)을 사용할 수 있다.
- [ ] (semantic dedup용) embedding 루틴을 사용할 수 있거나, 또는 `TODO(open-question: semantic dedup cosine threshold + embedding model)`이 해결될 때까지 이 단계가 feature-flag로 off되어 있다.

## Steps

### 1. `ClaimCandidate` extraction schema 정의
- **Do:** LLM이 candidate마다 emit해야 하는 JSON schema를 명세한다:
  ```jsonc
  {
    "text": "string",
    "claim_type": "empirical|methodological|definitional|comparative|normative",
    "polarity": "affirm|negate",
    "supporting_block_ids": ["block_id", "..."],   // REQUIRED, non-empty
    "confidence": 0.0
  }
  ```
  영속화 시점에 `model_id`, `prompt_hash`, `tool_version`, `generated: true`, `status: proposed`를 부착한다. 비어 있지 않은 `supporting_block_ids`를 schema layer에서 강제한다.
- **Verify:** `supporting_block_ids`가 비어 있거나 누락된 candidate는 어떤 쓰기 이전에 schema validation으로 거부된다. enum을 벗어난 `claim_type`을 가진 candidate는 거부된다.

### 2. Schema 제약 extractor 구축 (A2)
- **Do:** extractor를 `ParsedDoc`에 대한 constrained-decoding / JSON-schema LLM 호출로 구현한다. 형상이 허용되는 각 candidate를 extractor 신원과 `Source`로 향하는 `about` edge와 함께 영속화한다. 나중에 prompt가 잘못된 것으로 밝혀지면 `prompt_hash`로 batch 전체를 격리한다 — source는 절대 잃지 않는다.
- **Verify:** 영속화된 모든 candidate는 자신의 source의 실재하는 block을 가리키는 해석 가능한 `supporting_block_ids`와 `model_id` + `prompt_hash` + `tool_version`을 지닌다. 잘못된 batch는 source를 건드리지 않고 `prompt_hash`로 찾아 격리할 수 있다.

### 3. Exact source dedup (A4.1)
- **Do:** extraction 전에 `content_hash`(이미 `add_source`의 idempotency 키)로 source를 dedup한다. 같은 artifact를 다시 ingest하면 기존 `source_id`를 재사용하고, `parser_version`이 바뀌지 않은 한 재-extraction을 건너뛴다.
- **Verify:** 동일 artifact를 다시 ingest하면 중복 `Source`도, 중복 candidate 집합도 생기지 않는다.

### 4. Semantic claim dedup with union-merge (A4.2)
- **Do:** 새 candidate에 대해, 관련 `Concept` neighborhood 내에서 유사도(embedding cosine)를 계산한다. high threshold(~0.9, 도메인 튜닝, `TODO(open-question)`) 이상이면 **merge by union**한다: 살아남는 canonical claim이 *모든* evidence와 source pointer를 누적한다 — 아무것도 버리지 않는다. `{similarity, merged_into, decided_by}`를 merge event로 logging한다. merge 시 **monotone boundary**를 적용한다(`internal` + `confidential` → `confidential`). threshold 근처의 match는 auto-merge가 아니라 **review**로 보낸다.
- **Verify:** 두 claim을 merge하면 그들의 evidence + source pointer의 union이 보존된다(손실 없음). merge event가 기록된다. merge된 claim의 boundary는 입력들의 max이다. threshold 근처의 쌍은 조용히 merge되지 않고 review로 라우팅된다.

### 5. Review queue 모델
- **Do:** review ticket을 구현한다:
  ```ts
  type ReviewTicket = {
    id: Id; actor: Actor; stage: 3 | 5 | 6;
    items: { id: Id; kind: Kind; summary: string }[];
    state: "open" | "accepted" | "rejected" | "partial";
    created_at: string;
  }
  ```
  agent가 작성한 candidate(`actor.kind == "agent"`)는 auto-hold된다: item이 non-durable로 남고 호출은 `review_ticket`과 함께 `CONFIRM_REQUIRED`를 반환한다. 사람 + `confirm:true`는 confirmation 정책(`TODO(open-question)`)에 따라 우회할 수 있다.
- **Verify:** agent 제출은 ticket과 함께 `CONFIRM_REQUIRED`를 반환하고 모든 item을 non-durable로 남긴다. 어떤 agent 경로도 curator 동작 없이 candidate를 durable로 만들지 않는다.

### 6. Review state machine (조용한 auto-accept 없음)
- **Do:** transition을 구현하며 각각을 append-only로 그리고 actor + reason + timestamp와 함께 `_events`에 미러링한다:
  - `→ proposed` (extractor): block ref를 가진 schema-valid candidate.
  - `proposed → accepted` (curator): **evidence gate가 충족된 경우에만**(해석 가능한 `artifact_ref` ≥1). accept 시 core가 **trust를 재계산**한다(AI는 T2 상한), caller가 아님.
  - `proposed → needs_evidence` (curator 또는 gate): 해석 가능한 artifact 없음.
  - `proposed → rejected` (curator + reason): **audit용으로 보존**, `rejected`로 표시, 절대 삭제하지 않음.
  - `accepted → superseded` (새 쓰기): append-only supersede, update/delete 없음.
- **Verify:** 해석 가능한 evidence가 없는 claim의 accept는 차단된다(`accepted`가 아니라 `needs_evidence`에 안착/유지). 거부된 candidate는 reason과 함께 영속하며 retrieval-as-fact에서 제외되지만 audit 레코드에는 남는다. acceptance는 `Claim→Evidence` invariant를 재실행하여 오래된 candidate가 evidence 없이 durable이 되지 못하게 한다.

### 7. Accept 시점 재검증
- **Do:** `review_accept` 시, item이 durable이 되기 전에 accept transaction 안에서 `Claim→Evidence` invariant와 boundary 검사를 재실행한다.
- **Verify:** evidence가 제거되었거나 한 번도 부착되지 않은 candidate는 accept 시 `INVARIANT`에 실패하며 durable이 되지 않는다.

### 8. Audit + reindex 일관성
- **Do:** 모든 transition과 merge가 `_events` 레코드와 hash-chained audit 항목을 추가하도록 보장한다. git history가 audit trail이다. 거부/보존된 candidate는 `reindex`를 견딘다.
- **Verify:** SQLite 인덱스를 drop하고 `reindex`를 재실행하면 md-git으로부터 candidate, merge log, 거부된 item을 그들의 state와 함께 재구성한다.

## Acceptance criteria
- [ ] extractor는 schema-valid한 `ClaimCandidate`만 emit한다. 비어 있지 않은 `supporting_block_ids` 없이 존재하는 candidate는 없다.
- [ ] 모든 candidate는 `model_id` + `prompt_hash` + `tool_version`과 `generated: true`를 지닌다. 잘못된 batch는 `prompt_hash`로 격리 가능하다.
- [ ] exact source-hash dedup이 중복 source/candidate 집합을 막는다. semantic dedup은 `{similarity, merged_into, decided_by}` logging과 monotone boundary로 merge by union한다.
- [ ] agent 제출은 `CONFIRM_REQUIRED`로 auto-hold된다. v0에는 조용한 auto-accept 경로가 없다.
- [ ] state machine transition은 append-only이고 audit된다(actor/reason/ts). accept는 invariant + boundary를 재검증한다.
- [ ] 거부된 candidate는 audit용으로 보존되고, retrieval-as-fact에서 제외되며, 절대 삭제되지 않는다.
- [ ] trust는 accept 시 core가 재계산한다(AI는 T2 상한). 절대 caller가 설정하지 않는다.
- [ ] Tree가 green이다(build + lint + schema-validate + extraction/dedup/queue 테스트).

## Rollback / safety
- 모든 상태 변경은 append-only + supersede이다. 파괴적으로 편집되는 것은 없으므로, 잘못된 transition은 새로운 superseding event로 교정되며 audit trail이 보존된다.
- 잘못된 extractor prompt/model은 그 `prompt_hash` batch를 격리하여 봉쇄한다. source는 손대지 않는다.
- dedup이 잘못 merge하면, union-merge log(`merged_into`)로 reviewer가 merge 이전의 claim을 재구성할 수 있다. supersede로 교정한다.
- 어느 시점이든 drop + `reindex`로 md-git으로부터 파생 인덱스를 재구축한다.

## Hand-off
- RB-022는 CAW-05 signal을 `Source`/`ClaimCandidate`로 resolve하는 데 A0–A2(이 extractor + candidate 모델)를 재사용하고, stance-link review에 이 review state machine을 재사용한다.
- Phase-3 retrieval은 `accepted` claim만 fact로 표면화되고, `proposed`/`needs_evidence`/`rejected`는 audit용으로 query 가능하지만 절대 evidence-grade로 반환되지 않는다고 가정할 수 있다.
