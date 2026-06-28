# RB-040: Publish + sink (LaTeX/PDF)

- Status: ready
- Phase: phase-4-publish-interfaces-stubs
- Depends on: [RB-021, RB-013, RB-023]
- Implements design: [../../05-harness-core/artifact-lifecycle.md](../../05-harness-core/artifact-lifecycle.md), [../../04-data-layer/confidentiality-and-provenance.md](../../04-data-layer/confidentiality-and-provenance.md)
- Produces: `publish` + v1 `Sink/PublishAdapter` (LaTeX/PDF) with interlock + confidentiality enforced

## Objective

Emit a reviewed artifact via a `SinkAdapter`, enforcing — in the core, before the adapter — the patent-first
interlock and fail-closed confidentiality redaction.

## Preconditions
- [ ] RB-021 (drafted/reviewed artifacts), RB-013 (confidentiality), RB-023 (interlock).

## Steps
1. **Do:** Implement `adapters/sink/v1/latex-pdf` behind the port; register it.
   **Verify:** `test:` registry selects it; preflight passes.
2. **Do:** Implement `publish(artifactId, sinkRef)`: check interlock (deny if any held) → redact to sink boundary (fail-closed) → emit → Artifact `published`.
   **Verify:** `test:` T3 (held → denied), T7 (over-share → abort; public-safe emitted).
3. **Do:** Require confirmation (human gate) for publish; record provenance of what was emitted.
   **Verify:** `test:` publish without confirmation is refused.

## Acceptance criteria
- [ ] Publish emits via the sink ONLY when interlock clear + confidentiality satisfied (T3, T7); human-confirmed.

## Rollback / safety
Deny-by-default; revert adapter/op to roll back.

## Hand-off
RB-041 adds the review step before publish; RB-043 adds publish stubs (wiki/venue/filing).
