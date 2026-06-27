# RB-041: syntorch sub-torch capture

- Status: blocked
- Phase: phase-4-trace-pipeline
- Depends on: [RB-040]   # gated on T1
- Implements design: [trace-pipeline-syntorch-chakra.md](../../05-caw01-simulation-control-plane/trace-pipeline-syntorch-chakra.md), [serving-and-representation-layer.md](../../05-caw01-simulation-control-plane/serving-and-representation-layer.md), [../../_meta/SOURCE-BRIEF.md](../../_meta/SOURCE-BRIEF.md)
- Produces: `SyntorchCapturePort` impl — records the sub-torch op stream under the syntorch frontend

## Objective

Capture the sub-torch op stream below syntorch's drop-in torch frontend (under a thin vLLM-shaped harness),
recording per op: id, name, op_class, tensor IO (shape×dtype→bytes), deps, comm type+size, and the explicit
tiling/partitioning strategy id.

## Preconditions

- [ ] RB-040 (T1) passed. syntorch installed as the torch frontend in the harness.
- [ ] Resolve capture altitude (OQ-02) and vLLM version pin (OQ-05), or proceed with the documented default and note it. **Do not fabricate syntorch internals beyond the SOURCE-BRIEF.**

## Steps

1. **Do:** Stand up a thin vLLM-shaped harness running one agent-turn with syntorch as the torch frontend.
   **Verify:** `cmd:` the harness executes one agent-turn under syntorch.
2. **Do:** Implement capture at the resolved altitude (`__torch_dispatch__` / custom dispatcher per OQ-02); record per-op fields incl. concrete shapes→bytes and `strategy_id`.
   **Verify:** `test:` the captured stream for a known op has correct op_class + bytes + strategy_id.
3. **Do:** Emit the native capture artifact to the artifact store by path; expose via `SyntorchCapturePort.capture`.
   **Verify:** `test:` the adapter returns a native-trace path (no inline data).
4. **Do:** Record the resolved capture altitude + vLLM pin back into [open-questions.md](../../08-research-plan/open-questions.md) (OQ-02/OQ-05).
   **Verify:** `view:` OQ statuses updated.

## Acceptance criteria

- [ ] One agent-turn runs under syntorch and produces a captured op stream with correct per-op fields.
- [ ] Capture is stored by path and exposed via `SyntorchCapturePort`.
- [ ] OQ-02/OQ-05 resolved-or-defaulted and recorded.

## Rollback / safety

Capture is read-only observation of the harness; no destructive ops. If altitude is wrong, iterate before exporting.

## Hand-off

RB-042 converts this native capture into a standard Chakra `.et`.
