# RB-032: 시뮬레이션 런타임 서비스 + 실행(run) 라이프사이클

- Status: ready
- Phase: phase-3-simulation-engine
- Depends on: [RB-031, RB-012]
- Implements design: [simulation-engine-and-projection_ko.md](../../05-caw01-simulation-control-plane/simulation-engine-and-projection_ko.md), [simulation-runtime-service_ko.md](../../07-backend-api/simulation-runtime-service_ko.md), [../../03-architecture/system-architecture_ko.md](../../03-architecture/system-architecture_ko.md)
- Produces: 프로세스 외부(out-of-process) Python 엔진 서비스 + `@caw/engine-adapters` 연결 + 실제 `RunService`

## 목표

프로세스 외부 Python 엔진과 TS 어댑터를 세워 `RunService.start`가 실제 실행을 디스패치하고
(우선 LLMServingSim를 통한 시뮬레이션 축), 축별 상태를 스트리밍하며, 아티팩트 경로 + 메트릭을 반환하도록 한다.

## 전제조건

- [ ] RB-031 (Chakra→L0 lowering) 완료. RB-012의 스텁 엔진은 여기서 교체된다.

## 단계

1. **Do:** 실행(run) 엔드포인트를 노출하는 Python 엔진 서비스(OQ-09에 따라 FastAPI + SSE 쪽으로 기운다)를 만들어, 내부적으로 LLMServingSim와 L0 lowering을 호출하도록 한다.
   **Verify:** `cmd:` 서비스가 시작되고 헬스 체크가 응답한다.
2. **Do:** `ServingSimPort` + `L0LoweringPort`(+ syntorch/exporter/astrasim 포트용 스텁, phase-4에서 채움)에 대한 `@caw/engine-adapters`를 구현하여 서비스와 통신한다.
   **Verify:** `test:` 어댑터가 서비스를 호출하고 아티팩트 경로를 반환한다(인라인 blob 없음).
3. **Do:** `RunService`에 실행 상태 기계(draft→queued→running→done/failed/stopped)를 구현하고, `SimulationRun`을 영속화하며, 상태를 SSE 라우트로 스트리밍한다.
   **Verify:** `view:` UI의 Run이 시뮬레이션 축 실행에 대해 실제 스트리밍 상태를 보여준다.
4. **Do:** 완료 시 `TraceArtifact`(경로), `Metric`, 낮춰진 L0를 하나의 트랜잭션으로 등록한다.
   **Verify:** `test:` 완료된 실행이 (경로별) 아티팩트 행, 메트릭, DB의 L0를 갖는다.

## 수용 기준

- [ ] Python 엔진이 프로세스 외부에서 실행되며, web은 절대 이를 import하지 않는다.
- [ ] 시뮬레이션 축 실행이 Chakra → L0 → 메트릭을 생성하고, 아티팩트는 경로로 저장된다.
- [ ] 실행 상태 기계 + 스트리밍 상태가 end to end로 동작한다.

## 롤백 / 안전성

엔진은 분리되어 있으므로 서비스를 중지하면 실행이 비활성화된다. 필요 시 어댑터는 RB-012 스텁으로 되돌린다. 아티팩트는
run_id별로 불변(immutable)이다.

## 인계

RB-033이 이 실행들을 비교 가능한 투영으로 바꾸고, phase-4가 동일한 포트 뒤에 합성(syntorch) 축을 추가한다.
