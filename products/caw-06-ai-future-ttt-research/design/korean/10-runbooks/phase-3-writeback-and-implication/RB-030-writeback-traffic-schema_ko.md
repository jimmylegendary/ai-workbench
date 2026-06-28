# RB-030: `wbtraffic.v0` 스키마 + 분석적 L0 추정기 + CAW-01 L0 lowering 구현

- Status: ready
- Phase: phase-3-writeback-and-implication
- Depends on: [RB-001 (store 레이아웃 + 레코드 스키마), RB-002 (ExportAdapter stub 포함 포트), RB-02X (experiment ledger 항목 — finding이 존재함)]
- Implements design:
  - [../../05-ttt-research-core/writeback-traffic-schema.md](../../05-ttt-research-core/writeback-traffic-schema_ko.md)
  - [../../01-decisions/ADR-0004-writeback-traffic-schema.md](../../01-decisions/ADR-0004-writeback-traffic-schema_ko.md)
  - [../../01-decisions/ADR-0002-hypothesis-representation.md](../../01-decisions/ADR-0002-hypothesis-representation_ko.md) (불확실성은 inline으로 함께 이동)
  - [../../01-decisions/ADR-0008-export-boundaries.md](../../01-decisions/ADR-0008-export-boundaries_ko.md) (`Caw01WritebackAdapter`가 유일한 이음새)
  - [../../09-roadmap/milestones-and-phases.md](../../09-roadmap/milestones-and-phases_ko.md) (P3 종료 게이트; M1 wbtraffic 라인)
- Produces:
  - `wbtraffic.v0` 레코드 스키마 + validator (JSON 트윈 + 마크다운 카드 writer)
  - `AnalyticL0Estimator` (결정론적; assumptions를 방출)
  - `Caw01Lowering` (lowering 테이블 → L0 형태 객체; CAW-01 이름 재검증) + 자기기술(self-describing) export 번들 빌더

## Objective
빌더가 하나의 TTT variant의 공개 논문 파라미터에 명시적인 assumption 집합을 더해, CAW-06 자체 store에
영속화된 `wbtraffic.v0` 아티팩트(JSON + 마크다운 카드)를 생성할 수 있어야 한다. 이때 `provenance`,
`uncertainty`, `basis`는 **필수**이고, **모든 수치는 기본값이 `null`**이며, 모든 모델링 입력은
`assumptions` 아래에 나열되고, 알 수 없지만 필요한 수치는 `TODO(open-question: …)`로 렌더링되어야 한다 — 결코
지어내지 않는다. `AnalyticL0Estimator`는 모델링된 수치를 결정론적으로 채운다(동일 입력 → 바이트 단위로 동일한
출력). 이후 `Caw01Lowering` 단계가 이 아티팩트를 L0 형태 객체들(CAW-01의 `op`/`tensor`/`movement`)
**더하기 open-question 목록**으로 구성된 **자기기술 export 번들**로 직렬화하며, 직렬화 시점에 CAW-01 객체
이름을 재검증한다. "Done"의 의미 = 하나의 variant에 대해 번들이 디스크에 존재하고, 기본값으로
`basis: modeled` + `uncertainty: hypothesis`이며, read-side 및 기타 미지값은 타입이 지정된 open question으로
실리고 content hash가 있으며 — 어떤 CAW-01 store에도 값이 쓰이지 않은 상태. 이 런북은 스키마, 추정기, lowering을
구축한다; 실제 경계 파일 드롭은 RB-4XX (`Caw01WritebackAdapter`)다.

## Preconditions
- [ ] P2 종료 충족: `provenance.claim_id` / `thread_id`를 anchor할, 네 값짜리 verdict를 가진 `ledger/EXP-XXXX`
      항목 또는 status 태그가 붙은 hypothesis 형태의 finding이 최소 하나 존재. **refuted/inconclusive/error**
      finding도 유효한 anchor다(실패도 유용).
- [ ] Store 레이아웃 `store/{sources,claims,hypotheses,ledger,implications}`이 존재(ADR-0007); 이 런북은
      새로운 최상위 디렉터리를 추가하지 않는다 — 아티팩트는 생성 thread 아래 / ADR-0007에 따른 `store/writeback/`에 위치.
- [ ] `ExportAdapter` 포트가 문서화된 stub과 함께 존재(RB-002); 구체적인 `Caw01WritebackAdapter`는 아직
      필요하지 않다(그것은 RB-4XX).
