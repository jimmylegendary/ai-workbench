# RB-003: 파일 스토어, 엔티티 스키마, wbtraffic.v0 스키마 구현

- Status: ready
- Phase: phase-0-foundations
- Depends on: [RB-000, RB-001, RB-002]
- Implements design: [../../04-data-layer/data-model_ko.md](../../04-data-layer/data-model_ko.md), [../../04-data-layer/storage-and-scheduling_ko.md](../../04-data-layer/storage-and-scheduling_ko.md), [../../01-decisions/ADR-0002-hypothesis-representation_ko.md](../../01-decisions/ADR-0002-hypothesis-representation_ko.md), [../../01-decisions/ADR-0003-experiment-ledger_ko.md](../../01-decisions/ADR-0003-experiment-ledger_ko.md), [../../01-decisions/ADR-0004-writeback-traffic-schema_ko.md](../../01-decisions/ADR-0004-writeback-traffic-schema_ko.md), [../../01-decisions/ADR-0006-implication-mapping_ko.md](../../01-decisions/ADR-0006-implication-mapping_ko.md), [../../01-decisions/ADR-0007-storage-and-scheduling_ko.md](../../01-decisions/ADR-0007-storage-and-scheduling_ko.md)
- Produces: 공유 레코드 envelope + 엔티티 스키마(`Source`, `Claim`, `Hypothesis`, `ExperimentEntry`+`Result`, `ImplicationMap`, `WritebackTrafficSchema`/`wbtraffic.v0`, `ExportBundle`)와 data-model §5 불변식을 강제하는 검증기; 단조(monotonic) ID와 "current" resolver를 가진 append-only 파일 스토어 reader/writer; 모든 수치 기본값 `null` + `basis` modeled-vs-measured를 가진 `wbtraffic.v0` 스키마.

## Objective
CAW-06에게 자체 영속 데이터 레이어와 이후 모든 stage가 읽고/쓰는 타입화된 레코드를 부여합니다. "Done" = data-model.md §3의 각 엔티티가 공유 envelope(§2)를 지니고 §5 불변식에 대해 검증되는 스키마 모델(pydantic 또는 JSON Schema)을 가짐; 스토어가 엔티티당 하나의 markdown/JSON 레코드를 올바른 `store/<dir>/`에 쓰고, 안정적 단조 ID를 할당하며, supersede를 동반한 append-only이고, 대용량 artifact를 경로로만 참조하며, append-only 레코드 위로 "current"-state resolver를 노출; 그리고 모든 수치가 `null`로 기본 설정되고 필수 `basis: modeled|measured` 플래그를 가진 `wbtraffic.v0` 스키마가 존재. 검증기는 no-overclaim 불변식을 구조적으로 위반 불가능하게 만들어야 함: `status`+`confidence` 없는 Hypothesis-bearing 레코드 없음; `generated` 콘텐츠는 `evidence:false`이며 결코 status를 승격하거나 `evidence_ref`가 될 수 없음; 모든 `wbtraffic.v0` 수치는 `null`이거나 sourced이며 결코 지어내지 않음. 이는 스키마 + 스토어만; 파이프라인 stage 로직 없음.

## Preconditions
- [ ] RB-002 완료: ports/registry/fakes 존재; `check`가 녹색.
- [ ] 스키마 검증 도구 선택됨(tech-stack `TODO` 해결: pydantic v2 대 jsonschema). 핀 기록.
- [ ] data-model.md / repo-structure.md의 엔티티 이름과 ID 접두어가 고정됨: `SRC/CLAIM/HYP/EXP/IMAP/WBT/EXB`(정확히 사용; 이름 변경 금지).

## Steps

1. **Do:** 공유 envelope(data-model.md §2)를 베이스 모델로 구현: `id`, `kind`, `created`(쓰기 시점에 실제 타임스탬프로 남김 — fixture에 날짜를 지어내지 마세요), `provenance{source_ids, origin, retrieved_at}`, `boundary`(`internal|export:caw-01|export:caw-02`), `status`, `lineage{supersedes, derived_from}`. `generated` 플래그/`evidence:false` 마커는 어떤 하위 필드에도 표현 가능.
   **Verify:** 필수 envelope 필드가 누락된 레코드가 검증기에 의해 거부됨; 단위 테스트가 거부를 단언.

