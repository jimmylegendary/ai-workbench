# Provenance & Uncertainty — status lifecycle, evidence cap, generated-not-evidence, export carry-through

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [data-model.md](data-model.md) (the entities and the shared envelope these rules apply to)
  - [storage-and-scheduling.md](storage-and-scheduling.md) (append-only `status_log`, supersede, review gate)
  - [../01-decisions/ADR-0002-hypothesis-representation.md](../01-decisions/ADR-0002-hypothesis-representation.md) (THE load-bearing decision this implements)
  - [../01-decisions/ADR-0003-experiment-ledger.md](../01-decisions/ADR-0003-experiment-ledger.md) (verdict → evidence + status event)
  - [../01-decisions/ADR-0004-writeback-traffic-schema.md](../01-decisions/ADR-0004-writeback-traffic-schema.md) (modeled vs measured; uncertainty inline)
  - [../01-decisions/ADR-0008-export-boundaries.md](../01-decisions/ADR-0008-export-boundaries.md) (per-target gates carry status/uncertainty)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
This doc fixes the **data-layer mechanics of not overclaiming**: how provenance is recorded, the four-state
reversible status lifecycle, the calibrated qualitative uncertainty fields with their **hard evidence cap**, the
rule that **generated content is never evidence and never promotes a status**, the explicit marking that **a
hypothesis is not a settled claim** and **a generated summary is not evidence**, and how **exports carry
status/uncertainty inline** so nothing crosses a boundary stripped of it. It implements ADR-0002 at the data layer;
it does NOT re-decide the representation (ADR-0002 owns that) or the storage layout (see
[storage-and-scheduling.md](storage-and-scheduling.md)). This is the product's load-bearing invariant: if the model
cannot structurally distinguish *"a paper says X"*, *"we propose Y"*, and *"our toy run supports Y"*, overclaim
leaks into the CAW-01/CAW-02 exports.

## 1. Provenance — three separated layers, never merged
The brief's guardrail (§12): keep sources, claims, evidence, and generated conclusions **separate**. The data layer
enforces this with three separately-addressable record kinds plus a typed `Evidence` reference.

| Layer | Record | Provenance field | What it may say |
|---|---|---|---|
| source assertion | `Claim` | `asserted_by: SRC-NNNN` + `evidence_span` + `source_locator` | "<source> claims X" — never "X is true" |
| our proposal | `Hypothesis` | `from_claims: [...]`, `origin: generated` | "we propose to check X" — always provisional |
| an observation | `Evidence` | `evidence_kind ∈ {experiment, external, generated}` | bears on a hypothesis; typed by origin |

```yaml
# Evidence reference (embedded under Hypothesis / produced by a Result)
evidence_id: EVID-0009
evidence_kind: experiment|external|generated   # experiment = ledger Result; external = citation; generated = LLM text
evidence: true|false                # generated text is ALWAYS evidence:false
supports: true|false                # direction (for experiment/external only)
ref: EXP-0007 | SRC-0001            # resolves to a Result or a Source — never to a summary string
```

`TODO(open-question: is `Evidence` a top-level store dir or embedded under Hypothesis/Result? — data-model.md §OQ)`.

## 2. The status lifecycle (four states, reversible, append-only)
Default and **floor** is `hypothesis`. The current status = the latest event in the append-only `status_log`;
`supported`/`refuted` are **never terminal** and never mean proven/disproven — only "current evidence leans this
way" (ADR-0002 §3).

| Status | Entry condition | May export as |
|---|---|---|
| `hypothesis` | default on creation; zero-evidence ⇒ cannot be anything else | CAW-01 open question / proposal only |
| `supported` | ≥1 `experiment`/`external` evidence above the bar, supporting (human-confirmed) | "supported (provisional)" claim+evidence → CAW-02 |
| `refuted` | ≥1 disconfirming evidence above the bar | negative result (first-class) → CAW-02 |
| `inconclusive` | ran but verdict ambiguous, or conflicting evidence | open question + logged attempt |

```yaml
# StatusEvent (append-only; never edited; current = latest)
status_log:
  - {ts: TODO, from: null,       to: hypothesis,  by: scout,  evidence_ids: []}
  - {ts: TODO, from: hypothesis, to: supported,   by: jimmy,  evidence_ids: [EVID-0009]}  # human-gated
```

Verdict → status mapping (ADR-0003 → ADR-0002): a ledger `Result.verdict` becomes an `Evidence` record + a
**proposed** `StatusEvent`. Failures map honestly — `refuted`/`inconclusive` are real statuses, `invalid` (setup
broken) does **not** map to `refuted`. Reversals are expected, not exceptional; new/contradicting evidence re-opens
any state.

## 3. Uncertainty fields + the hard evidence cap
Qualitative, calibrated enums — no invented numeric precision on a field with no benchmarks (DOC-CONVENTIONS §3).

```
confidence  ∈ {very-low, low, moderate, high, very-high}      # default very-low
            derived from:
evidence_strength ∈ {none, weak, moderate, strong}   ×   agreement ∈ {conflicting, mixed, consistent}
likelihood  : optional — OMITTED unless quantified (empty != "about as likely as not")
falsifiability : REQUIRED to leave `hypothesis` (else a TODO, not a `supported` candidate)
reproducibility ∈ {unrun, single-run, replicated, failed-to-reproduce}   # links ledger entries
```

**The hard evidence cap (the anti-overclaim mechanism):** `confidence` is bounded by `evidence_strength`,
regardless of how compelling the prose is.

| evidence_strength | confidence cap |
|---|---|
| `none` | `very-low` |
| `weak` | `low` |
| `moderate` | `high` (no `very-high`) |
| `strong` | `very-high` |

