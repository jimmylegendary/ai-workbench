# RB-022: Canvas 2 — serving & representation 조합

- Status: ready
- Phase: phase-2-canvases
- Depends on: [RB-020]
- Implements design: [canvas-2-serving-representation.md](../../05-caw01-simulation-control-plane/canvas-2-serving-representation_ko.md), [serving-and-representation-layer.md](../../05-caw01-simulation-control-plane/serving-and-representation-layer_ko.md)
- Produces: 타입 핸들 노드, 문법(grammar) 검증, serialize→SimulationConfig을 갖춘 Canvas 2

## 목표

Canvas 2는 사용자가 LLM model → serving framework → representation layer → Chakra exporter → ASTRA-sim을 연결하도록 하며,
파이프라인 문법에 대해 검증하고, 유효한 그래프를 `SimulationConfig`으로 직렬화한다.

## 사전 조건

- [ ] RB-020 완료. `RegistryService`가 model/serving/strategy 카탈로그를 반환한다(스텁 허용).

## 단계

1. **Do:** **타입이 지정된 source/target 핸들**을 갖춘 노드 타입(LLM model, serving{vLLM|LLMServingSim}, representation{torch|syntorch}, Chakra exporter, ASTRA-sim{analytical|+SST})을 정의한다.
   **Verify:** `view:` 노드가 registry로부터 렌더링된다; 핸들에 타입이 지정되어 있다.
2. **Do:** **문법 검증**을 구현한다([serving-and-representation-layer.md](../../05-caw01-simulation-control-plane/serving-and-representation-layer_ko.md)의 합법적 연결); 불법 엣지는 인라인 사유와 함께 거부한다; ASTRA-sim 이전에 하드웨어 구성을 요구한다.
   **Verify:** `test:` 합법적 연결은 수락된다; 예를 들어 vLLM-frontend 없는 syntorch와 astrasim 이후의 exporter는 거부된다.
3. **Do:** 유효한 그래프를 `SimulationConfig`(serving_choice, representation, simulator_path, backend, hw_config_ref)으로 직렬화한다.
   **Verify:** `test:` 유효한 그래프가 스키마에 부합하는 `SimulationConfig`을 생성한다.
4. **Do:** 편집 시 `intent_event` + `c2_wiring` change_blob을 방출한다; dirty로 표시한다.
   **Verify:** `test:` 연결 편집이 change_blob을 생성한다.

## 수용 기준

- [ ] 타입 핸들 + 문법 검증이 불법 연결을 사유와 함께 거부한다.
- [ ] 유효한 조합이 `SimulationConfig`으로 직렬화된다.
- [ ] 편집이 `c2_wiring` change_blob을 생성한다.

## 롤백 / 안전성

UI이므로 롤백하려면 되돌린다. 유효하지 않은 config는 실행할 수 없다(RunService가 다시 검증함).

## 인계(Hand-off)

Canvas 2는 `RunService.start`가 소비하는 `SimulationConfig`을 생성한다; Canvas 1 + Canvas 3과 결합하면 실행 가능한 실험을 구성한다.
