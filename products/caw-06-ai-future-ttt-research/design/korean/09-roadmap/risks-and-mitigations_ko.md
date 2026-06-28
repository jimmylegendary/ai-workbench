# 리스크 및 완화책(Risks & Mitigations)

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [./milestones-and-phases_ko.md](./milestones-and-phases_ko.md), [./dependency-graph_ko.md](./dependency-graph_ko.md), [../01-decisions/ADR-0002-hypothesis-representation_ko.md](../01-decisions/ADR-0002-hypothesis-representation_ko.md), [../01-decisions/ADR-0003-experiment-ledger_ko.md](../01-decisions/ADR-0003-experiment-ledger_ko.md), [../01-decisions/ADR-0004-writeback-traffic-schema_ko.md](../01-decisions/ADR-0004-writeback-traffic-schema_ko.md), [../01-decisions/ADR-0008-export-boundaries_ko.md](../01-decisions/ADR-0008-export-boundaries_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## 목적
CAW-06에 특화된 전달 및 무결성 리스크와, ADR에 이미 존재하는 구체적인 설계 수준 완화책을 목록화한다(그리하여
리스크가 선의가 아니라 구조에 의해 통제되도록). 이 문서는 새로운 메커니즘을 도입하지 않는다 — 각 리스크를
그것을 담는 결정으로 가리킨다. 심각도는 정성적이다; 지어낸 확률 없음.

## 리스크 등록부

| ID | Risk | Likelihood | Impact | Owning mitigation |
|----|------|-----------|--------|-------------------|
| RK-1 | 불확실한 TTT의 overclaim(hypothesis가 확정된 것으로 제시됨) | High | High | Status lifecycle + evidence cap (ADR-0002) |
| RK-2 | Toy 실험이 실제 writeback traffic을 측정하지 못함 | High | High | estimate basis + open question 표시 (ADR-0004) |
| RK-3 | CAW-01 IR drift(객체 이름/레벨 변경) | Medium | High | 이름 재검증, export 경계만 (ADR-0004, ADR-0008) |
| RK-4 | 실제/대규모 training으로의 scope creep | Medium | High | v1 = 최소 reproduction만 (brief §11) |
| RK-5 | 빌드 예산 초과 / 넓은 스캐폴딩 | Medium | Medium | 수직 슬라이스 M1 우선 (ADR-0001, brief §12) |
| RK-6 | 부정 결과 유실 / 억제됨 | Medium | Medium | Failures first-class, 기본 표면화 (ADR-0003) |
| RK-7 | Provenance / 경계 누출(source 대 generated) | Low | High | 분리된 레코드 종류 + 경계 태그 (ADR-0002, ADR-0007) |

## 상세 및 완화책

### RK-1 — 불확실한 TTT의 overclaim
핵심 위험: 생성된 hypothesis가 하류에서 사실로 읽히는 것, 특히 일단 export되고 나면.
- **완화책(구조적):** 세 가지 분리된 레코드 종류(Source / Claim / Hypothesis); `hypothesis`를 기본으로 하는
  4-state 가역적 status; 보정된 *정성적* uncertainty; **엄격한 evidence cap** — generated evidence는 결코 status를
  승격할 수 없음. 어떤 것도 status/uncertainty가 벗겨진 채 경계를 넘지 않음(ADR-0002).
- **Check:** M1 게이트 "generated evidence did NOT promote status"; export bundle은 status + uncertainty 필드를
  운반하거나 검증이 실패함.
- **Residual:** 인간 독자가 `supported`를 `proven`으로 오독함 — Jimmy가 전략적 리뷰어다(brief §12).

### RK-2 — Toy 실험이 실제 writeback을 측정하지 못함
toy 규모의 최소 reproduction은 production write bandwidth/endurance를 반영하지 못할 수 있다; 위험은 L0 estimate를
측정으로 취급하는 것이다.
- **완화책:** `wbtraffic.v0`는 명시적 `basis` 필드(`analytic-L0` 대 `toy-grounded-L0`)를 갖는 **analytic L0
  estimate**로 생산됨; 모든 알 수 없는 수치는 `TODO(open-question)`이며 결코 날조되지 않음; open question은 export된
  bundle 내부로 이동함(ADR-0004).
- **Check:** P3 필드 커버리지 게이트; export는 `basis`나 `open_questions`가 누락된 bundle을 거부함.
- **Residual:** L0 모델 자체가 틀림 — 상시 open question "syntorch/vLLM 이전에 writeback을 L0/L1에서 모델링할 수
  있는가?"로 표시됨.

### RK-3 — CAW-01 IR drift
CAW-01은 자신의 IR 객체 이름과 L0/L1 레벨을 소유하는 별개 제품이다; 그것들은 우리 밑에서 바뀔 수 있다.
- **완화책:** CAW-06는 export 경계를 가로질러 자기 기술적 bundle을 CAW-01의 기존 L0 객체 + open question **위로**
  lowering함; IR 이름은 export 시점에 재검증되며 결코 하드 결합되지 않음; 공유 저장소 없음(ADR-0004, ADR-0008).
- **Check:** `Caw01WritebackAdapter`는 자신이 대조한 `caw01_ir_targets`와 어느 버전/source에 대해 재검증했는지를
  기록함.
- **Residual:** export 사이의 조용한 rename — 이름을 캐시하지 않고 export마다 재검증으로 완화.

### RK-4 — 실제 training으로의 scope creep
TTT 작업은 실제 대규모 training run으로의 확장을 유혹한다.
- **완화책:** brief §11 non-goal — v1은 최소 reproduction / toy 실험만; `ExperimentRunnerAdapter`는 외부
  compute/HW를 v1 작업이 아니라 문서화된 stub으로 유지함.
- **Check:** 실제 규모 training을 제안하는 어떤 런북도 범위 밖이며 리뷰에서 거부되어야 함.

### RK-5 — 빌드 예산 초과
넓은 수평적 스캐폴딩은 어떤 thread가 end-to-end로 흐르기도 전에 예산을 태운다.
- **완화책:** 하나의 파이프라인 코어 + 세 가지 얇은 표면(ADR-0001); 폭을 넓히기 전에 M1 수직 슬라이스 전달;
  단계 게이팅(마일스톤 문서 참조).
- **Check:** P 너머 작업 전에 M1 체크리스트 green; 표면은 같은 코어를 감싸며 로직 중복 없음.

### RK-6 — 부정 결과 유실
실패는 가장 재사용 가능한 산출물이며 가장 떨어뜨리기 쉽다.
- **완화책:** 하나의 run = 하나의 append-only ledger 항목; 사전 등록된 decision rule로 게이팅된 4-값 verdict;
  부정 결과는 기본적으로 보존, 분류, 표면화됨(ADR-0003). M1은 refuted/errored 결과를 성공으로 명시적으로 수용함.
- **Check:** ledger는 append-only; 실패하는 toy run도 여전히 완전하고 표면화된 항목을 생산함.

### RK-7 — Provenance / 경계 누출
공개 source 연구를 내부 claim과, 또는 생성된 요약을 evidence와 혼동할 위험.
- **완화책:** 분리된 레코드 종류; 모든 엔티티가 provenance, uncertainty/status, `boundary` 태그를 운반함(ADR-0002,
  ADR-0007); ImplicationMap 요약은 **generated, not evidence**로 명시적으로 표시됨(ADR-0006); 가드레일 §12.
- **Check:** validator는 `boundary`/provenance가 누락된 export를 거부함; map에 generated-summary 플래그 필수.

## Watch 트리거 (이 문서를 재검토할 때)
- 어떤 TTT 변형이 write back하지 *않는* 것으로 판명됨 → RK-2와 seed 테마 재검토.
- CAW-01이 IR 변경을 발표함 → RK-3 즉시 재검증.
- 실제 training을 실행하라는 어떤 요청 → RK-4를 Jimmy에게 에스컬레이션.

## 미해결 질문(Open Questions)
- syntorch/vLLM 통합 이전 writeback의 L0/L1 모델 가능성 — `../08-research-plan/open-questions_ko.md` 참조(RK-2 residual).

## 런북에 대한 함의
- 각 런북의 `Rollback / safety` 섹션은 그것이 건드리는 리스크와 그것을 담는 게이트를 명명해야 한다.
- Export 런북(P4)은 export 시 재검증(RK-3)과 bundle 검증(RK-1, RK-2, RK-7)을 구현해야 한다.
