# RB-031: Chakra → L0 lowering (정규화 허리, the normalization waist)

- Status: ready
- Phase: phase-3-simulation-engine
- Depends on: [RB-030]
- Implements design: [trace-pipeline-syntorch-chakra_ko.md](../../05-caw01-simulation-control-plane/trace-pipeline-syntorch-chakra_ko.md), [l0-ir-schema_ko.md](../../05-caw01-simulation-control-plane/l0-ir-schema_ko.md), [../../01-decisions/ADR-0005-trace-pipeline_ko.md](../../01-decisions/ADR-0005-trace-pipeline_ko.md)
- Produces: `L0LoweringPort` 구현 (Chakra ET → L0 IR)

## 목표

단일 정규화 허리를 구현한다: Chakra ET를 L0 IR로 변환한다 — 노드 타입을 op_class로, IO를
tensor 바이트로 매핑하고, tensor 수명(lifetime)을 도출하며, movement를 구성한다 — 그래서 Chakra를 내보내는
어떤 축(axis)이든 하나의 L0로 낮춰지도록 한다.

## 전제조건

- [ ] RB-030 (L0 스키마 + 롤업) 완료.
- [ ] 고정된(pinned) Chakra `et_def.proto` 리비전 (OQ-04). 미해결이면 문서화된 픽스처 방언(dialect)을 사용하고 이를 명기한다.

## 단계

1. **Do:** Chakra ET(rank별 `.et` protobuf)를 파싱한다. `NodeType`(COMP/COMM_*/MEM_*) → L0 `op_class`로 매핑한다.
   **Verify:** `test:` 픽스처에서 각 NodeType이 올바른 op_class로 매핑된다.
2. **Do:** Chakra `tensor_size`/IO + dtype → L0 tensor `size_bytes`/`dtype`로 매핑하고, 사이드 채널에서 `strategy_id`를 부착한다.
   **Verify:** `test:` tensor가 올바른 바이트/dtype/strategy_id를 갖는다.
3. **Do:** DAG 의존성 순회(첫/마지막 사용)를 통해 tensor **수명**(`allocated_at`/`freed_at`)을 도출한다. alloc/free 이벤트가 있으면 이를 우선한다 (OQ-07).
   **Verify:** `test:` 픽스처의 수명이 첫/마지막 사용과 일치한다.
4. **Do:** COMM/MEM 노드로부터 `movements`(from_tier/to_tier/bytes/sync)를 구성한다. L1/L2 주석은 op-id로 키된 사이드 채널에 싣는다(proto에는 넣지 않는다).
   **Verify:** `test:` movement + 롤업이 계산되며, L1/L2 주석이 별도로 보존된다.

## 수용 기준

- [ ] 픽스처 Chakra ET가 올바른 롤업을 갖는 유효한 L0로 낮춰진다.
- [ ] 노드 타입, tensor, 수명, movement 매핑이 모두 유닛 테스트된다.
- [ ] L1/L2 주석이 Chakra proto가 아닌 사이드 채널에 실린다.

## 롤백 / 안전성

순수 변환이므로 되돌리면 롤백된다. Chakra 리비전이 미해결이면 픽스처 방언이 명확히 표시되어
(OQ-04) 재타게팅할 수 있다.

## 인계

Chakra를 생성하는 어떤 축이든(현재 LLMServingSim, phase-4의 syntorch) 하나의 비교 가능한 L0로 정규화될 수 있다.
