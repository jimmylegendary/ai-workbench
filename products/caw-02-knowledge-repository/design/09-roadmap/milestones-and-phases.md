# Milestones & Phases

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:**
  - [dependency-graph.md](dependency-graph.md)
  - [risks-and-mitigations.md](risks-and-mitigations.md)
  - [../01-decisions/ADR-0001-product-surface-and-skill-interface.md](../01-decisions/ADR-0001-product-surface-and-skill-interface.md)
  - [../01-decisions/ADR-0002-storage.md](../01-decisions/ADR-0002-storage.md)
  - [../01-decisions/ADR-0005-ingestion-pipeline.md](../01-decisions/ADR-0005-ingestion-pipeline.md)
  - [../01-decisions/ADR-0007-import-export-contracts.md](../01-decisions/ADR-0007-import-export-contracts.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose

This doc sequences the build of CAW-02 into phases that map 1:1 to the runbook
phase folders (`10-runbooks/0X-*`), and pins the **headline milestone** of each.
It defines **entry/exit criteria** per phase so an AI builder knows when a phase
is started and done. It does NOT specify per-step build instructions (that is the
runbooks) nor redefine any ADR decision (it elaborates them). Scope is fixed by
the PRODUCT-BRIEF: v0 = **append + retrieve + skill-wrap**, NOT continual learning.

## Milestone definitions (headline outcomes)

| ID | Milestone | Proves |
|----|-----------|--------|
| **M0** | Repo + skeleton green | tree compiles/lints; CI runs; empty `knowledge/` tree initialized |
| **M1** | **First provenance-preserving knowledge transaction round-trip** | `add-source → extract-claim → attach-evidence → synthesize-cited-note` writes valid md-in-git, reindexes to SQLite, and is **retrievable** via the skill interface — the unit of value from the brief (§2) |
| **M2** | Boundaries + trust enforced on every write | `boundary`/`visibility` monotone propagation + T0–T3 ladder computed; evidence gate structural |
| **M3** | Agent writes via skill-wrap (confirmation-by-default) | MCP/CLI/API thin adapters codegen'd from the op manifest; agent submissions reviewed |
| **M4** | Retrieval v0 (FTS5 + structured filters) | citation-constrained RAG returns claim+evidence, never opaque blobs |
| **M5** | Import/export boundaries live | quarantine-on-import; fail-closed export allow-list; signed bundles to CAW-03 |

M1 is the **critical milestone**: nothing after it is meaningful until the
provenance round-trip exists end to end on the real storage substrate.

## Phases (mapped to runbook folders)

| Phase | Runbook folder | Theme | Headline milestone |
|-------|----------------|-------|--------------------|
| P0 | `10-runbooks/00-foundations` | Repo, CI, storage layout, data model | M0 |
| P1 | `10-runbooks/01-storage-and-index` | md-git source of truth + deterministic reindex → SQLite | (enables M1) |
| P2 | `10-runbooks/02-core-and-skillwrap` | core validator, evidence gate, op manifest, transaction round-trip | **M1** |
| P3 | `10-runbooks/03-provenance-trust` | boundary/visibility propagation, trust ladder, audit/events | M2 |
| P4 | `10-runbooks/04-surfaces` | API + MCP + CLI thin adapters, confirmation-by-default | M3 |
| P5 | `10-runbooks/05-retrieval` | FTS5 BM25 + first-class structured filters, RAG hydration | M4 |
| P6 | `10-runbooks/06-import-export` | quarantine import, fail-closed export, signed envelopes | M5 |
| P7 | `10-runbooks/07-viewer-and-hardening` | optional read-only viewer, dedup quality, ops hardening | — |

> Phases are **largely sequential** by dependency (see
> [dependency-graph.md](dependency-graph.md)); P4 and P5 may overlap once the
> core (P2) and provenance (P3) are stable.

---

## P0 — Foundations

**Goal:** a green skeleton and the canonical on-disk shape.

- **Entry:** ADR-0002/0003 accepted; empty repo.
- **Work:** initialize `knowledge/{sources,claims,evidence,notes,concepts,interests,decisions,open-questions,assumptions,signals}/` and `knowledge/_events/`; YAML frontmatter schemas per entity; CI (build + lint + schema-validate); fixtures.
- **Exit (all true):**
  - [ ] `knowledge/` tree + `_events/` exist and are version-controlled.
  - [ ] Frontmatter JSON-schema for every entity type lints sample fixtures.
  - [ ] CI green on an empty tree (build + lint + schema-validate).
  - [ ] Data model (ADR-0003) encoded as the one generic typed-edge contract.

## P1 — Storage & deterministic reindex

**Goal:** md-in-git is the single source of truth; SQLite is a derived, disposable index.

- **Entry:** P0 exit met.
- **Work:** writer that emits one `.md` per entity (frontmatter + body); append-only `_events/<ts>-<op>.jsonl` mirror; **deterministic, idempotent reindex** that rebuilds SQLite (relational + FTS migration kept droppable) purely from `knowledge/`.
- **Exit:**
  - [ ] `reindex` on a fixed corpus produces byte-identical SQLite content on repeat runs (idempotent).
  - [ ] Deleting the SQLite file and re-running reindex fully reconstructs the index from md-git.
  - [ ] FTS/vector schemas live in **separate droppable migrations**.
  - [ ] Every write appends exactly one `_events` line; git commit is the audit record.

## P2 — Core + skill-wrap → **M1**

**Goal:** the first provenance-preserving knowledge transaction, end to end.

- **Entry:** P1 exit met.
- **Work:** the ONE transactional core owning all logic — validator, the three-layer Claim→Evidence invariant, the **structural evidence gate** (`attach_evidence` has no prose field; `artifact_ref` must resolve), append-only + supersedes (no update/delete). One op manifest defining `add_source`, `parse`, `extract_claim`, `attach_evidence`, `synthesize_note`. Minimal skill entrypoint to drive the round-trip.
- **Exit (M1 acceptance):**
  - [ ] Running `add-source → extract-claim → attach-evidence → synthesize-cited-note` writes valid md files under `knowledge/` that pass schema + core validation.
  - [ ] The synthesized Note carries citations to Claim+Evidence; the generated summary is **never** stored as Evidence.
  - [ ] `reindex` ingests the new transaction; a retrieval query returns the Note **with its hydrated provenance chain** (source→claim→evidence).
  - [ ] A Claim with zero Evidence is **rejected** at all three layers (frontmatter, validator, reindex re-check).
  - [ ] The whole round-trip runs through the skill interface, not ad-hoc file edits.

## P3 — Provenance, boundaries & trust

**Goal:** integrity rules computed on every write.

- **Entry:** M1 met.
- **Work:** PROV-shaped two-layer provenance edges; **two orthogonal axes** `boundary {public,internal,confidential}` and `visibility {team,private}` with computed **monotone propagation** (synthesis never downgrades); derived **trust ladder T0–T3 + contested**, AI-authored capped at **T2**.
- **Exit:**
  - [ ] Synthesizing from a `confidential` input never yields a less-restrictive `boundary` (monotonicity test passes).
  - [ ] Trust is recomputed deterministically by reindex; AI-authored nodes never exceed T2.
  - [ ] Contested state is representable and surfaced in retrieval.
  - [ ] Audit (events + signed git commits/blame) reconstructs how every node got its labels.

## P4 — Surfaces (API + MCP + CLI)

**Goal:** thin adapters, identical semantics, safe agent writes.

- **Entry:** M2 met.
- **Work:** codegen API + MCP + CLI from the single op manifest (adapters add NO logic); **confirmation-by-default** for agent writes; agent submissions **reviewed by default** (no silent auto-accept in v0).
- **Exit:**
  - [ ] All three surfaces are generated from the manifest; a conformance test shows identical behavior across them.
  - [ ] Agent write without confirmation is blocked; rejected candidates retained for audit.
  - [ ] No surface can bypass the core validator or evidence gate.

## P5 — Retrieval v0

**Goal:** keyword retrieval with first-class structured filters; citation-constrained RAG.

- **Entry:** M1 met (can overlap P3/P4).
- **Work:** SQLite **FTS5 (BM25)**; structured filters (`boundary`, `visibility`, `type`, `trust`, `concept`) applied **before** ranking; results hydrate the provenance chain. **No embeddings in v0**; vector sidecar schema reserved.
- **Exit:**
  - [ ] Filters are applied pre-ranking; a `private`/`confidential` item never leaks into a filtered-out result set.
  - [ ] RAG returns claim+evidence bundles, never opaque blobs.
  - [ ] Vector schema reserved but unused; embedding triggers documented (recall/precision). TODO(open-question: numeric recall/precision triggers).

## P6 — Import / export boundaries

**Goal:** safe crossings to the other independent products.

- **Entry:** M2 + M4 met.
- **Work:** versioned envelope, **mandatory re-redaction at every crossing**, **fail-closed export allow-list**. Import = quarantine + confidentiality check then map to nodes; CAW-01 projections and CAW-05 radar signals **imported** (→ Source/Claim/Evidence/OpenQuestion/RelatedWork/RadarSignal); cited Claim+Evidence bundles **exported** to CAW-03; bundles **signed**; provenance manifest both ways.
- **Exit:**
  - [ ] Importing a CAW-01 projection lands it quarantined; a confidentiality check runs before mapping to nodes.
  - [ ] Export omits anything not on the allow-list (fail-closed); a confidential item can never appear in a public-facing bundle.
  - [ ] Exported bundles are signed and carry a provenance manifest.
  - [ ] These are file/API boundaries only — **no shared store** with CAW-01/05/03.

## P7 — Viewer & hardening

**Goal:** read-only browsing + operational robustness.

- **Entry:** M5 met.
- **Work:** optional **read-only** viewer (sources/claims/evidence/notes + links); dedup quality pass; resumable-runbook hardening (leave tree green at each checkpoint).
- **Exit:**
  - [ ] Viewer is read-only; no write path through it.
  - [ ] Dedup behavior documented and measured. TODO(open-question: dedup acceptance metric).
  - [ ] Each phase's runbooks leave a green tree so interrupted builds resume cleanly.

## Open Questions

- Numeric retrieval triggers for adding embeddings (P5). TODO(open-question).
- Dedup acceptance metric (P7). TODO(open-question).
- Whether P4 and P5 are formally parallelized or strictly sequenced.
- See `../08-research-plan/open-questions.md`.

## Implications for runbooks

- Folder numbering `10-runbooks/0X-*` matches phases P0–P7 above.
- M1 is the gating runbook acceptance; later phases may assume the round-trip + reindex exist.
- Every runbook must leave the tree green at its Acceptance checkpoint (resumability — see risks doc).
