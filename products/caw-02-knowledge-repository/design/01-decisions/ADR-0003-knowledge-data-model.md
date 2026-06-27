# ADR-0003: Knowledge data model and the Claim→Evidence invariant

- **Status:** proposed
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:**
  - [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF.md) (source of truth)
  - [ADR-0001-product-surface-and-skill-interface.md](ADR-0001-product-surface-and-skill-interface.md)
  - [ADR-0002-storage.md](ADR-0002-storage.md) (planned)
  - [ADR-0004-provenance-and-trust.md](ADR-0004-provenance-and-trust.md) (planned)
  - [ADR-0005-ingestion-pipeline.md](ADR-0005-ingestion-pipeline.md)
  - [ADR-0006-import-export-contracts.md](ADR-0006-import-export-contracts.md) (planned)
  - [../02-research/provenance-and-trust-models.md](../02-research/provenance-and-trust-models.md)
  - [../02-research/knowledge-store-storage-options.md](../02-research/knowledge-store-storage-options.md)
  - [../02-research/ingestion-and-extraction.md](../02-research/ingestion-and-extraction.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
Fix the **knowledge data model**: the first-class entities, the typed relationships between them, the per-entity
fields, and — the heart of the product — the **`Claim → Evidence` invariant** and where it is enforced. It does
NOT decide the physical storage format (ADR-0002 — md-first source of truth + rebuildable index), trust-level
recomputation rules (ADR-0004), ingestion stage mechanics (ADR-0005), or import/export wire schemas (ADR-0006).
This ADR is the shared vocabulary those ADRs elaborate.

## Context
- Brief §5 names the entities that must be **first-class and separate** because conflating them is the failure the
  product exists to prevent: a generated summary mistaken for evidence.
- The invariant (§5): **a `Claim` must point to `Evidence`; `Evidence` references a concrete artifact/source,
  never free text.** Generated synthesis (`Note`) is never evidence (§10).
- The model must support **reconstructability** (§5: replay how a synthesis was reached) and stay **upgradable
  toward a graph / continual-learning model without a rewrite** (§5, §6).
- Some entities are **imported references** to artifacts owned by other products (CAW-01 traces/runs): cataloged
  here, never executed here (§5, §7).
- Storage (ADR-0002) already commits to modeling every entity as a `node` and every relationship as a generic
  typed `edge` so a future graph is a query-engine change, not a data migration. This ADR defines the *kinds* and
  *relations* that populate those tables (and the equivalent md frontmatter).

## Entities (nodes)
All entities are **append-only**; corrections are new versions linked by `supersedes` (ADR-0001). Every entity
carries the common provenance/boundary fields in the table below.

### Assertion-layer entities
| Entity | `kind` | Role | Key typed links (see relations) |
|---|---|---|---|
| **Source** | `source` | A raw input: paper/article/note, or an imported-artifact reference. Never asserts anything itself. | target of `extracted_from`, `evidence_of` |
| **Claim** | `claim` | A single asserted statement. **Invalid without evidence.** | `evidence_for` (in), `about_concept`, `addresses`, `supersedes` |
| **Evidence** | `evidence` | A pointer from a Claim to a **concrete artifact/source span**. Carries `artifact_uri` + locator + stance. Never free text. | `evidence_for` → Claim, `extracted_from` → Source/artifact |
| **Note** | `note` | Generated synthesis over accepted Claims. `generated=true`. **Never evidence.** | `cites` → Claim/Evidence |
| **Concept** | `concept` | Topical anchor for retrieval ("what do we know about X"). | `about_concept` (in) |
| **Interest** | `interest` | A curator/team standing interest used to prioritize intake. | `relates_to` → Concept |
| **OpenQuestion** | `open_question` | An unresolved tension; raised manually or auto-raised by a threat signal. | `addresses` (in), `relates_to` |
| **Decision** | `decision` | A recorded decision kept linked to its evidence. | `addresses` (in) |
| **Assumption** | `assumption` | A stated assumption underpinning claims/decisions. | `relates_to`, `addresses` |

### Imported-artifact reference entities (cataloged, not executed here — brief §5/§7)
| Entity | `kind` | Role |
|---|---|---|
| **Trace** | `trace` | Reference to a CAW-01 execution trace artifact (by `artifact_uri`). |
| **SimulationRun** | `simulation_run` | Reference to a CAW-01 simulation run / projection artifact. |
| **Experiment** | `experiment` | Reference to an experiment artifact. |

These are valid **`evidence_of` / `extracted_from` targets** (a Claim's Evidence may point at a SimulationRun),
but they are **never** Claims and are never inlined — only referenced by URI/path (brief §6/§7, ADR-0006).

### Intake-signal entities (brief §5/§7; ADR-0005 Pipeline B)
| Entity | `kind` | Role |
|---|---|---|
| **RelatedWork** | `related_work` | External work classified as bearing on our claims; a **typed stanced link target**, not a loose summary. |
| **RadarSignal** | `radar_signal` | A CAW-05 radar intake item (paper/preprint/patent/blog/release) before/after classification. |

## Relations (edges)
One generic typed `edge(src_id, dst_id, rel)` table (ADR-0002) carries all of these. The relation vocabulary is
fixed here; ADR-0004 owns the *integrity meaning* of the provenance edges.

| `rel` | From → To | Meaning |
|---|---|---|
| `evidence_for` | Evidence → Claim | This evidence backs the claim. **Direction of the invariant.** |
| `challenges` | Evidence → Claim | This evidence contradicts the claim (powers threat/support, ADR-0005 B). |
| `extracted_from` | Evidence → Source\|Trace\|SimulationRun\|Experiment | The concrete artifact the evidence points at. |
| `cites` | Note → Claim\|Evidence | Synthesis cites what it rests on. |
| `derived_from` | Note\|Claim → Source\|Claim | Lineage (PROV `wasDerivedFrom`); reconstructability. |
| `about_concept` | Claim\|Source\|Note → Concept | Topical indexing for retrieval. |
| `addresses` | Claim\|Evidence → OpenQuestion\|Decision\|Assumption | Links findings to decisions. |
| `relates_to` | any → any | Weak association (Interest↔Concept, etc.). |
| `supports` | RelatedWork\|RadarSignal → Claim | External signal corroborates our claim. |
| `refutes` | RelatedWork\|RadarSignal → Claim | External signal threatens our claim (auto-raises OpenQuestion). |
| `supersedes` | any vN → any vN-1 | Append-only correction chain. |
| `attributed_to` | any → Agent | Who/what produced it (human vs AI skill). |

**No relation may make a `Note` the source of an `evidence_for`/`extracted_from` edge** — this is the structural
form of "generated synthesis is not evidence" and is rejected by the core link validator (ADR-0001 guardrail, ADR-0004 §2.3).

## Common fields (every node)
Mirrored in md frontmatter (source of truth) **and** the index `node` row (ADR-0002), kept in lockstep:
```
id            : stable id (e.g. clm_2026_<hash>) — also the filename id
kind          : source | claim | evidence | note | concept | interest |
                open_question | decision | assumption |
                trace | simulation_run | experiment | related_work | radar_signal
boundary      : public | internal | confidential          # ADR-0004 §3 (default-deny: internal)
visibility    : team | private                             # ADR-0004 §3 (default-private)
status        : proposed | accepted | needs_evidence | rejected | superseded   # ADR-0005 A6/B5
generated     : bool                                       # true for Note and any LLM-proposed candidate
trust         : T0..T3 | contested                         # DERIVED, never caller-set (ADR-0004 §4)
artifact_uri  : path/URI for evidence/trace/sim/experiment; NULL otherwise
created_by    : agent id (human or skill name)
attributed_to : origin author (may differ on import)
created_via   : provenance_event id (the activity that wrote it)
content_hash  : detects file↔index drift (ADR-0002)
created_at    : timestamp
```

## The Claim→Evidence invariant — definition and enforcement
**Definition.** A node of `kind=claim` is *valid* (may hold `status=accepted` and `trust > T0`) only if it has
**≥1 `evidence_for` edge** from a node of `kind=evidence`, **and** every such `evidence` node has an
`extracted_from` edge to a concrete `source`/`trace`/`simulation_run`/`experiment` (or a resolvable `file_uri`),
**never** to free text and **never** to a `note`.

**Why it is not a plain DB constraint.** "≥1 of a typed edge" is not expressible as a portable FK/CHECK across
SQLite *and* Postgres (ADR-0002 portability requirement). So the invariant is enforced in **three lockstep
layers**, identical on every surface and engine:

| Layer | Enforcement | Failure |
|---|---|---|
| **1. Schema (skill-wrap input)** | `kr.attach_evidence` has **no prose field**; `artifact_ref` must be a typed `{kind, ref}` resolving to a real artifact. It is structurally impossible to submit prose-as-evidence. | `ERR_EVIDENCE_NOT_ARTIFACT` |
| **2. Core transaction validator** | Before commit: (a) a Claim promoted past `needs_evidence` has ≥1 `evidence_for`; (b) each Evidence's `extracted_from` target resolves; (c) no `note` appears as the `from` of `evidence_for`/`extracted_from`. A failed check **aborts the whole transaction** — no orphan node/file. | `ERR_TRUST_WITHOUT_EVIDENCE`, `ERR_NOTE_AS_EVIDENCE` |
| **3. Reindex re-check** | `reindex` (ADR-0002) re-runs the invariant over `knowledge/**`; any violation is surfaced as a hard error, never silently indexed. | reindex fails loud |

A Claim with no resolvable evidence is a **first-class state** (`status=needs_evidence`, `trust=T0`), not an
error to hide — it stays visible and un-promotable until evidence is attached (ADR-0005 A3 gate). Imported,
unchecked signals (ADR-0006) also sit at `T0` until the gate passes locally.

## Reconstructability
"Reconstruct how synthesis N was reached" is a fixed traversal, available either as a recursive CTE over `edge`
or as git-blame across the linked md files (ADR-0002):
```
note --cites--> claim --evidence_for(in)--> evidence --extracted_from--> source/trace/simulation_run/experiment
```
Plus the per-transaction `provenance_event` / append-only audit chain (ADR-0004 §2.4, ADR-0001) records *who/what*
wrote each hop and *when*. Nothing downstream can exist without pointing back one layer.

## Decision (summary)
1. Adopt the **entity set** above (assertion + imported-artifact refs + intake signals), each a typed `node`.
2. Adopt the **typed relation vocabulary** above, carried by one generic `edge` table (graph-upgrade-ready, ADR-0002).
3. Enforce the **`Claim→Evidence` invariant in three lockstep layers** (schema, core validator, reindex re-check),
   not as a single DB constraint, so it is identical across surfaces and across SQLite/Postgres.
4. Keep **`Note` structurally barred** from being evidence; mark all generated content `generated=true`.
5. Keep entities **append-only** with `supersedes`; trust and boundary are **derived/propagated**, never caller-set.

## Consequences
**Easy:** typed retrieval with provenance; a future property-graph is a query change; agents cannot create a
no-evidence Claim or a Note-as-evidence even by mistake; imported artifacts cataloged without leaking payloads.

**Hard / follow-on:** the invariant logic must be centralized in the core (ADR-0001) and duplicated nowhere; the
`claim_type` taxonomy and dedup/merge semantics are deferred to ADR-0005; "independent source" for corroboration
(T2) may need a human/heuristic call (ADR-0004). Readers must resolve `supersedes` chains to find the latest version.

## Open questions / revisit triggers
- `TODO(open-question: ID scheme — content-addressed hash vs sequential slug; owned with ADR-0002.)`
- `TODO(open-question: claim_type taxonomy — is {empirical/methodological/definitional/comparative/normative} sufficient? owned with ADR-0005.)`
- `TODO(open-question: do we persist rejected Claim candidates as nodes for audit, and under what boundary? ADR-0005.)`
- `TODO(open-question: is "independent source" for T2 machine-decidable, or human-judged? ADR-0004.)`
- **Revisit** the edge vocabulary when the graph-upgrade (ADR-0002 v2 / Apache AGE) or continual-learning lands.
- See [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md).

## Implications for runbooks
- **RB (schema):** create the `node` + `edge` (+ `provenance_event`, `event`) tables with the fields/relations
  above; `boundary`/`visibility` NOT NULL with default-deny defaults; portable SQLite∩Postgres subset (ADR-0002).
- **RB (invariant gate):** implement the three-layer `Claim→Evidence` enforcement; a negative test must show that
  promoting a Claim with no resolvable Evidence, and attaching a Note as Evidence, both fail.
- **RB (reindex):** rebuild index from `knowledge/**` and **re-run the invariant**; reindex fails loud on any violation.
- **RB (model docs):** generate a `GLOSSARY.md` from this entity/relation table so terms are used exactly (DOC-CONVENTIONS §7).
