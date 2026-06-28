# Hypothesis & Uncertainty — the anti-overclaim contract

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:**
  - [./overview.md](./overview.md) (what the core is)
  - [./experiment-scout-pipeline.md](./experiment-scout-pipeline.md) (which stages create/transition these records)
  - [../01-decisions/ADR-0002-hypothesis-representation.md](../01-decisions/ADR-0002-hypothesis-representation.md) (load-bearing decision)
  - [../02-research/hypothesis-representation.md](../02-research/hypothesis-representation.md) (research backing + calibration)
  - [../01-decisions/ADR-0003-experiment-ledger.md](../01-decisions/ADR-0003-experiment-ledger.md) (verdicts → evidence → status)
  - [../01-decisions/ADR-0008-export-boundaries.md](../01-decisions/ADR-0008-export-boundaries.md) (exports carry uncertainty inline)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose

This doc is the core's **anti-overclaim contract**: the **three separated record kinds** (`Source`/`Claim`,
`Hypothesis`, `Evidence`), the **four-state reversible status lifecycle**, the **calibrated qualitative
uncertainty** fields, and the **hard evidence cap** (generated evidence can never promote a status). It is the
contract every stage (pipeline doc), the ledger (ADR-0003), and every export (ADR-0008, CAW-01/CAW-02) MUST honour.
It restates and cross-links ADR-0002 for the `05-` group; the ADR and
[../02-research/hypothesis-representation.md](../02-research/hypothesis-representation.md) hold the full options,
schemas, and calibration table — this doc does not redefine them.

## 1. Why this is load-bearing

A `Hypothesis` is **never a settled claim** (brief §12). The representation *is* the enforcement: if the model
cannot structurally distinguish "a paper says X", "we propose to check Y", and "our toy experiment supports Y",
overclaim leaks into the exports to CAW-01 and CAW-02. The field is volatile — which TTT variants actually *write
back* is itself unverified — so even the headline writeback claim is a **tracked `Hypothesis`, not a premise**
(brief §6). Baking "TTT writes back" in as fact would corrupt the CAW-01 bridge.

## 2. Three separated record kinds (never merged)

Three separately-addressable records, cross-referenced by id. They are never collapsed into one "fact" blob.

| Layer | Record | Truth status (how it renders) | Origin |
|---|---|---|---|
| Source claim | `Claim` | what a *source asserts* — "<source> claims …", never "it is true that …" | ingestion S4 |
| Hypothesis | `Hypothesis` | what *we propose to check* — always provisional | hypothesis stage |
| Evidence | `Evidence` | an observation bearing on a hypothesis; `evidence_kind ∈ {experiment, external, generated}` | ledger / citation / generated text |

### Hard rules (validator-enforced)

1. A `Hypothesis` is **never serialized without `status`**; default and floor is `hypothesis`. Zero evidence ⇒
   cannot be anything but `hypothesis`.
2. **`generated` evidence can never, on its own, move a status to `supported` or `refuted`** — a generated summary
   is not evidence (§12). It may only inform `inconclusive`.
3. A `Claim` carries `asserted_by` provenance; restating a source claim as our conclusion is forbidden.
4. Exports carry `status` + `confidence` + evidence links **inline**; nothing crosses a product boundary stripped
   of its uncertainty.

## 3. The four-state reversible lifecycle

Status is a property of *current evidence*, not a permanent label. `supported`/`refuted` are **never terminal** and
never mean proven/disproven — only "current evidence leans this way". Any state re-opens on new evidence.

| Status | Entry condition | May export as |
|---|---|---|
| `hypothesis` | default on creation | CAW-01 open question / proposal only |
| `supported` | ≥1 `experiment`/`external` evidence above the bar, supporting | "supported (provisional)" claim+evidence → CAW-02 |
| `refuted` | ≥1 disconfirming evidence above the bar | negative result (first-class) → CAW-02 |
| `inconclusive` | ran but verdict ambiguous, or conflicting evidence | open question + logged attempt |

```
                    ┌───────────────────────────────────────┐
                    v                                         │
   (create) ──► hypothesis ──experiment/external──► supported ┤
                    │  ▲                                       │ new disconfirming
                    │  │ re-opened by new/contradicting        │ evidence
                    │  │ evidence (every transition reversible) v
                    │  └───────────────────────────── refuted ─┘
                    │
                    └── ran, weak/mixed/null ─► inconclusive ──► (re-test) ─► hypothesis
```

**Transition rules.**
- Every transition writes an append-only `StatusEvent` (`ts`, `from→to`, triggering `evidence` ids, `by`); current
  status = latest event. Reversals and failures are auditable, expected, not exceptional.
- Only `experiment`/`external` evidence (never `generated`) can drive `→ supported` / `→ refuted` (rule 2).
- The pipeline **proposes** `→ supported`; **Jimmy confirms** before any `supported` export (brief §12;
  ADR-0001 §4). Scouting is hypothesis generation, not adjudication.
- **Failures are useful:** a ledger failure maps to `refuted`/`inconclusive` + an `Evidence` record — never
  silently dropped (ADR-0003; brief §5). Negative results are exportable knowledge.

## 4. Calibrated qualitative uncertainty + the hard cap

We separate **status** (which way evidence leans) from **confidence** (how strongly), using qualitative calibrated
enums by default to avoid false precision (IPCC two-metric pattern; see the research doc).

| Field | Values | Notes |
|---|---|---|
| `confidence` | `very-low … very-high` | derived from `evidence_strength` × `agreement`; default `very-low` |
| `evidence_strength` | `none` \| `weak` \| `moderate` \| `strong` | quality+quantity of **non-`generated`** evidence |
| `agreement` | `conflicting` \| `mixed` \| `consistent` | across evidence items |
| `likelihood` | optional `unlikely … very-likely` | **only if quantified**; else omit — empty ≠ "as likely as not" |
| `falsifiability` | markdown | the observation that would refute it — **required to leave `hypothesis`** |
| `reproducibility` | `unrun` \| `single-run` \| `replicated` \| `failed-to-reproduce` | links to ledger entries |