A hypothesis backed **only by `generated` evidence is pinned at `very-low`** — "compelling summary, no run" is
structurally weak, not persuasive. The cap is validator-enforced; a writer cannot type their way past it.

> Confidence scale note: this is ADR-0002's 5-value scale; `ImplicationMap` (ADR-0006) uses a 3-value scale.
> `TODO(open-question: unify or map confidence scales at the boundary — ADR-0002 vs ADR-0006)`.

## 4. Generated content is never evidence; a hypothesis is not a settled claim
Two markings the data layer makes **machine-checkable**, not just stylistic:

1. **Generated-not-evidence.** Any LLM-produced text — claim paraphrase, hypothesis statement, an `ImplicationMap`
   `summary`, a `wbtraffic` modeled estimate's prose — carries `evidence:false`. **`generated` evidence can never,
   on its own, move a status to `supported` or `refuted`** (it may only inform `inconclusive`). An `evidence_ref`
   that resolves to a summary string is rejected by the validator (ADR-0006 §4).
2. **Hypothesis-not-settled.** A `Hypothesis` is **never serialized without `status`**; a `supported` toy result is
   a *status update, never a settled claim* and is rendered "supported (provisional)". A renderer/export that drops
   `status`/`confidence` from a hypothesis is a bug, not a feature (ADR-0002 revisit trigger).
3. **Modeled-not-measured.** In `WritebackTrafficSchema`, `basis: modeled` (analytic L0 estimate, ADR-0004) is
   flagged distinctly from `basis: measured` (a ledger `writeback_observed` number). A modeled number is a
   *checkable hypothesis with assumptions*, not evidence of a real bottleneck; numerics default `null`, and a `null`
   that matters is a `TODO(open-question: …)`, never invented (DOC-CONVENTIONS §3).

| Concept pair | Honest marking | The error it prevents |
|---|---|---|
| source-says vs we-conclude | `Claim.asserted_by` / `Claim.status=unverified` | restating a paper as our finding |
| hypothesis vs settled claim | `status` mandatory; `supported` ⇒ "provisional" | exporting a guess as fact |
| generated vs observed | `evidence:false` on all generated text | a summary counted as evidence |
| modeled vs measured | `basis: modeled\|measured`; numerics `null` until sourced | an invented bandwidth number |

## 5. How exports carry status + uncertainty
Nothing crosses a product boundary stripped of its uncertainty (ADR-0002 §5). The `ExportAdapter` gates
(ADR-0008 §3–§5) make this checkable **at the boundary**:

| Target | What the bundle MUST carry | What the gate rejects |
|---|---|---|
| **CAW-01** | `wbtraffic.v0` `fields` + `uncertainty.{status,confidence}` + first-class `open_questions[]`; `basis` modeled/measured | bare assertions about CAW-01's IR; invented numbers |
| **CAW-02** | `claim` + `status ∈ {supported, refuted, inconclusive}` + `confidence` + `evidence[]` + explicit `not_evidence[]` | `status: hypothesis` items; summary-only items |

Boundary behavior by status:
- `hypothesis`-status → CAW-01 only as a **future-workload open question** (carrying `confidence` +
  `falsifiability`); **never** as a workload requirement.
- `supported` (human-confirmed) → CAW-01 as a candidate workload-axis input, still flagged `provisional`; → CAW-02
  as "supported (provisional)" claim+evidence.
- `refuted`/`inconclusive` → CAW-02 as **first-class negative knowledge** (failures useful, brief §5); a refuted
  write-back axis can seed a CAW-01 "axis not observed" open question
  (`TODO(open-question: should refuted implications export to CAW-01 as explicit "axis not observed" signals?)`).
- A CAW-05 import opens a `Hypothesis` at `status=hypothesis`, `confidence=very-low`, signal recorded as `external`
  evidence with CAW-05 prose `evidence:false` — **never auto-promoted** (ADR-0005 §6).

The `not_evidence[]` list on a CAW-02 bundle makes the source/summary separation **machine-checkable at the
boundary** — generated summaries are enumerated, not silently mixed into `evidence[]` (ADR-0008 §5).

## 6. Validator checklist (enforced at the data layer)
- [ ] No `Hypothesis`-bearing record serialized without `status` + `confidence`.
- [ ] `confidence` ≤ cap implied by `evidence_strength` (§3).
- [ ] `generated` evidence never the sole basis for `supported`/`refuted`.
- [ ] every `evidence_ref` resolves to a `Result` or `Source` — never a summary string.
- [ ] `Claim.asserted_by` present; never restated as our conclusion.
- [ ] `wbtraffic` numerics `null` or sourced (modeled-with-assumptions / measured); never invented.
- [ ] export bundles carry `status` + `confidence` inline; CAW-02 gate rejects bare `hypothesis`.

## Open Questions
- Confidence-scale unification (§3); `Evidence` as top-level vs embedded (§1); refuted→CAW-01 signals (§5).
- `TODO(open-question: confidence decay over time as the fast-moving TTT field shifts, triggering re-test?)` (ADR-0002).
- Tracked in [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md).

## Implications for runbooks
- **RB (cap/floor validators):** enforce the §6 checklist; default `status=hypothesis`, `confidence=very-low`.
- **RB (status lifecycle):** append-only `status_log` writer + "current = latest" resolver; verdict → proposed StatusEvent.
- **RB (generated-can't-promote):** validator blocking `supported`/`refuted` on `generated`-only evidence.
- **RB (export carry-through):** each adapter threads `status`/`confidence`/`not_evidence[]` inline; gate before emit.
