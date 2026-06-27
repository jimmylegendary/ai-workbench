# Knowledge Core — Entity & Edge Model

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [./overview.md](./overview.md)
  - [./claim-evidence-and-evidence-gate.md](./claim-evidence-and-evidence-gate.md)
  - [../01-decisions/ADR-0003-knowledge-data-model.md](../01-decisions/ADR-0003-knowledge-data-model.md)
  - [../01-decisions/ADR-0004-provenance-and-trust.md](../01-decisions/ADR-0004-provenance-and-trust.md)
  - [../01-decisions/ADR-0002-storage.md](../01-decisions/ADR-0002-storage.md)
  - [../02-research/provenance-and-trust-models.md](../02-research/provenance-and-trust-models.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
This doc specifies, in depth, the **typed entity set (nodes)** and the **typed edge vocabulary (relations)** the
knowledge core operates on, and how that shape is **graph-upgrade-ready**. It elaborates [ADR-0003](../01-decisions/ADR-0003-knowledge-data-model.md)
(which fixes the vocabulary) and [ADR-0004](../01-decisions/ADR-0004-provenance-and-trust.md) (which fixes the integrity
meaning of the provenance edges). It does NOT restate the Claim→Evidence enforcement detail — that is the sibling
[claim-evidence-and-evidence-gate.md](./claim-evidence-and-evidence-gate.md) — and it does NOT decide physical storage
(ADR-0002).

## 1. Modeling stance
- Everything is a **typed node**; every relationship is a **generic typed edge** `edge(src_id, dst_id, rel)`. This single
  decision (ADR-0002/0003) is what makes a future property-graph (Apache AGE / Postgres) a *query-engine swap, not a data
  rewrite*.
- Nodes are **append-only**; corrections are new nodes linked by `supersedes`.
- `trust`, `boundary`, `visibility` are **derived/propagated by the core**, never caller-set (ADR-0004).
- The md frontmatter (source of truth) and the derived index `node`/`edge` rows are kept in **lockstep** by reindex.

## 2. Common node fields
Every node — regardless of `kind` — carries this contract (mirrored in YAML frontmatter and the index `node` row):
```yaml
id:            clm_2026_<hash>        # stable; also the .md filename id
kind:          claim                  # see §3 enum
boundary:      internal               # public | internal | confidential   (default-deny: internal)
visibility:    private                # team | private                      (default: private)
status:        needs_evidence         # proposed | accepted | needs_evidence | rejected | superseded
generated:     false                  # true for Note + any LLM-proposed candidate
trust:         T0                      # T0..T3 | contested   — DERIVED, never caller-set
artifact_uri:  null                   # path/URI for evidence/trace/sim/experiment; null otherwise
created_by:    agent id               # human or skill name (who wrote this version)
attributed_to: agent id               # origin author (may differ on import)
created_via:   evt_<id>               # the provenance_event/activity that wrote it
content_hash:  <sha>                  # detects file <-> index drift
created_at:    2026-..T..Z
```

## 3. Entities (nodes)
### 3.1 Assertion-layer entities
| Entity | `kind` | Role | Asserts? | Key links |
|---|---|---|---|---|
| **Source** | `source` | Raw input (paper/article/note) or an imported-artifact reference. | No | target of `extracted_from` |
| **Claim** | `claim` | A single asserted statement. **Invalid without evidence.** | Yes | `evidence_for`(in), `about_concept`, `addresses`, `supersedes` |
| **Evidence** | `evidence` | Pointer from a Claim to a concrete artifact/source span; carries `artifact_uri` + locator + stance. **Never free text.** | No (points) | `evidence_for`/`challenges` → Claim, `extracted_from` → Source/artifact |
| **Note** | `note` | Generated synthesis over accepted Claims; `generated=true`. **Never evidence.** | No | `cites` → Claim/Evidence, `derived_from` |
| **Concept** | `concept` | Topical anchor for retrieval ("what do we know about X"). | No | `about_concept`(in) |
| **Interest** | `interest` | Curator/team standing interest used to prioritize intake. | No | `relates_to` → Concept |
| **OpenQuestion** | `open_question` | Unresolved tension; manual or auto-raised by a threat signal. | No | `addresses`(in), `relates_to` |
| **Decision** | `decision` | A recorded decision kept linked to its evidence. | No | `addresses`(in) |
| **Assumption** | `assumption` | A stated assumption underpinning claims/decisions. | No | `relates_to`, `addresses` |

### 3.2 Imported-artifact reference entities (cataloged, never executed here — brief §5/§7)
| Entity | `kind` | Role |
|---|---|---|
| **Trace** | `trace` | Reference to a CAW-01 execution-trace artifact (by `artifact_uri`). |
| **SimulationRun** | `simulation_run` | Reference to a CAW-01 simulation run / projection artifact. |
| **Experiment** | `experiment` | Reference to an experiment artifact. |

These are valid `extracted_from` targets (a Claim's Evidence may point at a `SimulationRun`) but are **never Claims** and
are **never inlined** — only referenced by URI/path (brief §6/§7; wire detail in [ADR-0007](../01-decisions/ADR-0007-import-export-contracts.md)).

### 3.3 Intake-signal entities (brief §5/§7; ADR-0005 Pipeline B)
| Entity | `kind` | Role |
|---|---|---|
| **RelatedWork** | `related_work` | External work classified as bearing on our claims; a typed *stanced link target*, not a loose summary. |
| **RadarSignal** | `radar_signal` | A CAW-05 radar intake item (paper/preprint/patent/blog/release) before/after classification. |

## 4. Edges (typed relations)
One generic `edge(src_id, dst_id, rel)` table carries all relations. The vocabulary is **closed** (fixed here); adding a
relation is a deliberate model change, not an ad-hoc write.

| `rel` | From → To | Meaning | Integrity role |
|---|---|---|---|
| `evidence_for` | Evidence → Claim | This evidence backs the claim. | **Direction of the invariant** (≥1 required to promote a Claim). |
| `challenges` | Evidence → Claim | This evidence contradicts the claim. | Powers threat/support + `contested` trust (ADR-0005 B). |
| `extracted_from` | Evidence → Source\|Trace\|SimulationRun\|Experiment | The concrete artifact the evidence points at. | Evidence MUST resolve here, never to prose/`note`. |
| `cites` | Note → Claim\|Evidence | Synthesis cites what it rests on. | A Note's lineage; never an evidence edge. |
| `derived_from` | Note\|Claim → Source\|Claim | PROV `wasDerivedFrom` lineage. | Reconstructability; participates in boundary propagation. |
| `about_concept` | Claim\|Source\|Note → Concept | Topical indexing for retrieval. | — |
| `addresses` | Claim\|Evidence → OpenQuestion\|Decision\|Assumption | Links findings to decisions/questions. | Keeps decisions reconstructable (use case 6). |
| `relates_to` | any → any | Weak association (Interest↔Concept, etc.). | Non-load-bearing; not used by trust/boundary. |
| `supports` | RelatedWork\|RadarSignal → Claim | External signal corroborates our claim. | Intake-side stance (distinct from Evidence). |
| `refutes` | RelatedWork\|RadarSignal → Claim | External signal threatens our claim. | Auto-raises an `OpenQuestion`. |
| `supersedes` | any vN → any vN-1 | Append-only correction chain. | Latest-version resolution. |
| `attributed_to` | any → Agent | Who/what produced it (human vs AI skill). | Trust cap (AI-only ≤ T2). |

> Naming: ADR-0003 uses snake_case relation names (`evidence_for`, `extracted_from`, `derived_from`, `about_concept`);
> [ADR-0004](../01-decisions/ADR-0004-provenance-and-trust.md) and the research doc reference the same edges in PROV
> camelCase (`supports`/`evidenceOf`/`derivedFrom`/`aboutConcept`). They are the **same edges**; the core uses the
> snake_case identifiers of ADR-0003 as canonical. TODO(open-question: confirm one canonical spelling in `GLOSSARY.md`).

### 4.1 Endpoint legality (which (kind, rel, kind) triples are allowed)
The core rejects any edge whose endpoints violate this matrix (excerpt; full set generated into the validator):
```
evidence_for   : evidence       -> claim
challenges     : evidence       -> claim
extracted_from : evidence       -> {source, trace, simulation_run, experiment}
cites          : note           -> {claim, evidence}
derived_from   : {note, claim}  -> {source, claim}
about_concept  : {claim, source, note} -> concept
addresses      : {claim, evidence}     -> {open_question, decision, assumption}
supports       : {related_work, radar_signal} -> claim
refutes        : {related_work, radar_signal} -> claim
supersedes     : X -> X        (same kind, older version)
attributed_to  : *  -> agent
```
**Hard structural rule (the spine of the product):** a node with `kind=note` may **never** be the `src` of
`evidence_for` or `extracted_from`. This is the structural form of "generated synthesis is not evidence" and is rejected
by the core link validator — full treatment in [claim-evidence-and-evidence-gate.md](./claim-evidence-and-evidence-gate.md).

## 5. Worked example (the unit of value)
The core ingestion transaction `add source → extract claim → attach evidence → synthesize note (cited)` produces:
```
src_001 (source)
   ^ extracted_from
ev_001 (evidence, artifact_uri=src_001#p3, stance=supports)
   | evidence_for
clm_001 (claim, status=accepted, trust=T1)  --about_concept--> cpt_attention (concept)
   ^ cites
note_001 (note, generated=true)  --cites--> ev_001   --derived_from--> src_001
```
Trust on `clm_001` is derived (one resolving source → T1). `note_001` carries no evidence edge — it can only `cites` and
`derived_from`. Boundary of `note_001` = max(boundary of all reachable ancestors) per ADR-0004 propagation.

## 6. Graph-upgrade readiness
The model is built so v2 (property graph) is a query/engine swap, not a migration:

| Concern | v0 (SQLite, derived index) | v2 (Postgres / Apache AGE) | Migration cost |
|---|---|---|---|
| Nodes | `node` rows ← md frontmatter | graph vertices (same fields) | reindex from md (SOT unchanged) |
| Edges | `edge(src,dst,rel)` rows | typed graph edges (same triples) | reindex from md (SOT unchanged) |
| Reconstruct traversal | recursive CTE over `edge` | native graph traversal / openCypher | rewrite the query, not the data |
| Trust/boundary recompute | core functions over edge rows | core functions over graph edges | same core, new edge accessor |

Because **markdown files in git are the single source of truth** (ADR-0002) and the index is disposable, the upgrade is:
stand up the new engine, point reindex at `knowledge/**`, drop the old index. The closed edge vocabulary and the
endpoint-legality matrix are exactly the schema a property graph wants.

## Open Questions
- TODO(open-question: ID scheme — content-addressed hash vs sequential slug; owned with ADR-0002.)
- TODO(open-question: `claim_type` taxonomy — {empirical/methodological/definitional/comparative/normative} sufficient? owned with ADR-0005.)
- TODO(open-question: canonical relation spelling — snake_case (ADR-0003) vs PROV camelCase (ADR-0004); resolve in GLOSSARY.)
- TODO(open-question: do we persist rejected Claim candidates as nodes for audit, and under what boundary? ADR-0005.)
- See [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md).

## Implications for runbooks
- **RB (schema):** create `node` + `edge` (+ `provenance_event`) with the fields/relations above; `boundary`/`visibility`
  NOT NULL with default-deny defaults; portable SQLite∩Postgres subset (ADR-0002).
- **RB (link validator):** generate the endpoint-legality matrix (§4.1) into the core validator; reject illegal triples.
- **RB (model docs):** generate `GLOSSARY.md` from §3/§4 so terms are used exactly (DOC-CONVENTIONS §7).
- **RB (graph upgrade, deferred):** a reindex-into-AGE path that consumes the unchanged md SOT.
