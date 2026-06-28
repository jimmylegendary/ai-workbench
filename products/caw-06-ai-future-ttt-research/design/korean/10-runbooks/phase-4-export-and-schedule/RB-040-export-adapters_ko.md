# RB-040: ExportAdapter 이음새 + v1 Caw01WritebackAdapter 및 Caw02ClaimAdapter 구축

- Status: ready
- Phase: phase-4-export-and-schedule
- Depends on: [RB-3XX (wbtraffic.v0 번들), RB-3XX (ImplicationMap), RB-0XX (ExportAdapter 포트 + registry stub), RB-2XX (experiment ledger)]
- Implements design: [../../05-ttt-research-core/export-boundaries.md](../../05-ttt-research-core/export-boundaries_ko.md), [../../01-decisions/ADR-0008-export-boundaries.md](../../01-decisions/ADR-0008-export-boundaries_ko.md), [../../01-decisions/ADR-0004-writeback-traffic-schema.md](../../01-decisions/ADR-0004-writeback-traffic-schema_ko.md), [../../01-decisions/ADR-0002-hypothesis-representation.md](../../01-decisions/ADR-0002-hypothesis-representation_ko.md)
- Produces: `ExportAdapter` registry 배선, `Caw01WritebackAdapter`, `Caw02ClaimAdapter`, `Caw03NoveltyAdapter`/`HttpExportAdapter` 문서화된 stub, `ExportBundle` + `ValidationReport` + `ExportReceipt` 타입, 타겟별 게이트, `store/exports/` 영수증 + rejection 레코드.

## Objective
CAW-06 밖으로 나가는 **유일한 export 이음새**를 구현해, finding이 **제품 경계를 가로질러 단방향으로 푸시되는
자기기술 번들**로서 떠날 수 있게 한다 — `wbtraffic.v0` 스키마 + open questions → CAW-01, 그리고 claim + 증거 +
uncertainty → CAW-02 — 이때 타겟별 **overclaim 금지 게이트가 어떤 쓰기 이전에 `validate()` 내부에서 강제**된다.
"Done"의 의미: 두 v1 adapter가 빌드되고, 두 stub은 등록되었으나 비활성이며, 모든 emit이 멱등이고 저장된 영수증을
산출하며, 맨 `hypothesis`는 CAW-02에 대해 게이트에서 거부되고, CAW-01 수치 필드는 `null`+`basis`로 유지되며(지어낸
숫자 없음), 어떤 adapter도 형제 제품의 store를 읽거나 쓰지 않고, export는 오직 사람 게이트를 통해서만 도달 가능
(RB-042).

## Preconditions
- [ ] P3 종료 충족: 하나의 finding에 대해 최소 하나의 `wbtraffic.v0` 번들(analytic-L0, 필드는
      `TODO(open-question)`일 수 있음)과 하나의 `ImplicationMap`(generated-summary 플래그 설정됨)이 존재.
- [ ] P0의 `ExportAdapter` 포트 + config 기반 registry가 `NotImplemented` 스타일 stub과 함께 컴파일됨.
- [ ] `store/exports/` 디렉터리가 ADR-0007 레이아웃에 따라 존재.
- [ ] 타겟별로 설정된 **경계 드롭 경로**가 가용(config 기반; 형제의 내부 store가 아님). 정확한 위치/인증은
      ADR-0008의 `TODO(open-question)`으로 취급하고 config에서 읽는다.
- [ ] CAW-01 IR 타겟 객체 이름이 **재검증됨, CAW-01 소유**로 config에 기록됨(결코 inline으로 가정하지 않음).

## Steps

1. **`ExportBundle` / `ValidationReport` / `ExportReceipt` 타입 정의.**
   - Do: `ExportBundle`을 `bundle_id`, `target`, `schema_version` (semver, in-band), `producer="caw-06"`,
     `content_hash` (`payload`에 대한 안정적 해시), `payload`, `provenance` (`thread_id`, `source_ids`,
     `boundary`)와 함께 구현. `ValidationReport{ok: bool, gate: str, reasons: [str]}`와
     `ExportReceipt{bundle_id, target, content_hash, status, ts, path_or_endpoint}` 추가.
   - Verify: Round-trip serialize/deserialize가 모든 필드를 보존; `content_hash`가 동일 payload의 두 직렬화에
     걸쳐 결정론적(단위 테스트).

