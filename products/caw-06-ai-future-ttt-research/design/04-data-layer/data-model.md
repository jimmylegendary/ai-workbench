# Data Model — entities, schemas, status/uncertainty, provenance

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [storage-and-scheduling.md](storage-and-scheduling.md) (where these records live; append-only ledger; scheduling)
  - [provenance-and-uncertainty.md](provenance-and-uncertainty.md) (the status lifecycle, evidence cap, export carry-through)
  - [../01-decisions/ADR-0002-hypothesis-representation.md](../01-decisions/ADR-0002-hypothesis-representation.md) (Source/Claim/Hypothesis separation, status, cap)
  - [../01-decisions/ADR-0003-experiment-ledger.md](../01-decisions/ADR-0003-experiment-ledger.md) (ExperimentEntry + Result, verdicts, repro gate)
  - [../01-decisions/ADR-0004-writeback-traffic-schema.md](../01-decisions/ADR-0004-writeback-traffic-schema.md) (`wbtraffic.v0`)
  - [../01-decisions/ADR-0005-source-and-claim-ingestion.md](../01-decisions/ADR-0005-source-and-claim-ingestion.md) (`Source`/`CandidateClaim` producers)
  - [../01-decisions/ADR-0006-implication-mapping.md](../01-decisions/ADR-0006-implication-mapping.md) (`ImplicationMap`)
  - [../01-decisions/ADR-0008-export-boundaries.md](../01-decisions/ADR-0008-export-boundaries.md) (`ExportBundle`)
  - [../02-research/experiment-ledger.md](../02-research/experiment-ledger.md) (authoritative ledger YAML — not duplicated here)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
This doc fixes the **canonical entity set** of CAW-06's OWN file store and the **shared field shape** every record
carries — the eight entities behind the unit of value `source → claim → hypothesis → small experiment → result →
implication` plus the two export artifacts. It defines each entity's identity, key fields, and cross-references,
and the three invariants every record shares (`provenance`, `status`/`uncertainty`, `boundary`). It does NOT
re-decide the representation rules (ADR-0002), the ledger discipline (ADR-0003), or the storage layout/scheduling
(see [storage-and-scheduling.md](storage-and-scheduling.md)). Full per-record narrative schemas live in the
`02-research/*` docs and the ADRs above; this doc is the **map**, cross-linking rather than re-deriving them.

## 1. Entity overview

| Entity | What it is | Origin (stage) | Truth status | Append-only? |
|---|---|---|---|---|
| `Source` | a public research item (paper, post) or imported CAW-05 signal | S1/S2 ingestion | factual record of *what exists* | merge-on-rediscover |
| `Claim` | what a *source asserts* ("<source> claims X") | S4 extraction | `unverified` — never our conclusion | append (supersede) |
| `Hypothesis` | what *we propose to check* — always provisional | hypothesis stage | `hypothesis` (default + floor) | append (`status_log`) |
| `ExperimentEntry` | one toy/minimal-reproduction **run** | Run stage | `planned`→`done`/`aborted` | yes (one run = one entry) |
| `Result` | the verdict + metrics block of a run | Run stage | a `verdict` (4-value) | yes (inside its entry) |
| `ImplicationMap` | one finding fanned out across domains | implication stage | per-implication `status` | append (supersede) |
| `WritebackTrafficSchema` | per-variant `wbtraffic.v0` artifact (the CAW-01 bridge) | Run output | carries a `Hypothesis` status | append (supersede) |
| `ExportBundle` | a self-describing one-way push to CAW-01/CAW-02 | export seam | mirrors source item status | append (receipts) |

> Separation is structural, not cosmetic (brief §12). `Source`/`Claim`/`Hypothesis`/`Evidence` are **never merged**
> into one "fact" record — that is the load-bearing invariant of ADR-0002. See
> [provenance-and-uncertainty.md](provenance-and-uncertainty.md) for the enforcement rules.

## 2. Shared envelope (every record)
Every record, regardless of kind, carries a common front-matter envelope. Producers MUST fill it; validators reject
records missing it (brief §7).

```yaml
# shared envelope (front-matter on every md/JSON record)
id: <PREFIX>-NNNN              # stable, monotonic; prefix per entity (SRC/CLAIM/HYP/EXP/IMAP/WBT/EXB)
kind: source|claim|hypothesis|experiment|implication-map|wbtraffic|export-bundle
created: TODO(open-question: do not invent dates)
provenance:                   # where it came from — always present
  source_ids: [SRC-0001]      # upstream sources (may be empty for pure-generated artifacts)
  origin: arxiv|semantic-scholar|caw05|generated|experiment
  retrieved_at: TODO
boundary: internal|export:caw-01|export:caw-02   # scope/destination tag (brief §7, §12)
status: <entity-specific>     # see each entity below; NEVER omitted on Hypothesis-bearing records
lineage:
  supersedes: null            # id this record corrects/refines (append-only model)
  derived_from: null
```

`generated` content (LLM paraphrase, summary) is always tagged `evidence:false` wherever it appears, and never
substitutes for a `Source`/`Claim`/`Result` reference (ADR-0002, ADR-0005).

