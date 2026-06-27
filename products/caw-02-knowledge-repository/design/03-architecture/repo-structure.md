# Repo Structure — code + content layout

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [./data-flow.md](./data-flow.md)
  - [./tech-stack.md](./tech-stack.md)
  - [../01-decisions/ADR-0001-product-surface-and-skill-interface.md](../01-decisions/ADR-0001-product-surface-and-skill-interface.md)
  - [../01-decisions/ADR-0002-storage.md](../01-decisions/ADR-0002-storage.md)
  - [../01-decisions/ADR-0003-knowledge-data-model.md](../01-decisions/ADR-0003-knowledge-data-model.md)
  - [../01-decisions/ADR-0006-retrieval.md](../01-decisions/ADR-0006-retrieval.md)
  - [../01-decisions/ADR-0007-import-export-contracts.md](../01-decisions/ADR-0007-import-export-contracts.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
This doc fixes the **on-disk layout of CAW-02 as a shipped product**: the `knowledge/` content tree (the
markdown-in-git source of truth), the `_events/` ledger, the `src/` core + thin adapters + reindex, and the
migrations. It implements ADR-0002 (storage), ADR-0001 (one core, thin adapters), and ADR-0003 (entity set). It
does NOT define field-level frontmatter schemas (ADR-0003) or wire formats (ADR-0007) — it places them.

## Top-level layout
Two concerns live side by side and are intentionally separable: **content** (`knowledge/`, the source of truth,
versioned in git) and **code** (`src/` etc., which builds the disposable index and the surfaces over it).

```
caw-02-knowledge-repository/
├── knowledge/                 # SOURCE OF TRUTH — markdown-in-git (ADR-0002)
├── design/                    # this design corpus (briefs, ADRs, architecture, runbooks)
├── src/                       # the product code (TS): core + adapters + reindex
├── migrations/                # numbered SQL: core (portable) + FTS/vector (droppable)
├── manifest/                  # the single op manifest the adapters are codegen'd from
├── schemas/                   # boundary envelope + frontmatter zod schemas
├── scripts/                   # operational scripts (reindex CLI entry, audits)
├── tests/                     # unit + invariant + portability-lint + golden-reindex tests
├── .index/                    # DERIVED, DISPOSABLE — index.sqlite (gitignored)
├── var/                       # runtime: quarantine/, vault/, exports/ (gitignored as policy dictates)
├── package.json               # TS workspace (versions pinned per tech-stack.md TODOs)
└── README.md
```

Rationale: a clean split lets `knowledge/` be cloned, diffed, and audited independently of the code, and lets the
index (`.index/`) be deleted and rebuilt at will (`reindex`). `var/` holds non-canonical runtime state.

## `knowledge/` — content (single source of truth)
One `.md` per entity = YAML frontmatter (machine contract) + markdown body (human note). Directory == entity
`kind`. The set mirrors the ADR-0003 entity set exactly.

```
knowledge/
├── sources/            # Source            (raw source: file/URI/DOI; content_hash, boundary)
├── claims/             # Claim             (must point to >=1 Evidence — the invariant)
├── evidence/           # Evidence          (extracted_from a concrete artifact; never prose)
├── notes/              # Note              (generated=true, cites claims; NEVER evidence)
├── concepts/           # Concept           (topical nodes; "poor-man's semantics" for FTS)
├── interests/          # Interest          (curator/team interest areas)
├── decisions/          # Decision          (recorded decisions linked to evidence)
├── open-questions/     # OpenQuestion      (incl. auto-raised on a refuting threat)
├── assumptions/        # Assumption        (stated assumptions linked to claims)
├── signals/            # RelatedWork / RadarSignal  (CAW-05 intake, typed — not loose summaries)
└── _events/            # append-only ledger (see below) — mirrors every skill-wrap write
```

Imported-artifact refs `Trace`, `SimulationRun`, `Experiment` (ADR-0003) are **referenced by URI** from
`evidence/` entities and physically copied into `var/vault/` (content-addressed) — they are catalogued, not
executed here (brief §5).

### Entity file naming and shape
```
knowledge/claims/<id>.md
---
id: clm_2026... # TODO(open-question: ID scheme — content-hash vs sequential slug, ADR-0002)
kind: claim
boundary: internal        # public | internal | confidential   (default-deny)
visibility: team          # team | private                      (default-private)
trust: T1                 # T0..T3 | contested  (DERIVED, never caller-set; AI capped T2)
claim_type: empirical
status: accepted          # proposed | accepted | needs_evidence | rejected
supersedes: null          # append-only edits set this to the prior id
content_hash: sha256:...  # staleness check for the derived index
created_by: agent:extractor@v1
created_at: <RFC3339>
# edges live in a generic typed set; see ADR-0003 (one edge table, graph-upgrade-ready)
edges:
  - { rel: supports, dst: ev_... }   # >=1 required — the Claim->Evidence invariant
  - { rel: about_concept, dst: cpt_... }
---
Human-readable claim note (markdown body).
```

### `_events/` — append-only ledger
```
knowledge/_events/
└── <ts>-<op>.jsonl     # e.g. 2026...-attach_evidence.jsonl
```
Every skill-wrap write appends one line: `{seq, ts, op, node_id, actor, payload}`. This is the second append-only
audit ledger alongside git history (signed commits/blame). It is **content**, versioned in git — never gitignored.
`reindex` replays it to rebuild the `event` table.

## `src/` — code (one core, thin adapters)
The transactional core owns ALL logic; adapters are thin and **codegen'd** from `manifest/` (ADR-0001).

```
src/
├── core/                       # the ONE transactional product core
│   ├── ops/                    # one module per kr.* op (add_source, attach_evidence, search, ...)
│   ├── validate/               # frontmatter schema check (invariant layer 1)
│   ├── invariant/              # Claim->Evidence enforcement (layer 2; reindex re-check = layer 3)
│   ├── evidence-gate/          # artifact_ref must resolve; no prose field (ADR-0004)
│   ├── boundary/               # monotone boundary/visibility propagation (ADR-0004)
│   ├── trust/                  # derived T0..T3 + contested ladder; AI-cap T2
│   ├── audit/                  # _events append + git-commit driver (signed)
│   ├── store/                  # file read/write (gray-matter + yaml); write-order tx (ADR-0002 §6)
│   └── retrieval/              # FTS5 query + structured filter + chain hydration (ADR-0006)
│
├── index/                      # the DERIVED SQLite index layer
│   ├── schema/                 # portable-subset table defs (node, edge, event)
│   ├── reindex/                # deterministic, idempotent rebuild from knowledge/** (the safety net)
│   └── query/                  # portable SQL (recursive CTE traversal; SQLite==Postgres)
│
├── adapters/                   # THIN, codegen'd — add NO logic (ADR-0001)
│   ├── api/                    # HTTP adapter
│   ├── mcp/                    # MCP server (primary agent surface)
│   ├── cli/                    # CLI (humans + scripts; reindex, import/export, audits)
│   └── viewer/                 # optional read-only viewer over search()
│
├── boundary-io/                # import/export over file/API boundaries (ADR-0007)
│   ├── envelope/               # versioned envelope validator + semver gate
│   ├── redact/                 # re-redaction ruleset (import AND export)
│   ├── import-caw01/           # projection -> Evidence (quarantine, vault copy, kind-based trust)
│   ├── import-caw05/           # signal -> Source/Claim/RelatedWork/OpenQuestion (raw_summary != evidence)
│   └── export-caw03/           # fail-closed cited Claim+Evidence bundle (sign + digest)
│
└── codegen/                    # manifest -> adapters + JSON Schema generator
```

Note: `import-*`/`export-*` are also exposed as **vetted `kr.*` skill ops** (`kr.import_projection`,
`kr.export_bundle`) — `boundary-io/` holds the boundary mechanics, but all writes route through `core/` so there
is no raw path bypassing enforcement (ADR-0007 §6).

## `manifest/` and `schemas/`
```
manifest/
└── ops.ts                  # the single op manifest: each kr.* op (zod in/out + metadata)

schemas/
├── frontmatter/            # zod schema per entity kind (invariant layer 1 contract)
└── boundary/               # envelope + payload schemas CAW-02 owns (ADR-0007; no shared registry)
```

## `migrations/`
FTS and vectors are isolated so retrieval choices never threaten portability (ADR-0002 §3, ADR-0006).
```
migrations/
├── 0001_core.sql           # node, edge, event (PORTABLE subset: TEXT/INTEGER/TIMESTAMP, FK, CHECK)
├── 0002_fts.sql            # FTS5 virtual table + filter columns  (DROPPABLE)
└── 0003_vec.sql.reserved   # nullable node_vec sidecar — RESERVED, UNUSED in v0  (DROPPABLE)
```

## `var/` — runtime, non-canonical
```
var/
├── quarantine/   # imports land here first; promoted to knowledge/ only after checks pass (ADR-0007)
├── vault/        # content-addressed copies of large imported artifacts (referenced by URI)
└── exports/      # signed bundles emitted to CAW-03 (CAW-02 emits; CAW-03 pulls)
```

## What is canonical vs derived (the load-bearing distinction)
| Path | Canonical? | In git? | Rebuildable? |
|---|---|---|---|
| `knowledge/**/*.md` | **Yes (SoT)** | Yes | No — it IS the truth |
| `knowledge/_events/*.jsonl` | **Yes (ledger)** | Yes | Append-only; not rebuilt |
| `.index/index.sqlite` | No (derived) | No (gitignored) | **Yes — `reindex`** |
| `var/vault/**` | Reference copies | Policy-dependent | Re-importable |
| `var/quarantine`, `var/exports` | No (transient) | No | Regenerated |

## Open Questions
- `TODO(open-question: ID scheme — content-addressed hash vs sequential slug, ADR-0002)`
- `TODO(open-question: monorepo tool / workspace layout for src subpackages, tech-stack.md)`
- `TODO(open-question: should var/vault be committed (LFS) or kept external; boundary/size tradeoff)`
- See [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md).

## Implications for runbooks
- A **scaffold RB** creates this tree (content dirs + `src/` skeleton + `migrations/`) leaving it green.
- The **reindex RB** lives at `src/index/reindex/` and proves byte-identical rebuild from `knowledge/**`.
- Ingest/skill-wrap RBs implement the write-order transaction in `core/store/` + `core/audit/`.
- Boundary RBs implement `boundary-io/` with quarantine→`var/vault/`→`knowledge/` promotion and fail-closed export.
