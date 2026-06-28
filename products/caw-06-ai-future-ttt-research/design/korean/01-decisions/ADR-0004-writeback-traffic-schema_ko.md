# ADR-0004: Writeback-traffic 스키마 + CAW-01 L0/L1 브리지(공유 저장소가 아니라 export)

- **Status:** proposed (load-bearing)
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:**
  - [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF_ko.md) (source of truth)
  - [../_meta/DOC-CONVENTIONS.md](../_meta/DOC-CONVENTIONS_ko.md)
  - [ADR-0001-product-surface-and-scout_ko.md](ADR-0001-product-surface-and-scout_ko.md) (아티팩트는 Run 출력)
  - [ADR-0002-hypothesis-representation_ko.md](ADR-0002-hypothesis-representation_ko.md) (모든 아티팩트가 status/불확실성 운반)
  - [ADR-0003-experiment-ledger_ko.md](ADR-0003-experiment-ledger_ko.md) (`writeback_observed`가 모델링된 수치를 근거 지음)
  - [../02-research/writeback-traffic-modeling.md](../02-research/writeback-traffic-modeling_ko.md) (이 ADR을 뒷받침하는 연구)
  - [../02-research/ttt-landscape.md](../02-research/ttt-landscape_ko.md) (변형별 write 프로파일)
  - [../02-research/implication-mapping-and-export.md](../02-research/implication-mapping-and-export_ko.md) (export 번들/게이트)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
CAW-06의 **writeback-traffic 스키마** — TTT write traffic을 모델링하는 필드(write bandwidth/volume, 업데이트 빈도,
optimizer-state residency, updated-state residency, updated-weight 재사용, endurance 압력, 그리고
context/update-frequency에 따른 capacity/bandwidth-ratio 이동) — 와 **그것이 CAW-01의 L0/L1 메모리-주석
IR로 공유 저장소가 아니라 export로서 어떻게 브리지되는가**를 결정한다(brief §5, §8). 이 ADR은 brief의 핵심 설계
질문에 답한다: *full syntorch/vLLM 통합 이전에, TTT write traffic을 L0/L1에서 추상적으로 모델링할 수 있는가?* 이
ADR은 CAW-01의 IR(CAW-01이 소유, 별개 제품)을 결정하지 **않고**, 실제 TTT를 규모로 실행하지 않으며(§11), TTT가
실제로 새 메모리 장치를 요구하는지를 정하지 않는다 — 그것은 태그된 `Hypothesis`로 남는다(ADR-0002).

## Context
- **이것이 전략적, load-bearing 브리지다.** brief의 틀: TTT는 CAW-01의 *후보 미래 워크로드 축*이다;
  **write back** 하는 추론(weight 업데이트, gradient, optimizer state, updated-weight 재사용)은 read-우세 LLM
  서빙 프로파일이 포착하지 못하는 **메모리 축**을 만들 수 있다. CAW-06의 일은 그 hypothesis를 **CAW-01의 IR로
  브리지되는 writeback-traffic 스키마**로 바꾸는 것이다(§1, §5).
- **핵심 주장은 전제가 아니라 hypothesis다.** 어떤 변형이 write back 하는지, 그리고 *무엇*을(full weights, adapter,
  fast-weight state, norm 통계, policy, optimizer moment) write back 하는지는 미검증이다
  ([ttt-landscape.md](../02-research/ttt-landscape_ko.md)는 대부분의 셀을 *uncertain*으로 표시). 따라서 단일
  "TTT = writes" 플래그는 틀렸다 — 스키마는 **변형별 필드**를 운반해야 하고, 모든 아티팩트는 ADR-0002 불확실성
  태그를 운반한다.
- **공유 기반 없음.** CAW-01은 자신의 IR과 저장소를 가진 별개 제품이다; CAW-06은 명시적 파일/API 경계를 가로질러
  아티팩트를 *export*하며 절대 CAW-01의 저장소에 쓰거나 공유 레지스트리를 가정하지 않는다(§8; conventions §4, §8).
- **v1은 추상-우선.** Full syntorch/vLLM 통합은 v1의 명시적 비목표다(§11); brief는 writeback을 먼저 L0/L1에서
  추상적으로 모델링하는 것을 명시적으로 허용한다(§5).