## 3. Entity schemas

### 3.1 Source
A public item or a CAW-05 import. Multi-origin rediscovery merges into **one** `Source` with multiple `provenance`
entries (dedup: DOI ▸ arXiv id ▸ normalized(title+first-author+year), ADR-0005 §4).

```yaml
id: SRC-0001
kind: source
title: "..."
authors: [...]
canonical_id: "doi:..." | "arxiv:2411.07279"
versions: ["v1","v2"]                 # arXiv versions kept distinct-but-linked
provenance:
  - {origin: arxiv, url: "...", retrieved_at: TODO, native_id: "2411.07279"}
  - {origin: caw05, bundle_id: "...", evidence: false}   # CAW-05 prose is non-evidential
boundary: internal
```

### 3.2 Claim
What a source asserts — extractive and attributable (verbatim span + locator). `status` is always `unverified`;
extraction never emits `supported` (ADR-0005 §5).

```yaml
id: CLAIM-0011
kind: claim
source_id: SRC-0001
statement: "<source> reports per-instance LoRA TTT lifts ARC accuracy over a frozen base"
evidence_span: "<verbatim quote>"     # required — traceable to source text
source_locator: "p4, §3.2"
claim_type: mechanism|quantitative-result|capability|efficiency|memory-traffic|reproducibility
writes_back: true|false|unknown       # default unknown (brief §6)
asserted_by: SRC-0001                 # provenance: it is the SOURCE that asserts this, not us
status: unverified
```

### 3.3 Hypothesis
What we propose to check. **Never serialized without `status`**; default and floor `hypothesis` (ADR-0002 §2).
Confidence/uncertainty fields and the append-only `status_log` are detailed in
[provenance-and-uncertainty.md](provenance-and-uncertainty.md).

```yaml
id: HYP-0003
kind: hypothesis
statement: "Per-instance TTT writes back enough state to register on a memory-traffic axis"
from_claims: [CLAIM-0011]
status: hypothesis|supported|refuted|inconclusive     # default+floor: hypothesis
confidence: very-low|low|moderate|high|very-high       # default very-low; capped by evidence (ADR-0002 §4)
evidence_strength: none|weak|moderate|strong
agreement: conflicting|mixed|consistent
likelihood: null                      # optional; omit unless quantified — empty != "50/50"
falsifiability: "observation that would refute"        # REQUIRED to leave `hypothesis`; else a TODO
reproducibility: unrun|single-run|replicated|failed-to-reproduce
evidence_ids: [EVID-...]              # Evidence records (experiment|external|generated)
status_log: [ ... ]                   # append-only StatusEvents (see provenance doc)
```

> `confidence` here is the ADR-0002 5-value scale. `ImplicationMap` uses a 3-value scale; the two are reconciled at
> the boundary, not silently — `TODO(open-question: unify or map confidence scales — ADR-0002 vs ADR-0006)`.

### 3.4 ExperimentEntry + 3.5 Result
One run = one append-only entry (ADR-0003). The **authoritative full YAML** is in
[../02-research/experiment-ledger.md](../02-research/experiment-ledger.md) §"ledger entry model" — reproduced here
only in skeleton to show the cross-references and the embedded `Result` + writeback hook.

```yaml
id: EXP-0007
kind: experiment
hypothesis_id: HYP-0003               # ← Hypothesis
claim_ref: CLAIM-0011                 # ← Claim
status: planned|running|done|aborted
prediction: {metric, baseline, expected_direction, decision_rule}   # pre-registered (anti-HARK, R6)
repro: {config_path, seeds:[0,1,2], code_rev, data_ref, env_lock, hardware, budget}  # MUST gate
result:                               # the Result sub-record (verdict is the payload)
  verdict: supported|refuted|inconclusive|invalid     # invalid = setup broken, NOT refuted
  metrics_path: "artifacts/EXP-0007/metrics.json"
  observed_effect: "TODO until run"
  negative_result: false
  failure_mode: null|oom|budget-exceeded|nonconvergence|no-effect|flaky|setup-error
writeback_observed:                   # OPTIONAL hook → WritebackTrafficSchema (ADR-0004); a MEASURED number
  weights_updated: true
  state_lifecycle: "per-request, discarded on completion"
  bytes_per_update: null              # null until measured — never invented
```

| Verdict | Means | Is NOT |
|---|---|---|
| `supported` | toy result matches predicted direction under the decision rule | "true at scale" / a settled claim |
| `refuted` | toy result contradicts prediction under the rule | "the idea is worthless" |
| `inconclusive` | ran cleanly, rule not met (effect within noise) | a failure to log |
| `invalid` | setup broken (OOM, bug, leak) | `refuted` |

A `Result` becomes an `Evidence` record (`evidence_kind=experiment`) + a *proposed* `StatusEvent` on its
`Hypothesis`; **failures are retained and classified, never dropped** (brief §5; see provenance doc §evidence).

### 3.6 ImplicationMap
One per finding; fans out into typed, uncertainty-tagged `implications[]` across the fixed 6-domain enum
(ADR-0006). The `summary` is **explicitly marked generated — not evidence**.

