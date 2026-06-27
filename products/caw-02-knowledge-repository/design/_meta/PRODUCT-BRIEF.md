# PRODUCT BRIEF — Team/Personal Knowledge Repository (CAW-02)

> Single source of truth for **CAW-02**. Every design doc + runbook must stay consistent with this brief.
> If a doc contradicts the brief, the brief wins. Do not fabricate internal facts; capture unknowns in
> `08-research-plan/open-questions.md`.

## 0. The one hard constraint
We are NOT building the product here. We write the design + build instructions (runbooks) an AI builder executes.

## 1. Identity & independence
- **Product:** Team/Personal Knowledge Repository (CAW-02).
- **One-liner:** an inspectable knowledge store that lets Jimmy and the team **append, retrieve, and reuse**
  technical knowledge with strict **provenance** (raw source → extracted claim → evidence → synthesis), as a
  standalone product.
- This is an **independent, standalone product** in the `ai-workbench` family of 6. It has its OWN core, data,
  and deployment. **No shared runtime substrate** with other products. It interacts with CAW-01/CAW-05/CAW-03
  only via **import/export boundaries** (files/APIs between independent products).

## 2. Problem & value
- **Problem:** technical knowledge (sources, claims, evidence, decisions, experiment outputs, related-work
  signals) is scattered and un-reconstructable; generated summaries get mistaken for evidence.
- **Unit of value:** one **provenance-preserving knowledge transaction** —
  `add source → extract claim(s) → attach evidence → synthesize note (cited)` — that stays reconstructable and reusable.
- **Why now / why separate:** every other product (CAW-01 runs, CAW-05 radar, CAW-03 drafting) needs a durable,
  trustworthy place to deposit and retrieve knowledge — but that store must be its **own** product with its own
  integrity rules, not a substrate baked into any one of them.
- **Maturity caution:** **continual learning is NOT v0.** v0 = **append + retrieve + skill-wrap**. The
  control-plane schema (traces, runs, insights, decisions stay reconstructable) is part of the knowledge-store core.

## 3. Users & top use cases
- **Personas:** Jimmy (domain expert/curator), the team (readers/contributors), and **AI agents** (which add/
  update knowledge via a safe skill interface).
- **Top use cases:**
  1. `add-source → extract-claims → synthesize-note` (cited) — the core ingestion loop.
  2. `add-related-work-signal → classify threat/support → link-to-claim` — radar/related-work intake.
  3. Retrieve: "what do we know about X, with evidence and trust level?"
  4. Import a CAW-01 simulation **projection** as durable evidence for a claim (without leaking confidential data).
  5. Export a cited claim/evidence bundle to CAW-03 (paper/patent product).
  6. Record a `Decision` / `OpenQuestion` / `Assumption` and keep it linked to its evidence.

## 4. Product surface(s)
- **Primary surfaces:** a typed **API**, an **MCP server**, and a **CLI** — so humans and agents add/retrieve
  knowledge safely (the "skill interface"). 
- **Secondary surface:** an optional **minimal knowledge viewer** (read-only) — browse sources/claims/evidence/
  notes and their links. Rich editing UI is a non-goal for v1.
- The product's own core/services sit behind all surfaces (no shared substrate with other products).

## 5. Core domain (the heart)
The knowledge store must distinguish, as first-class, separate things (generated summaries are NOT evidence):
- **Entities:** `Source, Claim, Evidence, Note, Concept, Interest, OpenQuestion, Decision, Assumption`, plus
  imported-artifact references `Trace, SimulationRun, Experiment` (cataloged as evidence, not executed here),
  and intake signals `RelatedWork, RadarSignal`.
- **Invariant:** a `Claim` must point to `Evidence`; `Evidence` references a concrete artifact/source, never free text.
- **Skill-wrap:** a safe interface that lets agents perform vetted knowledge transactions (add source, extract
  claim, attach evidence, synthesize note, classify signal) without corrupting provenance.
- **Reconstructability:** the schema preserves enough to reconstruct how a synthesis was reached (source → claim
  → evidence → note chain), and to upgrade later toward a graph / continual-learning model.

## 6. Data
- **CAW-02's OWN store** (never shared). v0 storage decision is open: **markdown-first vs SQLite vs both**
  (likely md-first as human-diffable source of truth + a SQLite/Postgres-portable index for query/retrieval;
  decide in ADR). Minimal schema that **allows future graph / continual-learning upgrades** without rewrite.
- **Boundaries:** every item carries `boundary` (public / internal / confidential) and a **team vs Jimmy-private**
  separation. Public-facing exports must be public-safe only.
- Large artifacts (imported traces/projections) stored by path/URI, referenced from rows.

## 7. Import / export boundaries (to other independent products)
- **Imports from CAW-01:** simulation **projections/evidence** exports → cataloged as `Evidence` for claims,
  **without leaking confidential data** (boundary enforced at import).
- **Imports from CAW-05:** **radar / related-work signals** → become `Source`/`Claim`/`OpenQuestion`/`RelatedWork`,
  classified threat/support — not loose summaries.
- **Exports to CAW-03:** cited `Claim`+`Evidence` bundles for paper/patent drafting.
- All of the above are explicit file/API boundaries between independent products — **no shared substrate/registry/DB.**

## 8. Decisions to make (each gets an ADR)
- ADR: product surface (API + MCP + CLI + optional viewer) and the agent **skill interface**.
- ADR: storage (md-first vs SQLite vs both; Postgres-portability; future graph upgrade path).
- ADR: the knowledge **data model** + the claim→evidence invariant enforcement.
- ADR: **provenance & trust** model (trust levels; public/internal/confidential; team vs private).
- ADR: **ingestion pipeline** (add-source→extract-claims→synthesize-note) and signal intake.
- ADR: **import/export** contracts with CAW-01/05/03 (boundary formats).
- ADR: retrieval (keyword vs semantic/vector; when to add embeddings).

## 9. Non-goals (v1)
- **Continual learning / autonomous self-editing** of knowledge (v0 is append + retrieve + skill-wrap).
- A heavyweight graph database (keep upgrade path open, but don't adopt Neo4j in v1).
- A rich editing UI / public knowledge website (CAW-04 is a separate product).
- Running simulations or radar collection (those are CAW-01 / CAW-05 — CAW-02 only catalogs their exports).
- Multi-tenant / org-scale access control beyond team-vs-private in v1.

## 10. Guardrails (inherited, all products)
- No confidential company data in public-facing outputs.
- Never conflate public-source research with internal Samsung/SAIT claims.
- Keep sources, claims, evidence, and generated conclusions separate; generated summaries are not evidence.
- Prefer small vertical slices that prove workflow semantics over broad platform scaffolding.
- Automatic generation is proposal/update generation; Jimmy is the reviewer for strategic decisions.