## Options considered

### A. 스키마 형태
| Option | Pros | Cons | Fit |
|---|---|---|---|
| **변형별 `wbtraffic.v0` 아티팩트**(fast-weights, update, writeback, `ratio_curve`, assumptions)에 필수 `provenance` + `uncertainty`, 모든 수치는 `null` 기본값 | ≥4개의 구별되는 TTT 메모리 프로파일을 포착; `null`+`basis`가 지어낸 숫자를 금함; 각 필드가 CAW-01 L0 객체로 깔끔히 하강 | 채울 필드가 더 많음; 다수가 `null`로 시작 | **Chosen** |
| 하나의 전역 "TTT writes back" boolean + bandwidth 숫자 | 사소 | 네 개의 서로 다른 메모리 프로파일을 숨김; CAW-01 축을 오염(ttt-landscape §3) | Rejected |
| syntorch/vLLM 트레이스가 존재할 때까지 스키마 보류 | 실제 숫자 | §11(비목표)과 §5(추상적으로 먼저 모델링)에 모순; 지금 아무것도 생산 못 함 | Rejected |

### B. v1에서 write traffic을 어떻게 생산하는가
| Option | Pros | Cons | Fit |
|---|---|---|---|
| **A. 변형 파라미터 + 나열된 가정에서 분석적 L0 추정**(`bytes_per_update`, `write_bw`, `ratio_curve`) | 인프라 없음; 결정론적; 명시적 가정 강제; 지금 export 아티팩트 생산 | 숫자는 *모델링됨*, `hypothesis`/`inconclusive`로 태그해야 함 | **v1 (chosen)** |
| B. 토이 reproduction → 측정된 카운터(ADR-0003) | 최소 run으로 몇몇 숫자를 근거 지음 | 작은 모델만; 여전히 syntorch/vLLM이 아님 | **하나의 변형에 대한 v1 후속** |
| C. Full syntorch/vLLM 트레이스 → Chakra → L0 | 실제 op/tensor/movement 트레이스 | 무거움; 명시적 비목표; CAW-01의 영역 | Deferred |

### C. CAW-01 브리지 메커니즘
| Option | Pros | Cons | Fit |
|---|---|---|---|
| **자기-기술 번들(v1은 file drop; HTTP 스텁)을 export하여 기존 L0 객체(`mem_store` op + writeback `movements` + 가변 `tensors`) + open-question 리스트로 하강** | 새 L0 객체 타입 불필요; 디커플된 경계; CAW-01이 나중에 Option C로 검증 *가능*하되 우리가 막지 않음 | 충실한 하강 테이블 필요; CAW-01이 방향성 read/write 분할을 opt-in해야 함 | **Chosen** |
| CAW-01의 IR / 공유 스키마 레지스트리에 쓰기 | "더 긴밀한" 통합 | 독립성 + no-shared-store(§8) 위반; 릴리스 사이클 결합 | Rejected |
| CAW-01에 raw CAW-06 레코드를 넘김 | 매핑 작업 적음 | 우리 내부 모델을 경계 너머로 누출; 그들의 IR이 아님 | Rejected |

## Decision
**변형별 `wbtraffic.v0` 스키마, v1에서 분석적 L0 추정으로 생산(선택적으로 하나의 토이 reproduction으로 근거),
CAW-01의 기존 L0 객체 + open question으로 하강된 자기-기술 번들로 export — 명시적 파일 경계를 가로질러, 절대 공유
저장소가 아니다.**

1. **스키마 = `wbtraffic.v0`**(CAW-06의 자체 아티팩트; markdown 카드 + JSON). 필수 `provenance`(`claim_id`,
   `source_url`)와 `uncertainty`(ADR-0002 status). 변형별 그룹: `fast_weights`(param_count, dtype,
   `fraction_of_model`), `update`(granularity token|chunk|sequence, `chunk_tokens`, `updates_per_1k_tokens`,
   `writes_optimizer_state`, `optimizer_state_bytes_per_param`), `writeback`(`bytes_per_update`,
   `write_bw_bytes_per_s`, `updated_state_residency` device|near_mem|host, `reuse_distance_tokens`,
   `endurance_writes_per_run`), 핵심 `ratio_curve`(context length × update frequency의 함수로서 read/write
   바이트 + capacity peak), `assumptions`, `open_questions`. **모든 수치는 `null` 기본값**이며 모델링된
   추정(가정 나열)이나 ADR-0003 reproduction에서 채워진다; 중요한 `null`은 `TODO(open-question: …)`가 되지, 절대
   지어낸 숫자가 아니다(conventions §3).

