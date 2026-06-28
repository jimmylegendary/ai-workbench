# Confidentiality & Provenance — CAW-03

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [data-model.md](./data-model.md), [../05-harness-core/artifact-lifecycle.md](../05-harness-core/artifact-lifecycle.md), [../01-decisions/ADR-0007-confidentiality-and-boundary.md](../01-decisions/ADR-0007-confidentiality-and-boundary.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose

How CAW-03 inherits CAW-02's confidentiality model and preserves provenance across the import/export boundaries.

## Inherited boundary model (from CAW-02, verbatim)

Two axes carried on every imported item and every artifact:

| Axis | Values | Meaning |
| --- | --- | --- |
| `boundary` | public / internal / confidential | what may be exposed |
| `visibility` | team / private | who may see it |

CAW-03 adds (proposed) a stricter **counsel / pre-filing tier** above `internal` for patent secrets
([ADR-0007](../01-decisions/ADR-0007-confidentiality-and-boundary.md)) — TODO(open-question: exact tier).

## Enforcement points

| Point | Rule |
| --- | --- |
| **Import** | a bundle carries its boundary; over-boundary content is quarantined/rejected |
| **Gate/assembly** | the engine never receives content above the artifact's confidentiality track |
| **Publish/export** | **fail-closed**: redact to the sink's allowed boundary; public sink → public-safe only; abort on over-share |
| **Patent path** | patent-first interlock + counsel tier; no autonomous filing |

## Provenance chain

```
Artifact → GatedClaimSet → ClaimRef(CAW-02 claim) → evidence_refs(CAW-02 evidence) → result_id(CAW-01)
DraftResult → FigureTableManifest(figure_id ↔ result_id)
```

Every drafted assertion is reconstructable back to a CAW-02 claim+evidence and a CAW-01 result. Generated text is
never promoted to evidence ([ADR-0003](../01-decisions/ADR-0003-evidence-gate-and-claim-ledger.md)).

## Redaction ruleset

Reuse CAW-02's redaction semantics. Home of the ruleset (vendored+pinned copy vs pinned in the import envelope) is
an open question — must avoid a shared runtime dependency (no shared substrate).

## Open questions

Counsel tier definition; redaction-ruleset home; reclassification authority (local clearance vs CAW-02 re-import) —
[../08-research-plan/open-questions.md](../08-research-plan/open-questions.md).

## Implications for runbooks

The publish + import runbooks implement the fail-closed redaction + boundary checks; the patent runbook implements
the counsel tier + interlock.
