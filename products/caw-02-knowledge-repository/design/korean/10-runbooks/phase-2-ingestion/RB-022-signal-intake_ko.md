# RB-022: Signal intake (add-related-work-signal → classify → link-to-claim)

- Status: ready
- Phase: phase-2-ingestion
- Depends on: [RB-020 (6-stage pipeline: stage-6 `classify_signal` hook, evidence gate)], [RB-021 (A0–A2 extractor + candidate model + review state machine)], [phase-1-core: core validator + evidence gate], [phase-0-foundations: RelatedWork/RadarSignal/OpenQuestion frontmatter schemas]
- Implements design: [../../05-knowledge-core/ingestion-pipeline_ko.md](../../05-knowledge-core/ingestion-pipeline_ko.md) (Pipeline B, B0–B5), [../../07-backend-api/ingestion-service_ko.md](../../07-backend-api/ingestion-service_ko.md) (Stage 6 classify/link), [../../01-decisions/ADR-0005-ingestion-pipeline_ko.md](../../01-decisions/ADR-0005-ingestion-pipeline_ko.md)
- Produces: Pipeline B — import 시 격리(quarantine)하고, 외부 work를 `Source`/`ClaimCandidate`로 resolve하고, 대상 내부 `Claim`을 찾고, 3-way stance를 분류하고, 외부 artifact의 evidence로 뒷받침되는 stanced `RelatedWork`→`Claim` link를 기록하며, `REFUTE`가 accepted claim에 안착하면 `OpenQuestion`을 자동으로 제기하는 CAW-05 radar/related-work signal intake.

## Objective
CAW-05(별개의 독립 제품)에서 도착하는 signal이 느슨한 summary가 아니라 **우리의 claim에 연결된** 타입 지정 entity가 된다. "완료" = CAW-05 envelope가 intake 시 격리되고 boundary가 재검사되며, dedup된 외부 `Source` + `ClaimCandidate`로 resolve되고, retrieval을 통해 내부 `Claim`에 매칭되며, `SUPPORT|REFUTE|NEI`로 분류되고, **외부 work의 artifact**(절대 CAW-05 summary 텍스트가 아님)를 가리키는 `Evidence`로 link된다 — 그리고 accepted claim에 대한 `REFUTE`는 자동으로 `OpenQuestion`을 제기하고 reviewer에게 알린다. 이것은 file/API import 경계이다: CAW-05와 **공유 저장소(shared store)가 없다**.

## Preconditions
- [ ] RB-020 + RB-021이 green: stage-6 edge writer, A0–A2 extractor, review state machine이 존재한다.
- [ ] B2를 위해 retrieval `search()`(FTS5/BM25 + structured filters)를 호출할 수 있다. phase-3 retrieval이 아직 구축되지 않았으면 B2는 core가 노출하는 최소 FTS lookup을 사용한다. embedding은 명시적으로 v0 밖이다.
- [ ] CAW-05로부터의 import envelope 계약(versioned, signed)이 정의되어 있다(ADR-0007). 여기서의 intake는 이를 소비하지만 wire format을 재정의하지 않는다.
- [ ] `RadarSignal`, `RelatedWork`, `OpenQuestion` frontmatter schema가 존재한다.

## Steps

### 1. B0 — Signal ingest (격리 + boundary 재검사)
- **Do:** CAW-05 envelope를 수용하고 `RadarSignal`/`RelatedWork{source_ref, boundary, received_at, origin:"CAW-05"}`를 기록한다. 먼저 **격리(quarantine)**된 채로 안착시킨다. origin 제품, 원래 signal id, 선언된 boundary, 수신 시간을 기록한다. **intake 시 선언된 boundary를 재검사한다 — 절대 맹목적으로 upgrade/trust하지 않는다**. durable node로 매핑하기 전에 confidentiality 검사를 실행한다.
- **Verify:** 갓 import된 signal은 격리되며 아직 어떤 claim에도 link되지 않는다. boundary는 intake 시 재검증된다(`public`을 주장하는 signal이 자동으로 public으로 수용되지 않음). intake는 envelope만 읽는다 — CAW-05로의 공유 DB/registry 핸들이 존재하지 않는다.

