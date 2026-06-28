# RB-031: `ImplicationMap` 모델 + validator + 라우팅 힌트 구현

- Status: ready
- Phase: phase-3-writeback-and-implication
- Depends on: [RB-001 (store 레이아웃 + 레코드 스키마), RB-02X (finding 존재: ledger 항목 / status 태그 hypothesis), RB-030 (`writeback_payload_ref`용 `wbtraffic.v0` 아티팩트 id)]
- Implements design:
  - [../../05-ttt-research-core/implication-mapping.md](../../05-ttt-research-core/implication-mapping_ko.md)
  - [../../01-decisions/ADR-0006-implication-mapping.md](../../01-decisions/ADR-0006-implication-mapping_ko.md)
  - [../../01-decisions/ADR-0002-hypothesis-representation.md](../../01-decisions/ADR-0002-hypothesis-representation_ko.md) (status/uncertainty 함께 실림)
  - [../../01-decisions/ADR-0003-experiment-ledger.md](../../01-decisions/ADR-0003-experiment-ledger_ko.md) (결과가 `evidence_refs`가 됨)
  - [../../01-decisions/ADR-0008-export-boundaries.md](../../01-decisions/ADR-0008-export-boundaries_ko.md) (힌트가 공급하는 게이트; 결코 emit이 아님)
  - [../../09-roadmap/milestones-and-phases.md](../../09-roadmap/milestones-and-phases_ko.md) (P3 종료; M1 ImplicationMap 라인)
- Produces:
  - `ImplicationMap` 레코드 스키마(6-domain 닫힌 enum) + validator
  - `export_targets`를 **힌트만** 계산하는 `route(map)` (emit 없음)
  - `store/implications/`로의 영속화

## Objective
빌더가 **하나의 finding**(로깅된 결과, status가 바뀐 hypothesis, 또는 추출된 claim)을 **고정된 여섯 도메인**에
걸쳐 타입이 지정되고 uncertainty 태그가 붙은 결과-주장(claims-about-consequences)으로 펼치고, 그 맵을 CAW-06
자체 `store/implications/`에 영속화하며, `export_targets` **라우팅 힌트**를 계산할 수 있어야 한다 — 단 결코 export를
emit하지 않는다(그것은 RB-4XX / ADR-0008). "Done"의 의미 = M1 finding에 대해 `summary_generated: true`인 하나의
`ImplicationMap`이 존재하고(요약은 **생성된 것이지 결코 증거가 아님**), 각 implication이 자기 자신의 독립적인
`status` + `confidence`를 지니고, 모든 `evidence_refs`가 실제 ledger 결과나 추출된 claim으로 해소되며,
`status: hypothesis`는 요약으로 끌어올릴 수 없고, refuted/inconclusive implication은 일급 "축이 관측되지
않음" 신호로 보존된다. 증거 없는 맨 hypothesis도 생성되지만 설계상 **어떤** 타겟으로도 라우팅되지 않는다.

## Preconditions
- [ ] `finding_ref`를 anchor할 finding이 존재(ADR-0003 ledger 결과, ADR-0002 hypothesis, 또는 ADR-0005
      claim). **refuted/inconclusive/error** finding도 유효한 anchor다(실패도 유용).
- [ ] `store/implications/`이 존재(ADR-0007); RB-001의 레코드 스키마가 로드 가능.
- [ ] 어떤 `memory-centric-systems`/`hardware` implication이 `writeback_payload_ref`(`wbtraffic.v0` 아티팩트
      id)를 실을 거라면 RB-030이 완료되어 있어야 함.
- [ ] CAW-01과 CAW-02는 **별도 제품**으로 취급: domain→target 열은 라우팅 힌트일 뿐; 공유 store 없음; 실제
      게이트는 이후 ExportAdapter에서 실행됨(ADR-0008).

## Steps

