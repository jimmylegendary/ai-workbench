# RB-043: ASTRA-sim 통합 (합성 축 end-to-end)

- Status: blocked
- Phase: phase-4-trace-pipeline
- Depends on: [RB-042, RB-033]
- Implements design: [trace-pipeline-syntorch-chakra_ko.md](../../05-caw01-simulation-control-plane/trace-pipeline-syntorch-chakra_ko.md), [simulation-engine-and-projection_ko.md](../../05-caw01-simulation-control-plane/simulation-engine-and-projection_ko.md)
- Produces: 합성 축을 연결하는 `AstraSimPort` 구현; Milestone-1 end-to-end

## 목표

합성 축을 end to end 실행한다: syntorch capture → Chakra exporter → ASTRA-sim(분석적) → L0,
Canvas-3 하드웨어 구성을 사용하여 시뮬레이션 축 옆에 비교 가능한 축으로 나타나도록 한다(Milestone 1 완료).

## 전제조건

- [ ] RB-042 (exporter) + RB-033 (투영) 완료.

## 단계

1. **Do:** 엔진에 대해 `AstraSimPort.simulate(etPaths, hwConfig, backend='analytical')`를 구현하고, Canvas-3 `hw_config_ref` 모델을 전달한다.
   **Verify:** `test:` ASTRA-sim이 하드웨어 모델로 syntorch `.et`에서 실행되어 메트릭 + 아티팩트를 반환한다.
2. **Do:** 결과를 L0로 낮추고(RB-031) 실행 아티팩트/메트릭/IR을 등록한다(RB-032 경로).
   **Verify:** `test:` 합성 축 실행이 저장된 L0 + 메트릭을 산출한다.
3. **Do:** 순서 문제(OQ-01)를 해결한다: 합성 축과 시뮬레이션 축을 **병렬로 하나의 L0에** 실행하고(v1 기본값) 결정을 기록한다.
   **Verify:** `view:` OQ-01이 선택된 접근법 + 근거와 함께 갱신된다.
4. **Do:** 하나의 agent-turn에 대해 두 축에 걸친 비교 가능한 투영을 생성한다(UC-1).
   **Verify:** `test:`+`view:` 투영이 두 축 + 델타를 보여준다; **Milestone 1 데모 가능**.

## 수용 기준

- [ ] 합성 축이 end to end로 실행된다(capture→Chakra→ASTRA-sim→L0).
- [ ] 두 축이 하나의 experiment 행으로 비교된다(UC-1 / Milestone 1).
- [ ] OQ-01이 기록된다.

## 롤백 / 안전성

분석적 백엔드만 사용(ns-3/SST는 연기). 실행은 run_id별로 불변이며, 어댑터를 되돌리면 롤백된다.

## 인계

Milestone 1 완료. T3/T4 골든 테스트는 실제 A100/OTel 베이스라인을 기다린다. phase-5가 MCP/CLI 표면을 추가한다.
