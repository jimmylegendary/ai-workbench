# RB-020: 6단계 ingestion 파이프라인 구축 (add-source → … → classify/link)

- Status: ready
- Phase: phase-2-ingestion
- Depends on: [phase-1-core: core validator + op manifest + structural evidence gate], [phase-1-core: file→index→_events transaction writer], [phase-0-foundations: frontmatter schemas for Source/Claim/Evidence/Note]
- Implements design: [../../05-knowledge-core/ingestion-pipeline_ko.md](../../05-knowledge-core/ingestion-pipeline_ko.md) (Pipeline A), [../../07-backend-api/ingestion-service_ko.md](../../07-backend-api/ingestion-service_ko.md) (6 stages), [../../01-decisions/ADR-0005-ingestion-pipeline_ko.md](../../01-decisions/ADR-0005-ingestion-pipeline_ko.md)
- Produces: 순서가 정해진 stage `add_source → parse → extract_claims → attach_evidence → synthesize_note → classify_signal`를 각각 하나의 core transaction으로 구동하는 `IngestService`; stage별 provenance 부수 효과; 구조적인 `generated-summary ≠ evidence` gate를 처음부터 끝까지 배선한 결과물.

## Objective
하나의 ingestion 서비스가 Pipeline A의 6개 파이프라인 stage를 순서가 정해진 append-only core transaction으로 노출한다. 각 stage는 자신이 의무적으로 갖춰야 할 provenance(content hash, block locator, extractor 신원, evidence `extracted_from`, note `cites`, signal 분류)를 부착하고, 고정된 `file → index → _events → validate → commit` 순서로 기록하며, validation 실패가 발생하면 transaction 전체를 abort한다(orphan 파일/row/event 없음). "완료" = 등록된 source가 parse → claim-candidates → evidence → cited note까지 거쳐 갈 수 있고, 모든 artifact가 해석 가능한(resolvable) provenance를 지니며 **생성된 텍스트가 절대 Evidence로 저장되지 않는** 상태. (Claim-extraction 내부 구현과 review queue는 RB-021, signal intake B-pipeline은 RB-022 — 이 runbook은 A-pipeline의 척추(spine)와 stage-6 hook을 구축한다.)

## Preconditions
- [ ] phase-1-core가 green 상태: transactional core, op manifest, 구조적 evidence gate(`attach_evidence`에 prose 필드가 없고, `artifact_ref`가 반드시 resolve되어야 함)가 존재하며 단위 테스트를 통과한다.
- [ ] `file → index → _events` writer가 idempotent하며 commit 전에 `Claim→Evidence` invariant를 검증한다.
- [ ] `Source, Claim, Evidence, Note`에 대한 frontmatter JSON-schema가 `knowledge/{sources,claims,evidence,notes}/` 아래에 존재한다.
- [ ] content-addressed artifact vault 경로가 설정되어 있다(큰 artifact는 inline이 아니라 `artifact_uri`로 참조).
- [ ] `reindex`가 invariant(layer 3)를 재검증하며 deterministic/idempotent하다.

## Steps

### 1. 파이프라인 stage 계약 정의
- **Do:** stage마다 하나의 메서드를 가진 `IngestService`를 만들고, 각 메서드는 타입이 지정된 입력을 받아 생성된 node id(들) + `txn_id`를 반환한다. stage는 오직 core transaction 안에서만 실행된다 — raw 파일 쓰기 없음. 골격:
  ```ts
  interface IngestService {
    add_source(in: AddSourceIn): SourceRef        // A0, stage 1
    parse(in: ParseIn): ParsedDocRef              // A1, stage 2 (internal, no public op)
    extract_claims(in: ExtractIn): CandidateRef[] // A2, stage 3 (detail in RB-021)
    attach_evidence(in: AttachEvidenceIn): EvidenceRef // A3, stage 4 (the gate)
    synthesize_note(in: SynthNoteIn): NoteRef     // A5, stage 5
    classify_signal(in: ClassifyIn): LinkRef      // A6/B, stage 6 hook (detail in RB-022)
  }
  ```
- **Verify:** 각 메서드는 core op manifest를 경유한다. 단위 테스트로 어떤 `IngestService` 경로도 core transaction writer를 거치지 않고 `.md`를 쓰지 않음을 assert한다.

### 2. Stage 1 — `add_source` (등록 + 해시 + boundary 하한)
- **Do:** raw artifact/body의 `sha256`을 **먼저** 계산하여 dedup + idempotency 키로 사용한다(동일 artifact를 다시 ingest하면 기존 `source_id`를 반환하는 no-op). `Source{type, locator, content_hash, boundary, visibility, created_by, created_at}`를 기록한다. intake 시점에 `boundary`를 default-deny `internal`로 포착하고, `visibility`는 default-private로 한다. 큰 artifact는 content-addressed vault로 복사하고 `artifact_uri`로 참조한다(절대 inline 하지 않음).
- **Verify:** byte 단위로 동일한 artifact에 대해 `add_source`를 다시 실행하면 같은 `source_id`가 나오고 **새** `_events` 줄이 추가되지 **않는다**. boundary가 누락된 source는 `internal`로 영속화된다. vault 파일이 존재하고 URI로 참조된다.

