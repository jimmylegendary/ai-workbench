---
source: session_memory_dse_controlplane.yaml
schema_version: "0.1"
generated_run_id: dse-controlplane-strategy-2026-06-27
report: A_strategy_brief
language: ko
---

# 본업 전략 보고서

## 1. 본업 정의

이 일의 본업은 단순한 web UI가 아니라 **end-to-end simulation platform control plane**, 즉 AI workload와 memory-system 가설을 재현 가능한 실험 단위로 고정하는 instrument다. 한 실험은 `(workload, hw config, sim config) -> trace -> metric -> DB row -> 비교가능 projection`으로 남아야 한다. 실측축(real service infra -> OTel trace), 합성축(syntorch -> Chakra trace), 시뮬축(LLM ServingSim + ASTRA-sim)을 같은 데이터 레이어로 묶어야 하며, UI는 이 instrument를 조작하고 비교하는 표면일 뿐이다.

## 2. Novelty / Positioning

핵심 novelty 한 줄:

> 확인된 범위에서의 가설: 기존 memory-centric 연구는 전문가가 하나의 아키텍처를 주장하고, 기존 DSE 도구는 고정된 device class 안에서 최적해를 탐색한다. 그 사이 빈자리 = device class 미정 상태에서 도메인 지식만 있으면 누구나 축을 흔들며 가설을 싸게 실험하고, 그 결과로 새 device spec과 미래 scaling law를 역산하는 instrument.

포지셔닝은 solver가 아니다. 자동으로 최적해를 찾는 fixed-space optimizer가 아니라, 사람이 memory/workload axis를 움직이고 새 축을 추가하며 evidence를 쌓는 **explorer's instrument**다. 여기서 `capacity vs bandwidth`는 답이 아니라 출력이다. 진짜 질문은 어떤 workload 축이 그 비율을 지배하고, 그 비율이 시간에 따라 어떻게 이동하며, 아직 보이지 않던 새 축이 언제 device-roadmap 베팅의 근거가 될 정도로 커지는가다.

## 3. IR / Schema 결정 로그

스키마는 한번 잘못 잡으면 빼는 비용이 크다. 그래서 초기 결정 기준은 단순해야 한다.

**Guiding principle:** memory traffic, capacity pressure, latency 같은 metric의 인과사슬을 바꾸는 인자는 1급 schema field로 둔다. 그 인과사슬을 바꾸지 않는 정보는 opaque attribute로 남긴다. 반복적으로 metric 인과에 등장하는 opaque attribute만 나중에 1급 field로 승격한다.

초기 required fields:

| 영역 | 1급 필드 |
| --- | --- |
| node/op | input tensor refs, output tensor refs, working set(op 생존 중) |
| tensor | size, dtype, allocated_at, freed_at, residency(memory tier), partitioning/tiling strategy id |
| movement edge | src tier, dst tier, bytes, sync/async |

Fill level은 별도 schema가 아니다. 같은 schema를 얼마나 채웠는지다.

| Fill level | 의미 | 첫 사용 |
| --- | --- | --- |
| L0 | op-level graph + tensor size/lifetime | capacity peak, rough traffic, ServingSim 첫 projection |
| L1 | memory tier residency + per-tier movement bytes | partitioning/tiling 영향 가시화, syntorch 가치 시작 |
| L2 | kernel-level tiling schedule, intra-kernel reuse, hw-optimal runtime logic | syntorch가 vLLM에 붙은 뒤 |

Anti-break 장치:

- `schema_version`과 nullable/optional field를 전제로 한다. consumer는 unknown field를 무시한다.
- 모든 entity에는 opaque `attributes` map을 둔다. metric 인과에 반복 등장할 때만 1급 field로 승격한다.
- source adapter는 IR만 향해 말한다. core는 ServingSim, syntorch, OTel 같은 source를 직접 알지 않는다. source가 못 채우는 값은 명시적 `null`이다.

## 4. 임계경로

| 순서 | 액션 | 이유 |
| --- | --- | --- |
| 지금 | syntorch<->A100 검증 골든 테스트 + L0 IR 종이 검증 | P1 생존조건이자 control plane 척추. ServingSim 출력 1개 + syntorch-style 출력 1개가 같은 그릇에 들어가야 한다. |
| 병렬(며칠) | 좁은 키워드 레이더 -> knowledge store 적재 | memory-centric DSE / memory device for LLM / Minsoo Rhu / DeepStack / TTT writeback traffic 누락 방지. |
| 다음 | source-agnostic control plane으로 ServingSim 한 바퀴 -> 첫 projection | 추론: ServingSim을 source A로 먼저 연결하면 syntorch-vLLM 미연결이 전체 진척을 막지 않는다. |
| 그 후 | syntorch source 합류 -> TTT 축 추가 -> P3 trust ladder | TTT-class workload를 미래 writeback-memory 축으로 정량화한다. |

열린 결정:

> 이번 주 착수: (a) 좁은 레이더 먼저 vs (b) syntorch 검증 골든 테스트 먼저. 둘 다 급함. "안 돌면 더 불안한 쪽"으로 선택.

## 5. RISK

가장 약한 고리는 모델도 device도 아니라 **A안 고정 tiling/partitioning이 충분히 그럴듯하다는 가정**이다. tiling이 틀리면 trace도 틀리고, 그 trace에서 역산한 device spec도 흔들린다.

따라서 syntorch의 survival condition은 A100 실측 OTel trace와의 대조 검증이다. source memo 기준으로 DeepStack류 선행이 실측 대비 오차를 제시하는 상황이면, 이쪽 검증이 약할 경우 reviewer 질문은 바로 "그 trace가 맞다는 걸 어떻게 아냐"로 들어온다. 이 문장은 radar seed이며, 해당 선행의 수치와 최신성은 별도 검증 전까지 단정하지 않는다.

또한 현재 `syntorch <-> vLLM`은 완전히 연결되지 않았다. 이 사실은 숨기면 안 된다. 추론: 단기 control plane은 ServingSim을 임시 source A로 삼아 L0 projection을 먼저 만들고, syntorch는 source B로 같은 IR slot에 나중에 합류시키는 구조가 맞다.
