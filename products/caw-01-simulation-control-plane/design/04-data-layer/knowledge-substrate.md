# Run-Evidence Provenance & Trust — CAW-01

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [data-model.md](./data-model.md), [../08-research-plan/validation-and-golden-tests.md](../08-research-plan/validation-and-golden-tests.md), [../00-overview/scope-and-non-goals.md](../00-overview/scope-and-non-goals.md)
- **Source of truth:** ../_meta/SOURCE-BRIEF.md

## Purpose

Define the provenance/audit model that keeps **claims, evidence, and generated conclusions separate** for
**this product's own runs** — the invariant that makes CAW-01 outputs usable as evidence that other independent
products (e.g. the paper/patent product CAW-03) can consume across a product boundary.

CAW-01 is an independent, standalone product. It keeps **only the minimal evidence/provenance it needs for its
own runs**. The general knowledge repository — ingesting external `Source`/`Claim`/`Note`/`Concept`/`Interest`/
`OpenQuestion` — is a **separate product (CAW-02)** and is **out of scope here**: CAW-01 does not model those
broad knowledge entities; it can export its own evidence/claims to CAW-02 (or be consumed by it) across a
product boundary, never via a shared store.

## The core invariant

> **Claims must point to evidence. A generated summary is not evidence by itself.**

```
Claim ──(supported by)──► Evidence ──(refers to)──► {SimulationRun | TraceArtifact}
  ▲
generated conclusion ──┘  (must attach Evidence to become publishable)
```

A conclusion produced by the system (e.g. "device X needs more capacity") starts as an **unbacked claim** and
only becomes publishable when Evidence pointing to run outputs (this product's own runs/artifacts) is attached.
External sources and the broad claim graph live in CAW-02 (separate product).

## Trust levels & boundaries

Every `Evidence` (and transitively every `Claim` it backs) carries:

| Field | Values | Use |
| --- | --- | --- |
| `trust_level` | high / medium / low / unverified | gates whether a claim can back a proposal |
| `boundary` | public / internal / confidential | gates what may appear in public-facing outputs |

Guardrails ([SOURCE-BRIEF §11](../_meta/SOURCE-BRIEF.md)):
- No confidential data in public-facing outputs.
- Never conflate public-source research with internal Samsung/SAIT claims (boundary tagging enforces this).

## Trust ladder (for simulation evidence)

Run-derived evidence is graded by where it sits on the trust ladder
([../08-research-plan/validation-and-golden-tests.md](../08-research-plan/validation-and-golden-tests.md)):

1. **Executable assumption** — syntorch makes an unbuilt-device assumption runnable.
2. **Explicit runtime** — tiling/partitioning represented as code/strategy-id, not prose.
3. **Validated trace** — syntorch trace checked against A100/OTel golden evidence.
4. **Cross-axis agreement** — synthetic and simulation axes agree within tolerance on the same L0.

`EvidenceService.trustStatus(runId)` surfaces which rung a run has reached.

## Separation in storage

- Generated text is stored as a `Claim` with `kind='generated'`, never directly as `Evidence`.
- Evidence rows always reference a concrete run/artifact id — never free text.
- Projections cite the `refs` they were computed from, so an artifact's lineage is reconstructable.

## Open questions

Exact `trust_level` promotion rules (what evidence promotes low→high) — TODO(open-question), tied to the
golden-test thresholds.

## Implications for runbooks

The phase-0 data-layer runbook encodes the claim→evidence FK constraint + boundary/trust columns; the
evidence/projection runbook enforces "no publish without evidence."
