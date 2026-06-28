# RB-031: Implement the `ImplicationMap` model + validator + routing hints

- Status: ready
- Phase: phase-3-writeback-and-implication
- Depends on: [RB-001 (store layout + record schemas), RB-02X (a finding exists: ledger entry / status-tagged hypothesis), RB-030 (`wbtraffic.v0` artifact id for `writeback_payload_ref`)]
- Implements design:
  - [../../05-ttt-research-core/implication-mapping.md](../../05-ttt-research-core/implication-mapping.md)
  - [../../01-decisions/ADR-0006-implication-mapping.md](../../01-decisions/ADR-0006-implication-mapping.md)
  - [../../01-decisions/ADR-0002-hypothesis-representation.md](../../01-decisions/ADR-0002-hypothesis-representation.md) (status/uncertainty carried)
  - [../../01-decisions/ADR-0003-experiment-ledger.md](../../01-decisions/ADR-0003-experiment-ledger.md) (results become `evidence_refs`)
  - [../../01-decisions/ADR-0008-export-boundaries.md](../../01-decisions/ADR-0008-export-boundaries.md) (the gate the hints feed, never the emit)
  - [../../09-roadmap/milestones-and-phases.md](../../09-roadmap/milestones-and-phases.md) (P3 exit; M1 ImplicationMap line)
- Produces:
  - `ImplicationMap` record schema (6-domain closed enum) + validator
  - `route(map)` computing `export_targets` **hints only** (no emit)
  - persistence into `store/implications/`

## Objective
A builder can fan **one finding** (a logged result, a status-changed hypothesis, or an extracted claim) out into
typed, uncertainty-tagged claims-about-consequences across the **fixed six domains**, persist the map in
CAW-06's OWN `store/implications/`, and compute `export_targets` **routing hints** — without ever emitting an
export (that is RB-4XX / ADR-0008). "Done" = one `ImplicationMap` exists for an M1 finding with
`summary_generated: true` (the summary is **generated, never evidence**), every implication carrying its own
independent `status` + `confidence`, every `evidence_refs` resolving to a real ledger result or extracted claim,
`status: hypothesis` un-liftable by the summary, and refuted/inconclusive implications retained as first-class
"axis not observed" signals. A bare hypothesis with no evidence is produced but routes to **no** target by
design.

## Preconditions
- [ ] A finding exists to anchor `finding_ref` (ADR-0003 ledger result, ADR-0002 hypothesis, or ADR-0005
      claim). A **refuted/inconclusive/error** finding is a valid anchor (failures useful).
- [ ] `store/implications/` exists (ADR-0007); record schemas from RB-001 are loadable.
- [ ] RB-030 done if any `memory-centric-systems`/`hardware` implication will carry a `writeback_payload_ref`
      (the `wbtraffic.v0` artifact id).
- [ ] CAW-01 and CAW-02 are treated as **separate products**: the domain→target column is a routing hint only;
      no shared store; the real gate runs later in the ExportAdapter (ADR-0008).

## Steps

### 1. Define the `ImplicationMap` schema (one per finding)
- **Do:** Model the top-level record per implication-mapping.md §3: `map_id`, `finding_ref{thread_id, kind ∈
  result|hypothesis|claim, ref_id}`, `provenance{source_ids[], boundary}` (boundary `internal` here, only
  `export:caw-0x` after a bundle is built), `summary` (string), **`summary_generated` (bool)**, and
  `implications[]`.
- **Verify:** Validation rejects a `finding_ref.kind` outside `{result, hypothesis, claim}`; accepts a map with
  `boundary: internal`.

### 2. Define the per-implication shape + the closed 6-domain enum
- **Do:** Each `implications[]` item: `impl_id` (unique in map), `domain` (**closed enum** exactly:
  `ai-services`, `education`, `dev-platforms`, `models`, `hardware`, `memory-centric-systems`), `statement`,
  `status` (`hypothesis|supported|refuted|inconclusive`, default `hypothesis`), `confidence`
  (`low|medium|high`, **independent** of status), `evidence_refs[]`, optional `writeback_payload_ref`,
  `export_targets[]`. Reject free-text domains (a new domain needs an ADR bump — implication-mapping.md §2).
- **Verify:** A free-text `domain` fails validation; all six listed domains validate; `status` and `confidence`
  are accepted in any combination (e.g. `supported` + `low`).

### 3. Enforce "summary is generated, never evidence"
- **Do:** Force `summary_generated: true` whenever the summary was model-written, and make the validator treat a
  `summary` string as **never** an `evidence_ref` (it cannot appear in any `evidence_refs[]`).
