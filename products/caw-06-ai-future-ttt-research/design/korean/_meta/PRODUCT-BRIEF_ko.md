# PRODUCT BRIEF — AI Future / TTT Research Automation (CAW-06)

> **CAW-06**의 단일 진실 공급원(single source of truth). 모든 디자인 문서 + 런북은 이 브리프와 일관성을
> 유지해야 합니다. 문서가 브리프와 모순되면 브리프가 우선합니다. 미지의 사항은
> `08-research-plan/open-questions.md`에 기록하세요.

## 0. 단 하나의 강한 제약
우리는 여기서 제품을 빌드하지 않습니다. 우리는 AI 빌더가 실행할 상세한 디자인 + 빌드 지침(런북)을
작성합니다 — 구체적인 기능, 방법론, 명명된 도구, 도구별 런북. 코드는 빌더가 작성합니다.

## 1. 정체성 및 독립성
- **제품:** AI Future / TTT Research Automation (CAW-06).
- **한 줄 소개:** AI의 미래를 둘러싼 **기술 스카우팅 → claim 추출 → hypothesis 생성 → 소규모 실험
  계획 → 결과 로깅 → implication mapping**을 자동화합니다 — **TTT (test-time training /
  test-time compute)**를 주제로 삼아 — 공개 연구를 과장 없이 구체적이고 회사와 관련된 실험으로
  연결합니다.
- `ai-workbench` 6개 제품군 내의 **독립적이고 자립적인 제품**입니다. 자체 코어, 데이터, 배포를
  갖습니다. **공유 런타임 기반(substrate)이 없습니다.** 공개 연구를 인제스트하고(CAW-05로부터 TTT
  신호를 import) 명시적 경계를 통해 다른 제품으로 **export**합니다.
- **전략적 프레이밍:** TTT는 시뮬레이션 컨트롤 플레인(CAW-01)을 위한 **후보 미래 WORKLOAD AXIS
  (워크로드 축)**입니다. **writes back**(되쓰기)하는 추론 — weight 업데이트, gradient, optimizer
  state, 쓰기 트래픽, 업데이트된 weight 재사용 — 은 **read-dominant LLM 서빙 프로파일이 포착하지
  못하는 메모리 축**을 만들어낼 수 있습니다. CAW-06의 역할은 그 가설을 검증 가능한 실험과 CAW-01의
  IR로 이어지는 **writeback-traffic 스키마**로 전환하는 것입니다.

## 2. 문제 및 가치
- **문제:** 미래 AI / TTT claim은 불확실하고 과장하거나 과소평가하기 쉽습니다. 이들은 구체적인
  실험이나 메모리 시스템에 미치는 함의와 거의 연결되지 않으며, 실패는 사라집니다.
- **가치 단위:** 하나의 **추적된 연구 스레드(research thread)** — `source → claim → hypothesis →
  소규모 실험 → 결과 (실패 포함) → implication` — 출처와 명시적 불확실성을 포함합니다.
- **왜 분리하는가:** hypothesis 추적 + 소규모 실험 실행 + implication mapping은 그 자체로 하나의
  분야이며, 시뮬레이터(CAW-01), 지식 리포(CAW-02), 레이더(CAW-05)와 구별됩니다.

## 3. 사용자 및 주요 사용 사례
- **페르소나:** Jimmy (연구자/리뷰어), 팀, AI 에이전트(the `ExperimentScout`).
- **주요 사용 사례:**
  1. `ExperimentScout`: TTT 소스 발견 → claim 추출 → hypothesis 생성(불확실성 태깅됨).
  2. 검증 가능한 claim에 대한 **최소 재현 / 토이 실험**을 계획하고, 결과를 로깅(실패 포함).
  3. 발견의 **implication**을 매핑(AI 서비스, 교육, 개발 플랫폼, 모델, 하드웨어, 메모리 중심 시스템).
  4. TTT 변종에 대한 **writeback-traffic 스키마 필드** 생성 → CAW-01의 IR로 export (L0/L1 브리지).
  5. CAW-05로부터 TTT **레이더 신호** import → 연구 스레드 개시.
  6. 검증된 claim+evidence를 CAW-02(지식)로 / 미래 워크로드 open question을 CAW-01로 export.

## 4. 제품 표면(surface)
- **주요:** **ExperimentScout 파이프라인**(스케줄링/트리거됨) + 이를 실행/검사하는 **CLI** 및 **MCP**.
- **출력물:** research-thread 레코드, **소규모 실험 ledger**, hypothesis 카드, implication map,
  **writeback-traffic 스키마** 산출물.
- 모든 표면 뒤에 하나의 제품 코어. 공유 substrate 없음.

## 5. 코어 도메인 (핵심)
- **ExperimentScout 워크플로:** 소스 발견 → claim 추출 → hypothesis 생성 → 최소 재현 계획 → 결과
  로깅 → implication mapping (items/06의 6단계).
- **Hypothesis 표현 (과장 금지):** hypothesis는 명시적 **status/uncertainty**(hypothesis /
  supported / refuted / inconclusive), evidence 링크를 가지며, 결코 hypothesis를 확정된 claim으로
  제시하지 않습니다.
