# 용어집(GLOSSARY) — CAW-01 보편 언어(Ubiquitous Language)

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Source of truth:** ./SOURCE-BRIEF_ko.md

CAW-01 설계 집합을 위한 표준 어휘입니다. 이 용어들을 정확히 사용하고, 동의어를 새로 만들지 마십시오.

## 프레임워크 및 도구

- **vLLM** — 오픈소스 LLM 서빙 프레임워크(중앙집중식 스케줄러, 연속/반복(iteration) 수준 배칭, PagedAttention KV 블록). 실행 경로: Engine → Executor → Worker → ModelRunner → `model.forward()`. `syntorch`는 `forward()` 이하의 모든 것(torch 프론트엔드 계약)을 대체하며, vLLM 내부를 대체하는 것은 아닙니다.
- **syntorch** ("synthetic torch") — 내부 Python 패키지. vLLM의 torch 계층과 동일하게 사용 가능한 **드롭인(drop-in) torch 프론트엔드**입니다. 그 아래의 모든 것(커널, HW 로직)은 커스텀이며, 커스텀 HW 칩/아키텍처를 위한 **파티셔닝/타일링(partitioning/tiling)**을 포함한 런타임 알고리즘을 표현할 수 있게 합니다. vLLM 내부에서 *torch 대신* 설치되어 **모든 하위-torch 트레이스를 캡처**하도록 의도되었으며, 이를 **Chakra exporter 계층**이 Chakra 트레이스로 변환합니다. 또한 **HW design 계층**(chip→cluster)을 담고 있습니다. 소유된 것으로 취급하고, [SOURCE-BRIEF §7](./SOURCE-BRIEF_ko.md)을 넘어서는 내부 구현을 지어내지 마십시오.
- **LLMServingSim** — LLM 서빙 루프의 요청(request) 수준 시뮬레이터(vLLM의 시뮬레이션 쌍둥이). 특히 이미 **수정된 ASTRA-sim + Chakra를 내장**하고 있어 반복마다 Chakra를 방출합니다 — ASTRA-sim의 동급(peer)이 *아닙니다*.
- **ASTRA-sim** — 분산 ML 시스템 시뮬레이터(계층 구조: workload / system / compute / network). **Chakra ET를 소비합니다.** 네트워크 백엔드는 정밀도 다이얼입니다: analytical(빠름, 기본값) → Garnet → ns-3(패킷/RDMA) → SST-Merlin(스케일아웃).
- **SST** — Structural Simulation Toolkit; ASTRA-sim 뒤에서 선택 가능한 고정밀 백엔드 중 하나(예: SST-Merlin)이며, 래퍼가 아닙니다.
- **Chakra trace / Chakra ET** — MLCommons **Execution Trace** 표준; 합성(syntorch exporter) 축과 시뮬레이션(LLMServingSim) 축이 물리적으로 만나는 교환 "허리(waist)". 노드 타입에는 COMP_NODE, COMM_COLL/SEND/RECV, MEM_LOAD/STORE 등이 있고, 속성에는 `num_ops`, `tensor_size`, `comm_type`, `comm_size` 등이 있습니다. 타이밍/구조 지향적이며, 텐서 크기/수명은 Chakra→L0 lowering 과정에서 추가됩니다.
- **OTel (OpenTelemetry)** — 분산 트레이스 표준(span 트리; GenAI semconv `gen_ai.usage.*`). CAW-01에서는 agent-turn/request 정체성 수준에서 정렬되는 **신뢰 사다리(trust-ladder) 검증 앵커**이며 — **결코 시뮬레이터 입력이 아닙니다**.

## IR 및 시뮬레이션 도메인

