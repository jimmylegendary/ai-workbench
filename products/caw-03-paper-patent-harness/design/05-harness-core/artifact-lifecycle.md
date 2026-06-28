# Artifact Lifecycle — CAW-03

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [../04-data-layer/data-model.md](../04-data-layer/data-model.md), [patent-drafting-module.md](./patent-drafting-module.md), [../01-decisions/ADR-0008-artifact-lifecycle-and-storage.md](../01-decisions/ADR-0008-artifact-lifecycle-and-storage.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose

The state machine for an `Artifact` (one paper OR one patent under governance). Shared up to `drafted`, then
branches on `artifact_type`.

## States

```
                       ┌────────────── paper ───────────────┐
gated → assembled → drafting → drafted → reviewed → published
                       └────────────── patent ──────────────┐
gated → assembled → drafting → drafted → reviewed → filing-gate → (filed | held)
                                              ▲
                                  patent-first interlock can HOLD publish/filing
```

| State | Meaning |
| --- | --- |
| `gated` | a GatedClaimSet exists (gate passed) |
| `assembled` | engine-neutral inputs built (papers) / patent inputs built |
| `drafting` | engine subprocess running |
| `drafted` | DraftResult captured (LaTeX/PDF/scores or PatentDraft) + provenance |
| `reviewed` | review checklist + scores recorded |
| `published` (paper) | emitted via Sink (public-safe), interlock clear |
| `filing-gate` (patent) | ready-for-filing; awaits human/counsel |
| `held` | blocked by the patent-first interlock or confidentiality fail-closed |

## Invariants per transition

- `gated → assembled`: refuses ungated claims.
- `drafted → published`: confidentiality redaction (fail-closed) **and** no held interlock
  ([../04-data-layer/confidentiality-and-provenance.md](../04-data-layer/confidentiality-and-provenance.md)).
- `reviewed → filing-gate`: never auto-files; human/counsel required.

## Provenance & immutability

Each `drafting` run is a new `EngineRun`; outputs are immutable per run. The artifact retains the `GatedClaimSet`,
the `FigureTableManifest`, and the review result for full reconstructability.

## Open questions

Re-gating in-flight artifacts when a CAW-02 bundle is superseded (poll/webhook/re-import-on-build) — see
[../08-research-plan/open-questions.md](../08-research-plan/open-questions.md).

## Implications for runbooks

The lifecycle/publish runbook implements the state machine + the per-transition invariants (gate, interlock,
confidentiality).