- **소규모 실험 ledger:** config + result + verdict를 갖는 최소 재현 / 토이 실험. **실패는
  일급(first-class)이며 유용하게 유지됩니다**(부정 결과는 버려지지 않고 기록됨).
- **Writeback-traffic 스키마 (CAW-01 브리지):** TTT 쓰기 트래픽을 모델링하는 스키마 필드 — write
  bandwidth, write endurance, near-memory update/최적화, updated-state residency, context/업데이트
  빈도에 따른 capacity/bandwidth 비율 변화 — CAW-01의 L0/L1 메모리 주석 IR에 연결되도록 설계됨.
  *(전체 syntorch/vLLM 통합 이전에 쓰기 트래픽을 L0/L1에서 모델링할 수 있는가? — 핵심 디자인 질문.)*
- **메모리 중심 hypothesis (조사 대상, 확정 아님):** TTT 계열 워크로드는 read-dominant 추론 서빙
  가정과 다른 메모리 디바이스 속성을 필요로 할 수 있습니다.

## 6. 코어 연구 주제 (시드; 5–10개 추적)
추론 중에 weight나 state를 업데이트하는 TTT / test-time training 변종; test-time compute와 그
메모리 트래픽; near-memory / in-memory update; optimizer-state residency; updated-weight 재사용;
writeback bandwidth/endurance 함의. *(첫 연구 run에서 어떤 TTT 변종이 실제로 되쓰기하는지 검증.)*

## 7. 데이터
- CAW-06 자체 저장소. 방향: markdown/JSON + 소규모 실험/결과 ledger(제품군과 일관됨); 대용량 실험
  산출물은 경로(path)로. 모든 항목은 provenance, uncertainty/status, `boundary`를 포함합니다. 구체
  사항은 ADR에서 결정.

## 8. Import / export 경계 (다른 독립 제품으로)
- **Imports:** 공개 연구 소스; **CAW-05로부터의 TTT 레이더 신호**.
- **Exports:** **writeback-traffic 스키마 + 미래 워크로드 open question → CAW-01**; **claim+evidence
  → CAW-02**; (선택적으로) novelty 단서 → CAW-03. 모두 독립 제품 간의 명시적 파일/API 경계 — 공유
  저장소 없음.

## 9. 개방형 통합 인터페이스 (이음새를 설계하되 v1만 빌드)
소스, experiment runner, export 타깃이 재설계 없이 꽂힐 수 있도록 하는 포트 및 어댑터:
- **SourceAdapter:** v1 = arXiv/Semantic Scholar + CAW-05 신호 import; 스텁 = 기타.
- **ExperimentRunnerAdapter:** v1 = 최소 로컬 토이 실험 runner; 스텁 = 외부 컴퓨트 / HW.
- **ExportAdapter:** v1 = CAW-01 (writeback 스키마/open question), CAW-02 (claim); 스텁 = 기타.
- 설정 기반 레지스트리 + 문서화된 스텁 (CAW-03/04/05와 동일한 패턴).

## 10. 내려야 할 결정 (각각 ADR을 가짐)
- 제품 표면 (ExperimentScout 파이프라인 + CLI + MCP)과 출력물.
- **Hypothesis 표현 & 불확실성** (과장 금지). ← 핵심(load-bearing)
- **소규모 실험 ledger** (최소 재현; 실패 유용성; 재현성).
- **Writeback-traffic 스키마** + CAW-01 L0/L1 브리지. ← 핵심(load-bearing)
- 소스/claim 인제스천 (+ CAW-05 import) + 포트.
- Implication mapping.
- 스토리지 + 스케줄링/자동화.
- CAW-01/CAW-02로의 export 경계.

## 11. 비목표 (v1)
- 대규모 학습 또는 실제 TTT의 대규모 실행 (v1 = 최소 재현 / 토이 실험만).
- 미래 AI에 대한 확정된 claim 주장 (모든 것은 명시적 불확실성을 포함).
- 시뮬레이터(CAW-01), 지식 리포(CAW-02), 레이더(CAW-05)가 되는 것 — 이들에게 export함.
- 전체 syntorch/vLLM 통합 (v1은 writeback 트래픽을 먼저 L0/L1에서 추상적으로 모델링할 수 있음).

## 12. 가드레일 (모든 제품 상속)
- 공개 대상 출력물에 회사 기밀 데이터 금지; 법적/ToS 안전 소스만 인제스트.
- 공개 소스 연구를 내부 Samsung/SAIT claim과 절대 혼동하지 않음.
- 소스, claim, evidence, 생성된 결론을 분리하여 유지; 생성된 요약은 evidence가 아님; hypothesis는
  결코 확정된 claim으로 제시되지 않음.
- 넓은 스캐폴딩보다 작은 수직 슬라이스(하나의 검증 가능한 TTT claim → 토이 실험 → implication)를
  선호.
- 자동 스카우팅은 제안/hypothesis 생성임; 전략적 결정의 리뷰어는 Jimmy.
