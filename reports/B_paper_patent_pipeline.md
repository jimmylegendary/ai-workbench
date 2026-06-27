---
source: session_memory_dse_controlplane.yaml
schema_version: "0.1"
generated_run_id: dse-controlplane-strategy-2026-06-27
report: B_paper_patent_pipeline
language: ko
---

# 논문 / 특허 파이프라인 보고서

## 1. Paper Candidates

### P1. SynTorch: An Executable Synthetic Frontend for Memory-Centric Design Space Exploration of Unbuilt AI Hardware

TL;DR: PyTorch와 frontend는 동일하지만 kernel, runtime, memory tier를 가상 hardware에 맞춰 추상 구현한 실행형 backend다. 실제 모델, 특히 vLLM류 workload를 코드 변경 없이 돌리면 제안 partitioning/tiling이 반영된 hardware-optimal Chakra trace를 생성하고, 존재하지 않는 memory system 위의 tensor lifetime, capacity peak, tier traffic을 산출한다.

Target venue: ASPLOS 우선, MICRO, MLSys workshop fallback.

Patent link: 가상 memory hierarchy 위 실행형 trace 생성과 그 trace에서 capacity/traffic을 유도하는 방법 특허.

Survival / caution: A100 실측 OTel trace 대비 syntorch trace 오차 보고가 필수다. 추론: 이 검증이 약하면 P1은 "정교한 문서"일 뿐 도구 논문으로 살아남기 어렵다.

### P2. Tracking the Moving Axes: Evidence-Based Projection of Memory Demand Shifts in Evolving AI Workloads

TL;DR: 단일시점 workload 특성화가 아니라 실측(OTel), 합성(SynTorch), 시뮬(ServingSim/ASTRA-sim)을 하나의 memory-annotated IR로 통합해 capacity vs bandwidth 지배 비율의 이동을 추적한다. 핵심 기여는 design space 축을 고정하지 않고 새 workload가 기존 축으로 설명되지 않을 때 "새 축 등장"으로 표면화하는 방법론이다.

Target venue: ISCA 비전/projection 성격, IEEE Micro 특집, HotInfra류.

Patent link: 이종 trace 통합 IR과 종속변수 비율 이동 탐지를 통한 memory-system 설계 방법 특허.

Survival / caution: 추론: P2는 control plane의 신뢰사다리 위에 서야 한다. ServingSim-only dashboard가 아니라 OTel/syntorch/sim source가 같은 schema에서 비교 가능하다는 증거가 있어야 한다.

### P3. When Inference Writes Back: The Memory Traffic Signature of Test-Time Training and Its Architectural Implications

TL;DR: TTT는 추론 중 weight update를 수행하기 때문에 prefill/decode와 근본적으로 다른 memory behavior를 만든다. gradient, optimizer state, write traffic, updated weight reuse가 read-dominated LLM serving profile에 새로운 write axis를 추가한다. 이 축을 IR/시뮬 파이프라인에 1급 시민으로 모델링하면 memory device가 요구받는 write bandwidth, durability, near-memory compute 특성을 역산할 수 있다.

Target venue: HotChips / HotInfra / ASPLOS WACI 계열 vision flag. 결과가 단단해지면 MICRO / ISCA 본트랙.

Patent link: 추론 중 write traffic을 겨냥한 memory device 구조. 특허 먼저, 논문이 따라가는 그림.

Survival / caution: P3는 출력이지 입력이 아니다. P1/P2의 tool/method 신뢰사다리 없이 P3를 단정하면 position paper에 그친다. 특히 TTT는 model, device, runtime, OS support까지 여러 가정을 동시에 깔기 때문에 가정 수를 줄이고 trace-backed evidence로 올라가야 한다.

## 2. Program Logic

`P1 -> P2 -> P3` 순서가 하나의 연구 프로그램이다.

- P1은 도구: 존재하지 않는 memory system 위에서 실행형 synthetic trace를 만드는 방법.
- P2는 방법론: 움직이는 workload/memory axis를 evidence 기반으로 추적하는 control plane.
- P3는 사례이자 device hook: TTT-class inference가 만드는 writeback memory axis와 그 architectural implication.

P1/P2는 방법/도구 특허로 묶이고, P3는 device structure 특허로 이어진다. 추론: 모든 paper는 "AI를 위한 무엇"이 아니라 **memory를 위한 무엇**으로 프레이밍해야 한다.

## 3. Related Work 차별화 매트릭스

| 연구 | 한줄정체 | 우리와의 경계 |
| --- | --- | --- |
| DeepStack | source memo 기준: 3D-stacked DRAM / LLM serving DSE를 정밀 모델링하는 가까운 threat. source memo는 vLLM 대비 12% 검증을 경고 신호로 둠. | 확인 전 경계: DeepStack은 known device class 안에서 정밀 탐색하고, 우리 방향은 device class 미정 상태에서 새 axis를 발견/검증하는 instrument. 단, DeepStack에 12% 검증이 실제로 확인되면 우리 validation이 더 약할 때 바로 비교당한다. |
| Minsoo Rhu line / MC-DLA | source memo 기준: memory-centric architecture proposal과 workload characterization의 가까운 선행 축. | 확인 전 경계: 그들은 architecture를 제안하고, 우리 방향은 architecture를 찾고 흔들어볼 수 있는 tool/control plane. 깊게 인용하고 경계를 명확히 해야 한다. |
| MemOS | source memo 기준: memory를 first-class resource로 다루는 execution paradigm / scaling pressure reference. | 확인 전 경계: MemOS가 paradigm을 주장한다면 우리는 trace-backed projection instrument를 만든다. |
| SECDA-DSE | source memo 기준: LLM을 DSE loop에 넣어 automatic solver처럼 탐색하는 접근. | 확인 전 경계: SECDA-DSE는 solver 패러다임에 가깝고, 우리 방향은 solver가 아니라 사람이 축을 움직이는 explorer's instrument. |
| Mutlu / Memory-Centric Computing | source memo 기준: processor-centric 사고의 한계를 짚는 broad memory-centric foundation. | 확인 전 경계: foundational framing으로는 흡수하되, contribution은 AI workload trace/IR/control-plane와 device-spec projection에 둔다. |

주의: 위 related-work 내용은 radar seed다. citation과 최신성은 자동/수동 검증 전까지 단정하지 않는다. "빈자리"는 최초/유일 주장으로 쓰지 않고, 확인된 범위에서의 working hypothesis로만 다룬다.

## 4. Trust Ladder And Release Stages

| Stage | 가능한 형태 | 조건 |
| --- | --- | --- |
| Vision | HotChips / WACI / HotInfra 성격의 vision 또는 position. "projection, not measurement"를 명시하고 깃발+특허 우선. | 정성 논증과 back-of-envelope까지만. P3를 final answer처럼 쓰지 않는다. |
| Quantified | syntorch 검증 후 TTT-class를 한 구성에 태워 write traffic / capacity peak 수치화. | A100/OTel 대조 또는 최소한 source-to-IR consistency evidence 필요. |
| Law | control plane으로 여러 model 크기, update frequency, context length를 sweep해 새 axis scaling을 함수로 표현. | 여기서야 "scaling law"라는 단어를 쓸 자격이 생긴다. device spec은 이 함수에서 역산한다. |

핵심은 신뢰의 사다리다. 존재하지 않는 device는 syntorch로 executable하게 만들고, 존재하지 않는 runtime/tiling은 코드로 만들고, 축 이동/신설은 control plane의 반복 projection으로 보여줘야 한다. P3는 그 사다리를 오른 뒤의 결과다.
