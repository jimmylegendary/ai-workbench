# Data Model — CAW-03

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [storage-strategy.md](./storage-strategy.md), [confidentiality-and-provenance.md](./confidentiality-and-provenance.md), [../05-harness-core/artifact-lifecycle.md](../05-harness-core/artifact-lifecycle.md), [../01-decisions/ADR-0008-artifact-lifecycle-and-storage.md](../01-decisions/ADR-0008-artifact-lifecycle-and-storage.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose

CAW-03's OWN minimal governance data model. CAW-03 **references** CAW-01 results and CAW-02 claims/evidence by
id/URI — it never duplicates them. Storage placement is in [storage-strategy.md](./storage-strategy.md).

## Principle

Own only what governance needs; reference everything else. No knowledge repo here (that's CAW-02); no runs here
(that's CAW-01).

## Entities

| Entity | Key fields | Notes |
| --- | --- | --- |
| `ClaimRef` | claim_id (CAW-02), bundle_id, claim_type(P1/P2/P3), gate_status, evidence_refs[] | reference into the imported CAW-02 ledger; gate result cached |
| `Bundle` | id, source_adapter, imported_at, boundary, provenance_manifest_ref | one import from a SourceAdapter |
| `GatedClaimSet` | id, claim_refs[], profile, gated_at | the shared front for paper & patent |
| `Artifact` | id, type(paper\|patent), state, gated_set_id, confidentiality_track, engine_run_id, review_id, output_ref | one paper or one patent under governance |
| `EngineRun` | id, engine_adapter, workspace_path, inputs_ref, outputs_ref(LaTeX/PDF/scores), provenance(figure↔result) | a draft run |
| `FigureTableManifest` | artifact_id, items[]{figure_id, result_id(CAW-01), caption} | binds outputs to CAW-01 results |
| `ReviewResult` | artifact_id, checklist[], scores, verdict | review checklist + autorater scores |
| `NoveltyFinding` | claim_ref, novel\|threatened\|patent_sensitive, evidence[](citation_pool/radar) | from Novelty/Radar |
| `PaperLadderEntry` | paper_id(P1/P2/P3), claim_refs[], readiness, threats[] | ladder governance |
| `AdapterConfig` | port, adapter_id, version, config, enabled | the config-driven registry |
| `InterlockState` | claim_ref, patent_first, status(held\|released) | patent-first interlock |

## References, not copies

```
ClaimRef.claim_id        → CAW-02 claim (id/URI)
ClaimRef.evidence_refs   → CAW-02 evidence (id/URI)
FigureTableManifest.result_id → CAW-01 result/projection (id/URI)
Artifact.output_ref      → file path (PDF / patent draft)
```

## Invariants

- An `Artifact` may only reference claims in a `GatedClaimSet` (no ungated claim drafted).
- `publish` on an artifact whose claim set has any `InterlockState=held` is denied ([ADR-0004](../01-decisions/ADR-0004-patent-drafting.md)).
- Every `ClaimRef.evidence_refs` points to a CAW-02 evidence id — never inline generated text.

## Open questions

Whether blocked claims persist as first-class `ClaimRef(gate_status=blocked)` backlog (leaning yes) — see
[../08-research-plan/open-questions.md](../08-research-plan/open-questions.md).

## Implications for runbooks

The phase that builds the governance store creates these tables/files; the gate + assembly + publish runbooks
enforce the invariants above.
