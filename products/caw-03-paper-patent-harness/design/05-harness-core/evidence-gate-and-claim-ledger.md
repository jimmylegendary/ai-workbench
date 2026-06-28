# Evidence Gate & Claim Ledger — CAW-03

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [input-assembly.md](./input-assembly.md), [../04-data-layer/data-model.md](../04-data-layer/data-model.md), [../01-decisions/ADR-0003-evidence-gate-and-claim-ledger.md](../01-decisions/ADR-0003-evidence-gate-and-claim-ledger.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose

The load-bearing integrity mechanism: the claim ledger (imported, not owned) and the evidence gate that decides
which claims may enter a draft.

## Claim ledger (imported by reference)

CAW-03 builds a ledger of `ClaimRef`s from an imported CAW-02 claim+evidence bundle. It **references** CAW-02 claims
and evidence by id/URI and **never re-owns** the knowledge repo ([../04-data-layer/data-model.md](../04-data-layer/data-model.md)).
Each `ClaimRef` carries: claim_type (P1/P2/P3), evidence_refs, boundary, and a cached gate_status.

## The gate

A **type-specific, profile-configurable** policy applied as a **precondition on input assembly**. It is a config
object (a gate profile), not hard-coded.

| Claim type | Typical minimum (configurable) |
| --- | --- |
| **P1/P2** (method/tool) | ≥1 evidence resolving to a real artifact; trust ≥ profile threshold |
| **P3** (future-device) | stricter: explicit assumption provenance + higher trust; often patent-sensitive |

**The one invariant no profile can relax:** *generated text is never evidence.* `evidence_refs` must resolve to a
real CAW-02 evidence id/artifact; a synthesis/summary cannot satisfy the gate.

## Behavior

- **Fail-closed:** a claim that does not pass is **blocked**; it cannot reach the engine.
- **Blocked-claim backlog:** blocked claims persist as visible `ClaimRef(gate_status=blocked)` work items (leaning
  persist, mirroring CAW-02's needs-evidence). 
- **Paper vs patent overlay:** the gate profile can add per-path requirements (e.g. patent path requires
  enablement-relevant evidence) — final legal judgment is deferred to human/counsel.

## Output

A `GatedClaimSet` — the shared front consumed by both [input-assembly.md](./input-assembly.md) (papers) and the
[patent-drafting-module.md](./patent-drafting-module.md).

## Open questions

Claim-typing auto-vs-human; per-venue minimum trust; re-gating when a CAW-02 bundle is superseded — see
[../08-research-plan/open-questions.md](../08-research-plan/open-questions.md).

## Implications for runbooks

The gate runbook implements the profile engine + the generated-text-never-evidence check + the fail-closed block +
the backlog; tested so no surface/adapter can bypass it.