2. **`ExportAdapter` 포트 계약과 registry 해소 구현.**
   - Do: `ExportAdapter`를 `target`, `validate(bundle)->ValidationReport`, `emit(bundle)->ExportReceipt`,
     `health()->AdapterStatus`와 함께 구현. config registry에서 `target`으로 adapter를 해소; 호출자에서 타겟
     선택을 하드코딩하지 말 것.
   - Verify: `registry.get("caw-01")`과 `get("caw-02")`가 v1 adapter를 반환; 알 수 없는 타겟은 타입 에러를
     raise; stub은 해소되지만 `emit()`은 문서화된 `NotImplemented` 스타일 가드를 raise.

3. **어떤 쓰기 이전에, `validate()` 내부에서 게이트 강제.**
   - Do: 공유 base에서 `emit()`이 먼저 `validate()`를 호출하고 `ok=false`면 쓰기를 거부하게 한다. 타겟별 게이트
     구현: **CAW-01**은 implication `domain ∈ {memory-centric-systems, hardware}`이고 `writeback_payload`가
     있거나 타입 지정 open question일 때 수락; **CAW-02**는 해소되는 `evidence_ref`가 ≥1개이고 `status ∈
     {supported, refuted, inconclusive}`이며 provenance가 있을 때만 수락.
   - Verify: `status="hypothesis"`인 CAW-02 번들은 `ok=false`를 반환하고 **결코 쓰이지 않음**(파일이 나타나지
     않음); 모든 필드가 `null`인 CAW-01 open-question 번들은 게이트를 통과.

4. **`Caw01WritebackAdapter` 구현 (writeback 스키마 + open questions).**
   - Do: payload를 ADR-0004 `wbtraffic.v0` 형태 아티팩트로 빌드: `kind:"writeback-traffic-schema"`,
     `ttt_variant`, `estimate_level`, `fields` 블록(write_bandwidth, write_endurance, near_memory_update,
     updated_state_residency, optimizer_state_bytes, updated_weight_reuse, capacity_bw_ratio_vs_context),
     `modeled_not_measured`, 그리고 일급 `open_questions[]`. payload를 **config에서 읽은**(재검증됨, CAW-01
     소유) CAW-01의 L0 객체 이름으로 lowering. toy-grounded 측정이 없는 수치 필드는 `value: null` +
     `basis: "TODO(open-question)"`로 유지.
   - Verify: emit이 모든 미측정 수치가 비어 있지 않은 `basis`와 함께 `null`인 번들을 산출; analytic-L0 추정에
     대해 `modeled_not_measured`가 `true`; `open_questions[]`가 비어 있지 않음; 지어낸 숫자 없음(어떤 수치
     필드도 자동 채워지지 않았음을 assert).

5. **`Caw02ClaimAdapter` 구현 (claim + 증거 + uncertainty).**
   - Do: `kind:"claim-with-evidence"` payload를 빌드해 `claim`, `status` (supported|refuted|inconclusive),
     `confidence`, `evidence[]` (ledger 결과 / 외부 출처로 해소), `not_evidence[]` (예: `generated_summary:*`),
     `uncertainty_notes`를 싣는다. status + confidence는 **inline**으로 이동.
   - Verify: 해소되는 `evidence_ref` 하나를 가진 refuted finding은 성공적으로 export; 생성된 요약은
     `not_evidence[]`에 나타나고 결코 `evidence[]`에는 없음; `status`/`confidence`가 없는 번들은 거부됨(uncertainty가
     벗겨진 채로는 아무것도 경계를 넘지 않음).

