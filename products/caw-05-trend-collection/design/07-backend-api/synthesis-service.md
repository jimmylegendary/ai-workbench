# Synthesis Service — classify → route → synthesize → render formats

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [./api-surface.md](./api-surface.md) (the `classify`, `synthesize`, `render` ops)
  - [./ingestion-service.md](./ingestion-service.md) (supplies deduped findings)
  - [./scheduler-and-persistence.md](./scheduler-and-persistence.md) (artifact persistence, ledger append)
  - [../01-decisions/ADR-0001-product-surface-and-outputs.md](../01-decisions/ADR-0001-product-surface-and-outputs.md) (five formats, FormatRenderer)
  - [../01-decisions/ADR-0004-classification-and-triage.md](../01-decisions/ADR-0004-classification-and-triage.md) (taxonomy, cascade, routing)
  - [../01-decisions/ADR-0005-related-work-ledger.md](../01-decisions/ADR-0005-related-work-ledger.md) (ledger links)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
Describes the back half of a Run: how deduped + scored findings are **classified** (two-axis taxonomy via an
LF→LLM→human cascade with a recall-biased selective-review gate), **routed** deterministically, optionally linked
into the ledger, then **synthesized** and **rendered** into the five markdown-first formats behind the
`FormatRenderer` port. It implements the `classify`/`synthesize`/`render` ops of [./api-surface.md](./api-surface.md)
under ADR-0004 (classification/triage) and ADR-0001 §C (formats). It does NOT define ingestion (sibling), the
relevance score (ADR-0002), the ledger schema (ADR-0005), or export-bundle wire format (ADR-0007). **A generated
rationale or summary is NEVER evidence.**

## Position in the Run
```
collect → dedup → relevance → classify+route (this doc) → [ledger] → synthesize+render (this doc) → export
```

## Stage 1 — Classify (two-axis taxonomy, LF→LLM→human cascade)
Each finding gets **two independent axes** (ADR-0004):

| Axis | Values |
|---|---|
| novelty | `novelty-threat` \| `support` \| `adjacent` \| `noise` |
| signal | `signal` \| `hype` |

The cascade tries the cheapest decider first and **escalates on low confidence** — recall-biased, never
precision-greedy.

```text
classify(finding):
    lf = labeling_functions(finding)          # 1. deterministic rules + per-source trust prior
    if lf.confident: return decide(lf, by="LF")
    llm = llm_classify(finding)               # 2. LLM with structured rubric; rationale is generated
    if llm.confidence >= threshold: return decide(llm, by="LLM")
    return abstain(finding)                    # 3. selective-review gate → human queue
```

### Selective-review gate (recall-biased)
| Outcome | Condition | Action |
|---|---|---|
| auto-decided | LF confident OR LLM ≥ threshold | route deterministically |
| **abstain → human** | below confidence threshold | queue for `confirm`; NEVER auto-discarded |
| floor override | relevance `floor_hit=true` (watch-list) | never silently dropped; min route = open-question |

```text
Classification = {
  novelty_axis, signal_axis, confidence,
  decided_by: "LF" | "LLM" | "human",
  version,                          # classification_version → export idempotency key
  rationale,                        # GENERATED — evidence:false ALWAYS; never an export claim
}
```
**Rationale-not-evidence rule:** the LLM's generated rationale explains the *decision*, not the *world*. It is
stored for audit, shown with the `evidence:false` banner, and is never emitted as a claim to CAW-02/03.

## Stage 2 — Route (deterministic, config-driven)
Routing is a pure function of the classification + config (ADR-0004) — no model call, fully reproducible.

| novelty × signal | Default route | Export target (via ADR-0007) |
|---|---|---|
| novelty-threat × signal | `experiment` or `open-question` + flag | CAW-03 (novelty RadarSignal) |
| support × signal | `knowledge` | CAW-02 (Source/Claim/RelatedWork) |
| adjacent × signal | `open-question` | CAW-01 / CAW-06 |
| any × hype | `task` (watch) or `open-question` | — (held; not auto-exported) |
| noise × any | `discard` | none; **never synthesized** |