2. **Do:** `schemas/source.py`(data-model §3.1) 구현: `title`, `authors`, `canonical_id`, `versions`, 다중 항목 `provenance`(`evidence:false`로 표기된 CAW-05 항목 포함), `boundary: internal`을 가진 `Source`. 재발견은 다중 provenance 항목을 가진 하나의 `Source`로 병합(dedup은 여기가 아닌 이후 파이프라인이 수행).
   **Verify:** 두 provenance origin을 가진 `Source`가 검증됨; CAW-05 provenance 항목이 `evidence:false`를 지님.

3. **Do:** `schemas/claim.py`(§3.2) 구현: `source_id`, `statement`, 필수 `evidence_span`(verbatim) + `source_locator`, `claim_type` enum, `writes_back: true|false|unknown`(기본 `unknown`), `asserted_by`, 그리고 `unverified`로 고정된 `status`를 가진 `Claim`. 검증기는 Claim에 `status=supported`를 금지(extraction은 결코 supported를 방출하지 않음).
   **Verify:** `evidence_span` 없는 Claim이 거부됨; `status=supported` 설정이 거부됨; 기본 `writes_back`이 `unknown`.

4. **Do:** `schemas/hypothesis.py`(§3.3) 구현: `statement`, `from_claims`, `status`(`hypothesis|supported|refuted|inconclusive`, 기본값+하한 `hypothesis`), `confidence`(5-value, 기본 `very-low`), `evidence_strength`, `agreement`, 선택 `likelihood`, `falsifiability`(`hypothesis`를 벗어나려면 필수), `reproducibility`, `evidence_ids`, 그리고 append-only `status_log`를 가진 `Hypothesis`. 검증기: `status`+`confidence` 없이 결코 직렬화하지 않음; **HARD evidence cap을 가진 보정된 불확실성** — generated/`evidence:false` evidence는 결코 `status`나 `confidence`를 올릴 수 없음(ADR-0002 §4). `hypothesis`를 벗어나려면 `falsifiability` 설정 필요.
   **Verify:** `status`나 `confidence` 없이 Hypothesis 직렬화가 거부됨; generated evidence만으로 구동된 status 승격이 거부됨; `falsifiability` 없이 `hypothesis`를 벗어나는 것이 거부됨; `status_log`가 append-only(in-place 편집 없음).

5. **Do:** `schemas/ledger_entry.py`(§3.4/§3.5) 구현: `hypothesis_id`, `claim_ref`, `status`(`planned|running|done|aborted`), 사전 등록된 `prediction{metric, baseline, expected_direction, decision_rule}`, 그리고 **reproducibility gate** 블록 `repro{config_path, seeds, code_rev, data_ref, env_lock, hardware, budget}`를 가진 `ExperimentEntry`; 임베디드 `Result{verdict: supported|refuted|inconclusive|invalid, metrics_path, observed_effect, negative_result, failure_mode}`; 그리고 선택적 `writeback_observed` 훅(MEASURED 수치; 측정 전까지 `bytes_per_update`는 null). 검증기: `repro`에 config+seed+env가 누락된 Result는 **non-reproducible → evidence로 사용 불가**로 표기(runner가 아닌 ledger writer가 소유하는 게이트); `invalid`은 `refuted`와 구별됨; 네거티브 결과(`refuted`/`inconclusive`/non-null `failure_mode`)는 보존되고 표기되며, 결코 폐기되지 않음.
   **Verify:** `repro`에 seeds/env 없는 항목이 non-reproducible로 표기되고 evidence로 거부됨; `invalid` verdict가 `refuted`로 카운트되지 않음; `negative_result=true` 항목이 검증되고 보존됨(failures useful).

