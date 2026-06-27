# SOURCE BRIEF — 단일 진실 공급원 (CAW-01 Workbench)

> 이 파일은 CAW-01 Simulation Control Plane의 **정본 제품 비전**입니다.
> `design/` 내의 모든 설계 문서와 런북은 이 브리프와 일관성을 유지해야 합니다.
> 문서가 이 브리프와 모순되면, 브리프가 우선합니다. 여기에 적혀 있거나 공개 리서치로
> 확인된 것을 넘어서 `syntorch`, `LLMServingSim`, `ASTRA-sim` 또는 내부 하드웨어에 관한
> 사실을 지어내지 마세요. 확신이 없으면 `08-research-plan/open-questions.md`에 기록하세요.

---

## 0. 단 하나의 강한 제약

**우리는 제품을 빌드하는 것이 아닙니다. 우리는 AI 빌더가 실행할 설계 + 빌드 지침을 작성하는 것입니다.**

- 모든 빌드 대상 지침은 `design/10-runbooks/`에 구조화된 단계별 형식의 **런북(runbook)**으로 존재합니다
  (`_meta/DOC-CONVENTIONS.md` 참조).
- 설계 문서는 *무엇을* 그리고 *왜*를 기술하고, 런북은 *AI 에이전트가 어떻게 빌드하는지*를 단계별로 기술합니다.
- 설계 작성자는 어떤 프로덕션 코드도 작성하지 않습니다. 런북은 빌드 가이드로서 코드 *스켈레톤/스니펫*을
  포함할 수 있지만, 실제 구현은 나중에 런북을 따르는 AI 빌더가 수행합니다.

---

## 1. 제품 맥락 (상속됨, 모순 금지)

**CAW-01은 독립적인 단독 제품입니다.** 이는 **6개의 별개 제품(CAW-01..06)** 가족 중 하나로,
각각 별도로 구현되고 별도로 배포되며, 제품들 사이에 **공유 런타임 기반(substrate)이 없습니다**.
제품들은 독립적입니다: 공유 레지스트리도, 공유 데이터베이스도, 제품을 가로지르는 공유 신뢰 사다리도
없습니다. 제품들이 협력하는 경우에도, 공통 런타임에 꽂히는 것이 아니라 오직 **독립 제품 간의 내보내기(export)
경계**를 통해서만 협력합니다(§9 참조).

CAW-01(작업명: *Simulation Control Plane*)의 제품 비전은 다음을 확립합니다:

- 이 제품은 **솔버가 아니라 계측기(instrument)**입니다. 도메인 전문가가 설계 공간 축을 저렴하게 *이동/추가/테스트*하고,
  워크로드 가설 → 메모리 디바이스 함의로 이어지는 근거 사슬을 보존하도록 돕습니다.
- 세 개의 **근거 축(evidence axes)**이 시뮬레이션 계층에 공급됩니다:
  - **실측(real measurement)**: 실제 서비스 인프라 → **OTel trace**
  - **합성 실행(synthetic execution)**: **syntorch → Chakra trace**
  - **시뮬레이션(simulation)**: **LLMServingSim + ASTRA-sim** (+ SST)
- 정본 시뮬레이션 흐름: `input feeder -> LLMServingSim -> syntorch -> AstraSim + SST`.
- 가치의 단위는 **하나의 재현 가능한 실험**입니다:
  `(workload, hardware config, simulation config) -> trace -> metric -> DB row -> comparable projection`.
- **메모리 주석이 달린 IR**이 결정적 설계 표면이며, 점진적인 **채움 수준(fill level)**을 가집니다:
  - `L0`: op 수준 그래프 + 텐서 크기/수명 → capacity peak + 대략적 트래픽
  - `L1`: 메모리 계층(tier) 잔존(residency) + 계층별 이동 바이트
  - `L2`: 커널 수준 타일링 스케줄, 커널 내부 재사용, 하드웨어 최적 런타임 로직
  - L0/L1/L2는 별도 스키마가 아니라 **완성도가 다른 동일한 스키마**입니다.