### 3. Stage 2 — `parse` (주소 지정 가능한 block + anchor)
- **Do:** `type`에 따라 라우팅한다: 논문 → GROBID(PDF→TEI)를 1차로, 깨진 PDF에는 LLM fallback. 기사 → readability/markdown. 노트 → 이미 구조화됨. `ParsedDoc{blocks[{block_id, kind, text, page, char_span}], refs[]}`를 emit한다. `parser_version`을 저장한다. 파싱된 콘텐츠에서 raw artifact로 향하는 `derived-from` edge를 기록한다. raw artifact는 절대 변경하거나 교체하지 않는다. parse 출력은 internal이다(public op 없음).
- **Verify:** emit된 모든 block은 해석 가능한 locator `{source_id, block_id, char_span, page}`를 가진다. 같은 source를 같은 `parser_version`으로 재파싱하면 deterministic하다(동일한 `block_id`/`char_span` 집합). parse 후 raw artifact는 byte 단위로 변경되지 않는다.

### 4. Stage 3 hook — `extract_claims`가 제안된 candidate를 생성
- **Do:** 이 stage를 배선하여 `generated: true`, `status: proposed`, `Source`로 향하는 `about`-edge, 그리고 필수적인 `supporting_block_ids`를 가진 `ClaimCandidate[]`를 emit하게 한다. candidate는 **non-durable**로 기록되어 review를 위해 enqueue된다(전체 extractor 로직 + queue는 RB-021). `supporting_block_ids`가 없는 candidate는 schema layer에서 거부된다.
- **Verify:** `supporting_block_ids`가 비어 있는 candidate는 schema validation에 실패하고 transaction을 abort한다. 생성된 candidate는 `proposed`, `generated: true`, non-durable이며 사실(fact)로 retrieve되지 않는다.

### 5. Stage 4 — `attach_evidence` (구조적 gate)
- **Do:** **prose/summary 필드가 없는** `attach_evidence(claim_id, artifact_ref, locator, stance, rationale)`를 구현한다. `artifact_ref`는 기존 `Source/Trace/SimulationRun/Experiment` node 또는 실재하는 `file_uri`로 반드시 resolve되어야 한다. `Note` 또는 `kind=generated-summary` 대상은 `EVIDENCE_GATE`로 거부한다. 성공 시 `Evidence{evidence_for→claim, extracted_from→artifact, locator, stance ∈ {SUPPORT,REFUTE,NEI}, rationale}`와 `supports`/`refutes` edge를 기록한 뒤 해당 claim에 대해 trust 재계산을 트리거한다. 해석 가능한 evidence가 없는 claim은 `needs_evidence`로 남고 절대 자동 승격(auto-promote)되지 않는다.
- **Verify:** `Note` id나 resolve 불가능한 `artifact_ref`로 `attach_evidence`를 호출하면 `EVIDENCE_GATE`를 반환하고 아무것도 기록하지 않는다. 유일한 "evidence"가 생성된 텍스트인 claim은 승격될 수 없다. 성공한 attach는 `extracted_from`을 locator로 기록하며 절대 prose로 기록하지 않는다.

### 6. Stage 5 — `synthesize_note` (인용은 하되 절대 evidence가 아님)
- **Do:** **accepted claim에 대해서만** `Note{generated: true, cites:[claim_id…], evidence_rollup}`를 구성한다. 독자가 LLM을 재실행하지 않고도 note→claim→evidence→source를 따라갈 수 있도록 `cites` + evidence rollup을 inline한다. `evidence=false`로 설정하고, Note를 `attach_evidence` 대상에서 그리고 export-as-evidence에서 구조적으로 배제한다. boundary는 단조적으로(monotonically) 전파된다: Note boundary ≥ max(인용된 입력들의 boundary).
- **Verify:** synthesize된 Note를 `attach_evidence`의 `artifact_ref`로 사용하려 하면 `EVIDENCE_GATE`로 실패한다. `confidential` cited claim으로부터 synthesize된 Note는 그 자체로 ≥ `confidential`이다. 모든 `cites` id는 source span으로 resolve되는 accepted claim으로 resolve된다.

### 7. Stage 6 — `classify_signal` hook
- **Do:** `classification: threat|support|unknown`을 반환하는 `classify_signal`을 노출한다. `threat`/`support`는 대상 `Claim`/`Concept`로 향하는 타입이 지정된 `RelatedWork` stanced edge가 된다. `unknown`은 signal을 `T0`에서 미검증 상태로 저장하며 자동 링크하지 **않는다**. 전체 B-pipeline(envelope intake, retrieval match, OpenQuestion escalation)은 RB-022에 맡긴다. 여기서는 stage 경계 + edge writer만 배선한다.
- **Verify:** `unknown` 분류는 자동 링크를 만들지 않고 `T0`에 안착한다. `threat`/`support`는 타입이 지정된 stanced edge를 기록한다. (escalation 동작은 RB-022에서 테스트.)