```yaml
id: IMAP-0002
kind: implication-map
finding_ref: {thread_id, kind: result|hypothesis|claim, ref_id: EXP-0007}
summary: "..."                        # GENERATED — evidence:false (never an evidence_ref)
implications:
  - impl_id: IMP-1
    domain: ai-services|education|dev-platforms|models|hardware|memory-centric-systems
    statement: "claim-about-consequences"
    status: hypothesis|supported|refuted|inconclusive   # independent of confidence
    confidence: low|medium|high
    evidence_refs: [EXP-0007]         # MUST resolve to a Result or Claim — never the summary
    writeback_payload_ref: WBT-0001   # only for CAW-01-bound implications
    export_targets: [caw-01]          # routing hint only; ADR-0008 owns the real gate
```

### 3.7 WritebackTrafficSchema (`wbtraffic.v0`)
CAW-06's OWN per-variant artifact — the LOAD-BEARING bridge to CAW-01, exported (never a shared store). Mandatory
`provenance` + `uncertainty` (an ADR-0002 status). **Every numeric defaults to `null`**; a `null` that matters is a
`TODO(open-question: …)`, never an invented number. Full field set + the L0/L1 lowering table: ADR-0004 §1/§3.

```yaml
id: WBT-0001
kind: wbtraffic
schema_version: "wbtraffic.v0"
ttt_variant: "per-instance-LoRA-TTT"
provenance: {claim_id: CLAIM-0011, source_url: "..."}
uncertainty: {status: hypothesis, confidence: very-low}   # mandatory (ADR-0002)
basis: modeled|measured               # MODELED (analytic L0 estimate) flagged distinctly from MEASURED (ledger)
fast_weights: {param_count: null, dtype: null, fraction_of_model: null}
update: {granularity: token|chunk|sequence, updates_per_1k_tokens: null, writes_optimizer_state: null}
writeback: {bytes_per_update: null, write_bw_bytes_per_s: null,
            updated_state_residency: device|near_mem|host, endurance_writes_per_run: null}
ratio_curve: null                     # read/write bytes + capacity peak vs context × update-freq
assumptions: ["..."]                  # every modeled number lists its assumptions
open_questions: ["wbq-001", "..."]    # first-class — CAW-01 receives questions, not assertions
```

### 3.8 ExportBundle
The only thing that crosses a product boundary; one-way push; self-describing (no shared registry). Per-target
payloads + gates are owned by ADR-0008; receipts are stored locally (`store/exports/`).

```yaml
id: EXB-0005
kind: export-bundle
target: caw-01|caw-02
schema_version: "1.0.0"               # semver, in-band
producer: "caw-06"
content_hash: "sha256:..."            # idempotency: re-emit = upsert by id+hash
provenance: {thread_id, source_ids: [SRC-0001], boundary: export:caw-01}
payload:                              # target-specific (ADR-0008 §4/§5)
  # CAW-01: kind: writeback-traffic-schema  → fields + open_questions[]  (modeled vs measured flagged)
  # CAW-02: kind: claim-with-evidence       → claim + status + confidence + evidence[] + not_evidence[]
receipt: {emitted_at: TODO, result: ok|rejected, reason: null}   # failed export stays exportable
```

## 4. Cross-reference graph

```
Source ──asserts──▶ Claim ──seeds──▶ Hypothesis ◀──status events── Result
                                        │                              ▲
                                        │                              │ verdict
                          probed-by ────┴──────────────▶ ExperimentEntry
                                        │
   Hypothesis/Result/Claim ──finding──▶ ImplicationMap ──routes──▶ ExportBundle ──push──▶ CAW-01/CAW-02
                                        │                              ▲
   ExperimentEntry.writeback_observed ──grounds──▶ WritebackTrafficSchema (CAW-01 payload)
```

## 5. Invariants (validator-enforced; see provenance doc)
- No `Hypothesis`-bearing record is serialized without `status` + `confidence`.
- `generated` content is `evidence:false` and can never promote a status or stand in for an `evidence_ref`.
- A `Claim` carries `asserted_by`; restating it as our conclusion is forbidden.
- Every numeric in `WritebackTrafficSchema` is `null` or sourced (modeled-with-assumptions / measured); never invented.
- Nothing crosses a `boundary` stripped of its `status`/`uncertainty` (ADR-0002 §5, ADR-0008 §5).

## Open Questions
- `TODO(open-question: unify confidence scales — ADR-0002 5-value vs ADR-0006 3-value — or map at boundary?)`
- `TODO(open-question: should `Evidence` be a first-class top-level entity dir, or stay embedded under Hypothesis/Result?)` — see [provenance-and-uncertainty.md](provenance-and-uncertainty.md).
- See [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md).

## Implications for runbooks
- **RB (schemas + validators):** implement the shared envelope + the eight entity schemas above; enforce the §5 invariants.
- **RB (resolvers):** "current status" (Hypothesis `status_log`) and "current verdict" (ExperimentEntry `supersedes`) resolver views, per [storage-and-scheduling.md](storage-and-scheduling.md).
- Cross-product references (CAW-01/02/05) are **import/export boundaries** — no shared store (ADR-0008).
