# RB-041: syntorch sub-torch 캡처

- Status: blocked
- Phase: phase-4-trace-pipeline
- Depends on: [RB-040]   # T1에 게이트됨
- Implements design: [trace-pipeline-syntorch-chakra_ko.md](../../05-caw01-simulation-control-plane/trace-pipeline-syntorch-chakra_ko.md), [serving-and-representation-layer_ko.md](../../05-caw01-simulation-control-plane/serving-and-representation-layer_ko.md), [../../_meta/SOURCE-BRIEF_ko.md](../../_meta/SOURCE-BRIEF_ko.md)
- Produces: `SyntorchCapturePort` 구현 — syntorch 프론트엔드 하에서 sub-torch op 스트림을 기록

## 목표

syntorch의 드롭인 torch 프론트엔드 아래(얇은 vLLM 형태 하네스 하)의 sub-torch op 스트림을 캡처하여,
op별로 다음을 기록한다: id, name, op_class, tensor IO (shape×dtype→bytes), 의존성(deps), comm 타입+크기,
그리고 명시적 타일링/파티셔닝 strategy id.

## 전제조건

- [ ] RB-040 (T1) 통과. syntorch가 하네스에 torch 프론트엔드로 설치됨.
- [ ] 캡처 고도(altitude)(OQ-02)와 vLLM 버전 고정(OQ-05)을 해결하거나, 문서화된 기본값으로 진행하고 이를 명기한다. **SOURCE-BRIEF를 넘어서 syntorch 내부를 날조하지 말 것.**

## 단계

1. **Do:** syntorch를 torch 프론트엔드로 하여 하나의 agent-turn을 실행하는 얇은 vLLM 형태 하네스를 세운다.
   **Verify:** `cmd:` 하네스가 syntorch 하에서 하나의 agent-turn을 실행한다.
2. **Do:** 해결된 고도(OQ-02에 따른 `__torch_dispatch__` / 커스텀 디스패처)에서 캡처를 구현한다. 구체적 shape→bytes와 `strategy_id`를 포함해 op별 필드를 기록한다.
   **Verify:** `test:` 알려진 op에 대해 캡처된 스트림이 올바른 op_class + bytes + strategy_id를 갖는다.
3. **Do:** 네이티브 캡처 아티팩트를 경로로 아티팩트 스토어에 방출하고, `SyntorchCapturePort.capture`로 노출한다.
   **Verify:** `test:` 어댑터가 네이티브 트레이스 경로를 반환한다(인라인 데이터 없음).
4. **Do:** 해결된 캡처 고도 + vLLM 고정을 [open-questions_ko.md](../../08-research-plan/open-questions_ko.md)(OQ-02/OQ-05)에 다시 기록한다.
   **Verify:** `view:` OQ 상태가 갱신된다.

## 수용 기준

- [ ] 하나의 agent-turn이 syntorch 하에서 실행되어 올바른 op별 필드를 갖는 캡처된 op 스트림을 생성한다.
- [ ] 캡처가 경로로 저장되고 `SyntorchCapturePort`로 노출된다.
- [ ] OQ-02/OQ-05가 해결되거나 기본값 처리되어 기록된다.

## 롤백 / 안전성

캡처는 하네스에 대한 읽기 전용 관찰이며, 파괴적 작업이 없다. 고도가 틀리면 export 전에 반복한다.

## 인계

RB-042가 이 네이티브 캡처를 표준 Chakra `.et`로 변환한다.
