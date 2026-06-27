# 데이터 모델 — CAW-01

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [storage-strategy.md](./storage-strategy_ko.md), [work-tree-and-versioning.md](./work-tree-and-versioning_ko.md), [knowledge-substrate.md](./knowledge-substrate_ko.md), [../05-caw01-simulation-control-plane/l0-ir-schema.md](../05-caw01-simulation-control-plane/l0-ir-schema_ko.md), [../01-decisions/ADR-0002-data-layer.md](../01-decisions/ADR-0002-data-layer_ko.md)
- **Source of truth:** ../_meta/SOURCE-BRIEF.md

## 목적

CAW-01의 논리적 스키마 — CAW-01은 독립적이고 단독으로 동작하는(standalone) 제품으로, 6개 제품군(CAW-01..06,
각각 별도로 구현·배포되며 공유 런타임이 없음) 중 하나다. 이 문서는 CAW-01의 간결한(lean) run-evidence & provenance
모델, 시뮬레이션 엔티티, HW 계층 구조, 그리고 graph-in-Postgres 접근 방식을 다룬다. 물리적 저장 위치(행 vs blob vs
벡터)는 [storage-strategy.md](./storage-strategy_ko.md)에, work-tree 테이블은
[work-tree-and-versioning.md](./work-tree-and-versioning_ko.md)에 있다.

## 규약

- 모든 테이블은 `id`(uuid), `created_at`, `created_by`, `surface`를 가진다.
- 외래 키는 명시적이며, 이 제품 자신이 생성한 결론에 대해 **claim→evidence 불변식**이 강제된다(`Evidence`가 없는
  `Claim`은 게시(publish) 대상으로 유효하지 않다).
- 그래프는 **adjacency/edge 테이블**로 저장되고 **recursive CTE**로 탐색된다(v1에서는 Neo4j 미사용, [ADR-0002](../01-decisions/ADR-0002-data-layer_ko.md)).

## Run-evidence & provenance

CAW-01은 **자신의 run에 필요한 최소한의 evidence/provenance만** 보관한다 — run에 Evidence를 첨부하고, 신뢰
사다리(trust ladder)에서 등급을 매기며, public/internal/confidential 경계를 강제하고, 이 제품 자신이 생성한 결론을
뒷받침하기에 충분한 정도다:

| 엔티티 | 주요 컬럼 | 비고 |
| --- | --- | --- |
| `Claim` | statement, status, boundary(public/internal/confidential) | 이 제품의 run에서 생성된 결론; 게시 가능하려면 evidence를 가리켜야 함 |
| `Evidence` | claim_id, kind(run/measurement/artifact), ref (run_id 또는 artifact 경로), trust_level, boundary | 증거; 이 제품 자신의 run/artifact를 참조하며, 자유 텍스트는 안 됨 |

> **일반 지식 저장소(general knowledge repository)** — 외부 `Source`/`Claim`/`Note`/`Concept`/`Interest`/
> `OpenQuestion`을 수집(ingest)하는 것 — 은 **별도 제품(CAW-02)**이며 **여기서는 범위 밖**이다. CAW-01의 데이터
> 모델에서는 이를 모델링하지 않는다. CAW-01은 자신의 evidence/claim을 제품 경계(product boundary)를 넘어 이를
> 소비하는 다른 독립 제품(예: CAW-02, 또는 논문/특허 제품 CAW-03)으로 **export**할 수 있다 — 이는 독립 제품들
> 사이의 export 경계이지 공유 저장소가 아니다.

출처/신뢰(provenance/trust) 모델은 [knowledge-substrate.md](./knowledge-substrate_ko.md)를 참조하라.

## 시뮬레이션 엔티티

| 엔티티 | 주요 컬럼 | 관계 |
| --- | --- | --- |
| `WorkloadModel` | name, agent_turn_spec, params | → Experiment |
| `InputTrace` | workload_id, path/URI, format | 경로로 참조하는 대용량 blob |
| `SimulationConfig` | serving_choice, representation(torch/syntorch), simulator_path, hw_config_ref, backend(analytical/ns3/sst) | Canvas 2 + Canvas 3에서 유래 |
| `SimulationRun` | experiment_id, config_id, status, started_at, finished_at | 상태 머신 |
| `TraceArtifact` | run_id, kind(chakra/otel/native), path/URI, rank | 경로로 참조하는 blob |
| `Metric` | run_id, name, value, unit | 수치 출력 |
| `ResultSet` | run_id, metrics[], projection_ref | 그룹화됨 |
| `MemoryAnnotatedIR` | run_id, fill_level(L0/L1/L2), path/URI 또는 행 | 정규화된 IR |
| `TensorNode` | ir_id, op_ref, size, dtype, allocated_at, freed_at, residency, strategy_id | IR 노드 |
| `DataMovementEdge` | ir_id, src_tier, dst_tier, bytes, sync_async | IR 엣지 |
| `FillLevel` | enum L0/L1/L2 | 완성도 표시자 |
| `ArchitectureProposal` | experiment_id, summary, evidence_refs[] | 하류(downstream) 결론 |
| `MemoryProductRequirement` | proposal_id, requirement, evidence_refs[] | 하류(downstream) 결론 |

IR 세부 사항은 [../05-caw01-simulation-control-plane/l0-ir-schema.md](../05-caw01-simulation-control-plane/l0-ir-schema_ko.md)에 있다.

## 하드웨어 계층 구조 (Canvas 3)

단일 자기참조(self-referential) `hw_node` adjacency 테이블이 chip→die→package→tray→rack→cluster를 모델링한다:

```
hw_node(id, experiment_id, parent_id NULL, level ENUM(cluster,rack,tray,package,die,chip,component),
        name, spec JSONB, part_id TEXT)        -- part_id == the picking identity
```

- recursive CTE로 탐색한다(약 6단계로 제한; 비용이 낮음).
- `spec JSONB`는 레벨별 속성을 담는다(promotion 원칙에 따라 컬럼으로 승격되기 전까지는 불투명).
- `part_id`는 canvas picking이 반환하는 안정적 식별자다([../05-caw01-simulation-control-plane/canvas-3-hw-design.md](../05-caw01-simulation-control-plane/canvas-3-hw-design_ko.md)).

## 조인 지점으로서의 Experiment

```
Experiment(id, name, head_ref)         -- head_ref → work-tree ref
   ├─ WorkloadModel        (Canvas 1)
   ├─ SimulationConfig     (Canvas 2)
   ├─ hw_node tree         (Canvas 3)
   └─ SimulationRun*       → TraceArtifact*, Metric*, MemoryAnnotatedIR, ResultSet
```

세 캔버스에 걸쳐 구성된 config는 **work-tree**에 의해 버전 관리된다([work-tree-and-versioning.md](./work-tree-and-versioning_ko.md)).

## 미해결 질문

`MemoryAnnotatedIR`가 TensorNode/DataMovementEdge를 행(질의 가능)으로 저장할지, blob+index(더 저렴)로 저장할지를
L0 규모에서 결정하는 문제 — TODO(open-question), IR 질의 요구사항에 따라 결정.

## 런북에 대한 함의

phase-0 데이터 레이어 런북이 이 테이블들을 생성한다(SQLite, PG 이식 가능). IR 행은 L0 lowering이 이를 방출(emit)하는
시점에 phase-3 엔진 런북에서 생성된다.
