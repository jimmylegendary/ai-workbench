# RB-030: L0 메모리 주석 IR 구현

- Status: ready
- Phase: phase-3-simulation-engine
- Depends on: [RB-002]
- Implements design: [l0-ir-schema_ko.md](../../05-caw01-simulation-control-plane/l0-ir-schema_ko.md), [../../04-data-layer/data-model_ko.md](../../04-data-layer/data-model_ko.md)
- Produces: L0 IR 데이터 구조 + 검증 + 용량/트래픽 롤업 (`engine/l0_lowering` + `@caw/core` 스키마)

## 목표

명세된 그대로 L0 IR을 구현한다: 1급(first-class) 메모리 필드를 갖는 op/tensor/movement 객체, 스키마
검증, 그리고 파생 롤업(용량 피크, 대략적 트래픽). L1/L2 필드는 예약하되 채우지 않는다.

## 전제조건

- [ ] RB-002 (IrRepo + 테이블) 완료.

## 단계

1. **Do:** [l0-ir-schema_ko.md](../../05-caw01-simulation-control-plane/l0-ir-schema_ko.md)에 따라 `engine`(Python)에 L0 스키마를 정의하고 `@caw/core/schemas`(Zod)에 동일한 계약을 미러링한다: `op{id,name,op_class,inputs,outputs,start,dur,strategy_id,attrs}`, `tensor{id,size_bytes,dtype,allocated_at,freed_at,residency,strategy_id}`, `movement{from_tier,to_tier,bytes,sync,op_ref}`.
   **Verify:** `test:` 샘플 L0 문서가 검증을 통과하고, 1급 필드가 빠진 문서는 실패한다.
2. **Do:** **용량 피크** = 시간에 걸친 Σ live-tensor 바이트의 최댓값을 구현한다 (live = allocated_at ≤ t < freed_at).
   **Verify:** `test:` 작은 픽스처에서 손으로 계산한 피크와 일치한다.
3. **Do:** **대략적 트래픽** = Σ movement 바이트(및 tier별 분해)를 구현한다.
   **Verify:** `test:` 픽스처 트래픽이 일치한다.
4. **Do:** `IrRepo.putL0`/`getL0` + `rollups`를 통해 L0를 영속화한다.
   **Verify:** `test:` repo를 통해 L0 문서를 라운드트립한다.

## 수용 기준

- [ ] L0 스키마가 Python과 TS(Zod) 양쪽에서 검증되며 서로 동기화 상태를 유지한다.
- [ ] 용량 피크 + 트래픽 롤업이 픽스처에서 정확하다.
- [ ] L0가 `IrRepo`를 통해 영속화/로드된다.

## 롤백 / 안전성

순수 데이터 + 함수이므로 되돌리면 롤백된다. L1/L2 필드는 존재하지만 채워지지 않은 상태로 남는다(비목표).

## 인계

RB-031이 Chakra ET를 이 L0로 낮추고(lower), RB-033이 투영(projection)을 위해 롤업을 읽는다.
