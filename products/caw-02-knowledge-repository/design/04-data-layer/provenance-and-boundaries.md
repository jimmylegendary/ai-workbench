# Provenance & Boundaries — two-axis classification, monotone propagation, trust ladder

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [./data-model.md](./data-model.md)
  - [./storage-strategy.md](./storage-strategy.md)
  - [./versioning-and-events.md](./versioning-and-events.md)
  - [../01-decisions/ADR-0004-provenance-and-trust.md](../01-decisions/ADR-0004-provenance-and-trust.md)
  - [../01-decisions/ADR-0003-knowledge-data-model.md](../01-decisions/ADR-0003-knowledge-data-model.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
This doc fixes the **data representation** of provenance and boundaries: the two orthogonal axes
`boundary{public,internal,confidential} × visibility{team,private}` with computed **monotone propagation**, the
derived **trust ladder T0–T3 + contested** (AI-authored capped at T2), and how the **evidence gate** is expressed
in the stored data. It elaborates [ADR-0004](../01-decisions/ADR-0004-provenance-and-trust.md). It does NOT define
entity fields (see [data-model](./data-model.md)), physical persistence (see [storage-strategy](./storage-strategy.md)),
or import/export wire formats (ADR-0007).

## 1. Two orthogonal axes (never one field)
Conflating "can it leave the building" with "whose space" is the classic leak. We keep **two** independent columns,
both `NOT NULL`, both defaulting to the safe direction.

| Axis | Field | Values | Ordered? | Default | Question it answers |
|---|---|---|---|---|---|
| Sensitivity | `boundary` | `public ⊂ internal ⊂ confidential` | yes (lattice) | `internal` (default-deny) | Can this leave the building? |
| Scope | `visibility` | `team`, `private` | no | `private` (default-private) | Whose space is it in? |

A `public` item can be `private` (Jimmy's public-source notes); a `confidential` item can be `team`. The axes do
not collapse. New unclassified items are `internal`/`private` until a **positive, attributed act** classifies them —
the dangerous direction (over-sharing) is the one that requires effort.

## 2. Monotone propagation (computed, never hand-set)
An entity's effective `boundary` is the **max** over itself and every entity reachable through provenance edges;
its effective `visibility` is `team` only if it and all provenance ancestors are `team`. Synthesis can never
launder sensitivity downward.

```
provenance edges that propagate sensitivity:
  evidence_for | challenges | extracted_from | cites | derived_from

boundary_eff(n)   = max_lattice( boundary(n),  { boundary_eff(a) : a in prov_ancestors(n) } )
visibility_eff(n) = team  iff  visibility(n)=team AND all a in prov_ancestors(n): visibility_eff(a)=team
                  = private otherwise
```

| Rule | Consequence |
|---|---|
| Monotone up only | a Note citing a `confidential` Claim is itself ≥ `confidential` |
| No downgrade by generation | synthesis never lowers `boundary` |
| Explicit declassify only | a downgrade needs an attributed `reclassify` activity by a human (Jimmy) with a recorded reason |
| Computed on read + export | propagation runs at query and at every export crossing (fail-closed allow-list, ADR-0007) |

```yaml
# example: a note inherits the max boundary of what it cites
# not_2026_x cites clm_2026_a (internal) and clm_2026_b (confidential)
# => boundary_eff(not_2026_x) = confidential   (even if authored as 'internal')
```

Stored vs effective: the file frontmatter holds the **declared** `boundary`/`visibility`; the index and every
read compute the **effective** value via propagation. Reindex recomputes effective values over the full graph
(see [storage-strategy §5](./storage-strategy.md)); a declared value lower than the computed floor is surfaced.

`TODO(open-question: do we persist the computed effective boundary as a cached column, or always compute on read? cache must be invalidated on any provenance-edge change.)`

## 3. The reclassify activity (the only downgrade path)
```yaml
# a provenance_event of activity=reclassify (ADR-0004 §4)
activity:  reclassify
agent:     human:jimmy            # AI agents may NOT downgrade boundary
ts:        2026-06-27T11:02:00Z
payload:
  node:    clm_2026_k7t2qx9m1a
  from:    confidential
  to:      internal
  reason:  "source paper is public; no SAIT-internal figures cited"
```
Downgrades are append-only events, never silent field edits; the history is auditable in git + `_events`
(see [versioning-and-events](./versioning-and-events.md)).

## 4. Trust ladder — derived and explainable
Trust is a **function of the graph**, recomputed on every edge change, never accepted from a caller (the `trust`
field is rejected if a caller sets it divergently).

| Level | Name | Derivable criteria |
|---|---|---|
| `T0` | unverified | no resolvable evidence yet (imported-but-unchecked signals; a bare Claim is rejected by the gate) |
| `T1` | single-source | ≥1 `evidence_for` evidence resolving to one external source |
| `T2` | corroborated | ≥2 independent sources, **or** evidence backed by a concrete artifact (trace/experiment/projection) |
| `T3` | reviewed | T2 **and** a human-review provenance event by an authorized agent |
| `contested` | conflict | both `evidence_for`(supports) and `challenges` above threshold — surfaced, not hidden |

```
trust(claim) =
  contested            if supports>=θ AND challenges>=θ
  T3                   if corroborated AND human_review_event(agent is human, authorized)
  T2                   if independent_sources>=2 OR has_artifact_backed_evidence
  T1                   if resolvable_evidence_count>=1
  T0                   otherwise
# AI-authored cap:
  if author_is_ai(claim):  trust = min(trust, T2)   # T3 requires a human reviewer (brief §10)
```

| Property | Rule |
|---|---|
| AI cap | AI-authored content caps at **T2**; T3 requires a human review event (encodes "Jimmy reviews strategic decisions") |
| Independence | trust and boundary are **independent** (a `public` claim can be T1; a `confidential` claim can be T3) |
| Recompute | any edge add/supersede triggers trust recompute on affected Claims; reindex recomputes globally |
| Explainable | every trust value is derivable from edges + provenance events, so a caller sees *why* |

`TODO(open-question: is "independent source" for T2 machine-decidable, or heuristic/human-judged? owned by ADR-0004.)`
`TODO(open-question: the exact contested threshold θ.)`

## 5. The evidence gate in the data
The gate (ADR-0004 §3) is the structural form of "generated summaries are not evidence", expressed across three
data facts:

| # | Data fact | Where it lives |
|---|---|---|
| 1 | `evidence` frontmatter has **no prose/summary field** — only `artifact_uri` + `locator` + `stance` | [data-model Evidence schema](./data-model.md) |
| 2 | A `claim` past `needs_evidence` MUST have ≥1 `evidence_for` edge from an `evidence` node | edge table + validator |
| 3 | No `note` may be the `from` of `evidence_for`/`extracted_from` | edge link validator |

Because Evidence is a *typed pointer* with no free-text slot, an agent **cannot** submit prose-as-evidence — the
gate is enforced by the absence of a field, not by a runtime warning. Violations return errors
(`ERR_EVIDENCE_NOT_ARTIFACT`, `ERR_TRUST_WITHOUT_EVIDENCE`, `ERR_NOTE_AS_EVIDENCE`), abort the transaction, and
leave no orphan node/file (see [storage-strategy §4](./storage-strategy.md)).

## 6. Provenance layer (PROV-shaped, no RDF)
Every write emits one `provenance_event` — the reconstructability substrate — linked from each node via
`created_via`.

```yaml
# provenance_event — one record per knowledge transaction
id:       pe_2026_a13f...
activity: attach_evidence        # add_source|extract_claim|attach_evidence|synthesize_note|classify_signal|reclassify|review
agent:    skill:attach-evidence  # human:jimmy | human:<teammate> | skill:<name>
ts:       2026-06-27T10:04:11Z
tool:     kr-cli v0
inputs:   [clm_2026_k7..., sim_2026_9f...]
outputs:  [evd_2026_77...]
notes:    "projection from CAW-01 run_8831 (imported, public-safe)"
```

| Field | Use |
|---|---|
| `agent` | distinguishes human vs AI authorship → drives the AI trust cap (§4) and downgrade authority (§3) |
| `inputs/outputs` | the lineage the reconstructability traversal walks (data-model §7) |
| `activity` | the typed transaction kind; `reclassify`/`review` are the only trust/boundary-changing activities |

Quarantine-on-import: imported items land at `T0`/`internal` until the local evidence gate passes; export is a
fail-closed allow-list with re-redaction at the crossing (ADR-0007).

## Open Questions
- `TODO(open-question: cache effective boundary vs compute-on-read; invalidation on edge change.)`
- `TODO(open-question: "independent source" for T2 — machine vs human.)`
- `TODO(open-question: contested threshold θ.)`
- `TODO(open-question: reclassification authority beyond Jimmy + required audit.)`
- `TODO(open-question: tamper-evidence on provenance events — hash chain in v0 vs later.)`
- See [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md).

## Implications for runbooks
- **RB (schema):** `boundary`/`visibility` NOT NULL default-deny/default-private; `provenance_event` table.
- **RB (propagation):** compute effective boundary/visibility on read + export; reindex recomputes globally.
- **RB (trust recompute):** derive trust from edges; AI cap at T2; recompute on edge change; never trust caller value.
- **RB (evidence gate):** enforce the three data facts of §5 with negative tests.
