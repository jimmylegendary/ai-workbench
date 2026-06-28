# Validation & Tests

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [./research-plan.md](./research-plan.md), [./open-questions.md](./open-questions.md)
  - [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF.md), [../_meta/DOC-CONVENTIONS.md](../_meta/DOC-CONVENTIONS.md)
  - ADRs: [0002](../01-decisions/ADR-0002-hypothesis-representation.md) · [0003](../01-decisions/ADR-0003-experiment-ledger.md) · [0004](../01-decisions/ADR-0004-writeback-traffic-schema.md) · [0005](../01-decisions/ADR-0005-source-and-claim-ingestion.md) · [0008](../01-decisions/ADR-0008-export-boundaries.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose

This doc specifies the **invariant tests** that turn CAW-06's load-bearing guardrails into machine-checkable
assertions. These are *guardrail tests*, not unit tests of every function — each one defends a property the
PRODUCT-BRIEF says must never break: **no overclaim**, **failures useful**, **nothing crosses a boundary stripped
of uncertainty**, **no shared store**, and **idempotent/resumable scouting**. It does NOT define test framework
mechanics or coverage targets (a runbook concern); it defines *what must be true* and the fixture each test runs
against. Every test below maps to an ADR and to a runbook acceptance criterion.

## 1. Test catalogue (the invariants)

| # | Invariant | Defends | ADR | Type |
|---|---|---|---|---|
| T1 | Generated evidence can never auto-promote a hypothesis | no overclaim | 0002 | unit + property |
| T2 | Reproducibility gate enforced before any non-`invalid` verdict | failures useful / repro | 0003 | integration |
| T3 | Negative results retained, classified, surfaced by default | failures useful | 0003 | integration |
| T4 | `wbtraffic` bundle lowers onto CAW-01 L0 (round-trip vs fixture) | the bridge as export | 0004, 0008 | contract |
| T5 | Exports carry status + uncertainty inline; bare hypotheses gated | no overclaim at boundary | 0002, 0008 | contract |
| T6 | Scout is idempotent + resumable | safe re-runs | 0001, 0005 | integration |
| T7 | No-shared-store: no export writes into another product's store | independence | 0008 | contract |

## 2. T1 — A hypothesis is never auto-promoted by generated evidence

The hard rule (ADR-0002 §2 rule 2): `generated` evidence can inform `inconclusive` but can **never** move a
status to `supported`/`refuted`; only `experiment` or `external` evidence can. Confidence is **capped by
`evidence_strength`** — generated-only is pinned at `very-low`.

```text
GIVEN a Hypothesis at status=hypothesis with only Evidence{evidence_kind: "generated"}
WHEN the lifecycle validator evaluates a proposed StatusEvent → supported
THEN the transition is REJECTED and status stays "hypothesis", confidence ≤ very-low

GIVEN the same hypothesis + one Evidence{evidence_kind: "experiment", direction: "supporting"} above the bar
WHEN promotion to "supported" is proposed
THEN it is ALLOWED (and still flagged provisional)
```

| Case | only-generated | +experiment supporting | +experiment disconfirming | two experiments disagree |
|---|---|---|---|---|
| Expected status | `hypothesis` (pinned) | `supported` | `refuted` | `inconclusive` |
| Expected confidence | `very-low` | ≤ `low` (single run) | ≤ `medium` | `very-low` |

**Property test:** for any randomly generated evidence set, if it contains zero non-`generated` items, the
resolved status MUST be in `{hypothesis, inconclusive}` and confidence MUST be `very-low`. (Closes the ADR-0002
revisit trigger: "if any pipeline path promotes on `generated` evidence" → this test fails loudly.)

## 3. T2 — Reproducibility gate enforced

ADR-0003: a run cannot reach a verdict other than `invalid` until every MUST repro item passes (R1 config frozen,
R2 ≥3 seeds, R3 code rev pinned, R4 env locked, R5 data specified, R6 decision rule pre-registered, R7 hardware/
budget, R11 baseline logged, R12 failures logged).

```text
GIVEN a ledger entry missing env.lock (R4) OR with <3 seeds (R2) OR no pre-registered decision_rule (R6)
WHEN the pre-run gate runs
THEN verdict is forced to "invalid" and the entry records which MUST item failed

GIVEN results are filled in, THEN a later edit of decision_rule
THEN it is REJECTED in place; the only legal path is a NEW entry with supersedes=<id>  (R6 anti-cherry-pick)
```

| MUST item missing | Gate outcome |
|---|---|
| R1 config / R3 code-rev / R4 env-lock | verdict pinned `invalid`, reason logged |
| R2 <3 seeds | `invalid` (closes lq-001 default of 3) |
| R6 rule edited after results | rejected; forces `supersedes` entry |
| R11 no baseline | `invalid` |
| all MUST present | verdict may be `supported`/`refuted`/`inconclusive` |

## 4. T3 — Negative results retained, classified, surfaced

ADR-0003: every run that started is an entry; `aborted`/`invalid`/`inconclusive`/`refuted` use the **same schema**
as successes; append-only + `supersedes` means a re-run never overwrites the failure it replaces.

```text
GIVEN a run that OOMs mid-way
THEN a ledger entry exists with status=aborted, failure_mode="oom", artifacts kept by path
AND it appears in the default negative-results view (NOT hidden)

GIVEN a hypothesis whose only runs are refuted/inconclusive
THEN its hypothesis card shows the full run history and the hypothesis stays visibly unsupported
```

- **Retention test:** deleting/overwriting a prior entry is impossible through the store API (append-only); a
  correction is a new entry with `supersedes`.
- **Classification test:** every non-success carries a `failure_mode` from the controlled vocab
  (`oom|budget-exceeded|nonconvergence|no-effect|flaky|setup-error`); a null `failure_mode` on a non-success
  fails validation.
- **Surfacing test:** the negative-results view lists all `refuted`/`inconclusive`/non-null-`failure_mode`
  entries grouped by `hypothesis_id`; a `no-effect` result is itself an exportable finding (T5).

## 5. T4 — `wbtraffic` bundle lowers onto CAW-01 L0 (round-trip vs fixture)

The bridge is an **export, not a shared store** (ADR-0004/0008). Test against a **pinned CAW-01 L0 fixture** — a
local copy re-verified at the boundary; CAW-01 OWNS its real IR (TRK-4).

```jsonc
// fixture: caw01-l0-fixture.json (pinned; re-verified, not a shared store)
{ "object_types": ["op", "tensor", "movement"],
  "op_classes": ["mem_store", "..."],
  "movement_fields": ["bytes", "from_tier", "to_tier"],
  "accepts_null_with_basis": "TODO(open-question: wbq-012)" }
```

```text
GIVEN a wbtraffic.v0 artifact (modeled estimate, assumptions listed)
WHEN Caw01WritebackAdapter lowers it to L0 objects
THEN each field maps per the ADR-0004 table:
     update event       → op{op_class:"mem_store"}
     bytes_per_update    → movement{bytes, from_tier:"device", to_tier:residency}
     fast_weights size   → tensor{size_bytes} (mutable, re-written)
     optimizer state     → extra tensor (enlarges capacity peak)
AND lowering uses NO new L0 object type (asymmetry is a read/write rollup split — wbq-002, an open question to CAW-01)
AND re-importing the lowered objects reconstructs the same field values (round-trip identity)
```

| Assertion | Pass condition |
|---|---|
| No new L0 object type introduced | only `op`/`tensor`/`movement` used |
| Round-trip identity | `lower(x)` then `parse` yields the same non-null fields |
| Modeled ≠ measured | every modeled field carries `basis: TODO(open-question)` and `uncertainty != supported` |
| Name drift caught | unknown CAW-01 object/op name → validation FAILS (no silent guess) |

## 6. T5 — Exports carry status + uncertainty; bare hypotheses gated

Nothing crosses a boundary stripped of status/uncertainty (ADR-0002 §2 rule 4; ADR-0008 per-target gates).

```text
GIVEN a CAW-02 bundle whose payload omits status OR confidence
THEN validate() REJECTS it before any write

GIVEN an implication with status="hypothesis" (no resolving evidence_ref)
THEN the CAW-02 gate REJECTS it (bare hypothesis ≠ knowledge)
BUT the CAW-01 gate ACCEPTS it as a typed open question (CAW-01 tolerates open questions)

GIVEN a refuted/inconclusive item with a resolving evidence_ref
THEN the CAW-02 gate ACCEPTS it (negative results are knowledge)
```

| Item | CAW-01 gate | CAW-02 gate |
|---|---|---|
| `hypothesis`, no evidence | accept (open question) | **reject** |
| `supported` + evidence | accept (if writeback/hardware domain) | accept (flagged `provisional`) |
| `refuted`/`inconclusive` + evidence | accept ("axis not observed" — eq-001 TODO) | accept |
| status/confidence missing | **reject** | **reject** |

Also assert `not_evidence` lists generated summaries explicitly, and every exported `supported` is tagged
`provisional` (ADR-0002 §7).

## 7. T6 — Scout is idempotent and resumable

ADR-0005: the ingestion pipeline (S1 Discover → S5 Persist) is idempotent and resumable behind a `SourceAdapter`;
same `FetchCursor` ⇒ no downstream duplicates; adapters always return an **advanced** cursor.

```text
GIVEN a SourceAdapter.fetch(query, cursor) returning items + cursor'
WHEN fetch is replayed with the SAME cursor
THEN no new Source/Claim records are created (idempotent)

GIVEN the pipeline is interrupted after S3 (canonicalize+dedup)
WHEN re-run from the persisted cursor/checkpoint
THEN it resumes at S4 without re-fetching or duplicating (resumable)

GIVEN a CAW-05 bundle re-imported with the same bundle_id watermark
THEN it merges as an added provenance entry, NOT a duplicate Source (TRK-5)
```

| Scenario | Expected |
|---|---|
| replay same cursor | 0 new records |
| arXiv v1 then v2 | distinct-but-linked sources (versions kept) |
| same paper via direct + CAW-05 | one `Source`, two provenance entries |
| crash mid-pipeline | resume from checkpoint, no dup |

## 8. T7 — No shared store (independence contract)

A boundary contract test (DOC-CONVENTIONS §8; PRODUCT-BRIEF §8): an `ExportAdapter` may only write to CAW-06's
own store + emit a self-describing bundle (file drop / POST). It MUST NOT open, read, or write any path inside
CAW-01/CAW-02/CAW-05.

```text
GIVEN any ExportAdapter.emit(bundle)
THEN the only writes are: (a) the outbound bundle at the configured drop/endpoint, (b) an ExportReceipt in CAW-06's store
AND the bundle is self-describing (schema_version, producer, content_hash) — no shared registry lookup
AND a failed/rejected export is logged and the finding stays exportable (failures first-class)
```

## 9. Fixtures

| Fixture | Used by | Note |
|---|---|---|
| `caw01-l0-fixture.json` | T4 | pinned copy of CAW-01 L0 shape; re-verified per TRK-4, not shared |
| `caw05-action-brief.sample.json` | T5, T6 | `caw05.action-brief/v1`; tolerant-of-extras |
| `hypothesis.generated-only.json` | T1 | generated evidence only → must stay `hypothesis` |
| `ledger.oom-abort.json` | T3 | aborted run with `failure_mode: oom` |
| `wbtraffic.modeled.json` | T4 | all numerics `null`/modeled with `basis: TODO` |

## Implications for runbooks

- Each invariant (T1–T7) is a runbook **acceptance criterion**, run in CI; the tree stays green at each phase
  checkpoint (DOC-CONVENTIONS §6).
- T1 + T5 are the anti-overclaim spine — they MUST exist before any export adapter is enabled.
- T4's fixture is **re-verified against CAW-01 at the boundary** every time CAW-01's IR may have changed (TRK-4);
  a name mismatch fails the test rather than silently lowering onto a stale name.
- Open questions referenced as `TODO(open-question: …)` in tests (e.g. wbq-012 null+basis acceptance, eq-001
  refuted→CAW-01) stay tracked in [open-questions.md](./open-questions.md) until resolved.
