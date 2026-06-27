# 페르소나 & 유스케이스 — CAW-01

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [vision_ko.md](./vision_ko.md), [scope-and-non-goals_ko.md](./scope-and-non-goals_ko.md), [../05-caw01-simulation-control-plane/overview_ko.md](../05-caw01-simulation-control-plane/overview_ko.md)
- **Source of truth:** ../_meta/SOURCE-BRIEF_ko.md

## 목적

CAW-01이 누구를 위해 봉사하는지, 그리고 제품이 반드시 지원해야 하는 구체적인 워크스루(walkthrough)를
정의한다. 각 유스케이스는 세 개의 캔버스, 컨트롤 패널, 워크 트리를 실행하며, 보존된 증거 아티팩트로 끝난다.

## 페르소나

| 페르소나 | 목표 | CAW-01에서 필요한 것 |
| --- | --- | --- |
| **도메인 전문가 (Jimmy)** | 설계 공간 축을 옮기고/추가하고/테스트; 메모리 디바이스 함의를 방어 | 워크로드 × 서빙 × 하드웨어의 빠른 조합; 비교 가능한 projection; 증거 추적 |
| **워크로드 / 네트워크 팀** | 워크로드가 메모리/트래픽에 어떻게 스트레스를 가하는지 이해 | Canvas 1 agent-turn 뷰; L0 용량 피크 + 트래픽 롤업 |
| **메모리 디바이스 팀** | 워크로드 압력을 디바이스 요구사항으로 전환 | 실행으로부터 도출된 `MemoryProductRequirement` / `ArchitectureProposal` |
| **AI 빌더 에이전트** | 런북으로부터 CAW-01을 빌드/확장; 이후 MCP/CLI로 구동 | 안정적인 `@caw/core` 계약; MCP 도구; 결정론적 런북 |
| **리뷰어 (Jimmy)** | 전략적 결론을 승인 | 증거 대 생성된 결론의 분리; 신뢰 사다리(trust-ladder) 상태 |

## 유스케이스

### UC-1 — 첫 번째 비교 실험 조합 및 실행
1. **Canvas 2**에서 LLM 모델을 고르고, ServingSim 스타일 경로와 syntorch 스타일 경로를 선택한다.
2. **Canvas 1**에서 워크로드를 정의하는 agent-turn 플로를 확인한다.
3. **컨트롤 패널**에서 실행한다. 엔진이 두 축에 대한 Chakra 트레이스를 생성하고; 둘 다 하나의 **L0 IR**로 낮춘다(lower).
4. 두 축의 **비교 가능한 projection**(용량 피크 + 대략적 트래픽)을 나란히 본다.
5. **전체 저장** → 워크 트리의 하나의 실험 커밋.
**완료 기준:** 두 축이 비교 가능한 projection과 보존된 입력을 갖춘 하나의 실험 행으로 나타난다.

### UC-2 — 커스텀 하드웨어 계층 설계 및 재실행
1. **Canvas 3**에서 chip → die → package → tray → rack → cluster를 빌드한다.
2. 특정 package/die/chip으로 드릴다운; 컴포넌트(`partId`)를 선택; 마이크로 수준 편집 적용 / 컴포넌트 추가.
3. 컨트롤 패널에서 재실행; projection이 어떻게 변하는지 관찰한다.
4. 하드웨어 서브트리만의 **항목별 저장**.
**완료 기준:** 워크로드/서빙을 다시 작성하지 않고도 하드웨어 변경이 새로운 비교 가능 projection을 만든다.

### UC-3 — what-if 구성 브랜칭
1. 워크 트리에서 현재 실험으로부터 **브랜치**를 만든다.
2. 서빙 선택(Canvas 2) 또는 타일링/파티셔닝 전략 id를 변경한다.
3. 두 브랜치를 실행; projection을 비교한다.
**완료 기준:** 두 브랜치가 독립적으로 실행 가능하고 비교 가능하다; 브랜치 DAG가 보인다.

### UC-4 — agent-turn 검사 및 L0로 매핑
1. **Canvas 1**을 연다; agent-turn을 op/data-movement 그래프로 펼친다.
2. 노드의 텐서 크기/수명을 검사하고; L0에서 그것의 `TensorNode`와 `DataMovementEdge`까지 추적한다.
**완료 기준:** 사용자가 시각적 op에서 그것의 L0 스키마 필드로, 그리고 다시 되돌아 이동할 수 있다.

### UC-5 — 논문/특허를 위한 증거 생성
1. 완료된 실험을 연다; **신뢰 사다리 상태**(예: syntorch trace 대 A100/OTel 골든)를 검토한다.
2. 비교 가능한 projection + 인용된 출처/가정을 증거 아티팩트로 내보낸다.
**완료 기준:** 주장이 증거(실행 출력 + 출처)를 가리키는 아티팩트가 존재하며, CAW-03(별도의 독립적인 논문/특허 제품)으로 **내보낼(export)** 준비가 된다.

## 안티 유스케이스 (v1)

아티팩트를 생성하지 않고 답을 얻기 위해 채팅하는 것; 프로덕션 서빙 실행; 다중 사용자 동시 편집;
공개 표면에 게시. 이들은 명시적으로 범위 외이다([scope-and-non-goals_ko.md](./scope-and-non-goals_ko.md) 참조).

## 미해결 질문

실제 OTel 앵커가 UC-5를 위해 현실적으로 얼마나 많은 op 수준 구조를 제공할 수 있는지 —
[../08-research-plan/open-questions_ko.md](../08-research-plan/open-questions_ko.md)에서 추적됨.

## 런북에 대한 함의

UC-1은 첫 번째 종단 간 런북 체인의 수용 시나리오이다; UC-2/UC-3은 Canvas-3 및 워크 트리 런북을 견인하고;
UC-5는 증거/projection 런북을 견인한다.