6. **Do:** `schemas/implication_map.py`(§3.6) 구현: `finding_ref`, **`evidence:false`로 강제된 `summary`**(generated, 결코 evidence_ref 아님), 그리고 각각 `domain`(고정 6-domain enum), `statement`, `status`, `confidence`(3-value), `Result`나 `Claim`로 반드시 resolve되는(결코 summary 아님) `evidence_refs`, 선택 `writeback_payload_ref`, `export_targets`(라우팅 힌트일 뿐)를 가진 `implications[]`를 가진 `ImplicationMap`.
   **Verify:** summary를 가리키는 `evidence_ref`가 거부됨; `summary`가 항상 `evidence:false`; enum 밖의 `domain`이 거부됨.

7. **Do:** `schemas/wbtraffic_v0.py`(§3.7, ADR-0004) 구현: `schema_version: "wbtraffic.v0"`, `ttt_variant`, `provenance`, 필수 `uncertainty{status, confidence}`(ADR-0002 status), 필수 `basis: modeled|measured`, 그리고 필드 그룹 `fast_weights`, `update`, `writeback`, `ratio_curve`, `assumptions`, `open_questions`를 가진 `WritebackTrafficSchema` — **모든 수치 기본값 `null`**. 검증기: `basis=measured`(ledger Result에서 sourced)도 아니고 `assumptions` 항목(`basis=modeled`인 경우)도 없는 non-null 수치는 거부됨 — **지어낸 수치 없음**; assumptions 없는 `modeled` 값은 거부됨; `uncertainty`는 필수.
   **Verify:** 모든 수치 기본값 `null`; `basis=modeled`이나 assumption 없이 수치 설정이 거부됨; `uncertainty`나 `basis`가 누락된 레코드가 거부됨; `open_questions`가 표현 가능하고 stripped되지 않음.

8. **Do:** `schemas/export_bundle.py`(§3.8) 구현: `target: caw-01|caw-02`, semver `schema_version`(in-band, 공유 레지스트리 없음), `producer: "caw-06"`, `content_hash`, `provenance`, target별 `payload`, 그리고 `receipt{emitted_at, result: ok|rejected, reason}`(rejected export도 export 가능 유지)를 가진 `ExportBundle`. 검증기: `status`/`uncertainty`가 제거된 채로 `boundary`를 넘는 것 없음; 번들은 자기 기술적(공유 스키마 레지스트리 import 없음).
   **Verify:** payload가 운반된 status/uncertainty를 누락한 번들이 거부됨; `content_hash`가 멱등 upsert를 가능하게 함(동일 id+hash = 중복 없음); `rejected` receipt도 유효하게 보존되는 레코드.

9. **Do:** `core/store.py`(storage-and-scheduling.md §2/§3)에 스토어 reader/writer 구현: 엔티티당 하나의 md/JSON 레코드를 올바른 `store/<dir>/`에 쓰기; 접두어별 안정적 단조 ID 할당(재사용 안 함; superseded 레코드는 ID를 유지하고 `lineage.supersedes`를 얻음); supersede를 동반한 append-only(수정 = 새 레코드/`StatusEvent`, 결코 in-place 편집 아님); 대용량 artifact는 `artifacts/EXP-XXXX/` 아래 경로로만 참조(결코 inline 아님). 쓰기 전에 모든 레코드를 자신의 스키마에 대해 검증하도록 연결.
   **Verify:** 각 엔티티 쓰기 후 읽기가 라운드트립; ID 할당이 단조이고 gap 허용; supersede가 디스크에 옛 것을 유지하며 새 레코드를 생성; 유효하지 않은 레코드(step 1–8 검증기 실패)를 디스크에 닿기 전에 거부.