### 2. B1 — Source + ClaimCandidate로 resolve (A0–A2 재사용)
- **Do:** 인용된 외부 work를 DOI/arXiv/S2 id로 dedup하여(없으면 `content_hash`로 fallback) `Source`로 resolve한다. RB-021 extractor를 재사용하여 외부 work가 주장하는 바에 대한 `ClaimCandidate[]`를 생성한다. CAW-05 `raw_summary`는 `generated: true` 컨텍스트로만 저장한다 — **evidence에서 제외**.
- **Verify:** 이미 알려진 외부 work를 인용하는 signal을 다시 import하면 기존 `Source`로 dedup된다. `raw_summary`는 컨텍스트로 저장되며 `artifact_ref`로 사용되는 것이 구조적으로 막힌다(Evidence가 될 수 없음). candidate는 extractor 신원 + block/locator ref를 지닌다.

### 3. B2 — 대상 내부 claim 찾기
- **Do:** 각 외부 `ClaimCandidate`에 대해 `search()`(FTS5/BM25 + structured filters, embedding은 나중)를 통해 매칭되는 내부 `Claim[]`을 retrieve한다. match score와 사용된 retrieval 방법을 기록한다.
- **Verify:** B2는 기록된 score + 방법과 함께 순위가 매겨진 내부 claim match를 반환한다. match가 없으면 흐름은 "no target"을 기록하고 link를 조작하지 않고 signal을 review를 위해 park한다.

### 4. B3 — Stance 분류 (재검증, 신뢰 안 함)
- **Do:** 각 (외부 claim, 내부 claim) 쌍에 대해 `rationale` span + `confidence`와 함께 `stance ∈ {SUPPORT, REFUTE(threat), NEI(neutral)}`를 분류하고, classifier `model_id` + `prompt_hash`, `generated: true`를 영속화한다. **CAW-05 자체 라벨을 신뢰하지 말고 재분류한다**(`TODO(open-question: how much of CAW-05's classification to re-classify at B3)`).
- **Verify:** 각 stance는 classifier 신원, rationale, confidence, `generated: true`를 지닌다. CAW-05의 들어오는 라벨은 로컬에서 계산된 stance를 override하지 않는다.

### 5. B4 — Claim에 link (stanced edge + 외부 artifact의 evidence)
- **Do:** 타입 지정 `supports`/`refutes` edge `RelatedWork`→`Claim`을 기록한다. 구조적 evidence gate를 통과하며 `extracted_from`이 **외부 work의 artifact**(locator)를 가리키는 `Evidence`로 뒷받침한다 — **절대** CAW-05 summary 텍스트가 아님. link는 review를 위해 `proposed`로 안착한다.
- **Verify:** evidence `extracted_from`은 CAW-05 summary가 아니라 외부 artifact로 resolve된다(summary 대상은 `EVIDENCE_GATE`로 실패). stanced edge가 존재하며 `proposed`이다.

### 6. B5 — Review / escalate (accepted claim에 대한 REFUTE → OpenQuestion)
- **Do:** proposed link를 RB-021 review state machine으로 라우팅한다. **`REFUTE` stance가 *accepted* `Claim`을 대상으로 하면, 자동으로 `OpenQuestion`을 제기**하고(claim으로 향하는 `addresses` edge와 함께) reviewer에게 알리며, escalation 계보(lineage)를 기록한다. 그 외 모든 것은 일반 review를 위해 `proposed`로 안착한다. `unknown`/no-target signal은 `T0`에 저장되며 자동 link하지 **않는다**.
- **Verify:** accepted claim에 대한 `REFUTE` signal은 `addresses`로 link된 정확히 하나의 `OpenQuestion`과 reviewer 알림을 자동 생성하며, escalation 계보가 기록된다. `SUPPORT`/`NEI` signal은 OpenQuestion을 생성하지 않는다. unknown signal은 `T0`에 남고 link되지 않는다.

