# 마일스톤 및 단계(Milestones & Phases)

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [./dependency-graph_ko.md](./dependency-graph_ko.md), [./risks-and-mitigations_ko.md](./risks-and-mitigations_ko.md), [../01-decisions/ADR-0001-product-surface-and-scout_ko.md](../01-decisions/ADR-0001-product-surface-and-scout_ko.md), [../01-decisions/ADR-0003-experiment-ledger_ko.md](../01-decisions/ADR-0003-experiment-ledger_ko.md), [../01-decisions/ADR-0004-writeback-traffic-schema_ko.md](../01-decisions/ADR-0004-writeback-traffic-schema_ko.md), [../01-decisions/ADR-0008-export-boundaries_ko.md](../01-decisions/ADR-0008-export-boundaries_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## 목적
CAW-06의 빌드를 런북 폴더(`10-runbooks/RB-0XX..RB-4XX`)에 1:1로 매핑되는 단계로 순서화하고, **Milestone 1**을 하나의
end-to-end 수직 슬라이스로 정의한다: 하나의 검사 가능한 TTT claim을 scout → hypothesis → toy 실험(기록됨,
실패 허용) → implication map → CAW-01(별개 제품)로 **export**된 `wbtraffic.v0` analytic estimate를 통해 구동하는 것.
이 문서는 ADR 결정을 재정의하거나, 스키마를 설계하거나(ADR 참조), 날짜를 설정하지 않는다. 각 단계는 중단된
빌드가 깔끔하게 재개되도록 명시적인 **entry**와 **exit** 게이트를 가진다.

## 단계화 원칙
하나의 연구 thread가 end-to-end로 흐를 수 있게 하는 가장 작은 스캐폴딩을 만든 다음 넓혀간다. brief에 따라: 넓은
스캐폴딩보다 작은 수직 슬라이스를 선호한다; failures는 first-class다; export된 어떤 것도 overclaim되지 않는다;
CAW-01 브리지는 공유 저장소가 아니라 **경계를 가로지르는 export**다.

## 단계 ↔ 런북 폴더

| Phase | Runbook prefix | Theme | exit 시점에 존재하는 것 |
|-------|----------------|-------|---------------------|
| P0 Foundations | `RB-0XX` | Store layout, 도메인 레코드, port(어댑터 없음) | ADR-0007에 따른 파일 store; Source/Claim/Hypothesis/Ledger/Implication 스키마; 문서화된 stub을 갖는 `SourceAdapter`/`ExperimentRunnerAdapter`/`ExportAdapter` port 인터페이스 |
| P1 Ingestion + Hypothesis | `RB-1XX` | S1–S5 파이프라인; claim→hypothesis | status/uncertainty를 갖고 실제 source에서 영속화된 하나의 thread(ADR-0002, ADR-0005) |
| P2 Experiment ledger | `RB-2XX` | 사전 등록된 toy 실험 | verdict + reproducibility gate를 갖는 하나의 append-only ledger 항목(ADR-0003) |
| P3 Implication + Writeback | `RB-3XX` | Implication map; `wbtraffic.v0` L0 estimate | 하나의 ImplicationMap + 하나의 자기 기술적 writeback bundle(ADR-0006, ADR-0004) |
| P4 Export | `RB-4XX` | ExportAdapter v1 | `Caw01WritebackAdapter` + `Caw02ClaimAdapter`가 경계 bundle을 방출(ADR-0008) |

> 세 가지 얇은 표면(스케줄/트리거 파이프라인, CLI, MCP — ADR-0001)은 P1이 실행 가능한 코어를 갖는 즉시 도입되어
> P4까지 견고해진다; 그것들은 별도 로직이 아니라 같은 파이프라인 코어를 감싼다.

## Milestone 1 — 증명 슬라이스 (LOAD-BEARING)
**Goal:** 하나의 검사 가능한 TTT claim이 thread 전체를 이동하여 CAW-01을 위한 export된 `wbtraffic.v0` analytic
estimate를 생산한다.

완료 정의(모든 박스가 검사 가능):

```
[ ] 1 Source record imported (arXiv/Sem.Scholar or a CAW-05 signal) with provenance
[ ] 1 Claim extracted, citing the Source, status-stripped of nothing
[ ] 1 Hypothesis (status=hypothesis, calibrated qualitative uncertainty)
[ ] 1 pre-registered decision rule recorded BEFORE the toy run
[ ] 1 toy-experiment ledger entry (append-only) with config+seed+env (reproducibility gate)
       -> verdict in {supported, refuted, inconclusive, error}; a FAILURE is a valid M1 outcome
[ ] generated evidence did NOT promote hypothesis status (evidence cap honored)
[ ] 1 ImplicationMap for the finding, summary explicitly marked generated (not evidence)
[ ] 1 wbtraffic.v0 bundle: analytic L0 estimate, basis marked, open questions attached
[ ] Caw01WritebackAdapter writes the bundle to a boundary path (NO shared store)
```

M1은 toy 실험이 claim을 **refute**하거나 error를 내더라도 명시적으로 성공한다 — thread, 기록된 부정 결과,
그리고 open question을 동반한 estimate가 산출물이지, 긍정적 발견이 아니다.

## 단계별 Entry / exit 게이트

### P0 Foundations
- **Entry:** ADR 0001–0008 수용됨; `_meta` brief 읽음.
- **Exit:** store 디렉터리 `store/{sources,claims,hypotheses,ledger,implications}`가 생성/round-trip됨; 모든
  레코드 종류가 스키마 + validator를 가짐; 세 port가 `NotImplemented` 스타일 가드를 발생시키는 stub 구현으로
  컴파일됨; 트리 green.

### P1 Ingestion + Hypothesis
- **Entry:** P0 exit 충족; 최소 하나의 `SourceAdapter` v1 연결됨.
- **Exit:** 파이프라인 S1→S5가 하나의 source에서 멱등적이고 재개 가능하게 실행됨; ≥1 Source, ≥1 Claim, ≥1
  Hypothesis 생산; Hypothesis가 4-state status(기본 `hypothesis`) + 정성적 uncertainty를 운반; 재실행이 중복을
  만들지 않음(S3에서 dedup). 어떤 레코드도 status/uncertainty가 벗겨진 채 함수 경계를 넘지 않음.

### P2 Experiment ledger
- **Entry:** P1 exit 충족; `ExperimentRunnerAdapter` v1(최소 로컬 runner) 연결됨.
- **Exit:** **사전 등록된** decision rule, 4-값 verdict, 통과하는 reproducibility gate(config+seed+env 캡처)를
  갖는 하나의 `ledger/EXP-XXXX` append-only 항목이 존재; 의도적으로 실패하는 run도 기록되고 부정 결과로 분류되어
  기본적으로 표면화됨.

### P3 Implication + Writeback
- **Entry:** P2 exit 충족(finding이, supported든 아니든, 존재).
- **Exit:** generated-summary 플래그가 설정된 ADR-0006 도메인 전반의 하나의 ImplicationMap; 모든 ADR-0004 필드가
  존재하고(값은 `TODO(open-question)`일 수 있음), basis가 표시되고(analytic 대 toy-grounded), open question이
  열거된 analytic **L0 estimate**로서 생산된 하나의 `wbtraffic.v0` bundle. CAW-01 IR 객체 이름은 가정되지 않고
  CAW-01에 대해 재검증됨.

### P4 Export
- **Entry:** P3 exit 충족; ExportAdapter 레지스트리 config 존재.
- **Exit:** `Caw01WritebackAdapter`가 writeback bundle + open question을 구성된 경계 경로로 방출; `Caw02ClaimAdapter`가
  claim+evidence를 방출; 문서화된 stub(`Caw03Novelty`, …)이 등록되었으나 비활성; 어떤 어댑터도 다른 제품의
  내부 store를 읽거나 쓰지 않음. M1 체크리스트 완전히 green.

## wbtraffic.v0 필드 커버리지 게이트 (P3)
export된 bundle은 이 필드들을 운반해야 한다(ADR-0004에 따라); 알 수 없는 수치는 `TODO(open-question)`이며 결코
지어내지 않는다:

```yaml
wbtraffic.v0:
  variant: <ttt-variant-id>
  basis: analytic-L0 | toy-grounded-L0
  write_bandwidth: TODO(open-question)
  write_endurance: TODO(open-question)
  near_memory_update: TODO(open-question)
  updated_state_residency: TODO(open-question)
  capacity_bw_ratio_over_context_freq: TODO(open-question)
  open_questions: [ ... ]
  caw01_ir_targets: <re-verified names, owned by CAW-01>
```

## M1 너머 (이후 마일스톤, 여기서 범위 아님)
- M2: 폭 — 5–10개 추적된 TTT 테마; 다수의 SourceAdapter.
- M3: estimate를 `analytic-L0`에서 `toy-grounded-L0`로 끌어올리기 위한 선택적 toy-reproduction grounding.
- M4: 형제 제품이 요청함에 따라 추가 export stub 활성화.

## 미해결 질문(Open Questions)
- syntorch/vLLM 통합 이전에 write traffic을 L0/L1에서 모델링할 수 있는가? `../08-research-plan/open-questions_ko.md`
  참조(및 ADR-0004).
- 어떤 TTT 변형이 실제로 write back하는가? 첫 연구 run에서 검증.

## 런북에 대한 함의
- 런북에 단계별 번호를 부여(`RB-0XX`..`RB-4XX`); M1은 RB-1XX..RB-4XX를 관통하는 acceptance 척추다.
- 각 런북의 Acceptance criteria는 위의 대응하는 단계 exit 게이트를 참조하고 트리를 green으로 유지해야 한다.
