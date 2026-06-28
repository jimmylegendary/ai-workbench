# Data Model — entities, schemas, provenance fields

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [./storage-and-scheduling.md](./storage-and-scheduling.md) (where these records physically live; index/cache)
  - [./provenance-and-boundaries.md](./provenance-and-boundaries.md) (provenance/boundary/trust + generated-summary marking)
  - [../01-decisions/ADR-0002-interest-model.md](../01-decisions/ADR-0002-interest-model.md) (Interest artifact)
  - [../01-decisions/ADR-0003-source-adapters-and-ingestion.md](../01-decisions/ADR-0003-source-adapters-and-ingestion.md) (Source, RawFinding, dedup keys)
  - [../01-decisions/ADR-0004-classification-and-triage.md](../01-decisions/ADR-0004-classification-and-triage.md) (Classification record)
  - [../01-decisions/ADR-0005-related-work-ledger.md](../01-decisions/ADR-0005-related-work-ledger.md) (WatchedTarget, VerifiedSource, LedgerLink)
  - [../01-decisions/ADR-0007-export-boundaries.md](../01-decisions/ADR-0007-export-boundaries.md) (ExportBundle envelope)
  - [../02-research/related-work-ledger.md](../02-research/related-work-ledger.md) (ledger + export bundle detail)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
This doc fixes the **logical data model** for CAW-05: the entities the radar reads, produces, links, and exports,
their field-level schemas, and the **provenance fields every record carries**. It is the canonical name/shape
reference the other data-layer docs and the runbooks build against. It does NOT decide *where* records are stored
or *when* they are written (see [storage-and-scheduling](./storage-and-scheduling.md)), nor the trust/boundary
*rules* over these fields (see [provenance-and-boundaries](./provenance-and-boundaries.md)), nor the
classification rubric (ADR-0004) or verification gate (ADR-0005) — it consumes those as fixed and shows their
output shape.

## 1. Entity map (the radar's nouns)
One Run reads `Interest` + `Source`, emits `Finding`, attaches a `Classification`, resolves a `VerifiedSource`,
links it to a `WatchedTarget` via `LedgerLink`, renders a `Digest`, and projects confirmed links into an
`ExportBundle`.

| Entity | Owner | Produced by | Identity | Mutability |
|---|---|---|---|---|
| `Interest` | CAW-05 | human, versioned | `caw05:int-v<N>` | versioned (new row per update) |
| `Source` | CAW-05 | config registry | `caw05:srcadapter-<family>` | config (edited in place) |
| `Finding` | CAW-05 | collect stage | `caw05:fnd-<uuid>` | append; superseded, never mutated |
| `Classification` | CAW-05 | classify stage | embedded in Finding (`+ class_version`) | append a new record per re-classify |
| `VerifiedSource` | CAW-05 | verify stage | `caw05:src-<sha>` (content-addressed) | content-addressed (immutable per key) |
| `WatchedTarget` | CAW-05 | seeded from watch list | `caw05:tgt-<slug>` | mutable anchor (foreign_ref may update) |
| `LedgerLink` | CAW-05 | ledger stage | `caw05:lnk-<uuid>` | **append-only** (`superseded_by`) |
| `Digest` | CAW-05 | synthesize stage | `caw05:dig-<run_id>` | immutable artifact per run |
| `ExportBundle` | CAW-05 | export stage | `caw05:exp-<idempotency_key>` | immutable artifact (idempotent) |

All identities are **CAW-05-local**. Cross-product references are carried only as opaque `foreign_ref` strings on
`WatchedTarget` and projected at export — never as a foreign id stored on a Finding (independence, brief §1/§8).

## 2. Shared provenance block
Every produced record (`Finding`, `Classification`, `VerifiedSource`, `LedgerLink`, `Digest`, `ExportBundle`)
embeds the same `provenance` block. It is the single auditable spine; see
[provenance-and-boundaries](./provenance-and-boundaries.md) for the rules over it.

```yaml
provenance:
  origin:        "arxiv | semantic-scholar | github | rss:<feed-id> | hn"  # WHERE it came from (source family)
  origin_ref:    "arxiv:2401.01234v2 | https://… | repo@sha"               # canonical locator at origin
  retrieved_at:  "<RFC3339>"        # WHEN we fetched it (not the publish date)
  published_at:  "<RFC3339|null>"   # source-asserted publish/update date, if any
  run_id:        "caw05:run-2026-26"  # which Run produced this record
  adapter:       "arxiv-adapter@<version>"  # which SourceAdapter/stage emitted it
  boundary:      "public"           # public | internal — v1 ingests public only (brief §12)
  trust_prior:   "high | medium | low"  # per-source prior (ADR-0003/0004); carried, not re-derived
```