### 1. `ImplicationMap` 스키마 정의 (finding당 하나)
- **Do:** implication-mapping.md §3에 따라 최상위 레코드를 모델링한다: `map_id`, `finding_ref{thread_id, kind ∈
  result|hypothesis|claim, ref_id}`, `provenance{source_ids[], boundary}` (여기서 boundary는 `internal`,
  번들이 빌드된 후에야 `export:caw-0x`), `summary` (문자열), **`summary_generated` (bool)**, 그리고
  `implications[]`.
- **Verify:** 검증이 `{result, hypothesis, claim}` 밖의 `finding_ref.kind`를 거부; `boundary: internal`인 맵은
  허용.

### 2. implication별 형태 + 닫힌 6-domain enum 정의
- **Do:** 각 `implications[]` 항목: `impl_id` (맵 내 고유), `domain` (**닫힌 enum**, 정확히:
  `ai-services`, `education`, `dev-platforms`, `models`, `hardware`, `memory-centric-systems`), `statement`,
  `status` (`hypothesis|supported|refuted|inconclusive`, 기본값 `hypothesis`), `confidence`
  (`low|medium|high`, status와 **독립**), `evidence_refs[]`, 선택적 `writeback_payload_ref`,
  `export_targets[]`. 자유 텍스트 도메인은 거부(새 도메인은 ADR bump 필요 — implication-mapping.md §2).
- **Verify:** 자유 텍스트 `domain`은 검증 실패; 나열된 여섯 도메인은 모두 검증 통과; `status`와 `confidence`는
  어떤 조합으로도 허용됨(예: `supported` + `low`).

### 3. "요약은 생성된 것이지 결코 증거가 아님" 강제
- **Do:** 요약이 모델로 작성된 경우 항상 `summary_generated: true`를 강제하고, validator가 `summary` 문자열을
  **결코** `evidence_ref`로 취급하지 않게 한다(어떤 `evidence_refs[]`에도 나타날 수 없음).
- **Verify:** `summary_generated: false`인 모델 작성 요약은 검증 실패; `evidence_refs[]` 안에서 사용된 `summary`
  문자열 id는 검증 실패.

### 4. validator 강력 규칙 구현 (overclaim 금지)
- **Do:** implication-mapping.md §4 규칙을 강제한다: (1) `status`와 `confidence` 독립; (2) **`evidence_refs`는
  반드시 해소되어야** 함 — ledger 결과(ADR-0003) 또는 추출된 claim(ADR-0005)으로; dangling ref는 실패; (3)
  **`status: hypothesis`는 생성된 요약으로 끌어올릴 수 없음** — 오직 증거 해소(ledger verdict / 입증하는
  claim)로만; (4) CAW-01로 향하는 `memory-centric-systems`/`hardware` implication은 `writeback_payload_ref`를
  실어야 하거나(SHOULD) 타입 지정 open question이어야 함; (6) **실패는 일급**: `refuted` / `inconclusive`
  implication도 여전히 생성되고 여전히 매핑 가능.
- **Verify:** dangling `evidence_ref`는 실패; 요약만 바뀐 채 `status`를 `hypothesis`에서 승격하는 것은
  실패(status는 `hypothesis`로 유지); `refuted` implication은 검증 통과하고 영속화됨(폐기되지 않음).

### 5. 라우팅 힌트 계산 (`route` — 자격 판정, 결코 emit 아님)
- **Do:** implication별로 `export_targets`를 설정하는 `route(map)`를 구현한다(implication-mapping.md §5):
  ```
  domain ∈ {memory-centric-systems, hardware}
     AND (writeback_payload_ref present OR statement is a typed open question)  -> hint caw-01
  has ≥1 resolving evidence_ref AND status ≠ hypothesis                        -> hint caw-02
  ```
  증거 없는 맨 `hypothesis`는 **어떤** 타겟도 받지 않는다. 함수는 자격만 표시한다; 어떤 번들도 쓰거나 형제 제품을
  건드려서는 안 된다(ADR-0008이 유일한 emit 이음새).