- [ ] 스키마 명세와 ADR-0004를 읽었다;
      [../../02-research/ttt-landscape.md](../../02-research/ttt-landscape_ko.md)의 variant별 분류 체계가 어떤
      variant가 무엇을 writeback하는지에 대한 출처다 — 여기서 다시 결정하지 말고 상호 링크하라.
- [ ] CAW-01은 **별도 제품**으로 취급한다: 그 IR 객체 이름은 사용 전 재검증 대상이며, 이 레포에서는 결코
      권위를 갖지 않고, 공유 store도 없다.

## Steps

### 1. `wbtraffic.v0` 레코드 스키마 정의
- **Do:** 명세와 정확히 일치하는 스키마(JSON Schema 또는 동등한 타입 모델)를 생성한다: 최상위
  `schema_version` (`"wbtraffic.v0"`), `thread_id`, `ttt_variant`, **필수** `provenance{claim_id,
  source_url}`, **필수** `uncertainty` (enum `hypothesis|supported|refuted|inconclusive`, 기본값
  `hypothesis`), `basis` (`modeled|measured|mixed`, 기본값 `modeled`), 그리고 그룹 `fast_weights`, `update`,
  `writeback`, `ratio_curve[]`, `assumptions[]`, `open_questions[]`. **모든 수치 필드를 nullable로, 기본값
  `null`로** 만든다 (writeback-traffic-schema.md §"the schema").
- **Verify:** 스키마 검증이 `provenance` 또는 `uncertainty`가 없는 레코드를 거부; 수치가 전부 `null`인 레코드는
  허용; JSON 트윈 내부에서 수치가 문자열 리터럴 `"TODO(open-question: …)"`로 설정된 레코드는 거부(`TODO`
  마커는 마크다운 카드 / `open_questions`에 위치하고, JSON 수치는 `null`로 유지).

