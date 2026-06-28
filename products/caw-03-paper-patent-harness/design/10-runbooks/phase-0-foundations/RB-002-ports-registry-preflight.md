# RB-002: Ports, adapter registry, and preflight

- Status: ready
- Phase: phase-0-foundations
- Depends on: [RB-001]
- Implements design: [../../05-harness-core/ports-and-adapters.md](../../05-harness-core/ports-and-adapters.md), [../../07-backend-api/adapter-registry-and-config.md](../../07-backend-api/adapter-registry-and-config.md), [../../01-decisions/ADR-0005-ports-and-adapters.md](../../01-decisions/ADR-0005-ports-and-adapters.md)
- Produces: the 5 typed ports + value objects, the config-driven registry, capability preflight, and fakes

## Objective

Build the hexagonal seam: the five port interfaces, the registry that selects adapters by config, capability-
descriptor preflight, the documented-stub pattern, and fake adapters for tests — before any real adapter.

## Preconditions
- [ ] RB-001 complete.

## Steps
1. **Do:** Define the 5 ports (`SourceAdapter, WritingEngineAdapter, PatentEngineAdapter, SinkAdapter, NoveltyAdapter`) + value objects (`Bundle, EngineInputs, DraftResult, Descriptor`) per [ports-and-adapters.md](../../05-harness-core/ports-and-adapters.md).
   **Verify:** `cmd: tsc --noEmit`.
2. **Do:** Build the registry: discover + select-by-config + **preflight** (validate `configSchema`, version/feature compat; reject incompatible). Secrets via env refs.
   **Verify:** `test:` preflight rejects an adapter with bad config / incompatible version; accepts a good one.
3. **Do:** Implement the **documented-stub** pattern: a stub advertises `implemented:false`; selecting it is allowed but flagged unavailable (never a silent governance-dropping no-op).
   **Verify:** `test:` selecting a stub returns a clear unavailable result; governance not bypassed.
4. **Do:** Provide **fake** adapters per port for downstream tests (incl. a deliberately-misbehaving fake).
   **Verify:** `test:` fakes load via the registry.

## Acceptance criteria
- [ ] 5 ports compile; registry selects by config; preflight rejects incompatible adapters.
- [ ] Stub pattern works (selectable, flagged, safe); fakes available.

## Rollback / safety
Interfaces + registry only; revert to roll back. No real external calls yet.

## Hand-off
Every later adapter (v1 + stubs) plugs into this registry; the core depends only on these ports.
