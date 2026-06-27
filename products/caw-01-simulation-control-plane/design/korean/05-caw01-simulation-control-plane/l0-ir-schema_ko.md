# L0 메모리 주석 IR 스키마 — CAW-01

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [trace-pipeline-syntorch-chakra_ko.md](./trace-pipeline-syntorch-chakra_ko.md), [simulation-engine-and-projection_ko.md](./simulation-engine-and-projection_ko.md), [../04-data-layer/data-model_ko.md](../04-data-layer/data-model_ko.md), [../01-decisions/ADR-0005-trace-pipeline_ko.md](../01-decisions/ADR-0005-trace-pipeline_ko.md)
- **Source of truth:** ../_meta/SOURCE-BRIEF_ko.md

## 목적

채움 수준(fill level) **L0**에서의 **메모리 주석 IR(memory-annotated IR)** 을 명세한다 — 세 개의 증거 축(evidence axis)이
모두 하향(lower)되는 단일 표현이며 — 그리고 L1/L2로 가는 점진적 경로를 정의한다. 이는 프로그램 전체에서 가장 중요한 설계 표면이다.

## 원칙 (필드 승격, field promotion)

> 어떤 필드는 메모리 트래픽, 용량 압박(capacity pressure),
> 지연(latency), tier별 이동(per-tier movement), tensor 수명(lifetime), 또는 tiling/partitioning에 대한 인과 사슬을 바꿀 때**에만** 일급(first-class)이다.
> 그 외 모든 것은 불투명한 속성(opaque attribute)이며, 반복된 증거가 metric을 바꾼다고 보일 때에만 승격된다.

L0/L1/L2는 **완성도가 다른 동일한 스키마**이며, 결코 별개의 스키마가 아니다.

## L0 스키마 (op 수준 graph + tensor size/lifetime)

```jsonc
{
  "ir_version": "L0",
  "experiment_id": "…", "run_id": "…", "axis": "synthetic|simulation|real",
  "time_unit": "us",
  "ops": [
    {
      "id": "op_0012",
      "name": "matmul",
      "op_class": "compute|mem_load|mem_store|p2p|collective",
      "inputs": ["t_in_3"], "outputs": ["t_out_4"],   // tensor refs
      "start": 1234, "dur": 56,                         // time axis (rough at L0)
      "strategy_id": "tile_v1",                          // tiling/partitioning, explicit (trust ladder)
      "attrs": { }                                       // opaque until promoted
    }
  ],
  "tensors": [
    {
      "id": "t_out_4",
      "size_bytes": 4194304, "dtype": "fp16",
      "allocated_at": 1234, "freed_at": 1801,            // lifetime → capacity peak
      "residency": "device",                              // L1 deepens this to tiers
      "strategy_id": "tile_v1"
    }
  ],
  "movements": [
    { "id": "mv_7", "from_tier": "host", "to_tier": "device",
      "bytes": 2097152, "sync": false, "op_ref": "op_0012" }  // → traffic
  ]
}
```

| 객체 | 일급 L0 필드 | 무엇을 좌우하는가 |
| --- | --- | --- |
| op | id, name, op_class, inputs, outputs, start, dur, strategy_id | graph + 대략적 타이밍 |
| tensor (`TensorNode`) | size_bytes, dtype, allocated_at, freed_at, residency, strategy_id | 용량 peak, lifetime |
| movement (`DataMovementEdge`) | from_tier, to_tier, bytes, sync | 트래픽 양 |

## L0에서 L1/L2로 (동일 스키마, 더 많은 채움)

| 수준 | 추가되는 것 |
| --- | --- |
| **L1** | tier별 residency 상세 + tier별 movement bytes (`from_tier`/`to_tier`가 실제 tier 모델이 됨) |
| **L2** | kernel 수준 tiling 스케줄, kernel 내부 재사용(intra-kernel reuse), 하드웨어 최적 런타임 로직 |

v1은 **L0만** 채운다([../00-overview/scope-and-non-goals_ko.md](../00-overview/scope-and-non-goals_ko.md)); 스키마는 L1/L2 필드를 예약(reserve)해 둔다.

## Chakra → L0 하향(lowering)

Chakra ET는 타이밍/구조 지향이며, 하향 과정에서 메모리 의미론을 추가한다
([trace-pipeline-syntorch-chakra_ko.md](./trace-pipeline-syntorch-chakra_ko.md)):

1. Chakra node → L0 op (`NodeType` → `op_class` 매핑).
2. Chakra `tensor_size`/IO → L0 tensor `size_bytes`/`dtype`.
3. **Tensor lifetime** (`allocated_at`/`freed_at`)은, 소스가 alloc/free 이벤트를 방출하지 않는 한, **DAG 의존성 순회(dependency walk)** 를 통해 (최초/최종 사용) 계산된다.
4. COMM/MEM node → L0 `movements`.

## 파생 집계(derived rollups) — L0의 핵심

- **용량 peak (capacity peak)** = 시간에 대한 Σ live-tensor `size_bytes`의 최대값 (live = allocated_at ≤ t < freed_at).
- **대략적 트래픽 (rough traffic)** = Σ movement `bytes` (선택적으로 tier별).

이 값들이 **comparable projection** ([simulation-engine-and-projection_ko.md](./simulation-engine-and-projection_ko.md))으로 공급된다.

## 왕복(round-trip) 요구사항 (수용 기준)

ServingSim 스타일 출력과 syntorch 스타일 출력이 모두 스키마 충돌 없이 **하나의** L0로 하향되어야 하며,
하나의 실험 행(experiment row)으로 비교되어야 한다([../08-research-plan/validation-and-golden-tests_ko.md](../08-research-plan/validation-and-golden-tests_ko.md)).

## 미해결 질문

- 현재 Chakra ET가 tensor size/lifetime을 담는가, 아니면 확장(extension)/사이드카(sidecar)가 필요한가? TODO(open-question).
- lifetime을 DAG walk만으로 할 것인가, 아니면 syntorch의 alloc/free 이벤트로 할 것인가? TODO(open-question).

## 런북에 대한 시사점

phase-3 런북이 L0 스키마 + Chakra→L0 하향 + 집계를 구현하며, L0 왕복 테스트가
그 수용 기준(acceptance criterion)이다.
