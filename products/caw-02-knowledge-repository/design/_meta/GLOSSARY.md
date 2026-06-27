# GLOSSARY — CAW-02 Knowledge Repository

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:**
  - [PRODUCT-BRIEF.md](./PRODUCT-BRIEF.md)
  - [DOC-CONVENTIONS.md](./DOC-CONVENTIONS.md)
  - [ADR-0003 data model](../01-decisions/ADR-0003-knowledge-data-model.md)
  - [ADR-0004 provenance & trust](../01-decisions/ADR-0004-provenance-and-trust.md)
  - [provenance & trust models (research)](../02-research/provenance-and-trust-models.md)
- **Source of truth:** ./PRODUCT-BRIEF.md

## Purpose

This is the **ubiquitous language** for CAW-02: one authoritative definition per term, used identically
across design docs, runbooks, code, schemas, and the skill-wrap surface. It DEFINES vocabulary; it does NOT
re-decide architecture (see the linked ADRs) or restate the brief's constraints. When a term appears anywhere
in this product's `design/`, it MUST mean exactly what it means here. Unknowns are marked
`TODO(open-question: ...)`; nothing here invents facts, dates, or numbers.

Conventions used below: **entity** = a typed knowledge node persisted as one markdown file; **edge** = a typed
relation between nodes; **op** = a skill-wrap operation. Capitalized terms (Source, Claim, …) are entity types.

---

## 1. Entity types (the knowledge nodes)

Each entity is exactly one markdown file: YAML frontmatter (the machine contract) + markdown body (the human
note). Stored under `knowledge/<type>/`. See [ADR-0003](../01-decisions/ADR-0003-knowledge-data-model.md) for
the schema and [ADR-0002] storage layout. All writes are append-only + supersedes — never in-place update.

| Term | Definition | Key rule |
|------|-----------|----------|
| **Source** | A concrete origin of information: a paper, URL, dataset, internal doc, imported CAW-01 projection, or CAW-05 signal record. Always references a real artifact by path/URI. | Sources are cataloged, not summarized into existence; a generated summary is never a Source. |
| **Claim** | A single, atomic, falsifiable assertion the repository holds ("X improves Y under Z"). The central unit of knowledge. | **Invariant:** every Claim MUST point to ≥1 Evidence (the evidence gate). AI-authored Claims capped at trust T2. |
| **Evidence** | A structural link binding a Claim to a concrete artifact (a Source, Trace, SimulationRun, Experiment, or located span within one). | Has **no prose field**; `artifact_ref` MUST resolve to a real artifact. A Note/summary can NEVER be Evidence. |
| **Note** | A synthesized, human-or-AI-authored writeup that interprets/combines Claims (the "what we know about X"). | A Note must **cite** the Claims it rests on; a Note is never Evidence and never substitutes for a Claim. |
| **Concept** | A reusable topic/tag/term that Claims, Notes, and Sources attach to for organization and retrieval (e.g. "sparse attention"). | Concepts are first-class retrieval filters, not free-text keywords. |
| **Interest** | A standing area Jimmy/the team tracks; groups Concepts/OpenQuestions to steer intake and radar linkage. | Drives prioritization, not provenance. |
| **OpenQuestion** | An explicitly recorded unknown ("does X hold for Y?") that can be linked to Claims/Evidence as they accrue. | Unknowns in design docs use `TODO(open-question: ...)`; OpenQuestion is the entity form in the store. |
| **Decision** | A recorded choice with rationale, linked to the Evidence/Claims/Assumptions it rests on. | Strategic decisions are Jimmy-reviewed (guardrail); kept reconstructable. |
| **Assumption** | A stated premise taken as true without (yet) sufficient Evidence; linkable to Claims/Decisions that depend on it. | Distinct from Claim: an Assumption is explicitly *unproven*; promoting it requires attaching Evidence. |
| **Trace** | An **imported-artifact reference** to a CAW-01 execution/agent trace, cataloged so it can serve as Evidence. | Referenced by path/URI; CAW-02 catalogs, never executes it. |
| **SimulationRun** | An imported-artifact reference to a CAW-01 simulation run/projection, usable as Evidence. | Imported under quarantine + boundary check; large artifact stored by path. |
| **Experiment** | An imported-artifact reference to an experiment record/result set, usable as Evidence. | Same import discipline as Trace/SimulationRun. |
| **RelatedWork** | An intake signal (often from CAW-05): an external work mapped into the store, classifiable as supporting/threatening a Claim. | Becomes Source/Claim/OpenQuestion links — not a loose summary. |
| **RadarSignal** | An intake signal from CAW-05 radar: a detected trend/event mapped into the store and classified threat/support. | Imported via the envelope; never trusted blindly (quarantine-on-import). |

