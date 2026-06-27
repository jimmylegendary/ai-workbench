# RB-040: Chakra ↔ ASTRA-sim 레퍼런스 라운드트립 (GATE, T1)

- Status: ready
- Phase: phase-4-trace-pipeline
- Depends on: [RB-031]
- Implements design: [trace-pipeline-syntorch-chakra_ko.md](../../05-caw01-simulation-control-plane/trace-pipeline-syntorch-chakra_ko.md), [../../08-research-plan/validation-and-golden-tests_ko.md](../../08-research-plan/validation-and-golden-tests_ko.md), [../../01-decisions/ADR-0005-trace-pipeline_ko.md](../../01-decisions/ADR-0005-trace-pipeline_ko.md)
- Produces: 안정적 메트릭을 갖는 검증된 Chakra `.et` → `et_feeder` → ASTRA-sim 경로 (**RB-041–043의 게이트**)

## 목표

syntorch 작업에 **앞서** Chakra 교환 허리의 위험을 줄인다: Chakra 스키마 리비전을 고정하고, 레퍼런스
`.et`를 ASTRA-sim(분석적 백엔드)에 투입하여 결정론적 메트릭을 확인한다. 이것이 테스트 **T1**이며 강제 게이트다.

## 전제조건

- [ ] RB-031 (Chakra→L0 lowering) 완료. ASTRA-sim + Chakra 툴체인이 `engine/`에 가용.

## 단계

1. **Do:** Chakra `et_def.proto` 리비전을 고정하고(OQ-04 해결) [tech-stack_ko.md](../../03-architecture/tech-stack_ko.md)에 기록한다.
   **Verify:** `view:` 고정 리비전이 기록되고 OQ-04가 갱신된다.
2. **Do:** 레퍼런스 rank별 `.et`(알려진 작은 워크로드)를 확보/작성한다. 단순 하드웨어 모델을 사용해 `et_feeder` + ASTRA-sim 분석적 구성을 세운다.
   **Verify:** `cmd:` ASTRA-sim이 `.et`를 수집하고 메트릭을 방출한다.
3. **Do:** 두 번 실행하여 실행 간 메트릭이 결정론적임을 확인한다.
   **Verify:** `test:` 두 실행이 동일한 메트릭을 산출한다(T1 통과).
4. **Do:** 동일한 레퍼런스 `.et`를 RB-031을 통해 L0로 낮추고, 롤업을 기대치와 대조하여 점검한다.
   **Verify:** `test:` 레퍼런스로부터 나온 L0 용량/트래픽이 타당하다.

## 수용 기준

- [ ] Chakra 리비전이 고정 + 기록됨.
- [ ] 레퍼런스 `.et` → ASTRA-sim이 **결정론적** 메트릭을 산출한다 (**T1 통과**).
- [ ] 동일한 `.et`가 타당한 L0로 낮춰진다.

## 롤백 / 안전성

레퍼런스 자산 + 구성뿐이다. T1이 실패하면 syntorch 연결로 **진행하지 말고** — 먼저 교환을 고친다(RK-1).

## 인계

Chakra→ASTRA-sim 경로가 신뢰된다. 파이프라인의 *앞단*(syntorch capture + exporter)만 가변으로 남는다.
RB-041–043이 이제 차단 해제된다.
