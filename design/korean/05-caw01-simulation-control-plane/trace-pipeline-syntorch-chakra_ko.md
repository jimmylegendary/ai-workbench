# Trace 파이프라인: syntorch → Chakra → ASTRA-sim → L0 — CAW-01

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [l0-ir-schema_ko.md](./l0-ir-schema_ko.md), [serving-and-representation-layer_ko.md](./serving-and-representation-layer_ko.md), [../01-decisions/ADR-0005-trace-pipeline_ko.md](../01-decisions/ADR-0005-trace-pipeline_ko.md), [../02-research/trace-capture-and-chakra_ko.md](../02-research/trace-capture-and-chakra_ko.md)
- **Source of truth:** ../_meta/SOURCE-BRIEF_ko.md

## 목적

합성 축(synthetic axis)을 깊이 있게 다룬다 — syntorch가 sub-torch op 스트림을 어떻게 포착(capture)하고, Chakra로 내보내고,
ASTRA-sim을 통해 실행하며, L0로 정규화하는지를 — 시뮬레이션(LLMServingSim) 축 및 실측(real, OTel)
앵커와 함께 설명한다. L0 스키마 자체는 [l0-ir-schema_ko.md](./l0-ir-schema_ko.md)에 있다.

## 단계별 (합성 축)

```
1 CAPTURE   syntorch records sub-torch ops below its drop-in frontend
              altitude: __torch_dispatch__ / custom dispatcher (concrete shapes→bytes)
              per op: op id, name, op_class(compute/mem_load/mem_store/p2p/collective),
                      tensor IO (shape×dtype→bytes), data+ctrl deps, comm type+size, strategy_id
2 EXPORT    syntorch-owned Chakra exporter maps native records → Chakra NodeType + attrs
              writes per-rank chakra.<rank>.et (protobuf)   [analogue of chakra_trace_link + chakra_converter]
3 SIMULATE  ASTRA-sim feeder ingests the .et; times it (analytical backend default; ns-3/SST behind flag)
              uses the Canvas-3 hardware config for compute/network/memory models
4 LOWER     Chakra ET → L0 IR (add tensor size/lifetime; movements; rollups)   [the single normalization waist]
5 METRICS   capacity peak + rough traffic + ASTRA-sim timings → Metric/ResultSet
```

## 나머지 두 축

| 축 | 경로 | 역할 |
| --- | --- | --- |
| **Simulation** | LLMServingSim (Chakra+ASTRA-sim 내장) → chakra/metrics → L0 lowering | serving 루프의 시뮬레이션 트윈(twin) |
| **Real** | service infra → OTel trace, agent-turn/request 동일성으로 정렬 | **검증 앵커 전용**, 결코 simulator 입력이 아님 ([ADR-0005](../01-decisions/ADR-0005-trace-pipeline_ko.md)) |

세 축 모두 **하나의 L0**로 수렴하여 하나의 실험 행(experiment row)으로 비교 가능하다.

## Chakra ET 핵심 (교환 허리, interchange waist)

- Node type: COMP_NODE, COMM_COLL/SEND/RECV, MEM_LOAD/STORE.
- Attr: `num_ops`, `tensor_size`, `comm_type`, `comm_size`; node 필드에 `ctrl_deps`, `data_deps`, `start_time_micros`, inputs/outputs 포함.
- 이는 **타이밍/구조 지향**이며, 메모리 size/lifetime은 하향(step 4) 중에 추가된다.

## L1/L2 사이드 채널(side channel)

더 풍부한 주석(tiling strategy id, tier residency)은 Chakra proto를 과부하시키지 않고
**op-id를 키로 하는 사이드 채널**에 실린다([../02-research/trace-capture-and-chakra_ko.md](../02-research/trace-capture-and-chakra_ko.md)).

## 참조 왕복(reference round-trip) — 먼저 리스크 제거

syntorch를 배선하기 전에: Chakra `et_def.proto` 리비전을 고정(pin)하고, `et_feeder` + 참조 `.et`의
ASTRA-sim 왕복을 구축한다. 그런 다음에야 파이프라인의 syntorch 앞단을 가변 부분으로 다룬다
([../08-research-plan/validation-and-golden-tests_ko.md](../08-research-plan/validation-and-golden-tests_ko.md)).

## 미해결 질문

- syntorch capture altitude (`__torch_dispatch__` vs 커스텀 recorder)? TODO(open-question).
- syntorch가 표준 `.et`를 직접 방출하는가, 아니면 native + exporter 방식인가? per-rank 파일 규약은? TODO(open-question).
- 통합 대상이 되는 Chakra `et_def.proto` 리비전은 무엇인가? TODO(open-question).
- vLLM 버전 고정 (V0 vs V1) + 정확한 torch API 표면? TODO(open-question).

## 런북에 대한 시사점

phase-4 런북이 capture, exporter, ASTRA-sim 통합을 그 순서대로 구현하며, 각 단계는 참조 왕복으로
게이팅된다; phase-3가 Chakra→L0 하향을 담당한다.
