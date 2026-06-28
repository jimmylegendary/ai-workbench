# ADR-0002: Hypothesis representation & uncertainty — three separated layers + a reversible status lifecycle

- **Status:** proposed (load-bearing)
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:**
  - [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF.md) (source of truth)
  - [../_meta/DOC-CONVENTIONS.md](../_meta/DOC-CONVENTIONS.md)
  - [ADR-0001-product-surface-and-scout.md](ADR-0001-product-surface-and-scout.md) (the surfaces that render/propose)
  - [ADR-0003-experiment-ledger.md](ADR-0003-experiment-ledger.md) (verdicts feed status transitions)
  - [ADR-0004-writeback-traffic-schema.md](ADR-0004-writeback-traffic-schema.md) (export carries status/uncertainty)
  - [../02-research/hypothesis-representation.md](../02-research/hypothesis-representation.md) (the research backing this ADR)
  - [../02-research/source-and-claim-ingestion.md](../02-research/source-and-claim-ingestion.md) (produces `CandidateClaim`s)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
Decide **how CAW-06 represents an uncertain future-AI / TTT hypothesis without overclaiming**: the three separated
record kinds, the four-state **status lifecycle** (`hypothesis` / `supported` / `refuted` / `inconclusive`), how
**confidence and uncertainty** are recorded, how **evidence** is linked, and the hard rule that **a hypothesis is
never rendered or exported as a settled claim**. This is the contract the ExperimentScout pipeline (ADR-0001), the
ledger (ADR-0003), and every export (ADR-0004, CAW-01/CAW-02) MUST honour. It does NOT define claim extraction
(ingestion doc), the ledger schema (ADR-0003 — this ADR only consumes its `verdict`), or storage serialization.

## Context
- **This is the load-bearing decision.** The brief's guardrails are explicit: *keep sources, claims, evidence, and
  generated conclusions separate; generated summaries are not evidence; a hypothesis is never presented as a
  settled claim* (§12); hypotheses carry explicit status/uncertainty and evidence links (§5). The representation
  **is** the enforcement mechanism — if the model cannot structurally distinguish "a paper says X", "we generated
  hypothesis Y", and "our toy experiment supports Y", overclaim leaks into the exports to CAW-01 and CAW-02.
- **The field is volatile and the headline claim is itself unverified.** Which TTT variants actually *write back*
  is open (§6; [ttt-landscape.md](../02-research/ttt-landscape.md) marks most cells *uncertain*). So the
  memory-writeback claim must be a **tracked `Hypothesis`, not a premise** — baking "TTT writes back" in as fact
  would corrupt the CAW-01 bridge (ADR-0004).
- **Scouting proposes; Jimmy adjudicates** (§12). Promotions to `supported` and exports are human-gated
  (ADR-0001 §4); the representation must make an un-adjudicated state the structural default.
- Prior art for the shape: claim-verification (`SUPPORTS/REFUTES/NOINFO`), assertion/evidence/provenance
  ontologies, and the IPCC two-metric (confidence = evidence × agreement, plus optional likelihood) calibrated
  language — see the research doc's Sources.

## Options considered

### A. Record structure
| Option | Pros | Cons | Fit |
|---|---|---|---|
| **Three separate, separately-addressable record kinds — `Claim`, `Hypothesis`, `Evidence` — cross-referenced by id** | Structurally enforces brief §12 separation; a source assertion can never silently become "our conclusion"; evidence is first-class and typed | Three schemas + id hygiene | **Chosen** |
| One "fact" record with a confidence field | Simple | Collapses source-says / we-propose / we-observed into one blob → exactly the overclaim the brief forbids | Rejected |
| Claim + hypothesis merged; evidence inline | Fewer joins | `generated` summaries inline next to experiment results invite "summary as evidence" | Rejected |

### B. Status model
| Option | Pros | Cons | Fit |
|---|---|---|---|
| **Four reversible statuses (`hypothesis`/`supported`/`refuted`/`inconclusive`), default+floor `hypothesis`, driven by an append-only `status_log`** | Exactly the brief's vocabulary (§5); `supported`/`refuted` are non-terminal and never "proven"; reversals + failures auditable | Need a "current = latest event" resolver | **Chosen** |
| Boolean verified/unverified | Trivial | No room for `inconclusive` or negative results; loses the field's nuance and the failures-useful mandate | Rejected |
| Free-text status | Flexible | Unqueryable; lets a writer type "confirmed" — overclaim by prose | Rejected |

### C. Uncertainty encoding
| Option | Pros | Cons | Fit |
|---|---|---|---|
| **Qualitative calibrated enums: `confidence` derived from `evidence_strength` × `agreement`, optional `likelihood` only if quantified; `confidence` capped by `evidence_strength`** | Avoids false precision; the cap makes "compelling prose, no evidence" structurally `very-low`; matches DOC-CONVENTIONS "don't invent numbers" | Enums need a calibration table | **Chosen** |
| Numeric 0–1 confidence | Sortable | Invites invented precision on a field with no benchmarks; violates §3 of conventions | Rejected (revisit as add-on) |
| No confidence, status only | Minimal | Can't distinguish "one lucky seed" from "replicated"; export consumers need strength | Rejected |

## Decision
**Three separated record kinds; a four-state reversible status lifecycle defaulting to `hypothesis`; calibrated
qualitative uncertainty with a hard evidence cap; nothing crosses a boundary stripped of status/uncertainty.**