- **신뢰 사다리(trust ladder)**(이 제품 자신의 런에 한정)가 신뢰성을 지배합니다: syntorch 트레이스는 A100/OTel 근거에
  대해 검증되어야 하며, 타일링/파티셔닝 가정은 산문이 아니라 명시적인 코드/전략 id여야 합니다.
- 설계 편향: **챗봇이 아니라 control plane처럼 느껴지게**(런 상태, 근거 완성도,
  열린 질문, 블로커, 아티팩트 준비도, 다음의 정직한 행동).

CAW-01은 자기 제품의 핵심입니다. 이 브리프는 그 UI/UX와 엔진을 상세히 명세합니다.

---

## 2. 제품 표면 (목표)

- **주 제품: Next.js로 만든 웹 애플리케이션.**
- 디자인 시스템 / UI는 **"open design"**(오픈소스 디자인 도구 — 정확한 도구는 `01-decisions/ADR-0006`에서 TBD;
  Penpot, shadcn/ui + Radix, OpenUI 등의 리서치 후보)으로 제작됩니다.
- 동일한 백엔드/엔진은 **CLI** 및 **MCP server**로도 도달 가능해야 합니다 — 이것들은
  **CAW-01 자신의 자동화 표면**으로, 외부 에이전트와 도구가 **이 제품**을 구동할 수 있게 합니다.
  (웹 앱 = 주된 인간 표면; MCP/CLI = 자동화 표면; 여기서 **"skill"** = **이 제품 자신의 operation들에 대한 재사용 가능한
  워크플로**.) 이것들은 어떤 제품 간(cross-product) 기반도 노출하지 않습니다.
  제품 표면 트레이드오프는 `01-decisions/ADR-0001`에서 결정됩니다.

---

## 3. CAW-01 UI: 최상위 셸(shell)

시스템 전역 **상단 내비게이션 바(nav bar)**가 모든 화면 상단에 걸쳐 있으며 메인 메뉴를 담습니다. 예:

- **Simulation** (이 브리프의 초점)
- **Module Design**
- **User**
- **Setting**
- (필요에 따른 기타 표준 앱 수준 메뉴)

**Simulation** 메뉴는 아래에 기술된 메인 작업 화면을 엽니다.

---

## 4. CAW-01 UI: Simulation 화면

레이아웃: **1:9 비율의 좌:우 분할**.

- **왼쪽(1) — Control Panel**: 시뮬레이션 실행, 저장, 런 라이프사이클 관리.
  - 시뮬레이션 런 시작/중지/구성
  - 항목별 저장 및 전체 저장 (Work Tree, §6 참조)
  - 런 상태, 진행도, 근거/프로젝션 판독값
- **오른쪽(9) — Workspace**: 세 개의 협응 **캔버스 패널** (§5 참조).

---

## 5. CAW-01 UI: 세 개의 캔버스 (오른쪽 "9" 워크스페이스)

오른쪽 워크스페이스는 사용자가 주어진 LLM 모델에 대해 **어떤 serving framework**와
**어떤 representation layer**를 붙여 실행할지 선택하고, 그것이 구동될 하드웨어를 설계하게 합니다. 이는
세 개의 협응 캔버스 패널로 구성됩니다:

### Canvas 1 — AI Workload Flow (에이전트 턴 시각화)
- **단일 AI 워크로드 = 하나의 에이전트 턴**의 **흐름**을 캔버스에 시각화합니다.
- 그 턴을 검사 가능한 그래프/흐름(하나의 턴을 구성하는 단계/op/데이터 이동)으로 보여줍니다.
- 이것이 최종적으로 메모리 주석이 달린 **L0 IR**로 매핑되는 "워크로드란 무엇인가" 뷰입니다.