---

## 2. Relations & structure

| Term | Definition |
|------|-----------|
| **edge (typed relation)** | A directed, typed link between two entities, stored in ONE generic typed edge table/representation (graph-upgrade-ready). Examples of edge types: `cites`, `supports`, `contradicts`, `derived_from`, `attaches_evidence`, `about_concept`, `supersedes`, `answers`. The single-table design lets a future Postgres/Apache-AGE port swap the query engine without rewriting data. See [ADR-0003](../01-decisions/ADR-0003-knowledge-data-model.md). |
| **node** | Any entity instance (§1) as a vertex in the knowledge graph. |
| **provenance chain** | The reconstructable path `Source → Claim → Evidence → Note` (plus edges) that records how a synthesis was reached. Retrieval **hydrates** this chain rather than returning opaque text. |

---

## 3. Provenance, trust & boundaries

See [ADR-0004](../01-decisions/ADR-0004-provenance-and-trust.md) and the
[research notes](../02-research/provenance-and-trust-models.md).

| Term | Definition |
|------|-----------|
| **evidence gate** | The structural enforcement in the skill-wrap that a Claim cannot exist without resolvable Evidence: `attach_evidence` has **no prose field**, and `artifact_ref` MUST resolve to a real artifact. This makes "generated summary ≠ evidence" mechanical, not advisory. The Claim→Evidence invariant is checked in three lockstep layers: frontmatter schema, core validator, and reindex re-check. |
| **provenance (two-layer)** | A PROV-shaped model: a layer of entities/artifacts and a layer of activities/agents that produced them, connected by a typed edge set. Records *who/what/from-what* for every node. |
| **trust ladder (T0–T3, contested)** | A small derived (not hand-set) trust grade per Claim: **T0** unverified/raw → **T1** single-source/weak → **T2** corroborated → **T3** strongly corroborated/authoritative; plus **contested** when supporting and contradicting Evidence coexist. Trust is *recomputed*, never freely edited. **AI-authored content is capped at T2.** |
| **contested** | Trust state for a Claim that has both supporting and contradicting Evidence; flagged rather than silently resolved. |
| **boundary** | One of two orthogonal sensitivity axes: `public` / `internal` / `confidential`. Governs export safety (no confidential data in public outputs). |
| **visibility (team / private)** | The second orthogonal axis: `team` (shared with the team) vs `private` (Jimmy-only). Independent of `boundary` — an item has both a boundary and a visibility. |
| **monotone propagation** | The rule that computed boundary/visibility on a synthesis is at least as restrictive as its inputs: synthesis **never downgrades** sensitivity (e.g. a Note citing a confidential Claim cannot become public). |
| **quarantine-on-import** | Imported artifacts/signals land in a holding state with a confidentiality check before mapping to nodes; nothing imported is trusted or made visible by default. |
| **filter-on-export (fail-loud / fail-closed)** | Export applies a confidentiality filter against a **fail-closed allow-list**: anything not explicitly permitted is withheld, and a disallowed item fails loudly rather than leaking. |

---

## 4. The surface (skill-wrap & core)

See [ADR-0001 surface] and [ADR-0005 ingestion].

| Term | Definition |
|------|-----------|
| **product core** | The single transactional component that owns ALL logic: validation, the evidence gate, trust recompute, boundary/visibility propagation, and the append-only audit. API, MCP, and CLI are **thin adapters** codegen'd from one op manifest and add no logic. |
| **skill-wrap** | The safe, vetted interface through which humans and agents perform knowledge transactions (`add_source`, `extract_claim`, `attach_evidence`, `synthesize_note`, `classify_signal`, …) without corrupting provenance. Each op enforces the invariants; agent writes are **confirmation-by-default**. |
| **op (operation)** | A single vetted skill-wrap action defined once in the op manifest; the API/MCP/CLI adapters are generated from it so all surfaces behave identically. |
| **transaction** | One provenance-preserving knowledge change (e.g. `add source → extract claim → attach evidence → synthesize note`). The unit of value; either fully recorded (entity files + event + edges) or not at all. |
| **confirmation-by-default** | Agent-initiated writes require explicit confirmation/review before acceptance; v0 has **no silent auto-accept**. Rejected candidates may be retained for audit. |
| **ingestion pipeline** | The 6-stage flow `add-source → parse → extract Claim-candidates → attach Evidence → synthesize Note (cited) → classify/link signal`; each stage attaches provenance and never violates Claim→Evidence. |

---

## 5. Storage, audit & retrieval

See [ADR-0002 storage], [ADR-0006 retrieval], [ADR-0007 import/export].