1. **Three layers, never merged.**

   | Layer | Record | Truth status | Origin |
   |---|---|---|---|
   | `Claim` | what a *source asserts* (rendered "<source> claims …", never "it is true that …") | extracted from public research | ingestion S4 |
   | `Hypothesis` | what *we propose to check* — always provisional | generated by ExperimentScout | hypothesis stage |
   | `Evidence` | an observation bearing on a hypothesis; `evidence_kind ∈ {experiment, external, generated}` | ledger result OR citation OR generated text | ledger / ingestion |

2. **Hard rules (validator-enforced).**
   - A `Hypothesis` is **never serialized without `status`**; default and floor is `hypothesis`. Zero-evidence ⇒
     cannot be anything but `hypothesis`.
   - **`generated` evidence can never, on its own, move a status to `supported` or `refuted`** (a generated
     summary is not evidence, §12). It may only inform `inconclusive`.
   - A `Claim` carries `asserted_by` provenance; restating a source claim as our conclusion is forbidden.
   - Exports carry `status` + `confidence` + evidence links **inline**; nothing crosses a product boundary
     stripped of its uncertainty.

3. **Status lifecycle (append-only `status_log`; current = latest event).**

   | Status | Entry condition | May export as |
   |---|---|---|
   | `hypothesis` | default on creation | CAW-01 open question / proposal only |
   | `supported` | ≥1 `experiment`/`external` evidence above the bar, supporting | "supported (provisional)" claim+evidence → CAW-02 |
   | `refuted` | ≥1 disconfirming evidence above the bar | negative result (first-class) → CAW-02 |
   | `inconclusive` | ran but verdict ambiguous, or conflicting evidence | open question + logged attempt |

   - Every transition writes a `StatusEvent` (`ts`, `from→to`, triggering `evidence` ids, `by`). The log is
     append-only; the lifecycle is auditable and reversals are expected, not exceptional.
   - `supported` and `refuted` are **never terminal** and never mean proven/disproven — only "current evidence
     leans this way". New/contradicting evidence re-opens any state.
   - **Jimmy is the reviewer** for strategic promotions; the pipeline proposes `→ supported`, a human confirms
     before any `supported` export (ADR-0001 §4; brief §12).

4. **Confidence & uncertainty fields.**
   - `confidence ∈ {very-low … very-high}` derived from `evidence_strength ∈ {none, weak, moderate, strong}` ×
     `agreement ∈ {conflicting, mixed, consistent}`; default `very-low`.
   - **Cap:** `confidence` is bounded by `evidence_strength` (`none → very-low`, `weak → low`) regardless of
     prose. A hypothesis backed only by `generated` evidence is pinned at `very-low`.
   - `likelihood` is **optional and omitted unless quantified** — empty ≠ "about as likely as not"; never invent.
   - `falsifiability` (the observation that would refute it) is **required to leave `hypothesis`**; missing ⇒ a
     `TODO`, not a `supported` candidate.
   - `reproducibility ∈ {unrun, single-run, replicated, failed-to-reproduce}` links to ledger entries (ADR-0003).

5. **Boundary behavior.** A `hypothesis`-status item exports to CAW-01 only as a future-workload **open question**
   (carrying `confidence` + `falsifiability`); only `supported` items export as candidate workload inputs, still
   flagged `provisional`. To CAW-02, export `Claim`+`Evidence` only when `status ∈ {supported, refuted,
   inconclusive}` — bare hypotheses are rejected by the gate. A CAW-05 import opens a `Hypothesis` at
   `status=hypothesis`, `confidence=very-low`, signal recorded as `external` evidence — never auto-promoted.

## Consequences
- **Easy:** any renderer/export can ask "what's the status + confidence + evidence?" and get a structurally honest
  answer; an agent literally cannot serialize a hypothesis as a fact, promote on generated text, or export bare.
- **Easy:** negative results have a home (`refuted`/`inconclusive`) and are exportable knowledge, satisfying the
  failures-useful mandate end-to-end with ADR-0003.
- **Hard / cost:** three record kinds + id cross-refs and a "current status" resolver over an append-only log;
  every surface and export adapter must thread status/confidence through (no shortcut renderings).
- **Follow-on:** ADR-0003's `verdict` maps to an `Evidence` record + a proposed `StatusEvent` (failures →
  `refuted`/`inconclusive`, never dropped); ADR-0004 and the CAW-02 adapter carry the inline uncertainty; ADR-0001
  surfaces enforce "display status + confidence on every hypothesis card". Runbooks: (1) the three record schemas
  + cap/floor validators; (2) the append-only lifecycle + the `generated`-can't-promote validator; (3) the
  scout-generation defaults (`status=hypothesis`, `confidence=very-low`, require `falsifiability` or `TODO`);
  (4) ledger→evidence→status integration; (5) export adapters carrying uncertainty inline.

## Open questions / revisit triggers
- TODO(open-question: do we need a numeric confidence (0–1) alongside the enum for downstream ranking, or does
  that invite false precision?) See [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md).
- TODO(open-question: should "supported by N independent experiments" be a structured counter gating confidence,
  vs. reviewer judgement?)
- TODO(open-question: how to represent a *partially* supported hypothesis — split into sub-hypotheses, or add a
  `scope` qualifier?)
- TODO(open-question: confidence decay over time as the fast-moving TTT field shifts, triggering re-test?)
- TODO(open-question: do CAW-01/CAW-02 require a shared status vocabulary, or do we map at the export adapter
  boundary? lean: map at the adapter — no shared registry.)
- **Revisit trigger:** if any pipeline path needs to promote on `generated` evidence, or to render a hypothesis
  without status/confidence, stop — that is the load-bearing invariant breaking, not a feature request.