### Canvas 2 — Serving & Representation Layer 선택
- 선택한 LLM 모델에 대해, 사용자는 함께 실행할 **serving framework**와 **representation layer**를
  선택합니다. 후보 / 빌딩 블록:
  - **vLLM** (LLM serving framework)
  - **LLMServingSim** (serving simulator)
  - **ASTRA-sim** (분산 ML 시스템 시뮬레이터; Chakra ET를 소비)
  - **syntorch** (synthetic torch — §7 참조)
- 사용자는 런을 구성합니다: 예) "vLLM으로 서빙하되 torch → syntorch로 교체하여 sub-torch 트레이스를 캡처",
  또는 "순수 시뮬레이션 프로젝션을 위해 LLMServingSim + ASTRA-sim으로 실행".

### Canvas 3 — Hardware Design (물리적 계층)
- 사용자가 전체 물리적 계층을 설계하고 그것을 캔버스에서 **실제 하드웨어처럼 시각화**하여 보는 하드웨어 설계 계층:
  - **chip** (개별 칩 스펙)
  - **die** 구조
  - **package** 구조
  - **tray** 구조
  - **rack** 구조
  - **cluster** 구조
- 사용자는 특정 cluster → rack → tray를 **선택**하고, 특정 package / die / chip으로 드릴다운하여,
  그것의 특정 **컴포넌트/부품(part)**을 선택할 수 있습니다.
- 선택된 부품에 대해 사용자는 **변경, 컴포넌트 추가, 마이크로 수준 변경 적용**(세밀한 입도의 컴포넌트 추가/편집)을 할 수 있습니다.

### 캔버스 간 동작
- 세 패널은 모두 **협응**됩니다(한 곳에서의 선택/변경이 관련된 곳에 반영됨).
- 오른쪽 "9" 워크스페이스는 사용자가 완전히 실행 가능한 실험을 구성하는 곳입니다:
  *워크로드(Canvas 1) × serving/representation(Canvas 2) × 하드웨어(Canvas 3)*.

---

## 6. Work Tree — 세 캔버스 전반의 변경 관리

- 세 패널 중 어느 곳에서든 이루어진 모든 선택과 변경은 변경의 **work tree**로 추적됩니다.
- **항목별 저장**(개별 변경/서브트리 저장)과 **전체 저장**(전체 트리 저장)을 지원합니다.
- work tree는 실험 구성을 위한 버전 관리/브랜칭 모델입니다. (구체적 모델은
  `04-data-layer/work-tree-and-versioning.md`와
  `05-caw01-simulation-control-plane/change-management-worktree.md`에서 설계됩니다.)

---

## 7. syntorch — 정확한 설명 (이것을 넘어 지어내지 말 것)

`syntorch`("synthetic torch")는 제품 소유자가 명시한 다음 속성을 가진 **Python 패키지**입니다:

1. **드롭인(drop-in) torch 프론트엔드.** **vLLM의 torch 계층과 동일하게** 사용할 수 있는 프론트엔드를 노출합니다
   — 즉, vLLM 아래에서 torch를 쓰는 코드가 syntorch를 동일한 방식으로 쓸 수 있습니다.
2. **torch 아래의 모든 것이 커스텀.** torch 프론트엔드 아래의 모든 것 — **커널, 하드웨어 로직 등** —
   은 **커스텀 설계**됩니다. 설계 중인 **커스텀 HW 칩 / 구조 / 아키텍처**에 맞춘 런타임 **알고리즘**
   (**파티셔닝 / 타일링** 포함)을 코드로 표현하게 해줍니다.
   즉, 아직 빌드되지 않은 디바이스 가정이 *실행 가능*해지고, 타일링/파티셔닝이 산문이 아니라 *명시적 코드/전략 id*가 됩니다.
3. **torch 교체를 통한 트레이스 캡처.** 의도된 향후 워크플로: **vLLM 내부에 torch 대신 syntorch를 설치**하여,
   **torch 아래의 모든 트레이스가 캡처**되도록 합니다.