```text
route(classification) -> Route   # deterministic lookup in routing.yaml; no LLM
```
**Terminal routes are proposal-only on agent surfaces.** A `novelty-threat` route to CAW-03 requires a human
`confirm` (review gate, ADR-0001 §4 / ADR-0004 §5); an MCP agent can only create a pending gate event.

## Stage 3 — Ledger link (optional, append-only)
When a finding relates to a `WatchedTarget`, the core appends a `LedgerLink` after Semantic Scholar verification
(Levenshtein title gate + year±1 + multi-key dedup). A provenance-complete LedgerLink is the single auditable
record (ADR-0005). Detail lives in ADR-0005; this service only invokes `ledger_append`/`ledger_verify`.

## Stage 4 — Synthesize + Render (five formats, FormatRenderer port)
`synthesize(run_id)` renders every **non-noise** finding; `render(finding, format)` renders one on demand. All
formats are markdown-first adapters over the shared `Finding`, inheriting one base template (ADR-0001 §5).

```text
interface FormatRenderer:
  format_id() -> Format
  render(finding | finding_set, base_ctx) -> ArtifactRef     # writes markdown, returns path
ArtifactRef = { path, format, finding_ids[], evidence:false, provenance_manifest_path }
```

| Format | Scope | Audience / target | Notes |
|---|---|---|---|
| `memo` | 1 finding | Jimmy / team | short triaged note |
| `digest` | N findings (weekly) | team readers | the primary weekly output |
| `slide-outline` | N findings | presentations | Marp-compatible markdown |
| `paper-card` | 1 paper | → CAW-02 / CAW-03 | structured related-work card |
| `action-brief` | 1 finding | → CAW-01 / CAW-06 | open-question / task framing |

### Base template guarantees (every artifact)
1. **Provenance manifest** — every claim links to its source provenance entry (origin, retrieved_at, native id).
2. **`evidence:false` banner** — the *"generated summary — not evidence"* notice (brief §5, §12). Generated prose
   is clearly separated from source-verbatim metadata.
3. **`noise` is never synthesized** — discard route produces no artifact.
4. **No internal-claim mixing** — public-source synthesis never asserts internal Samsung/SAIT claims (brief §12).

```text
synthesize(run_id):
    for finding in findings(run_id) where finding.route != "discard":
        ctx = base_ctx(finding)          # provenance manifest + evidence:false banner
        for fmt in formats_for(finding.route):
            renderer = registry[fmt]; renderer.render(finding, ctx)
```

## Idempotency & resumability
- Re-rendering a finding overwrites its artifact deterministically (same inputs ⇒ same markdown).
- `classification_version` is an input to the export idempotency key (ADR-0006 §4), so a re-classification is the
  only thing that legitimately re-exports.
- The synthesize stage is checkpointed; a crash resumes without re-classifying decided findings.

## Negative tests (must hold)
- A `noise` finding yields zero artifacts and zero exports.
- A low-confidence finding `abstain`s to the human queue; it is never auto-discarded.
- A watch-list (`floor_hit`) finding is always present in the digest, regardless of relevance score.
- A generated rationale never appears as a claim in a CAW-02/03 export bundle.

## Open Questions
- TODO(open-question: LLM confidence threshold + abstain rate target for the selective-review gate.)
- TODO(open-question: which labeling functions are reliable enough to auto-decide without LLM escalation?)
- TODO(open-question: paper-card field set required by CAW-02 vs CAW-03 — confirm at the export boundary.)
- See [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md).

## Implications for runbooks
- Classifier + routing behind ports; LF module, LLM module, and the human-review queue are separable units.
- One base template + five `FormatRenderer` adapters; the base template owns the provenance manifest +
  `evidence:false` banner so no individual renderer can omit them.
- Routing table is config (`routing.yaml`), not code, so re-routing is reviewable as a diff.