2. **v1 생산 = Option A(분석적 L0 추정), 선택적으로 하나의 Option-B 토이 reproduction으로 근거.** 추정기는
   `bytes_per_update = param_count × dtype_bytes (+ persist되면 optimizer state)`,
   `write_bw = bytes_per_update × update_rate`, 그리고 변형의 파라미터 + 가정에서 `ratio_curve`를 계산하며,
   모든 가정을 방출한다. 수용 기준: 동일 입력으로 재실행 시 결정론적이며 가정을 나열한다. 유용한 export를 방출하기
   위해 CAW-01의 syntorch/vLLM 파이프라인(Option C)을 요구하지 **않는다**. 모델링된 숫자는 실제 병목의
   **evidence가 아니다** — 그것은 검증 가능한 hypothesis이며, 모든 아티팩트에 명시되고, ledger 출처의 *측정된*
   숫자와 구별되게 플래그된다.

3. **L0/L1 하강(공유 저장소가 아니라 export).** TTT writeback은 **새 L0 객체 타입이 필요 없다** — CAW-01의 기존
   **op / tensor / movement** 객체로 표현 가능하다:

   | Writeback field | CAW-01 L0/L1 target | Level |
   |---|---|---|
   | update 이벤트 | `op` with `op_class: "mem_store"` | L0 |
   | `bytes_per_update` | writeback `movement.bytes` (device → residency tier) | L0 |
   | `fast_weights.param_count × dtype` | 가변 `tensor.size_bytes` (업데이트마다 재기록) | L0 |
   | optimizer state | 추가 live `tensor` (capacity peak 확대) | L0 |
   | `updated_state_residency` | `tensor.residency` / `movement.to_tier` (L1에서 near_mem/host) | L0→L1 |
   | `reuse_distance_tokens` | tensor lifetime + 재읽기 movement | L0→L1 |
   | context에 걸친 `update_freq` | 시간 축을 따른 반복 store op | L0 |
   | `ratio_curve` | 파생 롤업 (Σ write `movement.bytes` vs Σ read) | L0 rollup |
   | `endurance_writes_per_run` | tier별 누적 write 롤업 | L1 (proposed) |

   그것이 **추가하는** 것은 **방향/비대칭**이다: CAW-01의 무방향 "rough traffic = Σ movement bytes"는 **read vs
   write** 롤업으로 분할되어 read:write 비율과 context/frequency에 따른 그 드리프트가 일급이 되어야 한다. 그 분할 —
   그리고 `near_mem`이 residency tier인지 op 속성인지, endurance 롤업을 추가할지 — 는 **CAW-01에 대한 export
   요청(open question)이지, 우리가 그들의 IR에 가하는 변경이 아니다**.

4. **번들 + 게이트.** 아티팩트는 `ExportAdapter` → `Caw01WritebackAdapter`를 통해 자기-기술 번들
   (`schema_version`, `producer`, `content_hash`, `provenance`, `boundary:export:caw-01`)로 배송된다; 전송은
   v1에서 file drop(HTTP는 스텁-스왑)이다. 타깃별 게이트(implication-mapping 문서 §4)는 writeback 페이로드나
   타입드 open question을 운반하는 `domain ∈ {memory-centric-systems, hardware}` implication만 받아들인다.
   번들은 **스키마 필드 AND 미지(unknowns)**를 운반한다 — CAW-01은 자신의 IR에 대한 단언이 아니라 질문을 받는다.
   `validate()`가 어떤 write 전에든 게이트를 실행한다; 실패한 export는 로깅되고 발견은 export 가능한 채로 남는다
   (실패는 일급). CAW-06은 절대 CAW-01의 저장소에 쓰지 않는다.

