# ADR-0004: Provenance & trust model

- **Status:** proposed
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:**
  - [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF.md)
  - [../02-research/provenance-and-trust-models.md](../02-research/provenance-and-trust-models.md)
  - [./ADR-0002-storage.md](./ADR-0002-storage.md)
  - [./ADR-0006-retrieval.md](./ADR-0006-retrieval.md)
  - [./ADR-0007-import-export-contracts.md](./ADR-0007-import-export-contracts.md)
  - [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
Decide CAW-02's **provenance shape, trust levels, and the public/internal/confidential + team/private boundary model**,
and how they are enforced. It fixes the integrity invariant every other ADR must honor. It does NOT specify storage
format (see [ADR-0002](./ADR-0002-storage.md)) or the import/export wire formats (see
[ADR-0007](./ADR-0007-import-export-contracts.md)); those consume the rules fixed here.

## Context
- The product exists because "generated summaries get mistaken for evidence" (brief §2). The non-negotiable invariant:
  **a `Claim` points to `Evidence`; `Evidence` references a concrete artifact/source, never free text; generated
  synthesis is NOT evidence** (brief §5, §10).
- Every item carries `boundary` (public/internal/confidential) and a **team vs Jimmy-private** scope (brief §6).
- Public-facing exports must be public-safe only; never conflate public-source research with internal Samsung/SAIT
  claims (brief §10).
- Jimmy is the reviewer for strategic decisions; agents add knowledge via the skill-wrap (brief §3, §10).
- Reconstructability is a hard requirement and must remain upgradable toward a graph (brief §5).

## Options considered
| Decision area | Option | Pros | Cons | Fit |
|---|---|---|---|---|
| Provenance theory | Full W3C PROV in RDF/OWL | Standard, expressive | Heavy; RDF toolchain; overkill at this scale | Rejected |
| Provenance theory | **PROV-shaped two-layer (no RDF) + micropublication evidence-termination** | Borrows derivation/attribution + "claims bottom out in evidence"; minimal | Custom edge vocabulary to maintain | **Chosen** |
| Trust | Free-typed star rating | Simple | Opinion, not explainable; gameable | Rejected |
| Trust | **Derived, recomputed ladder T0–T3 + contested** | Explainable ("how much weight, why"); legible to humans+agents | Must recompute on edge change | **Chosen** |
| Boundary | Single sensitivity field | Fewer columns | Conflates "can it leave" with "whose space" — the classic leak | Rejected |
| Boundary | **Two orthogonal axes + computed monotone propagation** | Prevents conflation; over-sharing requires effort | Propagation must be computed on read/export | **Chosen** |

## Decision

### 1. Two-layer, PROV-shaped provenance (no RDF)
- **Assertion layer:** the knowledge entities (`Source, Claim, Evidence, Note, Concept, Interest, OpenQuestion,
  Decision, Assumption, RelatedWork, RadarSignal`, + imported refs `Trace, SimulationRun, Experiment`).
- **Provenance layer:** every write emits one `provenance_event { id, activity, agent, ts, inputs[], outputs[], tool,
  notes }` — Activity performed by an Agent (Jimmy, a teammate, or a named AI skill). This is one record per
  knowledge transaction and is the reconstructability substrate.

### 2. Typed edge set (the `edge` table of [ADR-0002](./ADR-0002-storage.md))
`supports` (Evidence→Claim), `challenges` (Evidence→Claim), `evidenceOf` (Evidence→Source|Artifact), `cites`
(Note→Claim|Evidence), `derivedFrom` (Note|Claim→Source|Claim), `attributedTo` (any→Agent), `aboutConcept`
(Claim|Source|Note→Concept), `addresses` (Claim|Evidence→OpenQuestion|Decision). Edges are typed, never free text.

### 3. The evidence gate (enforced in the skill-wrap, returns an error not a warning)
A write is **rejected** if any of:
1. A `Claim` is created/updated with **no** `supports`/`challenges` edge to an `Evidence`.
2. An `Evidence` row's `evidenceOf` target is free text rather than a resolvable `Source`/artifact URI/row id.
3. A `Note` (synthesis) appears as the `from` of an `evidenceOf`/`supports` edge (synthesis-as-evidence).

This is the machine form of brief §5/§10 — agents cannot corrupt provenance even by mistake.

### 4. Boundary model — two orthogonal axes
- **Sensitivity `boundary`** (*can this leave the building?*): ordered `public ⊂ internal ⊂ confidential`.
- **Scope `visibility`** (*whose space?*): `team` vs `private` (Jimmy-only); not ordered.
- **Propagation is computed, not hand-set:** an entity's `boundary` = `max()` over itself and every entity reachable via
  `supports`/`evidenceOf`/`derivedFrom`/`cites` (you cannot launder sensitivity by synthesizing over it). An entity is
  team-visible only if it and all provenance ancestors are `team`.
- **No downgrade by generation.** Synthesis never lowers `boundary`. A downgrade requires an explicit, attributed
  `reclassify` activity by a human (Jimmy), recorded with a reason.
- **Default-deny on sensitivity, default-private on scope.** New unclassified items are `internal`/`private` until a
  positive, attributed act classifies them — the dangerous direction (over-sharing) is the one requiring effort.

### 5. Trust ladder — derived and explainable
| Level | Name | Derivable criteria |
|---|---|---|
| T0 | unverified | no resolvable evidence yet (mainly imported-but-unchecked signals; a bare Claim is rejected by the gate) |
| T1 | single-source | ≥1 `supports` evidence resolving to one external source |
| T2 | corroborated | ≥2 independent sources, or evidence backed by a concrete artifact (trace/experiment/projection) |
| T3 | reviewed | T2 **and** a human-review provenance event by an authorized agent |
| T-CONFLICT | contested | both `supports` and `challenges` above threshold — surfaced, not hidden |

- Trust is **recomputed** whenever an edge changes; it is a function of the graph, never accepted from the caller.
- **AI-only review caps trust at T2.** T3 requires a human reviewer — encodes "Jimmy reviews strategic decisions".
- Trust and boundary are independent (a `public` claim can be T1; a `confidential` claim can be T3).

### 6. Team vs Jimmy-private separation
`visibility` is a first-class column with default `private`. Private items are excluded from team/shared views and from
team/shared exports unless the requester is the owner; a private provenance ancestor makes the derived item private
until re-derived from team-visible sources. This is the v0 access model — no multi-tenant ACLs (brief §9).

### 7. Provenance chain & reconstructability
"Reconstruct how synthesis N was reached" = walk `note → cites → claim → supports → evidence → evidenceOf → source`,
available as a recursive CTE over `edge` or as git-blame across the linked files (see [ADR-0002](./ADR-0002-storage.md)).
Every entity carries `created_by`, `created_via`, `attributed_to`, `trust`, `source_ref`.

## Consequences
- **Easy:** an agent literally cannot attach prose as evidence (the schema has no prose evidence field — see the
  skill-interface research); retrieval can return trust + evidence list so callers see *why*; over-sharing is hard by
  default; lineage spans products via preserved `attributed_to`.
- **Enforcement points:** the **evidence gate** and trust recomputation live in the skill-wrap core (one chokepoint for
  MCP/CLI/API); boundary propagation runs on read and at every export.
- **Hard:** "independent source" for T2 corroboration may not be fully machine-decidable; propagation must be computed,
  not cached blindly; reclassification needs an audited human workflow.
- **Follow-on:** schema runbook (assertion fields + `provenance_event` + typed edges, default-deny defaults); skill-wrap
  runbook (gate + trust recompute); import/export runbooks (quarantine-on-import at T0, fail-loud export filter).

## Open questions / revisit triggers
- `TODO(open-question: is "independent source" for T2 machine-decidable, or heuristic/human?)`
- `TODO(open-question: reclassification/declassification workflow — who beyond Jimmy may downgrade, and what audit?)`
- `TODO(open-question: tamper-evidence on provenance events — hash chain in v0 vs later upgrade?)`
- `TODO(open-question: exact provenance-manifest fields shared across the boundary — owned by ADR-0007)`
- See [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md).

## Implications for runbooks
- **RB (schema):** assertion tables with §7 fields + `provenance_event`; typed `edge` link table; boundary/visibility
  `NOT NULL` default-deny/default-private.
- **RB (skill-wrap):** evidence gate (reject on failure) + trust recompute (never trust caller-supplied trust).
- **RB (retrieval):** every result carries trust + evidence list + boundary (see [ADR-0006](./ADR-0006-retrieval.md)).
- **RB (viewer):** visually separate Claim / Evidence / Note; show trust + boundary badges so synthesis is never mistaken
  for evidence.
