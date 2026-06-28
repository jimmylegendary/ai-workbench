# Backend API Surface — the core op contract (typed)

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:**
  - [./scout-service.md](./scout-service.md)
  - [./experiment-runner-service.md](./experiment-runner-service.md)
  - [./persistence.md](./persistence.md)
  - [../01-decisions/ADR-0001-product-surface-and-scout.md](../01-decisions/ADR-0001-product-surface-and-scout.md)
  - [../01-decisions/ADR-0002-hypothesis-representation.md](../01-decisions/ADR-0002-hypothesis-representation.md)
  - [../01-decisions/ADR-0003-experiment-ledger.md](../01-decisions/ADR-0003-experiment-ledger.md)
  - [../01-decisions/ADR-0004-writeback-traffic-schema.md](../01-decisions/ADR-0004-writeback-traffic-schema.md)
  - [../01-decisions/ADR-0008-export-boundaries.md](../01-decisions/ADR-0008-export-boundaries.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
Define **one set of vetted typed operations** that every surface (scheduled/triggered pipeline, CLI, MCP) drives,
per ADR-0001. This is the single boundary where the anti-overclaim invariants, provenance stamping, and the human
review gate are enforced — surfaces are thin. It does NOT define the pipeline orchestration ([scout-service.md](./scout-service.md)),
the runner internals ([experiment-runner-service.md](./experiment-runner-service.md)), or the on-disk layout
([persistence.md](./persistence.md)); those are consumed as stable boundaries. **Governance lives in the core, never
the surface** — a surface may *request* a route; only the core, after the review gate, performs a promotion or export.

## Conventions for every op
- **Transport-agnostic.** Each op is a typed function; CLI subcommands and MCP tools are 1:1 wrappers. No surface
  carries logic the op-set does not express (a surface-local rule is a contract leak — ADR-0001).
- **Result envelope.** Every op returns `{ ok, value?, error?, warnings[], proposed_events[] }`. Mutating-terminal
  ops never apply directly; they append a `proposed_event` to the review queue (ADR-0007 §6).
- **Provenance + uncertainty are non-strippable.** Nothing crosses an op boundary without `status` + `uncertainty`
  (ADR-0002). Generated text is always tagged `generated:true` and **is not evidence** (brief §12).
- **Idempotency key.** Write ops take an optional `idem_key`; replay with the same key is a no-op returning the
  prior result (supports resumable Runs, ADR-0001 / ADR-0007).

```
type OpResult<T> = {
  ok: boolean
  value?: T
  error?: { code: string; message: string; retryable: boolean }
  warnings: string[]
  proposed_events: ProposedEvent[]   // review-queue items; never auto-applied
}
type ProposedEvent =
  | { kind: "status_promotion"; hypothesis_id: string; to: HypothesisStatus }
  | { kind: "export"; target: "caw-01" | "caw-02"; ref: string }
type Boundary = "internal" | "import:caw-05" | "export:caw-01" | "export:caw-02"
type Confidence = "very-low" | "low" | "medium" | "high"   // calibrated, qualitative (ADR-0002)
```

## Op families

| Family | Op | Mutates | Terminal-gated | Notes |
|---|---|---|---|---|
| Ingest | `ingest.discover` | yes | no | run SourceAdapters; persist `Source` (ADR-0005) |
| Ingest | `ingest.import_caw05` | yes | no | import a CAW-05 signal bundle (separate product) |
| Ingest | `ingest.extract_claims` | yes | no | `Source → CandidateClaim`; never auto-`Claim` |
| Hypothesis | `hyp.create` | yes | no | defaults `status=hypothesis`, `confidence=very-low` |
| Hypothesis | `hyp.attach_evidence` | yes | no | link Evidence; respects evidence cap |
| Hypothesis | `hyp.propose_status` | proposal | **yes** | promotion → review queue, never applied |
| Hypothesis | `hyp.get` / `hyp.list` | no | no | read; card render shows status+confidence+history |
| Experiment | `exp.plan` | yes | no | pre-register prediction + decision_rule |
| Experiment | `exp.run` | yes | no | dispatch to runner; entry on every launch |
| Experiment | `exp.log_result` | yes | no | append verdict + repro block |
| Experiment | `exp.negative_results` | no | no | failures-first surfacing view (ADR-0003) |
| Writeback | `wb.estimate` | yes | no | analytic L0 `wbtraffic.v0` (ADR-0004) |
| Writeback | `wb.get` | no | no | read artifact (status/uncertainty inline) |
| Implication | `impl.map` | yes | no | build ImplicationMap for a finding (ADR-0006) |
| Export | `export.stage` | yes | no | build bundle + run `validate()` gate |
| Export | `export.commit` | proposal | **yes** | `supported` export → review queue |
| Schedule | `sched.register` / `sched.fire` / `sched.status` | yes/no | no | cron + triggers (ADR-0007) |

### Ingest
```
ingest.discover(family: string, since?: FetchCursor) -> OpResult<{ sources: SourceRef[]; cursor: FetchCursor }>
ingest.import_caw05(bundle_path: string) -> OpResult<{ source: SourceRef }>   // boundary=import:caw-05
ingest.extract_claims(source_id: string) -> OpResult<{ candidates: CandidateClaimRef[] }>
```
Extraction emits `CandidateClaim` (proposed, `generated:true`), never a settled `Claim`. Idempotent on
`(source_id, content_hash)` — re-extraction does not duplicate.

### Hypothesis
```
hyp.create(claim_ref: string, statement: string) -> OpResult<HypothesisRef>
  // status defaults to "hypothesis"; confidence="very-low"; a hypothesis is NEVER a settled claim
hyp.attach_evidence(hypothesis_id, ev: { kind: "experiment"|"citation"|"generated"; ref: string }) -> OpResult<void>
  // HARD CAP: generated evidence cannot raise confidence or propose a promotion (ADR-0002)
hyp.propose_status(hypothesis_id, to: HypothesisStatus, rationale_ref: string) -> OpResult<void>
  // appends proposed_events[{status_promotion}]; the four states are reversible; never auto-applied
```
`HypothesisStatus = "hypothesis" | "supported" | "refuted" | "inconclusive"` (reversible; default `hypothesis`).
`confidence ≤ evidence_strength` is enforced core-side; no op can set `supported` from generated evidence alone.

### Experiment
```
exp.plan(hypothesis_id, prediction: Prediction) -> OpResult<ExpPlanRef>
  // Prediction = { metric, baseline, expected_direction, decision_rule }  pre-registered (ADR-0003 R6)
exp.run(plan_id, runner: string) -> OpResult<{ exp_id: string }>           // entry created on EVERY launch
exp.log_result(exp_id, results, verdict: Verdict) -> OpResult<{ evidence_ref: string }>
exp.negative_results(filter?: { failure_mode?, hypothesis_id? }) -> OpResult<LedgerEntryRef[]>
```
`Verdict = "supported" | "refuted" | "inconclusive" | "invalid"`. A verdict is admissible only after the
reproducibility gate passes (else forced `invalid`). `supported` at toy scale produces an `Evidence` record plus a
**proposed** `StatusEvent` — never a settled claim (ADR-0003 §2).

### Writeback (the CAW-01 bridge — export, not shared store)
```
wb.estimate(variant_id, assumptions: WbAssumptions) -> OpResult<WbTrafficV0>   // analytic L0 (ADR-0004)
wb.get(artifact_id) -> OpResult<WbTrafficV0>
```
Every numeric defaults `null`; an unknown that matters becomes `TODO(open-question: …)`, never an invented number.
A modeled number is flagged distinctly from a measured `writeback_observed` (ADR-0003). Lowering onto CAW-01's L0
objects + open questions happens at export, not here. CAW-01 IR object names are owned by CAW-01 — re-verify.

### Implication
```
impl.map(finding_id) -> OpResult<ImplicationMap>   // domains: AI services, education, dev platforms,
                                                   //          models, hardware, memory-centric (ADR-0006)
```
The map `summary` is explicitly `generated:true` and is **not evidence**; per-implication uncertainty travels inline.

### Export
```
export.stage(target: "caw-01"|"caw-02", ref: string) -> OpResult<{ bundle: ExportBundle; gate: GateResult }>
export.commit(bundle_id) -> OpResult<void>   // proposal-only when payload status=supported (human gate)
```
`ExportAdapter` is the ONLY export seam (ADR-0008). The bundle is self-describing (`schema_version`, `producer`,
`content_hash`, `provenance`, `boundary`); `validate()` runs the per-target gate before any write. A failed export
is logged and the finding stays exportable (failures first-class). CAW-06 never writes into another product's store.

### Schedule
```
sched.register(family, schedule: CronExpr) -> OpResult<void>
sched.fire(family|thread_id, now?: boolean) -> OpResult<{ run_id: string }>
sched.status() -> OpResult<{ runs: RunReceipt[]; cursors: Record<string, FetchCursor> }>
```
The scheduler only **fires**; catch-up/overlap/heartbeat live in the Run wrapper ([scout-service.md](./scout-service.md)).

## Anti-overclaim invariants (enforced here, not in any surface)
| Invariant | Op enforcement |
|---|---|
| Hypothesis ≠ settled claim | `hyp.create` defaults `status=hypothesis`; promotion is proposal-only |
| Generated ≠ evidence | `hyp.attach_evidence(kind=generated)` cannot raise confidence/propose promotion |
| Evidence cap | `confidence ≤ evidence_strength`, checked core-side on every write |
| Failures useful | `exp.run` forces a ledger entry on every launch incl. crashes |
| No shared store | export ops emit a bundle across a file/API boundary; no foreign writes |
| Human reviewer | terminal ops (`hyp.propose_status`, `export.commit`) only enqueue proposed_events |

## Open Questions
- TODO(open-question: is a Run synchronous or resumable stage-jobs with a handle — affects `sched.status`/`exp.run` return shape; ADR-0001.)
- TODO(open-question: does `ingest.import_caw05` trigger an immediate single-thread Run or enqueue for next pass; ADR-0001.)
- See [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md).

## Implications for runbooks
- One runbook per op family wrapping the core; CLI and MCP generated 1:1 from the op manifest.
- A conformance test asserts CLI ↔ MCP ↔ pipeline call the identical op (no surface-local logic).
- Terminal ops must be unit-tested to prove they enqueue, never apply.