| Term | Definition |
|------|-----------|
| **single source of truth** | The markdown files in git. Everything queryable is derived from them. |
| **frontmatter** | The YAML block at the top of each entity file: the machine contract (type, ids, boundary, visibility, edges, trust inputs). The markdown body below it is the human note. |
| **reindex** | The deterministic, idempotent process that rebuilds the SQLite index (and FTS/vector migrations) from the markdown files. Because it is rebuildable, SQLite is **derived and disposable**. The reindex also re-checks the Claim→Evidence invariant. |
| **derived index** | The SQLite database (relational + FTS, optional vector sidecar) produced by reindex; never authoritative, safe to drop and rebuild. |
| **_events log** | The append-only `knowledge/_events/<ts>-<op>.jsonl` stream that mirrors every skill-wrap write. Together with signed git commits/blame it forms the audit trail. |
| **append-only** | Writes only add; no destructive update/delete of knowledge. Corrections are made via supersedes. |
| **supersedes** | The mechanism for changing knowledge: a new version is written and a `supersedes` edge points to the prior entity, which is retained. Preserves history and reconstructability. |
| **audit trail** | The combination of the `_events` log + signed git history (commits/blame) that lets any state be reconstructed and attributed. |
| **FTS5** | SQLite's full-text search (BM25 ranking), the v0 text-retrieval engine, co-located with the relational index. After a Postgres port the equivalent is `tsvector`/GIN. |
| **structured filters** | First-class query constraints (boundary, visibility, type, trust, concept) applied **before** ranking, not as a post-filter. |
| **citation-constrained RAG** | Retrieval-augmented generation that returns **Claim + Evidence** (and the hydrated provenance chain), never opaque text blobs; answers stay traceable to artifacts. |
| **vector sidecar** | A RESERVED, droppable embeddings schema. **No embeddings in v0**; sqlite-vec/pgvector are added only when measured recall/precision triggers fire. `TODO(open-question: define the trigger thresholds)`. |

---

## 6. Import / export

See [ADR-0007 import/export]. All of these are file/API boundaries between **independent products** — there is
**no shared store, registry, or substrate**.

| Term | Definition |
|------|-----------|
| **import/export envelope** | A file-artifact-first, **versioned** container used to move knowledge across a product boundary. Bundles are **signed** and carry a provenance manifest. Crossing in either direction triggers re-redaction. |
| **redaction (re-redaction)** | Mandatory removal/masking of disallowed (e.g. confidential) content at **every** boundary crossing — on import and on export — even if redaction happened earlier. |
| **provenance manifest** | The metadata accompanying an envelope (both directions) describing origin, boundaries, and the provenance of each item, so the receiver can verify and re-apply its own rules. |
| **CAW-01** | A separate product (simulation/runs). CAW-02 **imports** its projections/traces as Evidence (Trace/SimulationRun/Experiment) under quarantine + boundary check. |
| **CAW-05** | A separate product (radar). CAW-02 **imports** its radar/related-work signals as Source/Claim/OpenQuestion/RelatedWork/RadarSignal. |
| **CAW-03** | A separate product (paper/patent drafting). CAW-02 **exports** cited Claim+Evidence bundles to it via the fail-closed allow-list. |

---

## 7. Cross-cutting terms

| Term | Definition |
|------|-----------|
| **invariant** | A property that must always hold; the central one is **Claim→Evidence (≥1)**, enforced in three lockstep layers (frontmatter schema, core validator, reindex re-check). |
| **artifact** | A concrete, addressable thing (file, URL, dataset, run output) referenced by path/URI; Evidence must resolve to one. |
| **artifact_ref** | The resolvable pointer (path/URI/locator) on an Evidence record that MUST resolve to a real artifact. |
| **agent** | An AI actor that uses the skill-wrap; subject to confirmation-by-default and the T2 trust cap on authored content. |
| **curator** | The human (Jimmy) who reviews agent proposals and owns strategic Decisions. |

---

## Open Questions

- Vector-retrieval trigger thresholds. `TODO(open-question: recall/precision triggers that justify embeddings)`
- Exact trust-ladder recompute formula (corroboration counts → T0–T3). `TODO(open-question)`
- Final edge-type vocabulary closure. `TODO(open-question: enumerate the canonical edge types)`
- See [08-research-plan/open-questions.md](../08-research-plan/open-questions.md).

## Implications for runbooks

- Runbooks MUST use these exact term/entity names (per DOC-CONVENTIONS §7).
- Schema, validator, and reindex runbooks all reference the **same** Claim→Evidence invariant defined here.
- Skill-wrap op names in code must match the op vocabulary in §4.