### 2. validator 구현 (overclaim 금지 불변식)
- **Do:** 다음을 강제하는 `validate(record)`를 추가한다: (a) `provenance.claim_id`와 `provenance.source_url`이
  비어 있지 않음; (b) `uncertainty` 존재; (c) **`modeled`/`mixed`만으로 된 아티팩트는 절대 `uncertainty:
  supported`를 가질 수 없음**(생성/모델링됨 ≠ 증거 — 강력한 evidence cap, ADR-0002 + 스키마 명세 §"v1
  production"); (d) 수치가 채워졌다면 그것이 파생된 입력들이 `assumptions[]`에 반드시 나타나야 함.
- **Verify:** 단위 검사: `{basis: modeled, uncertainty: supported}`는 "modeled cannot be supported"라는 명확한
  에러로 검증 실패; `supported`가 허용되기 전에 `{basis: measured}`가 요구됨; `assumptions`가 빈 채로 채워진
  `write_bw_bytes_per_s`는 실패.

### 3. 마크다운 카드 writer 구현 (JSON ↔ 카드 트윈)
- **Do:** 하나의 레코드로부터 JSON 트윈과 사람이 읽는 마크다운 카드를 모두 방출하는 serializer를 작성한다. 카드는
  알 수 없지만 필요한 수치를 `TODO(open-question: <id>)`로 렌더링해야 하며(conventions §3), `basis` +
  `uncertainty`를 헤더에 출력해 독자가 "modeled, hypothesis"를 놓칠 수 없게 한다.
- **Verify:** Round-trip: 파싱된 레코드로부터 재생성된 카드+JSON이 원본과 바이트 단위로 동일; `open_questions`에
  플래그된 `null` 수치는 카드에서 `TODO(open-question: …)` 라인으로 렌더링됨.

### 4. `AnalyticL0Estimator` 구현 (Option A, 결정론적)
- **Do:** variant의 `fast_weights.param_count`, `dtype`, optimizer 플래그
  (`writes_optimizer_state`, `optimizer_state_bytes_per_param`), `update.updates_per_1k_tokens`, 그리고 명시적
  `tokens_per_s` assumption이 주어지면 다음을 계산한다 (writeback-traffic-schema.md §"v1 production"):
  ```
  bytes_per_update     = param_count * dtype_bytes
                         (+ param_count * optimizer_state_bytes_per_param  if writes_optimizer_state)
  update_rate          = updates_per_1k_tokens / 1000
  write_bw_bytes_per_s = bytes_per_update * update_rate * tokens_per_s
  ratio_curve[i]       = per (context_tokens, update_freq):
                           write_bytes = bytes_per_update * (updates over that context)
                           read_bytes  = null  -> open_question (read-side model: KV + weight reads)
                           capacity_peak_bytes = live(fast_weights + optimizer_state)
  ```
  **모든** 입력(dtype, optimizer 선택, update rate, tokens_per_s, model size)을 `assumptions[]`에 append한다.
  `basis: modeled`, `uncertainty: hypothesis`로 설정한다. variant가 제공하지 않은 입력은 `null`로 남기고
  대응하는 `wbq-***` id를 `open_questions`에 추가한다(예: `wbq-001` optimizer-state, `wbq-006`
  write_bw-vs-read).
- **Verify:** 동일 입력으로 추정기를 재실행하면 바이트 단위로 동일한 JSON을 산출(결정론성 — ADR-0004
  acceptance). `tokens_per_s`를 생략하면 `write_bw_bytes_per_s`가 `null`로 유지되고 `open_questions`에 항목이
  추가됨; 추정기는 결코 숫자를 지어내지 않음. 모든 `ratio_curve` 행의 `read_bytes`는 기록된 open question과
  함께 `null`(read-side model은 v1 범위 밖).

### 5. CAW-01 L0 lowering 구축 (기존 객체 + open questions로 export)
- **Do:** lowering 테이블(writeback-traffic-schema.md §"The CAW-01 L0/L1 bridge")을 사용해
  `Caw01Lowering(record) -> {payload, open_questions}`를 구현한다: update 이벤트 → `op{op_class: "mem_store"}`;
  `bytes_per_update` → writeback `movement.bytes`; `param_count×dtype` → 변경 가능 `tensor.size_bytes`; optimizer
  state → 추가 live `tensor`; `updated_state_residency` → `tensor.residency`/`movement.to_tier`;
  `reuse_distance_tokens` → tensor lifetime + re-read movements; update-freq → 반복되는 store ops;
  `ratio_curve` → 방향성 Σwrite-vs-Σread rollup; `endurance_writes_per_run` → tier별 rollup (L1, 제안됨).
  방향성 split / `near_mem` tier / endurance 요청은 그들의 IR을 편집하는 것이 아니라 **CAW-01에 대한 타입 지정
  open question**(`wbq-002`, `wbq-003`, `wbq-004`)으로 싣는다. 대상 객체 이름은 "owned by CAW-01; re-verify
  before serializing; not authoritative here"로 주석 처리된 단일 `CAW01_IR_NAMES` 상수에서 가져온다.
- **Verify:** Lowering 출력이 세 가지 객체 종류(`op`/`tensor`/`movement`)만 포함 — 새로운 L0 객체 타입을
  지어내지 않음. `open_questions` 목록이 비어 있지 않고 방향성 read/write-split 요청을 포함. golden-file 테스트가
  lowered 형태를 고정; 코드 주석이 이름을 사용 전 재검증 대상으로 표시.

### 6. 자기기술 export 번들 구축
- **Do:** `build_bundle(record)`를 구현해
  `{ schema_version, producer: "caw-06", content_hash, provenance, boundary: "export:caw-01",
  payload: <lowered L0 objects>, open_questions }`를 산출한다 (ADR-0004 §4). `content_hash`는 정규화된 payload에
  대한 것이다. 어떤 CAW-01 위치에도 쓰지 말 것 — CAW-06 자체 store / staging 경로에만 쓴다; 경계 파일 드롭은
  RB-4XX다.
- **Verify:** 번들이 스키마 필드 **와** 미지값(open questions 존재)을 **둘 다** 실음. 동일 입력에 대해
  `content_hash`가 안정적. CAW-06 자체 트리 밖의 어떤 파일시스템 경로도 건드리지 않음(테스트에서 assert).

### 7. 필드 커버리지 게이트 연결 (P3 종료)
- **Do:** milestones-and-phases.md §"wbtraffic.v0 field coverage gate"의 P3 필드들(`variant`, `basis`,
  `write_bandwidth`, `write_endurance`, `near_memory_update`, `updated_state_residency`,
  `capacity_bw_ratio_over_context_freq`, `open_questions`, `caw01_ir_targets`)이 모두 존재함을 assert하는
  `coverage_check(bundle)`을 추가한다. 미지 수치는 누락되거나 지어내지지 않고 `TODO(open-question)`로 표시된다.
- **Verify:** 필수 필드가 누락된 번들은 검사 실패; 모든 필드가 존재하는 번들(수치는 `TODO(open-question)`일 수
  있음)은 통과; `basis`가 `analytic-L0`로 읽힘(측정값이 병합된 경우에만 `toy-grounded-L0`).

## Acceptance criteria
- [ ] `wbtraffic.v0` 스키마 + validator 존재; `provenance` 또는 `uncertainty`가 없는 레코드는 거부; 수치가
      전부 `null`인 레코드는 허용.
- [ ] **강력한 evidence cap 준수:** `modeled`/`mixed` 아티팩트는 절대 `uncertainty: supported`가 될 수
      없음(테스트가 증명). 기본값은 `basis: modeled` + `uncertainty: hypothesis`.
- [ ] `AnalyticL0Estimator`는 결정론적(동일 입력 → 바이트 단위 동일 출력)이며 **모든** assumption을 방출; 생략된
      입력은 `null`로 유지되어 open question이 됨; 어떤 숫자도 지어내지 않음.
- [ ] `ratio_curve` read-side는 `null` + open question(read model은 v1 범위 밖); 모델링된 `write_bw`는 측정된
      병목이 아니라 hypothesis로 라벨링됨(`wbq-006`).
- [ ] `Caw01Lowering`은 `op`/`tensor`/`movement` 객체만 방출(새 L0 타입 없음)하고, 사용 전 재검증 상수에서
      이름을 가져오며, 방향성 split / `near_mem` / endurance 항목을 IR 편집이 아니라 **CAW-01에 대한 타입 지정
      open question**으로 싣는다.
- [ ] `build_bundle`이 자기기술 번들(`schema_version`, `producer`, `content_hash`, `provenance`, `boundary`,
      `payload`, `open_questions`)을 CAW-06 자체 store 내부에만 쓰도록 산출; **CAW-06 밖의 어떤 경로도 건드리지
      않음**(공유 store 없음).
- [ ] 하나의 variant에 대해 P3 필드 커버리지 게이트 통과; 트리가 green(컴파일, lint).

## Rollback / safety
- 아티팩트와 번들은 CAW-06 자체 store 안의 순수 출력이다; 되돌리려면 staged된 `wbtraffic.v0` JSON/카드와 번들
  파일을 삭제 — 어떤 형제 제품에서도 변경되는 것이 없다(단방향, 공유 store 없음). 그것이 참조하는
  ledger/hypothesis는 append-only이며 손대지 않는다.
- 빌드 시점에 CAW-01 객체 이름을 재검증할 수 없다면 **추측하지 말 것**: 이름을 재검증 상수에 유지하고 잠정적으로
  표시하며, 방향성 split 요청은 open question으로 남긴다. 권위 있는 것처럼 이름을 직렬화하지 말 것.
- 재검토 트리거(ADR-0004): 어떤 코드 경로라도 모델링된 숫자를 `supported`로 export하게 하거나, 스키마 셀을 확정된
  CAW-01 요구사항으로 단정하면 — 멈춰라. "hypothesis, with provenance, not a premise" 불변식이 깨지고 있다.

## Hand-off
- RB-4XX (`Caw01WritebackAdapter`)는 검증된 자기기술 번들(L0 형태 payload + open questions + content hash)이
  존재한다고 가정할 수 있고, 그것을 설정된 경계 경로에 드롭하기만 하면 된다 — 단방향, 공유 store 없음, 사람 게이트.
- RB-031 (ImplicationMap)은 CAW-01로 향하는 `memory-centric-systems`/`hardware` implication에
  `writeback_payload_ref`로 설정할 `wbtraffic.v0` 아티팩트 id가 존재한다고 가정할 수 있다.
- 이후의 Option-B toy 재현은 단일 `null`을 측정된 `bytes_per_update`로 덮어쓰고, 그 필드의 `basis`를
  `measured`로 뒤집고(아티팩트는 `mixed`가 됨), 그것을 구분되게 플래그할 수 있다 — 아티팩트를 재구성하지 않고.
  측정값은 추정치에 근거를 제공할 뿐, 아티팩트를 증거로 바꾸지 않는다.