4. **Chakra exporter 계층.** 캡처된 트레이스는 **exporter 계층**에 의해 **Chakra 트레이스**
   (Chakra execution trace / ET — ASTRA-sim이 소비하는 MLCommons 표준)로 변환됩니다.
5. **하드웨어 설계 계층.** syntorch(또는 그 주변 도구)는 다음을 설계할 수 있는 **HW 설계 계층**을 포함합니다:
   개별 **칩 스펙, die 구조, package 구조, tray 구조, rack 구조, cluster 구조** —
   이것이 Canvas 3가 시각화하고 편집하는 대상입니다.

> syntorch는 내부/소유 패키지로 취급됩니다. 공개 리서치(vLLM, ASTRA-sim, Chakra, LLMServingSim)는
> 인용할 수 있지만, 위를 넘어선 syntorch 내부는 날조하면 안 됩니다. 알 수 없는 것은 열린 질문으로 기록하세요.

---

## 8. 트레이스 & 시뮬레이션 파이프라인 (모두가 어떻게 연결되는가)

```
                 ┌─────────────── real measurement axis ───────────────┐
                 │  real service infra  ─────────────────►  OTel trace  │
                 └──────────────────────────────────────────────────────┘
                 ┌─────────────── synthetic execution axis ─────────────┐
   LLM model ──► │  vLLM (torch → syntorch)  ──►  sub-torch trace        │
                 │                            ──►  Chakra exporter ──► Chakra trace
                 └──────────────────────────────────────────────────────┘
                 ┌─────────────── simulation axis ──────────────────────┐
                 │  input feeder ─► LLMServingSim ─► (syntorch) ─► ASTRA-sim (+ SST)
                 └──────────────────────────────────────────────────────┘
                                          │
                                          ▼
              memory-annotated IR (L0 → L1 → L2)  ─►  metrics  ─►  comparable projection
```

- Chakra 트레이스는 ASTRA-sim으로 들어가는 교환 형식(interchange format)입니다.
- 세 축 모두 비교 가능한 프로젝션을 위해 **동일한 메모리 주석 IR**로 정규화됩니다.
- control plane의 역할은 이 축들을 조합 가능, 실행 가능, 검사 가능하게 하고 근거로 보존 가능하게 만드는 것입니다.

---

## 9. 데이터 요구사항 (스토리지 스택은 research/ADR에서 결정)

CAW-01은 **이 제품이 자신의 런을 위해 필요로 하는 것만** 저장하고 관계지읍니다. 공유되는 제품 간
데이터베이스는 없습니다; 아래 모델은 CAW-01 내부에 한정됩니다. 최소한 다음을 저장하고 관계지어야 합니다:

- **런 근거 & 프로비넌스 (린(lean), 이 제품 전용)**: 런에 부착되는 `Evidence, Decision, Assumption, OpenQuestion`.
  CAW-01 자신이 생성한 결론에 대한 불변식: Evidence는 런에 부착된다; 생성된 claim/결론은 그것을 뒷받침하는
  Evidence를 가리켜야 한다; 생성된 요약은 evidence가 아니다.
  **신뢰 사다리(trust ladder)**와 **public/internal/confidential** 경계가 이 제품 자신의 런에 한정되어 여기에 적용됩니다.
- **시뮬레이션 엔티티**: `WorkloadModel, InputTrace, SimulationConfig, SimulationRun, TraceArtifact,
  Metric, ResultSet, ArchitectureProposal, MemoryProductRequirement, MemoryAnnotatedIR, TensorNode,
  DataMovementEdge, FillLevel`.
- **HW 설계 엔티티**: chip/die/package/tray/rack/cluster 계층 + 컴포넌트 + 편집.
- **Work tree 엔티티**: 세 캔버스 전반의 버전 관리된 변경 트리, 항목별 및 전체 저장 포함.

