# RB-032: Simulation runtime service + run lifecycle

- Status: ready
- Phase: phase-3-simulation-engine
- Depends on: [RB-031, RB-012]
- Implements design: [simulation-engine-and-projection.md](../../05-caw01-simulation-control-plane/simulation-engine-and-projection.md), [simulation-runtime-service.md](../../07-backend-api/simulation-runtime-service.md), [../../03-architecture/system-architecture.md](../../03-architecture/system-architecture.md)
- Produces: out-of-process Python engine service + `@caw/engine-adapters` wiring + real `RunService`

## Objective

Stand up the out-of-process Python engine and the TS adapters so `RunService.start` dispatches a real run
(simulation axis via LLMServingSim first), streams per-axis status, and hands back artifact paths + metrics.

## Preconditions

- [ ] RB-031 (Chakra→L0 lowering) complete. RB-012's stub engine is replaced here.

## Steps

1. **Do:** Create the Python engine service (lean toward FastAPI + SSE per OQ-09) exposing run endpoints that internally call LLMServingSim and the L0 lowering.
   **Verify:** `cmd:` the service starts; a health check responds.
2. **Do:** Implement `@caw/engine-adapters` for `ServingSimPort` + `L0LoweringPort` (+ stubs for syntorch/exporter/astrasim ports, filled in phase-4) talking to the service.
   **Verify:** `test:` the adapter invokes the service and returns artifact paths (no inline blobs).
3. **Do:** Implement the run state machine in `RunService` (draft→queued→running→done/failed/stopped); persist `SimulationRun`; stream status to the SSE route.
   **Verify:** `view:` Run in the UI shows real streaming status for a simulation-axis run.
4. **Do:** On completion, register `TraceArtifact` (paths), `Metric`, and the lowered L0 in one transaction.
   **Verify:** `test:` a completed run has artifact rows (by path), metrics, and an L0 in the DB.

## Acceptance criteria

- [ ] Python engine runs out-of-process; web never imports it.
- [ ] A simulation-axis run produces Chakra → L0 → metrics, artifacts stored by path.
- [ ] Run state machine + streaming status work end to end.

## Rollback / safety

Engine is separate; stop the service to disable runs. Adapters revert to the RB-012 stub if needed. Artifacts are
immutable per run_id.

## Hand-off

RB-033 turns these runs into comparable projections; phase-4 adds the synthetic (syntorch) axis behind the same ports.