5. **불확실성은 인라인으로 이동한다.** ADR-0002에 따라, `uncertainty` status는 아티팩트에 필수다;
   `hypothesis` status는 open question으로 export되고, 오직 `supported`(사람이 확정한)만 후보 워크로드-축 입력으로
   export되며 여전히 `provisional`로 플래그된다. 모델링된 추정은 단독으로 `supported`가 될 수 없다(모델링 ≠ 측정;
   생성 ≠ evidence).

## Consequences
- **쉬움:** 공개-논문 파라미터 + 가정에서 오늘 유용한 CAW-01 export를 방출하되, CAW-01 인프라 없이 그리고 지어낸
  숫자 없이; 나중에 아티팩트를 재구성하지 않고 하나의 ADR-0003 reproduction의 측정값으로 `null`을 교체.
- **쉬움:** 스키마가 기존 L0 객체로 하강하므로, CAW-01은 나중에 자신의 Option-C 트레이스로 검증할 수 있다 —
  브리지는 릴리스 사이클을 결합하지 않고 전방 호환된다.
- **어려움 / 비용:** 가치가 `assumptions`에 달려 있다(모델링된 `write_bw`는 hypothesis일 뿐); 핵심 방향성
  read/write 분할은 우리가 그들 대신 할 수 없는 open-question 요청을 CAW-01이 *수용*하는지에 달려 있다; CAW-01의
  IR이 진화하면서 하강 테이블을 충실하게 유지하려면 경계에서 주기적 조정이 필요하다.
- **후속:** ADR-0003은 측정된 `writeback_observed` 숫자를 공급한다; ADR-0002는 모든 아티팩트가 운반하는 불확실성
  태그를 공급한다; ADR-0001은 아티팩트를 Run 출력으로 방출하고 export를 사람 검토 뒤로 게이팅한다. Runbook:
  (1) `wbtraffic.v0` 스키마(JSON + 카드, 필수 provenance/uncertainty, 수치 `null` 기본값); (2) 분석적 L0
  추정기(결정론적, 가정 나열); (3) L0-형태 객체 + open-question 리스트를 파일 경계 너머로 직렬화하는
  `Caw01WritebackAdapter`(공유 저장소 없음); (4) 단일 변형에 대해 `bytes_per_update`를 측정하는 하나의 토이
  reproduction(Option B), 실패는 일급으로 로깅.

## Open questions / revisit triggers
- **wbq-001:** 어떤 TTT 변형이 *실제로* optimizer state를 write back 하고 어떤 것이 fast-weight 델타만 하는가
  (Titans / LaCT / TTT-E2E가 다름)? [../08-research-plan/open-questions.md](../08-research-plan/open-questions_ko.md)
  참조.
- **wbq-002:** CAW-01이 "rough traffic"을 방향성 read/write 롤업 + endurance 롤업으로 분할해야 하는가? (CAW-01에
  대한 export 요청 — 그들의 결정.)
- **wbq-003:** CAW-01의 모델에서 `near_mem`은 residency *tier*인가 *op 속성*(compute-at-write)인가?
- **wbq-004:** 실제 TTT 워크로드가 어떤 그럴듯한 tier에든 write-endurance 압력을 만드는가, 아니면 endurance는
  DRAM/HBM residency에 비이슈인가?
- **wbq-005:** `reuse_distance_tokens`를 CAW-01 tensor lifetime처럼 DAG 워크에서 유도할 수 있는가, 아니면 정적
  그래프에 없는 update-frequency 메타데이터가 필요한가?
- **wbq-006:** 모델링된 `write_bw`가 긴 context에서 read bandwidth를 초과한 적이 있는가 — 즉 writeback 축이
  병목인 적이 있는가, 아니면 항상 2차적인가? (전체 브리지를 정당화하는 hypothesis.)
- **Revisit trigger:** 어떤 아티팩트가 모델링된 숫자를 `supported`로 export하거나, 스키마 셀을 확정된 CAW-01
  워크로드 요구사항으로 단언한다면, 멈춰라 — load-bearing "hypothesis, provenance와 함께, 전제가 아님" 불변식이
  깨지는 것이다.
