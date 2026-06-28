# Persistence — file store, append-only ledger, schemas, cross-product references by id

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:**
  - [./api-surface.md](./api-surface.md)
  - [./scout-service.md](./scout-service.md)
  - [./experiment-runner-service.md](./experiment-runner-service.md)
  - [../01-decisions/ADR-0007-storage-and-scheduling.md](../01-decisions/ADR-0007-storage-and-scheduling.md)
  - [../01-decisions/ADR-0002-hypothesis-representation.md](../01-decisions/ADR-0002-hypothesis-representation.md)
  - [../01-decisions/ADR-0003-experiment-ledger.md](../01-decisions/ADR-0003-experiment-ledger.md)
  - [../01-decisions/ADR-0008-export-boundaries.md](../01-decisions/ADR-0008-export-boundaries.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
Define CAW-06's **own** file-based store (ADR-0007): the on-disk layout, the per-entity record schemas, the
append-only ledger + `supersede` model, the derived index, and how records **reference CAW-01/CAW-02/CAW-05 by id
across boundaries** (never a shared store). It does NOT define the ops ([api-surface.md](./api-surface.md)), the
pipeline ([scout-service.md](./scout-service.md)), or runner internals ([experiment-runner-service.md](./experiment-runner-service.md)).

## Principles (ADR-0007)
- **Files on disk are the source of truth** — markdown/JSON records + large artifacts by path; git-trackable,
  diffable, zero database infra (brief §7).
- **Append-only with supersede** — the ledger (ADR-0003) and hypothesis `status_log` (ADR-0002) are append-only; a
  correction is a new record with `lineage.supersedes`, never an in-place edit. A **"current" resolver** computes
  latest-state views; nothing is deleted (failures retained, brief §5).
- **Optional derived index** — a disposable SQLite/JSON index rebuilt from files powers negative-results, per-
  hypothesis history, and thread queries. Deleting it loses nothing.
- **Every record carries** `provenance`, `status`/`uncertainty`, and `boundary` in front-matter (brief §7, §12).
- **No shared substrate** — cross-product links are opaque ids + a `boundary` tag; CAW-06 never reads/writes another
  product's store (brief §8).

## Layout
```
store/
  sources/SRC-XXXX.md            # Source (ADR-0005); boundary=internal | import:caw-05
  claims/CLM-XXXX.md             # Claim / CandidateClaim (ADR-0002/0005)
  hypotheses/HYP-XXXX.md         # Hypothesis + append-only status_log (ADR-0002)
  ledger/EXP-XXXX/entry.json     # one run = one append-only entry (ADR-0003)
  ledger/EXP-XXXX/REPRO.md       # reproducibility gate output (runner service)
  implications/IMP-XXXX.md       # ImplicationMap (ADR-0006)
  writeback/WB-XXXX.json         # wbtraffic.v0 artifact (ADR-0004)
  exports/EXP-RCPT-XXXX.json     # export receipts (ADR-0008)
  threads/THR-XXXX.md            # thread spine: source→claim→hyp→exp→impl chain
artifacts/EXP-XXXX/              # configs, metrics, logs, checkpoints, plots (by path; never inlined)
index/                          # disposable derived index (rebuildable from store/)
sources.yaml                    # schedule + adapter registry (ADR-0007/0005)
```
Id scheme: `SRC/CLM/HYP/EXP/IMP/WB/THR-XXXX`, zero-padded, monotonic, never renumbered.

## Common front-matter (every record)
```yaml
id: HYP-0007
kind: hypothesis
provenance: { created_by: ExperimentScout, run_id: RUN-0031, source_refs: [SRC-0003] }
status: hypothesis            # ADR-0002: hypothesis|supported|refuted|inconclusive (reversible; default hypothesis)
uncertainty: { confidence: very-low }   # calibrated qualitative; confidence <= evidence_strength (HARD cap)
boundary: internal            # internal | import:caw-05 | export:caw-01 | export:caw-02
generated: false              # true => generated text; generated is NOT evidence (brief §12)
lineage: { supersedes: null, derived_from: [CLM-0012] }
```

## Entity schemas (key fields)
### Source / Claim
```yaml
# SRC-XXXX  (boundary=import:caw-05 when imported from CAW-05, a separate product)
kind: source
content_hash: <sha256>         # dedup key (S3 canonicalize+dedup)
ref: { url: <tos-safe>, title, authors, venue }
external_ref: { product: caw-05, id: "SIG-0419" }   # opaque id across boundary; NO shared store
```
```yaml
# CLM-XXXX
kind: claim                    # CandidateClaim until reviewed; candidate carries generated:true
statement: "<verbatim or quoted claim>"
checkable: true
source_ref: SRC-0003
```

### Hypothesis (append-only status_log)
```yaml
kind: hypothesis
statement: "<the proposed, uncertain proposition>"   # NEVER printed as a settled claim
claim_ref: CLM-0012
evidence: [ { kind: experiment, ref: EXP-0021, strength: low },
            { kind: generated, ref: GEN-..,  strength: none } ]   # generated cannot promote
status_log:                    # append-only; each StatusEvent reversible; proposals stay pending until human-confirmed
  - { at: TODO, to: hypothesis, by: ExperimentScout, evidence_ref: null }
  - { at: TODO, to: supported,  by: PENDING-REVIEW, evidence_ref: EXP-0021 }   # not applied until Jimmy confirms
```

### Ledger entry (one run = one append-only entry — ADR-0003)
```json
{
  "id": "EXP-0021",
  "hypothesis_id": "HYP-0007",
  "claim_ref": "CLM-0012",
  "prediction": { "metric": "accuracy", "baseline": "<ref>",
                  "expected_direction": ">", "decision_rule": ">= +2pp on >=2/3 seeds" },
  "repro": { "spec_hash": "<sha256>", "seeds": [11,23,42], "code_rev": {}, "env": {}, "repro_md": "REPRO.md" },
  "results": { "per_seed": [], "summary": null, "artifacts_path": "artifacts/EXP-0021/" },
  "verdict": "invalid",
  "failure_mode": "setup-error",
  "writeback_observed": null,
  "lineage": { "supersedes": null, "derived_from": null }
}
```
`launch()` writes this with `verdict=running` then finalizes; a crash leaves `invalid`/`aborted` — failures never
silently dropped. Verdict admissible only after the repro gate passes (else forced `invalid`).

### Writeback artifact (wbtraffic.v0 — ADR-0004)
```json
{
  "id": "WB-0004", "schema_version": "wbtraffic.v0",
  "provenance": { "claim_id": "CLM-0012", "source_url": "<url>" },
  "uncertainty": { "status": "hypothesis" },
  "fast_weights": { "param_count": null, "dtype": null, "fraction_of_model": null },
  "update": { "granularity": null, "updates_per_1k_tokens": null, "optimizer_state_bytes_per_param": null },
  "writeback": { "bytes_per_update": null, "write_bw_bytes_per_s": null, "updated_state_residency": null },
  "ratio_curve": null,
  "assumptions": [], "open_questions": ["wbq-001","wbq-006"]
}
```
Every numeric defaults `null`; a load-bearing unknown becomes `TODO(open-question: …)`, never an invented number.

### Export receipt (ADR-0008)
```json
{ "id": "EXP-RCPT-0002", "target": "caw-01", "adapter": "Caw01WritebackAdapter",
  "bundle": { "content_hash": "<sha256>", "boundary": "export:caw-01" },
  "payload_status": "hypothesis", "gate": "passed", "committed": false,
  "lowered_refs": ["caw-01:op", "caw-01:movement"] }
```
`Caw01WritebackAdapter` lowers `wbtraffic.v0` onto CAW-01's existing L0 objects + an open-question list and ships a
self-describing bundle over a **file boundary**. `Caw02ClaimAdapter` exports claims+evidence to CAW-02. CAW-01/02/05
object/id names are **owned by those products** (re-verify each export); no shared store, no foreign writes.

## Append-only + the "current" resolver
- Writes only **append** a new record/version; `lineage.supersedes` chains corrections.
- The resolver returns the head of each chain for "current verdict per hypothesis" and "current status"; full
  history (incl. failures) stays on disk and feeds the negative-results view.
- `FetchCursor` per adapter (arXiv watermark, Semantic Scholar page, last CAW-05 `bundle_id`) is persisted so
  scheduled re-runs are incremental and idempotent.

## Cross-product references (by id, across boundaries)
| Direction | Mechanism | Store coupling |
|---|---|---|
| Import from CAW-05 | `external_ref{product:caw-05,id}` + `boundary:import:caw-05` | none (opaque id) |
| Export to CAW-01 | self-describing bundle + receipt; `lowered_refs` name CAW-01 L0 objects | none (file drop) |
| Export to CAW-02 | claims+evidence bundle + receipt | none (file drop) |

## Open Questions
- TODO(open-question: index backend — SQLite vs flat JSON; does v1 query volume justify SQLite; ADR-0007.)
- TODO(open-question: retention/GC for large failure artifacts — keep forever by path vs summarize+prune; ADR-0003/0007.)
- TODO(open-question: per-thread file locks for concurrent scheduled runs; ADR-0007.)
- See [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md).

## Implications for runbooks
- RB: file store + id allocator + front-matter validator (provenance/status/boundary required).
- RB: append-only writer + `lineage` supersede + "current" resolver.
- RB: derived index builder (rebuildable) powering negative-results/thread queries.
- RB: export receipt writer under `store/exports/` (ADR-0008).
