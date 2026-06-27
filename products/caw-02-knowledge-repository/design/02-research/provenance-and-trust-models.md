# Provenance & Trust Models

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** ../_meta/PRODUCT-BRIEF.md, ../_meta/DOC-CONVENTIONS.md, ../01-decisions/ (future ADR: provenance & trust), ../08-research-plan/open-questions.md
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
This doc decides **how CAW-02 models provenance and trust**, and **how the public/internal/confidential and
team/private boundaries are enforced at import/export**. It recommends a concrete provenance graph shape, a trust-level
scheme, and a boundary-enforcement design grounded in established models (W3C PROV, micropublications/nanopublications).
It does **NOT** specify storage format (md vs SQLite — separate ADR), the ingestion pipeline mechanics (separate ADR),
retrieval/embeddings, or the wire formats of the CAW-01/05/03 contracts (import/export ADR). It fixes the *integrity
invariant* those docs must honor.

The non-negotiable invariant (from the brief §5, §10): **a `Claim` points to `Evidence`; `Evidence` references a
concrete artifact/source, never free text; generated synthesis is NOT evidence.**

## 1. Background: which external models we borrow from
We do not invent a provenance theory; we map the brief's entities onto two proven models and keep only what v0 needs.

| Model | What it gives us | What we take | What we drop for v0 |
|---|---|---|---|
| **W3C PROV** (PROV-DM/PROV-O, W3C Rec 2013) | Domain-agnostic triad **Entity / Activity / Agent** + relations `wasDerivedFrom`, `wasGeneratedBy`, `used`, `wasAttributedTo`, `wasAssociatedWith` | The derivation/attribution backbone for *how a Note was reached* | Full OWL/RDF serialization, qualified relations, PROV-XML |
| **Micropublications** (Clark et al., biomedical) | Explicit separation of **Claim / Evidence / Argument / Annotation**; evidence chains terminate at data, not prose | The Claim→Evidence→Source termination rule; the "support vs challenge" link semantics | Formal argument graphs, statement reification |
| **Nanopublications** (assertion + provenance + pubinfo) | Three-part split: *what is asserted*, *where it came from*, *who/when stated it* | The clean split between assertion content and its provenance metadata | RDF named graphs, trusty-URIs, decentralized publishing |

The synthesis: PROV explains **how** something was produced; micropublications enforce **that claims bottom out in
evidence and never in generated text**. CAW-02 needs both because its whole reason to exist (brief §2) is that
"generated summaries get mistaken for evidence."

## 2. Recommended provenance model

### 2.1 Two layers, kept distinct
- **Assertion layer** — the knowledge content: `Source, Claim, Evidence, Note, Concept, OpenQuestion, Decision,
  Assumption, RelatedWork, RadarSignal`, plus imported-artifact refs (`Trace, SimulationRun, Experiment`).
- **Provenance layer** — *how each assertion came to be*: every write is an **Activity** performed by an **Agent**
  (Jimmy, a teammate, or a named AI skill) at a time, producing/using assertion entities.

This mirrors PROV (entity vs activity vs agent) without adopting RDF. In storage terms it is one `provenance_event`
record per knowledge transaction, referencing the entities it touched.

### 2.2 The core edge types (typed, not free text)
| Edge | From → To | Meaning | Invariant enforced |
|---|---|---|---|
| `supports` | Evidence → Claim | evidence backs a claim | Claim is **invalid** with zero `supports` edges |
| `challenges` | Evidence → Claim | evidence contradicts a claim | enables threat/support classification (use case 2) |
| `evidenceOf` | Evidence → Source\|Artifact | evidence points at a concrete thing | **Evidence MUST resolve to an artifact URI/row, never prose** |
| `cites` | Note → Claim\|Evidence | synthesis cites what it rests on | a Note with claims-in-text but no `cites` edges is **flagged** |
| `derivedFrom` | Note\|Claim → Source\|Claim | PROV `wasDerivedFrom` lineage | reconstructability of the chain |
| `attributedTo` | any entity → Agent | who/what produced it | distinguishes human vs AI authorship |
| `aboutConcept` | Claim\|Source\|Note → Concept | topical indexing | retrieval ("what do we know about X") |
| `addresses` | Claim\|Evidence → OpenQuestion\|Decision | links findings to decisions | keeps decisions reconstructable (use case 6) |

### 2.3 The hard rule, stated as a check (the "evidence gate")
A write is **rejected** (skill interface returns an error, not a warning) if any of:
1. A `Claim` is created/updated with **no** `supports`/`challenges` edge to an `Evidence`.
2. An `Evidence` row's `evidenceOf` target is free text rather than a resolvable `Source`/artifact URI/row id.
3. A `Note` (synthesis) is recorded **as** Evidence, i.e. a `Note` id appears as the `from` of an `evidenceOf`/`supports`
   edge. Generated synthesis can be *cited by* a Note and can *prompt* a Claim, but it is never the terminus of an
   evidence chain.