10. **Do:** `core/resolver.py`(storage-and-scheduling.md §3)에 "current"-state resolver 구현: `store/` 위의 순수 함수로 Hypothesis별 "current status"(최신 `StatusEvent`)와 Hypothesis별 "current verdict"(최신 non-superseded `ExperimentEntry`)를 계산. `store/index/` 삭제가 아무것도 잃지 않아야 함(index는 폐기 가능/재빌드 가능).
   **Verify:** 두 superseding 항목으로, resolver가 최신을 반환; 추가된 `StatusEvent`로 "current status"가 그것을 반영; `store/index/` 삭제 후 재resolve가 동일한 결과를 산출.

## Acceptance criteria
- [ ] 여덟 엔티티 스키마(`Source`, `Claim`, `Hypothesis`, `ExperimentEntry`+`Result`, `ImplicationMap`, `WritebackTrafficSchema`, `ExportBundle`)가 공유 envelope와 함께 존재하고 `typecheck`를 통과 — 이름/접두어가 data-model.md와 정확히 일치(P0 종료: "every record kind has a schema + validator").
- [ ] data-model §5 불변식이 검증기로 강제되고 테스트됨: `status`+`confidence` 없는 Hypothesis-bearing 레코드 없음; **HARD evidence cap**(generated evidence는 결코 status/confidence를 승격하지 않음); `Claim.asserted_by` 존재하며 결코 우리 결론으로 재진술되지 않음; 모든 `wbtraffic.v0` 수치는 `null`이거나 sourced(결코 지어내지 않음); `status`/`uncertainty`가 제거된 채로 `boundary`를 넘는 것 없음.
- [ ] reproducibility gate가 스토어/ledger writer에 의해 강제됨: config+seed+env 없는 항목은 non-reproducible로 표기되고 evidence로 거부됨; `invalid` ≠ `refuted`; 네거티브 결과는 보존, 분류, 노출 가능(failures useful).
- [ ] `wbtraffic.v0`가 `schema_version`, `uncertainty`, `basis: modeled|measured`, 모든 수치 기본값 `null`, `assumptions`, `open_questions`를 지님; modeled 수치는 assumptions 필요.
- [ ] 파일 스토어가 엔티티당 하나의 레코드를 올바른 `store/<dir>/`에 단조 비재사용 ID, append-only+supersede, artifact 경로 참조로 쓰기; read/write 라운드트립; 쓰기 전에 유효하지 않은 레코드 거부.
- [ ] "current"-state resolver가 append-only 레코드 위로 최신 status/verdict를 반환; `store/index/` 삭제가 아무것도 잃지 않음(P0 종료: "store dirs create/round-trip"). 트리는 녹색 유지.

## Rollback / safety
- 모든 변경은 추가적(스키마 모듈, `core/store.py`, `core/resolver.py`, 테스트). Rollback = `schemas/*.py`와 두 core 모듈을 RB-000 플레이스홀더로 되돌리기.
- 안전: 스토어는 append-only — rollback은 `store/` 아래 실제 레코드를 결코 삭제하면 안 됨(failures are first-class, ADR-0007). 중간 실패는 부분적으로 쓰인 레코드를 디스크에 닿기 전에 검증으로 거부되게 두어, 스토어가 결코 유효하지 않은 레코드를 보유하지 않게 함. 중단된 쓰기가 레코드를 손상시킬 수 없도록 atomic write(temp 파일 + rename) 사용.

## Hand-off
다음 런북들(Phase 1+)은 다음을 가정할 수 있음: 모든 엔티티에 대한 타입화·검증된 레코드; 단조 ID, supersede, artifact-by-path, current-state resolver를 가진 append-only 파일 스토어; 그리고 P3의 analytic L0 estimator가 채울 준비가 된 `wbtraffic.v0` 스키마. 스키마, 스토어, 포트(RB-002), 경계 규칙 + op-manifest(RB-001), 트리(RB-000)가 제자리에 있으면 P0 완료: ingestion 파이프라인(RB-1XX)이 첫 실제 Source/Claim/Hypothesis를 persist할 수 있고, 모든 게이트(status/uncertainty + evidence cap, reproducibility, export-eligibility)가 어떤 어댑터가 아닌 스키마 + 스토어에 의해 강제됨.
