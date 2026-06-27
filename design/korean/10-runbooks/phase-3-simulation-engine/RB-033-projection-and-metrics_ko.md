# RB-033: 비교 가능한 투영(projection) + 메트릭 (T2 수용)

- Status: ready
- Phase: phase-3-simulation-engine
- Depends on: [RB-032]
- Implements design: [simulation-engine-and-projection_ko.md](../../05-caw01-simulation-control-plane/simulation-engine-and-projection_ko.md), [control-panel-and-run-lifecycle_ko.md](../../05-caw01-simulation-control-plane/control-panel-and-run-lifecycle_ko.md), [../../08-research-plan/validation-and-golden-tests_ko.md](../../08-research-plan/validation-and-golden-tests_ko.md)
- Produces: `EvidenceService.projection` + 컨트롤 패널 투영 표시; **T2 L0 라운드트립 테스트**

## 목표

실행들을 컨트롤 패널에 렌더링되는 비교 가능한 투영(용량 피크, 트래픽, 지연시간, 축 간 델타, 신뢰 단계(trust rung))으로
바꾸고, **T2 L0 라운드트립**을 입증한다: ServingSim 스타일과 syntorch 스타일 출력(syntorch는
phase-4까지 스텁일 수 있음)이 하나의 L0로 낮춰져 하나의 행으로 비교된다.

## 전제조건

- [ ] RB-032 (L0를 생성하는 실제 실행) 완료.

## 단계

1. **Do:** 축별 롤업을 비교 가능한 행 + `delta`로 정렬하는 `EvidenceService.projection(experiment, refs[])`를 구현한다.
   **Verify:** `test:` 두 실행에 대한 투영이 정렬된 행 + 올바른 델타를 산출한다.
2. **Do:** 사다리(ladder) 규칙에 따라 실행별 `trustStatus`(신뢰 단계)를 노출한다.
   **Verify:** `test:` 명시적 strategy_id를 가진 실행이 올바른 단계를 보고한다.
3. **Do:** 스토어에 바인딩된 `ProjectionReadout` + `EvidenceList`를 컨트롤 패널에 렌더링한다.
   **Verify:** `view:` 실행 후 패널이 용량/트래픽/지연시간 + 델타 + 신뢰 단계를 보여준다.
4. **Do:** **T2 테스트**를 구현한다: ServingSim 스타일 출력과 syntorch 스타일 픽스처를 lowering에 투입하여 둘 다 유효한 L0와 스키마 충돌 없는 비교 가능한 투영을 생성함을 단언한다.
   **Verify:** `test:` T2 통과 ([../../08-research-plan/validation-and-golden-tests_ko.md](../../08-research-plan/validation-and-golden-tests_ko.md)).

## 수용 기준

- [ ] 투영이 축들을 델타를 가진 비교 가능한 행으로 정렬한다.
- [ ] 컨트롤 패널이 투영 + 증거(evidence) + 신뢰 단계를 렌더링한다.
- [ ] **T2 L0 라운드트립 통과** (Milestone-1 게이트).

## 롤백 / 안전성

저장된 실행에 대한 읽기 전용 파생이므로 되돌리면 롤백된다. 신뢰 단계의 임계값은 TODO(open-question)로 남아 있다
(T3/T4는 실제 베이스라인을 기다린다).

## 인계

phase-4가 실제 syntorch 축을 공급하면 Milestone 1을 데모할 수 있고, UC-1이 end to end로 동작한다.