These three checks are the machine-readable form of brief §5/§10 and belong in the skill-wrap (brief §5) so **agents
cannot corrupt provenance even by mistake**.

### 2.4 Entity-level provenance fields (minimum)
Every assertion-layer row carries:
```
id            : stable id (ULID/uuid)
kind          : Source | Claim | Evidence | Note | ...
boundary      : public | internal | confidential        # §3
visibility    : team | private                           # §3
created_by    : agent id (human or skill name)
created_via   : activity id (the provenance_event)
attributed_to : agent id (origin author, may differ from created_by on import)
trust         : trust level (§4) — DERIVED, not free-typed
source_ref    : URI/path/row for Source & Evidence; NULL for pure synthesis
```
And every transaction emits one `provenance_event { id, activity, agent, ts, inputs[], outputs[], tool, notes }`.

## 3. Boundary model (public / internal / confidential + team / private)
Two **orthogonal** axes. Conflating them is the classic leak (brief §10: "never conflate public-source research with
internal Samsung/SAIT claims").

- **Sensitivity (`boundary`)** — *can this leave the building?* `public ⊂ internal ⊂ confidential` (ordered).
- **Scope (`visibility`)** — *whose space is it in?* `team` vs `private` (Jimmy-only). Not ordered; access scopes.

| boundary | meaning | may appear in public export? | typical source |
|---|---|---|---|
| `public` | derived only from public sources, no internal claims | **yes** | published papers, public radar signals |
| `internal` | team knowledge, not for outside release | no | team decisions, internal experiments |
| `confidential` | Samsung/SAIT-restricted, projection-only handling | no — and not even in full internal exports without redaction | CAW-01 confidential traces |

### 3.1 Propagation rules (computed, not hand-set)
- **Monotone non-decreasing sensitivity:** an entity's `boundary` is `max()` of itself and every entity reachable via
  `supports`/`evidenceOf`/`derivedFrom`/`cites`. A Note citing one confidential Evidence is confidential. You cannot
  "launder" sensitivity by synthesizing over it.
- **Visibility intersection:** an entity is visible to the team only if it **and all its provenance ancestors** are
  `team`. A private ancestor makes the whole derived item private until re-derived from team-visible sources.
- **No downgrade by generation:** synthesis never lowers `boundary` (the leak vector). Downgrade requires an explicit,
  attributed `reclassify` activity by a human agent (Jimmy), recorded as a provenance event with a reason.

## 4. Trust-level scheme
Trust is **derived and explainable**, never a free-typed star rating. It answers "how much weight does this carry, and
why." Keep it a small ordered ladder so it is legible to humans and agents.

| Level | Name | Criteria (derivable) |
|---|---|---|
| T0 | **unverified** | asserted with no resolvable evidence yet (transient; a bare Claim before its gate passes is rejected, so T0 mainly tags imported-but-unchecked signals) |
| T1 | **single-source** | ≥1 `supports` evidence resolving to one external source |
| T2 | **corroborated** | ≥2 independent sources, or evidence backed by a concrete artifact (trace/experiment/projection) |
| T3 | **reviewed** | T2 **and** a human-review provenance event by an authorized agent (brief §10: Jimmy reviews strategic decisions) |
| T-CONFLICT | **contested** | has both `supports` and `challenges` evidence above threshold — surfaced, not hidden |

Rules:
- Trust is **recomputed** whenever an edge changes; it is a function of the provenance graph, not a stored opinion.
- **AI-only attribution caps trust at T2.** A claim whose only review is by an AI agent cannot reach T3; T3 requires a
  human reviewer. This encodes "Jimmy is the reviewer for strategic decisions" (brief §10).
- Trust and boundary are independent: a `public` claim can be `T1`; a `confidential` claim can be `T3`.
- Retrieval (use case 3) returns trust + the evidence list so callers see *why*, satisfying "with evidence and trust
  level."

## 5. Enforcement at import / export
The boundary is a **product edge** (brief §7) — files/APIs between independent products, no shared store. Provenance
travels with the data as a manifest; it is re-validated on the way in and filtered on the way out.

### 5.1 Import (CAW-01 projections, CAW-05 signals)
| Step | Rule |
|---|---|
| Arrive | Imported bundle carries a provenance manifest (origin product, agent, source refs, declared boundary). |
| Quarantine | Imported items land as `T0 unverified` until the **evidence gate** (§2.3) passes locally. |
| CAW-01 projections | Cataloged as `Evidence` referencing the projection artifact **by URI/path**, never inlining raw confidential data (brief §7). Declared `confidential` stays `confidential`; importer **cannot downgrade**. |
| CAW-05 signals | Become `Source`/`Claim`/`OpenQuestion`/`RelatedWork`, classified `supports`/`challenges` — **not** stored as loose summaries (brief §7). |
| Attribution | `attributed_to` preserves the origin agent; `created_via` records the import activity so lineage spans products. |

### 5.2 Export (to CAW-03, and any public-facing output)
| Step | Rule |
|---|---|
| Select | Caller requests a `Claim`+`Evidence` bundle (use case 5). |
| Boundary filter | Export computes the bundle's effective `boundary` via §3.1 propagation. A **public-facing** export is rejected if any reachable entity is `internal`/`confidential`. No silent redaction — fail loud, list the offending ids. |
| Visibility filter | `private` items are excluded from team/shared exports unless the requester is the owner. |
| Evidence integrity | Every exported `Claim` ships with its `supports` Evidence and the source refs; an exported Note ships with its `cites` edges. A bundle failing the evidence gate cannot be exported. |
| Synthesis labeling | Exported Notes are tagged `kind=synthesis, evidence=false` so the downstream product (CAW-03, a separate product) cannot mistake synthesis for evidence. |
| Manifest out | Export emits a provenance manifest mirroring §5.1 so the receiving product can re-validate. |

### 5.3 The default that prevents leaks
**Default-deny on sensitivity, default-private on scope.** New items without an explicit boundary are treated as
`internal`/`private` until classified. Public requires a positive, attributed act. This makes the dangerous direction
(over-sharing) the one that requires effort.

## 6. Recommendation (summary)
1. Adopt the **two-layer** model: assertion entities + a `provenance_event` per transaction (PROV-shaped, no RDF).
2. Adopt the **typed edge set** (§2.2) and enforce the **evidence gate** (§2.3) inside the skill-wrap so agents cannot
   corrupt provenance.
3. Model boundary as **two orthogonal axes** with **computed monotone propagation** (§3); never downgrade by synthesis.
4. Make **trust derived and explainable** (T0–T3 + contested), with AI-only review capped at T2 (§4).
5. Enforce boundaries at the **import/export edges** with quarantine-on-import and fail-loud filtering-on-export (§5),
   carrying a provenance manifest both ways.

## 7. Open Questions
See ../08-research-plan/open-questions.md.
- TODO(open-question: storage of edges — adjacency rows in SQLite vs links embedded in md frontmatter; affects how the
  evidence gate and propagation are computed. Defer to storage ADR.)
- TODO(open-question: is "independent source" for T2 corroboration machine-decidable, or does it need a human/heuristic
  call? Risk of false corroboration when two signals share an upstream origin.)
- TODO(open-question: exact provenance-manifest schema shared with CAW-01/05/03 — owned by the import/export ADR; this
  doc only fixes the fields that must survive the boundary.)
- TODO(open-question: how confidential CAW-01 projections are referenced without the artifact store being reachable from
  a public deployment — URI scheme + access mediation.)
- TODO(open-question: reclassification/declassification workflow — who beyond Jimmy may downgrade, and what audit is
  required.)
- TODO(open-question: do we need tamper-evidence on provenance events (hash chain / content addressing) in v0, or is
  that a later upgrade?)

## 8. Implications for runbooks
- **Schema runbook:** must create assertion tables with the §2.4 fields and a `provenance_event` table; edges as a typed
  link table (or md-frontmatter equivalent). Boundary/visibility are NOT NULL with default-deny defaults (§5.3).
- **Skill-wrap runbook:** the add-source/extract-claim/attach-evidence/synthesize-note skills must run the **evidence
  gate** (§2.3) and **reject** on failure; trust is recomputed, never accepted from the caller.
- **Import runbook (CAW-01/05):** land items as `T0`, preserve `attributed_to`, never downgrade declared `confidential`,
  catalog projections by URI.
- **Export runbook (CAW-03 / public):** run boundary + visibility propagation, fail loud with offending ids, tag
  synthesis `evidence=false`, attach outbound manifest.
- **Retrieval runbook:** every result carries trust level + evidence list + boundary, so callers never see a bare claim.
- **Viewer (read-only):** must visually separate Claim / Evidence / Note and show trust + boundary badges so a human can
  never mistake synthesis for evidence.

## References
- [PROV-O: The PROV Ontology (W3C)](https://www.w3.org/TR/prov-o/)
- [Micropublications: a semantic model for claims, evidence, arguments and annotations](https://pmc.ncbi.nlm.nih.gov/articles/PMC4530550/)
- [Nanopublications for exposing experimental data in the life-sciences](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC4603842/)
- [Provenance, Assertion and Evidence Ontologies — survey](https://pmc.ncbi.nlm.nih.gov/articles/PMC12376154/)
