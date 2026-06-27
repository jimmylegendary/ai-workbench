# Data Model — entity frontmatter schemas + the generic typed edge model

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [./storage-strategy.md](./storage-strategy.md)
  - [./provenance-and-boundaries.md](./provenance-and-boundaries.md)
  - [./versioning-and-events.md](./versioning-and-events.md)
  - [../01-decisions/ADR-0002-storage.md](../01-decisions/ADR-0002-storage.md)
  - [../01-decisions/ADR-0003-knowledge-data-model.md](../01-decisions/ADR-0003-knowledge-data-model.md)
  - [../01-decisions/ADR-0004-provenance-and-trust.md](../01-decisions/ADR-0004-provenance-and-trust.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
This doc fixes the **concrete on-disk shape** of every CAW-02 knowledge entity: the YAML frontmatter contract per
`kind`, the one generic typed `edge` model, the node id scheme, and the structural form of the `Claim→Evidence`
invariant. It elaborates [ADR-0003](../01-decisions/ADR-0003-knowledge-data-model.md) (the vocabulary) and
[ADR-0002](../01-decisions/ADR-0002-storage.md) (files are the source of truth). It does NOT decide physical
persistence/reindex mechanics (see [storage-strategy](./storage-strategy.md)), the trust/boundary *meaning* (see
[provenance-and-boundaries](./provenance-and-boundaries.md)), or the event/version log (see
[versioning-and-events](./versioning-and-events.md)).

## 1. One entity = one markdown file
Every node is **one `.md` file** = YAML frontmatter (the machine contract) + markdown body (the human note), laid
out by `kind`:

```
knowledge/
  sources/         clm? no — src_*.md
  claims/          clm_*.md
  evidence/        evd_*.md
  notes/           not_*.md
  concepts/        cpt_*.md
  interests/       int_*.md
  open-questions/  oq_*.md
  decisions/       dec_*.md
  assumptions/     asm_*.md
  signals/         rw_*.md, rdr_*.md
  _refs/           trc_*.md, sim_*.md, exp_*.md   # imported-artifact references
  _events/         <ts>-<op>.jsonl                # append-only event mirror
```

The frontmatter is canonical; the SQLite `node`/`edge` rows are a derived mirror kept in lockstep
(see [storage-strategy](./storage-strategy.md)). The body is free human prose and is **never** machine-load-bearing
— a body can never be evidence (the structural form of brief §10).

## 2. Node id scheme
```
<prefix>_<yyyy>_<base32(blake3(canonical_payload))[:10]>
e.g.  clm_2026_k7t2qx9m1a
```

| Rule | Value |
|---|---|
| Prefix per kind | `src claim→clm evd not cpt int oq dec asm rw rdr trc sim exp` |
| Year segment | creation year (human-scannable, not semantic) |
| Hash segment | first 10 chars of base32(blake3) over the canonical frontmatter-minus-`id` + body |
| Stability | id is content-addressed at creation, then **immutable**; corrections are new ids linked by `supersedes` |
| Filename | `id` + `.md`; filename and `id` field MUST match (reindex re-checks) |
| Collisions | hash collision ⇒ append `-1` and surface `TODO(open-question: collision policy)` |

Content-addressing makes a node's id a fingerprint of its content at birth, so duplicate imports self-detect. The
`supersedes` chain (not id mutation) carries every later edit — see [versioning-and-events](./versioning-and-events.md).

`TODO(open-question: content-addressed hash vs sequential slug — owned jointly by ADR-0002/0003; this doc assumes hash.)`

## 3. Common frontmatter (every node)
Mirrored to the index `node` row and kept in lockstep. Fields marked **derived** are computed by the core and
MUST NOT be set by a caller (rejected if present and divergent).

```yaml
id:            clm_2026_k7t2qx9m1a        # immutable, == filename
kind:          claim                       # closed vocabulary, see §4
schema_version: 1                          # frontmatter contract version
boundary:      internal                    # public|internal|confidential (default-deny: internal)
visibility:    private                     # team|private (default-private)
status:        needs_evidence              # proposed|accepted|needs_evidence|rejected|superseded
generated:     true                        # true for Note + any LLM-proposed candidate
trust:         T0                          # DERIVED  T0..T3|contested  (never caller-set)
artifact_uri:  null                        # path/URI for evidence/_refs; null otherwise
created_by:    skill:extract-claims        # agent id (human or skill name)
attributed_to: human:jimmy                 # origin author (may differ on import)
created_via:   pe_2026_a13f...             # provenance_event id of the writing activity
supersedes:    null                        # id of the version this replaces (null if original)
content_hash:  blake3:9f2c...              # detects file<->index drift
created_at:    2026-06-27T10:04:11Z        # RFC3339 UTC
```

Edges are NOT stored as free fields here; they live in dedicated link blocks (§5) that mirror 1:1 to the `edge`
table, so a single representation drives both files and index.

## 4. Per-kind frontmatter schemas
Closed `kind` vocabulary (ADR-0003): `source claim evidence note concept interest open_question decision
assumption trace simulation_run experiment related_work radar_signal`. Below: the **type-specific** fields each
adds on top of §3. Examples show only the distinctive fields.

### Source
```yaml
kind: source
source_type:  paper|article|note|dataset|import_ref   # what the raw input is
title:        "Sparse Mixture-of-Experts routing..."
origin_uri:   https://arxiv.org/abs/...               # where it came from (may be null for internal)
imported_from: caw-05|caw-01|null                      # cross-product import provenance (file boundary)
```
A Source **asserts nothing itself**; it is the target of `extracted_from`/`evidence_of`.

### Claim
```yaml
kind: claim
statement:    "MoE routing reduces FLOPs/token by ~Nx at fixed quality."
claim_type:   empirical    # empirical|methodological|definitional|comparative|normative  (TODO taxonomy ADR-0005)
# status starts needs_evidence; promotion to accepted requires >=1 evidence_for edge (§6)
```
**Invalid without evidence.** A bare Claim is a first-class `status=needs_evidence`, `trust=T0` state — visible,
un-promotable, never an error to hide.

### Evidence
```yaml
kind: evidence
stance:       supports          # supports|challenges
artifact_uri: file://knowledge/_refs/sim_2026_...   # MUST resolve to a real artifact/source span
locator:      "p.4, fig.2"      # span/page/line/cell locator inside the artifact
# NOTE: there is NO prose/summary field. Evidence is a typed pointer, never free text.
```
The **absence of a prose field is the schema-layer evidence gate** (ADR-0004 §3, layer 1). Evidence carries an
`evidence_for` edge to its Claim and an `extracted_from` edge to a concrete artifact/source.

### Note (synthesis)
```yaml
kind: note
generated:    true             # always true; structurally barred from being evidence
title:        "What we know about MoE routing efficiency"
# body holds the synthesis prose; every assertion in it is backed by a cites edge to Claim/Evidence
```

### Concept / Interest
```yaml
kind: concept
label:        "mixture-of-experts"
aliases:      ["MoE", "sparse experts"]
```
```yaml
kind: interest
label:        "inference-cost reduction"
priority:     high|normal|low        # drives intake prioritization (ADR-0005 Pipeline B)
```

### OpenQuestion / Decision / Assumption
```yaml
kind: open_question
question:     "Does MoE routing hold at our context lengths?"
raised_by:    human:jimmy|signal:rdr_2026_...    # manual or auto-raised by a refuting signal
resolved_by:  null                                # decision id once resolved
```
```yaml
kind: decision
title:        "Adopt MoE for the v2 inference path"
decided_by:   human:jimmy        # strategic decisions are human-reviewed (brief §10)
status:       accepted
```
```yaml
kind: assumption
statement:    "Token distribution at inference matches training mix."
confidence:   stated            # stated|tested  (tested requires linked evidence)
```

### Imported-artifact references (cataloged, never executed here)
```yaml
kind: simulation_run            # or trace | experiment
artifact_uri: file:///artifacts/caw01/run_8831/projection.parquet
origin:       caw-01            # the independent product that produced it (file/API boundary)
checksum:     blake3:...        # integrity of the referenced artifact
# payload is NEVER inlined; only referenced by URI (brief §6/§7)
```

### Intake signals
```yaml
kind: related_work              # or radar_signal
external_ref:  https://...                 # the external work
classification: supports|refutes|neutral   # typed stance vs our claims (not a loose summary)
imported_from:  caw-05                      # radar intake boundary
```

## 5. The generic typed edge model
All relationships are **one generic `edge`** — graph-upgrade-ready (ADR-0002/0003). In files, edges live as a typed
link block in the *source* node's frontmatter; reindex projects them into the `edge` table.

```yaml
# inside evd_2026_xxx.md frontmatter
links:
  - rel: evidence_for      # this Evidence backs a Claim
    to:  clm_2026_k7t2qx9m1a
  - rel: extracted_from    # ...and points at a concrete artifact
    to:  sim_2026_9f1d2c
```

```sql
-- derived index (portable SQLite∩Postgres subset)
CREATE TABLE edge (
  src_id  TEXT NOT NULL,
  dst_id  TEXT NOT NULL,
  rel     TEXT NOT NULL,
  created_via TEXT NOT NULL,          -- provenance_event id
  PRIMARY KEY (src_id, dst_id, rel)
);
```

| `rel` | From → To | Meaning |
|---|---|---|
| `evidence_for` | Evidence → Claim | Backs the claim. **Direction of the invariant.** |
| `challenges` | Evidence → Claim | Contradicts the claim (powers threat/support). |
| `extracted_from` | Evidence → Source\|Trace\|SimulationRun\|Experiment | The concrete artifact pointed at. |
| `cites` | Note → Claim\|Evidence | Synthesis cites what it rests on. |
| `derived_from` | Note\|Claim → Source\|Claim | Lineage (PROV `wasDerivedFrom`). |
| `about_concept` | Claim\|Source\|Note → Concept | Topical indexing for retrieval. |
| `addresses` | Claim\|Evidence → OpenQuestion\|Decision\|Assumption | Links findings to decisions. |
| `relates_to` | any → any | Weak association. |
| `supports` | RelatedWork\|RadarSignal → Claim | External signal corroborates. |
| `refutes` | RelatedWork\|RadarSignal → Claim | External signal threatens (auto-raises OpenQuestion). |
| `supersedes` | any vN → any vN-1 | Append-only correction chain. |
| `attributed_to` | any → Agent | Who/what produced it. |

**Structural bar:** no edge may make a `note` the `from` of `evidence_for`/`extracted_from`. This is the
data-model form of "generated synthesis is not evidence" and is rejected by the core link validator.

## 6. The Claim→Evidence invariant (structural form)
**Definition.** A `kind=claim` node is *valid* (may hold `status=accepted` and `trust > T0`) only if:
1. it has **≥1 `evidence_for` edge** from an `evidence` node, **and**
2. every such `evidence` node has an `extracted_from` edge to a concrete `source|trace|simulation_run|experiment`
   (or a resolvable `artifact_uri`), **never** to free text and **never** to a `note`.

Enforced in **three lockstep layers** (ADR-0003), identical across API/MCP/CLI and SQLite/Postgres:

| Layer | Where | Failure code |
|---|---|---|
| 1. Schema | `attach_evidence` has no prose field; `artifact_uri` must resolve | `ERR_EVIDENCE_NOT_ARTIFACT` |
| 2. Core validator | pre-commit: ≥1 `evidence_for`; `extracted_from` resolves; no note-as-evidence | `ERR_TRUST_WITHOUT_EVIDENCE`, `ERR_NOTE_AS_EVIDENCE` |
| 3. Reindex re-check | rebuild re-runs the invariant over `knowledge/**`; fails loud | reindex aborts |

A no-evidence Claim is the first-class `needs_evidence`/`T0` state, never a hidden error.

## 7. Reconstructability traversal
```
note --cites--> claim --evidence_for(in)--> evidence --extracted_from--> source|trace|simulation_run|experiment
```
Available as a recursive CTE over `edge` or as git-blame across linked files. Every hop also records *who/what/when*
via `created_via` → `provenance_event` (see [versioning-and-events](./versioning-and-events.md)).

## Open Questions
- `TODO(open-question: ID scheme — content-addressed hash vs sequential slug.)`
- `TODO(open-question: claim_type taxonomy sufficiency — owned with ADR-0005.)`
- `TODO(open-question: do we persist rejected Claim candidates as nodes, and under what boundary?)`
- See [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md).

## Implications for runbooks
- **RB (schema):** create `node`/`edge` tables with these fields; `boundary`/`visibility` NOT NULL default-deny.
- **RB (frontmatter validator):** per-kind YAML schema check; Evidence has no prose field; filename==`id`.
- **RB (invariant gate):** the three-layer enforcement with negative tests (bare Claim, note-as-evidence both fail).
