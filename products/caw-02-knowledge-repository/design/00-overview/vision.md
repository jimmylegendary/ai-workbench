# Vision — CAW-02 Team/Personal Knowledge Repository

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set review date)
- **Related:**
  - [scope-and-non-goals.md](./scope-and-non-goals.md)
  - [personas-and-use-cases.md](./personas-and-use-cases.md)
  - [ADR-0001 Product surface & skill interface](../01-decisions/ADR-0001-product-surface-and-skill-interface.md)
  - [ADR-0002 Storage](../01-decisions/ADR-0002-storage.md)
  - [ADR-0003 Knowledge data model](../01-decisions/ADR-0003-knowledge-data-model.md)
  - [ADR-0004 Provenance & trust](../01-decisions/ADR-0004-provenance-and-trust.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
This doc states the north star for CAW-02: **what** we are building, **why**, and the **single unit of value**
it must protect. It defines the v0 boundary (append + retrieve + skill-wrap) and the first vertical slice. It does
NOT specify storage layout, schemas, surfaces, or pipeline mechanics — those live in the linked ADRs and the
[02-research](../02-research) notes. It does not re-argue scope (see [scope-and-non-goals.md](./scope-and-non-goals.md)).

## 1. North star
CAW-02 is an **instrument for provenance-preserving knowledge**: an inspectable store where Jimmy and the team
**append, retrieve, and reuse** technical knowledge such that *how a conclusion was reached stays reconstructable*.
The store's job is not to be clever; it is to be **trustworthy under inspection** — every synthesized note can be
walked back to the claims it rests on, every claim back to concrete evidence, every piece of evidence back to a
real artifact or source.

The failure mode we exist to prevent: **a generated summary getting mistaken for evidence**, and internal/
confidential material leaking into public-facing outputs. The whole design is organized around making that
mistake *structurally impossible* rather than merely discouraged.

## 2. The unit of value
The atom of the product is one **provenance-preserving knowledge transaction**:

```
add source  →  extract claim(s)  →  attach evidence  →  synthesize note (cited)
```

A transaction is "good" only if the resulting graph stays **reconstructable** and **reusable**:

| Property            | What it means here                                                                   |
|---------------------|--------------------------------------------------------------------------------------|
| Reconstructable     | source → claim → evidence → note chain is intact and walkable, both directions       |
| Cited               | every synthesized note names the claims/evidence it rests on; no orphan conclusions  |
| Evidence-real       | evidence resolves to a concrete artifact/source — never free prose (the evidence gate)|
| Boundary-safe       | each item carries `boundary` + `visibility`; synthesis never downgrades them          |
| Reusable            | a later reader (human or agent) can retrieve the chain and depend on it               |

The **Claim→Evidence invariant** (a `Claim` must point to `>=1` real `Evidence`) is the load-bearing rule. It is
enforced in three lockstep layers — frontmatter schema, core validator, reindex re-check — so it holds identically
across every surface and storage engine (see [ADR-0003](../01-decisions/ADR-0003-knowledge-data-model.md)).

## 3. What v0 is — and is not
v0 = **append + retrieve + skill-wrap**. Concretely:

- **Append** — append-only writes plus *supersedes* (no in-place update/delete). Every write is mirrored to an
  append-only event log; git history is the audit trail (see [ADR-0002](../01-decisions/ADR-0002-storage.md)).
- **Retrieve** — keyword/structured retrieval (FTS + first-class boundary/type/trust filters) that hydrates the
  full provenance chain; RAG is citation-constrained (see [ADR-0006](../01-decisions/ADR-0006-retrieval.md)).
- **Skill-wrap** — a safe, vetted interface so AI agents can run knowledge transactions without corrupting
  provenance; the **evidence gate** lives here (see [ADR-0001](../01-decisions/ADR-0001-product-surface-and-skill-interface.md)).

v0 is explicitly **NOT continual learning / autonomous self-editing**. The control-plane schema is designed so a
future continual-learning or graph upgrade is an *engine/query swap, not a data rewrite* — but that capability is
out of v0 scope. See [scope-and-non-goals.md](./scope-and-non-goals.md).

## 4. Independence
CAW-02 is an **independent, standalone product** with its own core, data, and deployment. It shares **no runtime
substrate, registry, or database** with any sibling product. It touches the rest of the `ai-workbench` family only
across explicit **import/export boundaries** (files/APIs):

| Boundary        | Direction | What crosses                                                              |
|-----------------|-----------|--------------------------------------------------------------------------|
| CAW-01 (sims)   | import    | simulation projections/evidence → cataloged as `Evidence` (quarantined)  |
| CAW-05 (radar)  | import    | radar / related-work signals → `Source`/`Claim`/`OpenQuestion`/`RelatedWork`|
| CAW-03 (drafting)| export   | cited `Claim`+`Evidence` bundles for paper/patent drafting               |

Each crossing re-redacts and re-checks boundaries; the export path is **fail-closed allow-list**
(see [ADR-0007](../01-decisions/ADR-0007-import-export-contracts.md)). CAW-04 (public knowledge website) is a
separate product, not a surface of CAW-02.

## 5. Design philosophy (the few principles)
- **Files in git are the source of truth.** Each entity is one human-diffable `.md` (YAML frontmatter = machine
  contract + markdown body = human note). SQLite is a derived, disposable index, rebuilt by a deterministic
  reindex. This keeps knowledge inspectable, ownable, and engine-portable.
- **One core owns all logic.** Validation, evidence gate, trust recompute, boundary propagation, and audit live in
  ONE transactional core. API + MCP + CLI are *thin adapters codegen'd from one op manifest* — they add no logic.
- **Structural integrity over policy.** `attach_evidence` has no prose field; a note can never be evidence. Trust
  is a small derived ladder (T0–T3 + contested), with AI-authored capped at T2. Boundaries propagate monotonically.
- **Small vertical slices first.** Prove workflow semantics end-to-end before broadening the platform.

## 6. First vertical slice
The slice that proves the product is the **core ingestion loop, end to end, through the skill-wrap**:

```
add-source(URL/file)
  → extract-claim(s)         (agent proposes; reviewed by default)
    → attach-evidence        (evidence gate: artifact_ref must resolve)
      → synthesize-note       (cited; generated summary is NOT evidence)
        → retrieve            ("what do we know about X, with evidence + trust?")
```

Done looks like: a single command/agent run that turns one real source into a reviewed Claim backed by resolvable
Evidence and a cited Note, all written append-only to git + mirrored to the event log, then retrievable with its
full provenance chain and boundary/trust metadata intact. This slice exercises every load-bearing rule (invariant,
evidence gate, append-only, boundary propagation, citation-constrained retrieval) without requiring import/export,
the viewer, or any continual-learning machinery.

Sequencing after the slice: (1) add CAW-05 signal intake, (2) add CAW-01 projection import as evidence, (3) add
CAW-03 cited-bundle export, (4) optional read-only viewer. See [personas-and-use-cases.md](./personas-and-use-cases.md)
for the walkthroughs.

## 7. Success signals (qualitative, v0)
- Any synthesized note can be walked to its evidence in one step; no orphan conclusions exist.
- No generated summary is ever stored as evidence (the gate holds across all surfaces).
- No confidential item appears in any public-facing export (fail-closed holds).
- An agent can complete the core loop under review without corrupting provenance.
- Rebuilding the SQLite index from files yields an identical graph (determinism holds).

TODO(open-question: do we want quantitative v0 success metrics, e.g. retrieval precision targets, before the
embeddings trigger in [ADR-0006](../01-decisions/ADR-0006-retrieval.md)?)

## Open questions
See [08-research-plan/open-questions.md](../08-research-plan/open-questions.md) (TODO: create) for the live list.
Open here: quantitative success metrics; review date.

## Implications for runbooks
- The first runbook phase must deliver the **vertical slice** of §6 (core loop through skill-wrap), green at each
  checkpoint, before any import/export or viewer work.
- Runbooks must treat files-in-git as source of truth and the SQLite index as rebuildable from scratch.
- Every write path runbook must route through the single core (no logic in adapters) and exercise the evidence gate.
