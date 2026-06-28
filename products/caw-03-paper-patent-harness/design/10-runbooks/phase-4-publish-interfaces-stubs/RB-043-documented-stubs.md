# RB-043: Documented stubs (future connectors)

- Status: ready
- Phase: phase-4-publish-interfaces-stubs
- Depends on: [RB-002]
- Implements design: [../../05-harness-core/ports-and-adapters.md](../../05-harness-core/ports-and-adapters.md), [../../01-decisions/ADR-0005-ports-and-adapters.md](../../01-decisions/ADR-0005-ports-and-adapters.md)
- Produces: documented stub adapters for internal wiki, experiment-server, venue submission, patent filing, live prior-art

## Objective

Ship the brief-mandated **open seams** as documented stubs so future integrations are "fill in one adapter", not a
redesign. A stub = interface impl + `implemented:false` descriptor + config example + a README note.

## Preconditions
- [ ] RB-002 (ports/registry/preflight + stub pattern).

## Steps
1. **Do:** Create stub adapters:
   - `source/stubs/internal-wiki`, `source/stubs/experiment-server`
   - `sink/stubs/internal-wiki-publish`, `sink/stubs/venue-submission`, `sink/stubs/patent-filing`
   - `novelty/stubs/live-prior-art`
   Each with the port interface, an `implemented:false` capability descriptor, a config example, and a README explaining how to complete it.
   **Verify:** `test:` each stub is discoverable + selectable; preflight reports `implemented:false`.
2. **Do:** Ensure selecting a stub never bypasses governance and never silently succeeds (clear unavailable signal).
   **Verify:** `test:` T5 — a stub source/sink yields a safe unavailable result; gate/confidentiality intact.
3. **Do:** Document in each adapter folder exactly what implementing the real connector entails (the seam contract).
   **Verify:** `view:` each stub has a "to implement" note referencing the port contract.

## Acceptance criteria
- [ ] All listed stubs exist, selectable, flagged `implemented:false`, governance-safe (T5).
- [ ] Each documents how to complete the real connector.

## Rollback / safety
Stubs are inert; remove to roll back. They must never act as silent no-ops that drop governance.

## Hand-off
Wiring a real internal wiki / experiment-server / venue / filing connector later = implementing that one adapter;
the core is untouched.