> **범위 밖 — 일반 지식 저장소(general knowledge repository).** 광범위한 지식 모델(단일 런 자신의 근거를
> 넘어 외부 세계의 `Source / Claim / Note / Concept / Interest / OpenQuestion`을 수집하는 것)은
> **별개의 독립 제품(CAW-02)**이며 여기서 모델링하지 않습니다. 이 광범위한 지식 엔티티들을 CAW-01의
> 데이터 모델에 추가하지 마세요. CAW-01은 자신의 evidence/projection/requirement를 내보내기(export) 경계를 통해
> CAW-02(및 기타 독립 제품)로 **내보낼** 수 있지만, 그것들과 스토어를 공유하지는 않습니다. §9a 참조.

리서치하고 결정할 후보 스토리지 기술(`02-research/data-layer-options.md`와
`01-decisions/ADR-0002` 참조): **관계형 SQL**(예: Postgres/SQLite), **vector DB**(임베딩/검색),
HW/IR 그래프를 위한 **graph DB**(Neo4j), 그리고 **markdown 우선 / file 우선 DB**(git 추적
md/json을 진실 공급원으로). 하이브리드/폴리글랏 답안이 허용되며 그럴 가능성이 높습니다. ADR은 선택과
스토어 간 경계를 — 모두 CAW-01 내부에서 — 정당화해야 합니다.

### 9a. 내보내기 경계 (독립 제품 간)

CAW-01은 자신이 생성한 아티팩트 — **evidence, 비교 가능한 projection, 메모리 product requirement** — 를
**내보낼(export)** 수 있어, 다른 **독립** 제품이 그것들을 소비할 수 있습니다. 예를 들어 논문/특허 제품이나
CAW-03가 CAW-01의 projection/requirement를 소비할 수 있고, 일반 지식 저장소(CAW-02)가 CAW-01이 내보낸
evidence를 수집할 수 있습니다. 이것들은 엄격히 **독립 제품 간의 내보내기 경계**입니다: 정의된 아티팩트/인터페이스
계약이지, 공유 레지스트리나 기반(substrate), 데이터베이스가 아닙니다. 각 제품은 별도로 구현되고 별도로 배포된 채로
남습니다.

---

## 10. 설계가 내려야 할 결정 (가정하지 말 것)

리서치하고 결정하세요 (각각 `01-decisions/`에 ADR을 가짐):
- ADR-0001 제품 표면 (웹 앱 주력 + MCP + CLI; 이 제품에서 "skill"이란 무엇인가)
- ADR-0002 데이터 계층 (SQL / vector / Neo4j / md 우선 / 하이브리드) — 린 런 근거 + 프로비넌스, 이 제품 전용
- ADR-0003 프론트엔드 스택 (Next.js 세부: app router, server/client 분할 등)
- ADR-0004 캔버스 렌더링 기술 (노드 그래프 + 3D HW 계층: React Flow/xyflow, Konva, react-three-fiber/three.js 등)
- ADR-0005 트레이스 파이프라인 (syntorch 캡처 → Chakra exporter → ASTRA-sim 통합 경계)
- ADR-0006 디자인 시스템 / "open design" 도구 선택
- ADR-0007 Work-tree 변경 관리 모델 (CRDT? 이벤트 로그? git 유사 객체 모델?)

---

## 11. 가드레일 (상속됨)

- 기밀 회사 데이터를 공개 대상 산출물에 저장하지 마세요.
- 공개 소스 리서치를 내부 Samsung/SAIT 주장과 혼동하지 마세요.
- 소스, claim, evidence, 그리고 생성된 결론을 분리해서 유지하세요.
- 광범위한 플랫폼 스캐폴딩보다 워크플로 의미론을 증명하는 작은 수직 슬라이스를 선호하세요.
- 자동 리서치는 제안/업데이트 생성으로 취급하세요; Jimmy는 전략적 결정의 리뷰어로 남습니다.