`retrieved_at` and `published_at` are distinct on purpose: cursors advance on retrieval time, recall reasoning
uses publish time. No date is ever invented — a missing source date is `null`, not a guess.

## 3. Interest
The small curated **typed interest artifact** (ADR-0002). Drives the additive, explainable, recall-floored
relevance score. Human-gated and versioned; seeded from the narrow watch list (brief §6).

```yaml
interest:
  version: caw05:int-v3
  updated_by: jimmy
  updated_at: "<RFC3339>"
  terms:
    - { value: "memory-centric DSE", kind: topic,   tier: 1, polarity: include }
    - { value: "Minsoo Rhu",          kind: author,  tier: 1, polarity: include }
    - { value: "MemOS",               kind: entity,  tier: 1, polarity: include }
    - { value: "arXiv:cs.AR",         kind: venue,   tier: 2, polarity: include }
    - { value: "crypto airdrop",      kind: keyword, tier: 3, polarity: exclude }
  embedding_lane: { enabled: false }   # alpha; gated on a labeled eval set (ADR-0002)
```

`kind ∈ {keyword, topic, entity, author, venue}`; `tier ∈ {1,2,3}` (weight); `polarity ∈ {include, exclude}`.
Updates create a **new version row** — a Finding records the `interest.version` it was scored against, so a
score is always reproducible.

## 4. Source
A `SourceAdapter` registry entry behind the one port (ADR-0003). Config, not data.

```yaml
source:
  id: caw05:srcadapter-arxiv
  family: "arxiv | semantic-scholar | github | rss | hn"
  status: "v1 | stub"          # documented stubs: reddit, sec-edgar, newsletters
  trust_prior: high
  cursor_kind: "oai-from | etag | since | numeric-id"   # see storage-and-scheduling §cursors
  legal_note: "public API; ToS-safe; rate ~<documented>"  # only legal/ToS-safe ingestion (brief §12)
```

## 5. Finding (with embedded Classification)
The unit of value: `source → signal → classification` with provenance (brief §2). A Finding is one JSON record;
its `classification` is the ADR-0004 record embedded (re-classification appends a record with a new
`class_version`, the prior kept for audit).

```yaml
finding:
  finding_id: caw05:fnd-0c12
  provenance: { … as §2 … }
  dedup_key: "doi:10.1145/… | arxiv:2401.01234 | sha256:<title+abstract>"   # ADR-0003 canonical key
  raw:
    title: "…"
    authors: ["…"]
    abstract: "…"          # source text; NOT a generated summary
    url: "https://…"
    external_ids: { arxiv: "…", doi: "…|null", s2: "…|null" }
  relevance:               # from the Interest score (ADR-0002)
    score: 0.0
    interest_version: caw05:int-v3
    watchlist_hits: ["memory-centric DSE"]
    explain: ["bm25(title)=…", "tier1-author-match=…"]   # additive, explainable contributions
  classification:          # ADR-0004 record
    relevance_class: "novelty-threat | support | adjacent | noise"
    signal: { score: 0.0, bucket: "hype | mixed | signal" }
    confidence: 0.0
    class_version: 1
    method: { labeler: "lf | llm | human", self_consistency: 0.0, abstained: false }
    review: { state: "queued | auto-accepted | human-confirmed | human-overridden", reviewer: null, decided_at: null }
    rationale_note: { text: "…", model: "<model>", evidence: false }   # generated; NEVER evidence
    routing: { decision: "knowledge|task|experiment|open-question|discard", targets: [], digest_eligible: true }
```

**Invariants encoded here:** `rationale_note.evidence=false` (generated text is never evidence, brief §5/§12);
a Finding with `watchlist_hits ≠ []` is never `routing.decision=discard` without human review (recall floor,
ADR-0004 §4); `noise` is discarded as a tombstone, never linked (ADR-0005).

## 6. VerifiedSource
The bibliographic entity a Finding resolved to after the Semantic Scholar gate (ADR-0005 §4). Content-addressed
by canonical key so weekly re-runs collapse to one row.

```yaml
verified_source:
  src_id: caw05:src-9b…                 # sha of canonical_key
  canonical_key: "doi:10.1145/… | arxiv:2401.01234 | s2:<paperId>"
  precedence: "doi > arxiv > s2 > dblp/acl > title+author-hash"
  metadata: { title: "…", authors: ["…"], venue: "…", year: 2026 }
  external_ids: { doi: "…", arxiv: "…", s2: "…", dblp: "…" }   # preprint↔published linked
  verification: { status: "verified | ambiguous | unverified", match_ratio: 0.0, gate: "lev>=0.70 & year±1" }
  locators: ["arxiv:2401.01234v2", "doi:…"]   # keep both versions a link may point into
  provenance: { … as §2 … }
```