- **Memory-annotated IR** — 세 축 모두가 lowering되어 내려가는 단일 정규화 표현. 골격: op/tensor 노드, data-movement 엣지, 시간 축, 일급(first-class) 메모리 어노테이션.
- **채움 레벨 L0 / L1 / L2** — 별개의 스키마가 아니라 *동일한 스키마의 완전성 레벨*. **L0** = op 수준 그래프 + 텐서 크기/수명(용량 피크 + 대략적 트래픽). **L1** = 메모리 계층(tier) 잔류(residency) + 계층별 이동 바이트. **L2** = 커널 수준 타일링 스케줄, 커널 내 재사용, 하드웨어 최적 런타임 로직.
- **승격 원칙(promotion principle)** — 어떤 필드는 메모리 트래픽, 용량 압박, 지연(latency), 계층별 이동, 텐서 수명, 또는 타일링/파티셔닝에 대한 인과 사슬을 바꿀 때에만 일급이 됩니다. 그렇지 않으면 불투명한 속성으로 남습니다.
- **TensorNode** — 텐서를 위한 IR 노드: size, dtype, allocated_at, freed_at, residency, partitioning/tiling 전략 id.
- **DataMovementEdge** — 이동을 위한 IR 엣지: src tier, dst tier, bytes, sync/async.
- **WorkloadModel / InputTrace / SimulationConfig / SimulationRun / TraceArtifact / Metric / ResultSet** — 시뮬레이션 기반(substrate) 엔티티: 워크로드 정의, 그 입력 트레이스, 실행 구성, 실행 인스턴스, 생성된 트레이스 blob, 측정된 메트릭, 그리고 그룹화된 결과.
- **ArchitectureProposal / MemoryProductRequirement** — 실행 결과로부터 도출되는 하위(downstream) 결론(디바이스 요구사항 함의).
- **agent-turn** — AI 에이전트의 한 턴; Canvas 1에서 시각화되는 "AI 워크로드"의 단위이자 OTel/Chakra 정체성이 정렬되는 입도(granularity).
- **projection** — 두 축/실행을 하나의 실험 행(row)으로 비교 가능하게 만드는, 비교 가능한 파생 뷰(예: 용량 피크 + 트래픽).
- **신뢰 사다리(trust ladder)** — 신뢰도 계단: syntorch 트레이스는 A100/OTel 증거에 대해 검증되어야 하며, 타일링/파티셔닝은 산문이 아니라 명시적 코드/전략 id여야 합니다.
- **타일링 / 파티셔닝 전략 id(tiling / partitioning strategy id)** — syntorch가 적용하는 런타임 알고리즘의 명시적 식별자; 미제작 디바이스 가정이 실행 가능하고 감사 가능하도록 일급으로 둡니다.
- **세 가지 증거 축(three evidence axes)** — real(OTel), synthetic(syntorch→Chakra), simulation(LLMServingSim+ASTRA-sim).

## 하드웨어 계층 구조 (Canvas 3)

- **chip / die / package / tray / rack / cluster** — Canvas 3에서 설계·시각화되어 syntorch HW design 계층 + ASTRA-sim/SST 설정으로 투입되는 물리적 설계 계층 구조.
- **partId** — 캔버스 피킹(picking)이 반환하는 도메인 정체성: chip/die/package/tray/rack/cluster + 컴포넌트를 식별하는 안정적 경로이며, 결코 원시(raw) 렌더러 객체가 아닙니다.

## work-tree 및 버전 관리

- **work-tree** — 세 캔버스 전반의 변경 사항을 담는 git 유사 트리(문자 그대로의 "work tree"); 항목별 저장과 전체 저장을 지원합니다.
- **change_blob** — 버전이 매겨진 하나의 대상(C1 노드 파라미터 집합, C2 배선(wiring), C3 part 설정)에 대한 불변·콘텐츠 주소(content-addressed) 스냅샷.
- **change_tree** — workload/serving/hardware 구조를 반영하는, 엔트리 → blob/하위 트리의 이름 붙은 맵.
- **change_commit** — `{root_tree, parents[], author, surface, message, created_at}`; 추가 전용(append-only); 본질적 출처(provenance).
- **ref** — 커밋을 가리키는 이동 가능한 이름 붙은 포인터(실험별 기본 라인 + what-if용 사용자 브랜치).

## 플랫폼

- **@caw/core** — 공유 TypeScript 코어: 도메인 서비스(`ExperimentService`, `RunService`, `RegistryService`, `WorkTreeService`, `EvidenceService`) + Zod 계약; `next` 의존성 제로; 그 뒤에는 engine-adapter 포트와 리포지토리 인터페이스가 자리합니다.
- **engine-adapter port** — 구체적 엔진(syntorch / LLMServingSim / ASTRA-sim)이 프로세스 외부(out-of-process)에서 구현하는 `@caw/core`의 인터페이스.
- **surface** — `@caw/core`로 향하는 얇은 진입점: 웹 앱(주력), MCP 서버, 또는 CLI.
- **skill** — 다른 에이전트에게 (예: MCP를 통해) 노출되는 재사용 가능한 워크벤치 워크플로의 패키징.
