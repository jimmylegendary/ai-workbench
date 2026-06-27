# RB-042: syntorch Chakra exporter 계층

- Status: blocked
- Phase: phase-4-trace-pipeline
- Depends on: [RB-041]
- Implements design: [trace-pipeline-syntorch-chakra_ko.md](../../05-caw01-simulation-control-plane/trace-pipeline-syntorch-chakra_ko.md), [../../02-research/trace-capture-and-chakra_ko.md](../../02-research/trace-capture-and-chakra_ko.md), [../../01-decisions/ADR-0005-trace-pipeline_ko.md](../../01-decisions/ADR-0005-trace-pipeline_ko.md)
- Produces: `ChakraExporterPort` 구현 — 네이티브 syntorch 캡처 → 표준 rank별 Chakra `.et`

## 목표

네이티브 syntorch 캡처를 **표준** rank별 Chakra `.et`(고정 리비전)로 변환하여 ASTRA-sim의
feeder가 변경 없이 수집하도록 한다 — `chakra_trace_link` + `chakra_converter`의 syntorch 소유 대응물.

## 전제조건

- [ ] RB-041 (캡처) 완료; Chakra 리비전 고정됨 (RB-040).

## 단계

1. **Do:** 네이티브 레코드 → Chakra `NodeType` + 속성(`num_ops`, `tensor_size`, `comm_type`, `comm_size`)으로 매핑하고, 의존성을 보존한다.
   **Verify:** `test:` 캡처된 픽스처가 스키마 유효한 Chakra 노드로 매핑된다.
2. **Do:** **rank별** `chakra.<rank>.et` protobuf를 작성한다. L1/L2 주석(타일링 strategy id, tier residency)은 op-id로 키된 **사이드 채널**에 유지하고 proto에는 넣지 않는다.
   **Verify:** `test:` `.et`가 고정 스키마에 대해 검증되며, 사이드 채널 파일이 존재하고 op id로 키된다.
3. **Do:** `ChakraExporterPort.toChakra`로 노출하고 `.et`를 경로로 저장한다.
   **Verify:** `test:` 어댑터가 `.et` 경로를 반환한다.
4. **Do:** export된 `.et`가 변경 없이 RB-040 ASTRA-sim 경로에 공급됨을 확인한다.
   **Verify:** `test:` ASTRA-sim이 syntorch가 export한 `.et`를 수집한다(T1과 동일한 feeder).

## 수용 기준

- [ ] 네이티브 캡처 → 표준 rank별 Chakra `.et`(고정 리비전).
- [ ] L1/L2 주석이 proto가 아닌 사이드 채널에 실린다.
- [ ] export된 `.et`가 T1 레퍼런스와 동일한 ASTRA-sim feeder에 의해 소비된다.

## 롤백 / 안전성

순수 변환이므로 되돌리면 롤백된다. 방언이 ASTRA-sim의 기대치에서 벗어나면(OQ-03), 통합 전에 매핑을 고친다.

## 인계

RB-043이 합성 축을 ASTRA-sim을 거쳐 L0로 end to end 실행한다.