### 7. Provenance, audit, idempotency
- **Do:** 모든 B-stage는 하나의 `_events` 레코드 + hash-chained audit 항목을 추가한다. origin + 원래 signal id가 node와 함께 이동한다. external id / `content_hash`로 intake를 idempotent하게 만든다(같은 signal을 다시 import하면 중복이 아니라 no-op 또는 supersede). trust는 파생(AI는 T2 상한), boundary는 monotone.
- **Verify:** 동일 signal을 다시 import해도 중복 node/link가 생기지 않는다. md-git으로부터의 `reindex`가 signal, stance link, evidence, 자동 제기된 OpenQuestion을 재구성한다.

### 8. End-to-end 작업 테스트
- **Do:** 테스트 추가: 외부 work가 기존 **accepted** 내부 claim을 refute하는 CAW-05 envelope를 import하고 B0→B5를 실행한다.
- **Verify:** signal이 격리된 뒤 dedup된 `Source`로 resolve된다. 외부 artifact의 evidence와 함께 `refutes` edge가 기록된다. `OpenQuestion`이 자동 제기되고 reviewer에게 알려진다. 어디에도 CAW-05 summary가 evidence로 저장되지 않는다. CAW-05로의 공유 저장소 접근이 발생하지 않는다.

## Acceptance criteria
- [ ] signal은 intake 시 boundary가 재검사된 채(절대 맹목적으로 upgrade되지 않음) 격리되어 안착한다. durable 매핑 전에 confidentiality 검사가 실행된다.
- [ ] 외부 work는 DOI/arXiv/S2로 dedup된 `Source`로 resolve된다. `raw_summary`는 컨텍스트 전용이며 evidence가 되는 것이 금지된다.
- [ ] B2는 `search()`를 사용하고 match score + 방법을 기록한다. no-match signal은 조작된 link 없이 park된다.
- [ ] stance는 classifier 신원 + rationale과 함께 로컬에서 분류된다(`SUPPORT|REFUTE|NEI`). CAW-05 라벨은 맹목적으로 신뢰되지 않는다.
- [ ] stanced link는 (gate를 통과하며) 외부 artifact를 가리키는 `Evidence`를 지닌다. 절대 CAW-05 summary가 아니다.
- [ ] accepted claim에 대한 `REFUTE`는 정확히 하나의 link된 `OpenQuestion` + reviewer 알림을 자동 제기한다. unknown signal은 `T0`에 남고 link되지 않는다.
- [ ] intake는 idempotent하다. 모든 stage가 audit된다. `reindex`가 md-git으로부터 모든 것을 재구성한다.
- [ ] boundary는 monotone이다. CAW-05와 공유 저장소가 없다 — file/API 경계만 있다.
- [ ] Tree가 green이다(build + lint + schema-validate + signal-intake 테스트).

## Rollback / safety
- 모든 쓰기는 append-only + supersede이다. 잘못된 link/분류는 삭제가 아니라 superseding event로 교정된다 — audit 계보가 보존된다.
- quarantine-first는 confidentiality/boundary 검사 실패 시 signal이 durable node로 매핑되기 전에 멈춤을 의미한다. 격리된 레코드는 audit용으로 보존된다.
- 잘못된 classifier batch는 source signal을 잃지 않고 `prompt_hash`로 격리 가능하다.
- drop + `reindex`로 md-git으로부터 파생 인덱스를 재구축한다.

## Hand-off
- Phase-3 retrieval은 stance link와 자동 제기된 OpenQuestion이 provenance와 함께 query 가능하고, accepted claim/link만 fact로 표면화된다고 가정할 수 있다.
- Phase-5 import/export는 CAW-05 intake 경계(quarantine + re-redaction + confidentiality 검사)가 다른 inbound crossing의 템플릿이라고 가정할 수 있다. 인용된 bundle을 CAW-03으로 export하는 것은 동일한 evidence-on-artifact 규율 위에 구축된다.
