# 비전 — CAW-06, AI 미래 / TTT 연구 자동화

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [scope-and-non-goals_ko.md](scope-and-non-goals_ko.md)
  - [personas-and-use-cases_ko.md](personas-and-use-cases_ko.md)
  - [../01-decisions/ADR-0001-product-surface-and-scout_ko.md](../01-decisions/ADR-0001-product-surface-and-scout_ko.md)
  - [../01-decisions/ADR-0002-hypothesis-representation_ko.md](../01-decisions/ADR-0002-hypothesis-representation_ko.md)
  - [../01-decisions/ADR-0004-writeback-traffic-schema_ko.md](../01-decisions/ADR-0004-writeback-traffic-schema_ko.md)
  - [../01-decisions/ADR-0008-export-boundaries_ko.md](../01-decisions/ADR-0008-export-boundaries_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## 목적
CAW-06의 북극성(north star)을 명시한다: 불확실한 TTT / 미래-AI **주장을 검증 가능한 실험으로** 전환하고,
"되써넣는(writes back) 추론" 아이디어를 export로서 CAW-01에 가교하는 **writeback-traffic 스키마**로 전환한다. 가치의
단위, 과장 금지(no-overclaim) 입장, 그리고 첫 수직 슬라이스를 정의한다. 어떤 결정도 재정의하지 않으며(ADR 참조), 범위
경계를 열거하지 않고([scope-and-non-goals_ko.md](scope-and-non-goals_ko.md) 참조), 페르소나/활용 사례를 나열하지
않는다([personas-and-use-cases_ko.md](personas-and-use-cases_ko.md) 참조).

## 북극성
미래-AI 및 TTT(test-time training / test-time compute) 주장은 떠들썩하고, 빠르게 변하며, 과장하거나 과소평가하기 쉽다.
이들은 구체적 실험에 좀처럼 연결되지 않으며, *메모리 시스템* 함의에는 거의 결코 연결되지 않는다 — 그리고 실험이 실패하면
결과는 사라진다. CAW-06는 그러한 각 주장을 **검증 가능하고 추적되도록** 만들기 위해 존재한다:

> 공개 주장에서 반증 가능한 **가설**을 생성하고, **최소 재현(minimal reproduction)**을 실행하고, 결과를 기록하며
> (실패 포함), 그 **함의(implications)**를 매핑하고 — 리드 테마에 대해서는 — CAW-01이 후보 미래 워크로드 축으로 다룰 수
> 있는 **writeback-traffic 스키마**를 방출한다.

전략적 베팅(전제가 아닌 *가설*): **되써넣는** 추론 — 가중치 갱신, 그래디언트, optimizer state, 갱신된 가중치 재사용 —
은 **read 우세(read-dominant) LLM 서빙 프로파일이 포착하지 못하는 메모리 트래픽 축**을 만들어낼 수 있다. CAW-06의 임무는
그 베팅을 *검증 가능하게* 만들고, verdict가 아니라 스키마 + open question을 CAW-01에 넘기는 것이다.

## 가치의 단위 — 추적되는 연구 스레드
원자적 산출물은 출처와 명시적 불확실성을 end-to-end로 지니는 **추적되는 연구 스레드 하나**이다:

```
source ──▶ claim ──▶ hypothesis ──▶ small experiment ──▶ result (incl. failure) ──▶ implication
 (S1–S2)   (S4)     (status=         (ledger:            (verdict →                 (ImplicationMap)
            who      hypothesis,      one run =           Evidence →                       │
            asserts) very-low conf)   one entry,          StatusEvent)             ┌───────┴───────┐
                                      pre-registered                               ▼               ▼
                                      decision rule)                          CAW-01 export    CAW-02 export
                                                                            (wbtraffic.v0 +   (claim+evidence,
                                                                             open questions)   not bare hypo)
```

모든 노드는 개별적으로 주소 지정 가능한 레코드이며; `status` / `confidence`를 벗겨낸 채 진전되는 것은 없다
(ADR-0002). 스레드는 실험이 *실패*하더라도 가치가 있다 — `refuted` 또는 `inconclusive` 스레드는 낭비가 아니라
export 가능한 지식이다.

## 세 가지 원칙 (하중을 지탱하는, load-bearing)
| 원칙 | 여기서의 의미 | 강제 수단 |
|---|---|---|
| **과장 금지(No overclaim)** | 가설은 결코 확정된 주장으로 렌더링되거나 export되지 않음; `Claim` / `Hypothesis` / `Evidence`는 별도의 레코드 종류; `generated` 텍스트는 결코 증거가 아니며 status를 결코 승격시킬 수 없음 | [ADR-0002](../01-decisions/ADR-0002-hypothesis-representation_ko.md) |
| **실패는 유용하다(Failures are useful)** | 한 run = 한 append-only 원장 항목; 음성 결과는 기본적으로 보존, 분류, 표면화됨; 실패한 export도 계속 export 가능 | [ADR-0003](../01-decisions/ADR-0003-experiment-ledger_ko.md), [ADR-0008](../01-decisions/ADR-0008-export-boundaries_ko.md) |
| **합치지 말고 가교하라(Bridge, don't merge)** | CAW-01 연결은 공유 store/레지스트리/substrate가 아니라 **파일 경계를 가로지르는 export**; CAW-06는 자기 기술적 번들과 open question을 넘겨줌 | [ADR-0004](../01-decisions/ADR-0004-writeback-traffic-schema_ko.md), [ADR-0008](../01-decisions/ADR-0008-export-boundaries_ko.md) |

## writeback → CAW-01 가교 (전략적 출력)
리드 아티팩트는 변형별 `wbtraffic.v0` 스키마로, v1에서는 **분석적 L0 추정치**로 생산되며(선택적으로 토이 재현 하나로
근거화), CAW-01의 기존 L0 객체로 **내려보낸(lowered)** 자기 기술적 번들로 export된다
(`mem_store` ops + writeback `movements` + 변경 가능한 `tensors`) 더하기 타입이 지정된 open-question 목록.

```yaml
# wbtraffic.v0 (sketch — full schema in ADR-0004). Numerics default null; never invent.
kind: writeback-traffic-schema
ttt_variant: TODO(open-question: which variant; do its writes touch optimizer state? wbq-001)
uncertainty: { status: hypothesis, confidence: very-low }   # modeled ≠ measured; generated ≠ evidence
provenance: { claim_id: ..., source_url: ... }
fields:
  write_bandwidth_bytes_per_s: { value: null, basis: "TODO(open-question)" }
  write_endurance_writes_per_run: { value: null, basis: "TODO(open-question)" }
  updated_state_residency: device | near_mem | host        # TODO(open-question)
  optimizer_state_bytes_per_param: { value: null }
  updated_weight_reuse_distance_tokens: { value: null }
  capacity_bw_ratio_curve: []   # read/write bytes vs context length × update frequency
open_questions: [ wbq-002 directional read/write split, wbq-006 is write ever the bottleneck ]
boundary: export:caw-01
```

CAW-01은 자신의 IR 객체 이름을 소유함(별도 제품) — CAW-06는 경계에서 그것들을 재검증하며 공유 레지스트리를 결코
가정하지 않는다. CAW-01은 **자신의 IR에 대한 단언이 아니라 질문과 스키마를** 받는다.

## 첫 수직 슬라이스 (v1)
폭을 넓히기 전에 **하나의** 검증 가능한 TTT 주장에 대해 전체 스레드를 입증한다(brief §12 — 스캐폴딩보다 작은 수직
슬라이스):

1. **Scout** 하나의 TTT 소스 → `Claim` 추출 → 반증 가능한 `Hypothesis` 하나 생성(`status=hypothesis`,
   `confidence=very-low`, `falsifiability` 필수).
2. 최소 로컬 runner를 통해 **토이 실험** → 사전 등록된 결정 규칙과 reproducibility 레코드(config+seed+env)를 갖춘
   append-only 원장 항목 하나. **실패 경로도 로그한다.**
3. 발견을 도메인 전반에 걸쳐 **implication map**; 생성된 요약을 *generated, 증거 아님*으로 표시.
4. **Writeback 추정:** 변형에 대해 `wbtraffic.v0` 분석적 L0 추정치 하나를 방출.
5. 단일 `ExportAdapter`를 통해 두 이음매(seam)를 **Export**: `wbtraffic.v0` + open question → CAW-01;
   주장+증거 → CAW-02(`status ∈ {supported, refuted, inconclusive}`인 경우에만).

**Done의 모습:** 리뷰어가 소스에서 두 export까지 감사할 수 있는 스레드 하나로, 모든 수치는 원장에서-측정되었거나
명시적 `TODO(open-question)`이며, 어떤 가설도 사실로서 경계를 넘지 않은 상태.

## 성공이 아닌 것
대규모 학습이 아니고, "TTT가 새 메모리를 필요로 한다고 입증된 것"이 아니고, CAW-01/02/05가 되는 것이 아니고, 전체
syntorch/vLLM 통합이 아니다. [scope-and-non-goals_ko.md](scope-and-non-goals_ko.md) 참조.

## 미해결 질문
- 헤드라인 가설 자체 — *writeback이 언젠가 병목이 되는가?* — 는 `wbq-006`이며, 설계상 미해결.
- 전체 등록부(`wbq-001…006`, ingestion, export 계약 질문)는
  [../08-research-plan/open-questions_ko.md](../08-research-plan/open-questions_ko.md) 참조.

## 런북에 대한 함의
- 스레드 store + 세 가지 레코드 스키마를 먼저 구축한다; ADR-0002의 분리 없이는 슬라이스를 구축할 수 없다.
- v1 마일스톤은 폭이 아니라 **위의 단일 수직 슬라이스**다 — 주장 하나, 토이 실험 하나(실패 경로 포함), writeback 추정 하나,
  export 둘.
