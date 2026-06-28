# Storage Strategy — CAW-03

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [data-model.md](./data-model.md), [../01-decisions/ADR-0008-artifact-lifecycle-and-storage.md](../01-decisions/ADR-0008-artifact-lifecycle-and-storage.md), [../03-architecture/system-architecture.md](../03-architecture/system-architecture.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose

What lives where: CAW-03's own governance data vs references vs large artifacts vs the engine workspace.

## Placement

| Data | Store | Why |
| --- | --- | --- |
| Governance entities (ClaimRef, Bundle, GatedClaimSet, Artifact, EngineRun, ReviewResult, NoveltyFinding, PaperLadder, AdapterConfig, InterlockState) | **SQLite (or md+SQLite)** | small, queryable, consistent with siblings |
| CAW-01 results / CAW-02 claims+evidence | **referenced by id/URI** | owned by those independent products, not duplicated |
| Produced artifacts (PDF, patent draft, LaTeX) | **filesystem by path** (`artifacts/`) | large blobs never in rows |
| Engine working files (PaperOrchestra subprocess) | **`workspace/`** (ephemeral, gitignored) | scratch for the engine run |
| Config / gate profiles / confidentiality rules | **tracked config files** | reviewable, version-controlled |

## Direction (decide in ADR-0008)

- v1 leans **SQLite single-file** governance DB + filesystem artifacts; revisit md-first if human-diff of governance
  state becomes valuable. (Open question.)
- Keep dialect-portable so a later Postgres move is mechanical (consistent with CAW-01/02).

## Imported provenance

A `Bundle` import stores a **provenance manifest reference** so an artifact's lineage (claim → evidence → result)
is reconstructable across the import boundary, without a shared store ([confidentiality-and-provenance.md](./confidentiality-and-provenance.md)).

## Lifecycle & cleanup

- `workspace/` is cleared per run; `artifacts/` are retained per artifact.
- Re-drafts create a new `EngineRun`; outputs are immutable per run.

## Open questions

SQLite single-file vs directory-of-files; redaction-ruleset home (vendored vs envelope-pinned) — see
[../08-research-plan/open-questions.md](../08-research-plan/open-questions.md).

## Implications for runbooks

Phase-0 sets up the governance store + `workspace/`/`artifacts/` conventions; the engine runbook writes into them.