- **Verify:** A model-written summary with `summary_generated: false` fails validation; a `summary` string id
  used inside `evidence_refs[]` fails validation.

### 4. Implement validator hard rules (no-overclaim)
- **Do:** Enforce the implication-mapping.md §4 rules: (1) `status` and `confidence` independent; (2)
  **`evidence_refs` MUST resolve** to a ledger result (ADR-0003) or an extracted claim (ADR-0005) — a dangling
  ref fails; (3) **`status: hypothesis` cannot be lifted by a generated summary** — only by resolving evidence
  (ledger verdict / corroborating claim); (4) a CAW-01-bound `memory-centric-systems`/`hardware` implication
  SHOULD carry a `writeback_payload_ref` OR be a typed open question; (6) **failures first-class**: `refuted` /
  `inconclusive` implications are still produced and still mappable.
- **Verify:** A dangling `evidence_ref` fails; promoting `status` from `hypothesis` while only the summary
  changed fails (status stays `hypothesis`); a `refuted` implication validates and persists (not discarded).

### 5. Compute routing hints (`route` — eligibility, never emit)
- **Do:** Implement `route(map)` setting `export_targets` per implication (implication-mapping.md §5):
  ```
  domain ∈ {memory-centric-systems, hardware}
     AND (writeback_payload_ref present OR statement is a typed open question)  -> hint caw-01
  has ≥1 resolving evidence_ref AND status ≠ hypothesis                        -> hint caw-02
  ```
  A bare `hypothesis` with no evidence gets **no** target. The function only marks eligibility; it MUST NOT
  write any bundle or touch a sibling product (ADR-0008 is the single emit seam).
- **Verify:** A `memory-centric-systems` implication with a `writeback_payload_ref` hints `caw-01`; a
  `supported` implication with a resolving evidence ref hints `caw-02`; a bare hypothesis hints nothing; `route`
  performs zero writes outside CAW-06's store (assert in test).

### 6. Persist into CAW-06's own store
- **Do:** Write the validated map (JSON + optional markdown) to `store/implications/<map_id>.json` (ADR-0007);
  large artifacts by path. `provenance.boundary` stays `internal` — it only becomes `export:caw-0x` once RB-4XX
  builds a bundle.
- **Verify:** Round-trip load reproduces the map; `boundary` is `internal`; re-running on the same finding is
  idempotent (no duplicate map for the same `finding_ref`).

## Acceptance criteria
- [ ] `ImplicationMap` schema + validator exist; `domain` is a **closed 6-value enum**; free text rejected.
- [ ] `summary_generated` is forced `true` for model-written summaries and a `summary` is **never** usable as an
      `evidence_ref` (generated summary ≠ evidence).
- [ ] `status` and `confidence` are independent; `status: hypothesis` cannot be lifted by a generated summary
      (only by resolving evidence) — tests prove both.
- [ ] Every `evidence_refs` entry resolves to a ledger result or extracted claim; a dangling ref fails
      validation.
- [ ] Refuted/inconclusive implications are produced, validated, and persisted as first-class "axis not
      observed" signals (not discarded).
- [ ] `route` sets `export_targets` **hints only**, emits nothing, touches no sibling store; a bare hypothesis
      routes nowhere; CAW-01/CAW-02 targets are hints re-checked by ADR-0008's gate.
- [ ] One `ImplicationMap` for an M1 finding persists in `store/implications/` with `boundary: internal`; tree
      is green.

## Rollback / safety
- The map is a pure output in CAW-06's OWN store; to undo, delete `store/implications/<map_id>.json`. The
  finding it references (ledger entry / hypothesis / claim) is untouched.
- `route` must never emit; if any code path writes a bundle or reaches a sibling product from here, that is a
  boundary violation — the ExportAdapter (ADR-0008) is the only emit seam.
- Revisit trigger: if a generated summary ever lifts an implication's `status`, or a `summary` is cited as
  evidence, stop — the no-overclaim invariant is breaking.

## Hand-off
- RB-4XX (ExportAdapter / `Caw01WritebackAdapter` + `Caw02ClaimAdapter`) can assume each implication already
  carries resolved `status`/`confidence`/`evidence_refs` and `export_targets` hints; it re-checks the real
  per-target gate before any boundary write and is the sole emit seam.
- The M1 checklist's "ImplicationMap with generated-summary flag set" box is satisfiable by the persisted map;
  combined with RB-030's `wbtraffic.v0` bundle, the P3 exit gate is met.
- Independence reminder: CAW-01 and CAW-02 are separate products; `export_targets` are hints, not writes — no
  shared store crossed here.