- **Verify:** `writeback_payload_ref`가 있는 `memory-centric-systems` implication은 `caw-01`을 힌트; 해소되는
  evidence ref가 있는 `supported` implication은 `caw-02`를 힌트; 맨 hypothesis는 아무것도 힌트하지 않음;
  `route`는 CAW-06 store 밖에 쓰기를 전혀 수행하지 않음(테스트에서 assert).

### 6. CAW-06 자체 store로 영속화
- **Do:** 검증된 맵(JSON + 선택적 마크다운)을 `store/implications/<map_id>.json`에 쓴다(ADR-0007); 큰 아티팩트는
  경로로. `provenance.boundary`는 `internal`로 유지 — RB-4XX가 번들을 빌드해야만 `export:caw-0x`가 됨.
- **Verify:** Round-trip 로드가 맵을 재현; `boundary`가 `internal`; 동일 finding에 대한 재실행이 멱등(동일
  `finding_ref`에 대해 중복 맵 없음).

## Acceptance criteria
- [ ] `ImplicationMap` 스키마 + validator 존재; `domain`은 **닫힌 6-값 enum**; 자유 텍스트 거부.
- [ ] `summary_generated`는 모델 작성 요약에 대해 `true`로 강제되고, `summary`는 **결코** `evidence_ref`로 사용
      불가(생성된 요약 ≠ 증거).
- [ ] `status`와 `confidence`는 독립; `status: hypothesis`는 생성된 요약으로 끌어올릴 수 없음(오직 증거 해소로만)
      — 테스트가 둘 다 증명.
- [ ] 모든 `evidence_refs` 항목이 ledger 결과나 추출된 claim으로 해소; dangling ref는 검증 실패.
- [ ] Refuted/inconclusive implication이 생성·검증·영속화되어 일급 "축이 관측되지 않음" 신호가 됨(폐기되지 않음).
- [ ] `route`는 `export_targets`를 **힌트만** 설정하고, 아무것도 emit하지 않으며, 어떤 형제 store도 건드리지
      않음; 맨 hypothesis는 어디로도 라우팅되지 않음; CAW-01/CAW-02 타겟은 ADR-0008 게이트가 재확인하는 힌트.
- [ ] M1 finding에 대한 하나의 `ImplicationMap`이 `boundary: internal`로 `store/implications/`에 영속화; 트리가
      green.

## Rollback / safety
- 맵은 CAW-06 자체 store 안의 순수 출력이다; 되돌리려면 `store/implications/<map_id>.json`을 삭제. 그것이
  참조하는 finding(ledger 항목 / hypothesis / claim)은 손대지 않는다.
- `route`는 결코 emit해서는 안 된다; 어떤 코드 경로라도 여기서 번들을 쓰거나 형제 제품에 도달하면 그것은 경계
  위반이다 — ExportAdapter(ADR-0008)가 유일한 emit 이음새다.
- 재검토 트리거: 생성된 요약이 implication의 `status`를 끌어올리거나, `summary`가 증거로 인용되면 — 멈춰라.
  overclaim 금지 불변식이 깨지고 있다.

## Hand-off
- RB-4XX (ExportAdapter / `Caw01WritebackAdapter` + `Caw02ClaimAdapter`)는 각 implication이 이미 해소된
  `status`/`confidence`/`evidence_refs`와 `export_targets` 힌트를 싣고 있다고 가정할 수 있다; 그것은 어떤 경계
  쓰기 전에도 실제 타겟별 게이트를 재확인하며 유일한 emit 이음새다.
- M1 체크리스트의 "ImplicationMap with generated-summary flag set" 항목은 영속화된 맵으로 충족 가능; RB-030의
  `wbtraffic.v0` 번들과 결합하면 P3 종료 게이트가 충족된다.
- 독립성 상기: CAW-01과 CAW-02는 별도 제품이다; `export_targets`는 힌트이지 쓰기가 아니다 — 여기서 공유 store를
  넘나들지 않는다.