6. **`emit()`을 멱등으로 만들고 영수증 + rejection 저장.**
   - Do: emit을 `bundle_id`+`content_hash`로 키잉(재emit = upsert). `ExportReceipt`를
     `store/exports/<thread_id>/`에 쓴다. 게이트 거부 또는 전송 실패한 export를 일급 레코드로 로깅; finding은
     재시도를 위해 **export 가능** 상태로 둔다.
   - Verify: 동일 번들을 두 번 emit하면 하나의 논리적 경계 아티팩트와 upsert 영수증을 산출(중복 없음); 강제된
     전송 실패는 `failed` 레코드를 쓰고 finding은 재export 선택 가능 상태로 남음.

7. **문서화된 stub 등록.**
   - Do: `Caw03NoveltyAdapter` (novelty cues)와 `HttpExportAdapter` (transport swap)를 포트를 구현하되
     `emit()`에서 문서화된 가드를 raise하도록 registry에 등록.
   - Verify: stub이 `registry.list()`에 `status="stub"`으로 나타남; `emit()` 호출이 조용한 no-op이 아니라
     문서화된 가드를 raise.

8. **코드에서 독립성 계약 assert.**
   - Do: 유일한 쓰기 타겟이 설정된 경계 경로/엔드포인트임을 확인; 어떤 adapter도 형제 제품의 내부 store 아래
     경로를 열지 않으며 read-back이 없음을 검증하는 테스트/assert 추가.
   - Verify: 정적/경로 검사 통과; 영수증은 local 전용; 어떤 코드 경로도 CAW-01/CAW-02 store를 import하거나 읽지
     않음.

## Acceptance criteria
- [ ] `Caw01WritebackAdapter` + `Caw02ClaimAdapter`가 빌드되고 경계 번들을 emit; `Caw03NoveltyAdapter` +
      `HttpExportAdapter`는 등록되었으나 비활성(ADR-0008 P4 종료).
- [ ] `validate()`가 어떤 쓰기 **이전에** 타겟별 게이트를 실행; 게이트에서 걸러진 번들은 로깅되고 결코 emit되지
      않음.
- [ ] CAW-02 게이트가 맨 `hypothesis`를 거부; refuted/inconclusive는 허용; `not_evidence[]`는 생성된 요약을
      제외.
- [ ] CAW-01 번들이 미측정 수치에 대해 `null`+`basis`를 싣고, `modeled_not_measured`가 설정되며, 비어 있지 않은
      `open_questions[]` — 지어낸 숫자 없음.
- [ ] `emit()`이 `bundle_id`+`content_hash`로 멱등; thread별 `ExportReceipt`가 `store/exports/` 아래 저장됨.
- [ ] 어떤 adapter도 형제 제품의 내부 store를 읽거나 쓰지 않음; CAW-01 IR 이름은 재검증된 config에서 옴.
- [ ] 트리가 green(컴파일, lint 통과).

## Rollback / safety
- 모든 emit은 CAW-06 소유 경계 경로에 대한 append/upsert다; 중간 실패를 롤백하려면 `store/exports/<thread>/`의
  부분 번들 + 영수증을 삭제하고 재실행 — 멱등성이 재emit을 안전하게 만든다.
- 결코 `validate()`를 우회하지 말 것; 게이트 변경이 필요하면 호출 순서가 아니라 게이트를 바꿔라.
- Export는 **사람 게이트**로 유지됨(RB-042): 이 런북은 adapter를 빌드하지만 `supported` export를 자동 emit하지
  않는다.

## Hand-off
- RB-042 (CLI/MCP)는 `export <target>`을 MCP에 대해서는 **stage 전용** op로, 사람 게이트 뒤의 `--commit` 경로로
  배선해 이 이음새를 호출할 수 있다.
- RB-041 (scout Run)은 Run 중에 export 번들을 **stage**할 수 있지만 `supported`/승격 export를 자동 emit해서는
  결코 안 된다.
- 새 타겟 추가는 이제 config + 포트 구현이지, 결코 이음새 재설계가 아니다.