## 7. WatchedTarget
The local anchor seam to the family without a shared store (ADR-0005). Holds an opaque `foreign_ref`; export
projects onto it.

```yaml
watched_target:
  target_id: caw05:tgt-mc-dla-novelty
  label: "MC-DLA memory-wall novelty claim"
  foreign_ref: "caw03://claim/CLM-2031"   # opaque; CAW-05 never reaches into CAW-03's store
  watchlist_topic: "Minsoo Rhu / MC-DLA / memory-wall line"
```

## 8. LedgerLink
The single auditable edge `(Finding, WatchedTarget, relation, rationale, provenance)`; **append-only**, schema
fixed by ADR-0005 §2.2 (reproduced here as the data-layer contract).

```yaml
ledger_link:
  link_id: caw05:lnk-7f3a
  finding_ref: caw05:fnd-0c12
  verified_source_ref: caw05:src-9b…       # null if unverified
  target_ref: caw05:tgt-mc-dla-novelty
  relation: "novelty-threat | support | adjacent"   # noise is NEVER linked (discarded at triage)
  strength: { score: 0.0, basis: "title+abstract overlap vs target claim text" }
  rationale: "human-readable WHY this source bears on this target"
  evidence_locator: "p.4 §3.2 / fig 2 / abstract"   # concrete pointer INTO the source, never the summary
  generated_summary_ref: "caw05:sum-… | null"        # kind=generated-summary, NEVER the backing
  provenance: { … as §2 (+ verification_status) … }
  review_status: "proposed | confirmed | rejected"
  superseded_by: "caw05:lnk-… | null"      # corrections add a row, never mutate
```

## 9. Digest
The weekly synthesized artifact (markdown-first, ADR-0001). One of five FormatRenderer outputs; the digest is
the default. It references findings/links — it does not re-store them.

```yaml
digest:
  digest_id: caw05:dig-2026-26
  run_id: caw05:run-2026-26
  format: "digest"   # memo | digest | slide-outline | paper-card | action-brief
  window: { from: "<RFC3339>", to: "<RFC3339>" }
  sections:
    - { relevance_class: "novelty-threat", finding_refs: ["caw05:fnd-0c12"], link_refs: ["caw05:lnk-7f3a"] }
  rendered_path: "digests/2026-26.md"   # markdown body; generated prose is marked (not evidence)
  provenance: { … as §2 … }
```

## 10. ExportBundle
The only thing that crosses a product boundary, via the ExportAdapter port (ADR-0007). A projection of
**confirmed** LedgerLinks; signed; idempotent. Envelope per [related-work-ledger research §4](../02-research/related-work-ledger.md)
and ADR-0007.

```json
{
  "contract_version": "1.0.0",
  "boundary_kind": "caw05-signal",
  "source_product": "CAW-05",
  "produced_at": "<RFC3339>",
  "producer_run_id": "caw05:run-2026-26",
  "declared_boundary": "public",
  "idempotency_key": "hash(finding_id + target + classification_version)",
  "payload_sha256": "<hash of canonicalized payload>",
  "signature": "<scheme TBD — align across family>",
  "payload": { "signals": [ /* one per exported LedgerLink; raw_summary tagged generated, not evidence */ ] }
}
```

Targets: CAW-02 (Source/Claim/RelatedWork), CAW-03 (novelty RadarSignal), CAW-01/CAW-06 (open questions). The
per-signal `related_to` carries the WatchedTarget `foreign_ref` so each consumer sees ids in its own namespace.

## Open Questions
- TODO(open-question: do `task`/`experiment` routings get their own persisted entity or live only in the Digest
  until CAW-01/CAW-06 contracts firm up? — see ADR-0004.)
- TODO(open-question: signature field scheme on ExportBundle — align with CAW-02 (minisign/cosign/DSSE), ADR-0007.)
- TODO(open-question: retention/TTL for `discard` tombstones kept for dedup memory + audit — ADR-0004/0006.)
- See [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md) (to be created).

## Implications for runbooks
- **RB (store):** materialize each entity at its path/identity (storage-and-scheduling §layout); enforce
  append-only on `LedgerLink`/`Finding` (corrections via `superseded_by`, never mutation).
- **RB (schema validation):** a shared `provenance` validator rejecting any record missing origin/retrieved_at/
  boundary; a check that `rationale_note.evidence` is always `false`.
- **RB (model fixtures):** golden JSON/YAML fixtures per entity for the index-rebuild and export negative tests.