### 8. Stage별 provenance + audit
- **Do:** 각 stage는 하나의 `_events/<ts>-<op>.jsonl` 레코드와 core audit 서비스를 통한 hash-chained audit 항목을 추가한다. extractor/classifier 신원(`model_id`, `prompt_hash`, `tool_version`)이 모든 생성 artifact와 함께 이동한다. Trust는 core가 **파생**하며 절대 caller가 설정하지 않는다. AI가 작성한 entity는 T2에서 상한이 걸린다.
- **Verify:** 각 stage 호출은 정확히 하나의 `_events` 줄을 생성한다. caller가 공급한 trust 값은 무시/거부된다. SQLite 인덱스를 `reindex`로 삭제·재구축하면 md-git으로부터 모든 node + edge가 재현된다.

### 9. Transaction + abort 의미론
- **Do:** 각 stage를 `file → index → _events → validate → commit` 순서의 하나의 core txn으로 실행한다. 어느 stage에서든 validation 실패는 transaction 전체를 abort한다: orphan 파일 없음, 반쯤 쓰인 edge 없음, audit 항목 없음. `idempotency_key`를 존중한다(반복은 원래의 `txn_id`를 반환, 같은 키를 다른 payload로 재사용할 때만 `CONFLICT`).
- **Verify:** stage 중간에 validation 실패를 강제로 발생시키고(예: 승격 시점에 evidence가 0인 claim을 주입), `.md`도, SQLite row도, `_events` 줄도 살아남지 않음을 확인한다. 같은 `idempotency_key`로 stage를 반복하면 원래 결과를 반환한다.

### 10. End-to-end happy-path 테스트
- **Do:** fixture 논문에 대해 `add_source → parse → extract_claims → attach_evidence → synthesize_note`를 실행한 뒤 `reindex`, 그다음 Note를 retrieve하는 테스트를 추가한다.
- **Verify:** synthesize된 Note는 **hydrate된 provenance chain** source→claim→evidence와 함께 retrieve된다. generated summary는 어디에도 Evidence로 저장되지 않는다. 실행은 전적으로 skill/op 인터페이스를 거친다(임의의 파일 편집 없음).

## Acceptance criteria
- [ ] 6개 stage 모두 op manifest를 통한 core transaction으로 존재한다. invariant나 gate를 우회하는 raw write 경로가 없다.
- [ ] `add_source`는 `content_hash`로 idempotent하다. `parse`는 deterministic하며 해석 가능한 block locator를 emit한다. raw artifact는 절대 변경되지 않는다.
- [ ] `attach_evidence`는 prose 필드가 없고, 해석 가능한 `artifact_ref`를 요구하며, Note/generated-summary 대상을 `EVIDENCE_GATE`로 거부한다.
- [ ] synthesize된 `Note`(`generated: true`, `evidence=false`)는 절대 evidence edge의 출처가 될 수 없다. boundary 전파는 단조(monotone)이다.
- [ ] 각 stage는 정확히 하나의 `_events` 레코드를 추가한다. trust는 파생되며(AI는 T2 상한) 절대 caller가 설정하지 않는다.
- [ ] validation 실패는 orphan 파일/row/event 없이 transaction 전체를 abort한다.
- [ ] End-to-end happy path가 round-trip되고 `reindex` 후 Note가 전체 provenance와 함께 retrieve된다.
- [ ] Tree가 green이다(build + lint + schema-validate + 파이프라인 테스트).

## Rollback / safety
- 모든 쓰기는 append-only + supersedes이다. 되돌릴 파괴적 update/delete가 없다.
- 파이프라인 중간 실패는 부분 상태를 남기지 않는다(transaction abort). 마지막으로 accepted된 stage부터 재실행해도 안전하다(`content_hash`/`idempotency_key`로 idempotent).
- 사후에 어떤 stage가 버그가 있다고 발견되면, 파생된 SQLite 인덱스를 drop하고 md-git으로부터 `reindex`한다. 잘못된 생성 artifact는 저장된 `model_id`/`prompt_hash`로 격리(quarantine)하며 source는 잃지 않는다.

## Hand-off
- RB-021은 stage 3(`extract_claims`)가 proposed/non-durable producer로 배선되어 있다고 가정하고, 그 위에 schema 제약 extractor, dedup, review queue를 구축한다.
- RB-022는 stage 6(`classify_signal`) edge-writer + unknown 시 `T0` 동작이 존재한다고 가정하고, 전체 CAW-05 signal B-pipeline(intake → retrieval match → stance → link → OpenQuestion escalation)을 구축한다.
- Retrieval(phase-3)은 ingest된 transaction이 hydrate 가능한 provenance와 함께 `reindex`를 통해 round-trip된다고 가정할 수 있다.