**The hard cap (load-bearing).** `confidence` is **bounded by `evidence_strength`**: `none → very-low`,
`weak → low`, regardless of how compelling the prose seems. A hypothesis backed only by `generated` evidence is
pinned at `very-low`. `likelihood` is omitted, not guessed (DOC-CONVENTIONS §3 — unknowns are `TODO`, never
fabricated numbers). A hypothesis missing `falsifiability` is a `TODO`, not a `supported` candidate.

### Calibration (worked examples)

| Situation | status | evidence_strength | confidence | Why |
|---|---|---|---|---|
| Scout generated hypothesis from 2 claims, nothing run | `hypothesis` | `weak` | `very-low` | generated-only; capped |
| Toy reproduction shows non-zero writeback, one run | `supported` | `moderate` | `low` | single experiment; `reproducibility=single-run` |
| Two toy runs disagree | `inconclusive` | `weak` | `very-low` | `agreement=conflicting` |
| Reproduction shows ~zero write traffic for that variant | `refuted` | `moderate` | `medium` | disconfirming, matches falsifiability |
| LLM summary "strongly suggests TTT dominates memory" only | `hypothesis` | `none` | `very-low` | generated ≠ evidence (rule 2) |

## 5. Record shapes (illustrative — builder writes the schema)

```jsonc
{
  "id": "HYP-2026-0007", "kind": "Hypothesis",
  "statement": "TTT-class inference (weight/state writeback during serving) produces a write-traffic profile not captured by read-dominant LLM-serving memory assumptions.",
  "theme": "ttt-writeback",
  "status": "hypothesis",                 // hypothesis | supported | refuted | inconclusive — required, floor=hypothesis
  "confidence": "very-low", "evidence_strength": "none", "agreement": "mixed",
  "likelihood": null,                     // omit unless quantified — do NOT invent
  "falsifiability": "A measured TTT variant shows write bytes/token ≈ 0 vs. baseline ⇒ refuted.",
  "reproducibility": "unrun",
  "derived_from_claims": ["CLM-2026-0031", "CLM-2026-0042"],
  "evidence": [],                         // Evidence ids
  "status_log": [{"ts": "TODO", "from": null, "to": "hypothesis", "by": "ExperimentScout", "evidence": []}],
  "boundary": {"exports_to": ["CAW-01:open-question"], "imports_from": ["CAW-05:signal-9921"]},
  "provenance": {"created_by": "ExperimentScout", "created_at": "TODO", "review_state": "unreviewed"}
}
```

```jsonc
{
  "id": "EVD-2026-0118", "kind": "Evidence",
  "evidence_kind": "experiment",          // experiment | external | generated
  "supports": "HYP-2026-0007",
  "direction": "supporting",              // supporting | disconfirming | neutral
  "strength": "moderate",
  "ledger_ref": "EXP-2026-0044",          // set for evidence_kind=experiment (incl. failures)
  "source_ref": null,                     // set for evidence_kind=external (citation)
  "note": "Toy reproduction measured non-zero write bytes/token under TTT update; single run."
}
```

## 6. Boundary behavior (export, never shared store)

- **To CAW-01 (separate product):** a `hypothesis`-status item exports only as a future-workload **open question**
  carrying `confidence` + `falsifiability`. Only `supported` items export as candidate workload inputs, still
  flagged `provisional`. The `wbtraffic` bundle is **lowered onto CAW-01's existing L0 objects** across a file/API
  handoff — no shared store (ADR-0004, ADR-0008).
- **To CAW-02 (separate product):** export `Claim` + linked `Evidence` only when `status ∈ {supported, refuted,
  inconclusive}`; status + confidence travel inline. **Bare hypotheses are rejected by the gate.**
- **From CAW-05 (separate product):** an imported TTT signal opens a `Hypothesis` at `status=hypothesis`,
  `confidence=very-low`, signal recorded as `external` evidence — never auto-promoted.

## Open Questions

See [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md).

- `TODO(open-question: numeric confidence (0–1) alongside the enum for ranking, or does that invite false precision?)`
- `TODO(open-question: "supported by N independent experiments" as a structured counter gating confidence vs reviewer judgement?)`
- `TODO(open-question: represent a partially-supported hypothesis — split into sub-hypotheses or add a scope qualifier?)`
- `TODO(open-question: confidence decay over time as the fast-moving TTT field shifts, triggering re-test?)`
- `TODO(open-question: do CAW-01/CAW-02 require a shared status vocabulary, or map at the export adapter boundary? lean: map at adapter — no shared registry.)`

## Implications for runbooks

- **Schema runbook:** three separate record types with id cross-refs; `status` required, default `hypothesis`;
  enforce the `confidence ≤ evidence_strength` cap.
- **Lifecycle runbook:** append-only `status_log`; a validator that **rejects** `supported`/`refuted` whose only
  evidence is `evidence_kind=generated`.
- **Scout runbook:** generate at `status=hypothesis`, `confidence=very-low`; require `falsifiability` or emit `TODO`.
- **Ledger integration runbook:** a verdict (incl. failure) creates `Evidence` + proposes a `StatusEvent`.
- **Export adapter runbooks:** carry status+confidence+evidence inline; block bare-hypothesis export; tag
  `supported` exports `provisional`.
- **Revisit trigger:** any path needing to promote on `generated` evidence, or render a hypothesis without
  status/confidence, is the load-bearing invariant breaking — stop, not a feature request.
