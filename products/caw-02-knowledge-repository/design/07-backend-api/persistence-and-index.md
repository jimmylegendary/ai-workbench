# Persistence & Index — md-git Repo, Reindex, Events Writer, Artifact Vault

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:**
  - [./api-surface.md](./api-surface.md)
  - [./ingestion-service.md](./ingestion-service.md)
  - [./retrieval-service.md](./retrieval-service.md)
  - [../01-decisions/ADR-0002-storage.md](../01-decisions/ADR-0002-storage.md)
  - [../01-decisions/ADR-0003-knowledge-data-model.md](../01-decisions/ADR-0003-knowledge-data-model.md)
  - [../01-decisions/ADR-0004-provenance-and-trust.md](../01-decisions/ADR-0004-provenance-and-trust.md)
  - [../01-decisions/ADR-0006-retrieval.md](../01-decisions/ADR-0006-retrieval.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
Describe the **persistence layer the core services write through**: the markdown-in-git file repository (the single
source of truth), the deterministic reindex into SQLite (a derived, disposable index), the append-only `_events`
writer, and the content-addressed artifact-by-path store. It elaborates ADR-0002; it never redefines it. It does
NOT define operation signatures (see [api-surface.md](./api-surface.md)), pipeline behavior (see
[ingestion-service.md](./ingestion-service.md)), or ranking (see [retrieval-service.md](./retrieval-service.md)).

## Layer model

```
                 ┌─────────────────────────────────────────────┐
core txn ──────▶ │ FileRepo  (knowledge/**.md)  = SOURCE OF TRUTH│ ── git: signed commits + blame (audit ledger #2)
                 └─────────────────────────────────────────────┘
                        │ mirror                 │ append
                        ▼                         ▼
                 ┌──────────────┐         ┌──────────────────────┐
                 │ SQLite Index │◀─reindex│ _events/*.jsonl       │ (audit ledger #1, hash-chained)
                 │ (disposable) │  (rebuild)└──────────────────────┘
                 └──────────────┘
                        ▲ artifact_uri
                 ┌──────────────────────┐
                 │ Artifact Vault (CAS) │  large blobs by sha256 (NOT inlined)
                 └──────────────────────┘
```

**Files are canonical. SQLite is authoritative for nobody** (ADR-0002 §2): a `content_hash` mismatch on read means
the index is stale ⇒ rebuild; never silently trust a row.

## 1. FileRepo — markdown over git

Each entity is **one `.md` = YAML frontmatter (machine contract) + markdown body (human note)** under
`knowledge/{sources,claims,evidence,notes,concepts,interests,decisions,open-questions,assumptions,signals}/`
(ADR-0002 §1).

```yaml
---
id: clm_0xab12                       # ADR-0002 ID scheme TODO(open-question)
kind: claim                          # one of the entity kinds (ADR-0003)
boundary: internal                   # public|internal|confidential (default-deny)
visibility: team                     # team|private (default-private)
trust: T2                            # DERIVED; written by reindex/recompute, not by hand
artifact_uri: null                   # path/URI for Source/Evidence; large blobs live in the vault
content_hash: sha256:...             # of canonicalized frontmatter+body; staleness check
created_at: 2026-01-01T00:00:00Z     # TODO(open-question: real timestamps at build time)
edges:                               # typed edges authored on the source node
  - { rel: supports, dst: evd_0x99 }
  - { rel: about,    dst: src_0x07 }
supersedes: null                     # append-only correction pointer (ADR-0001 §C)
---
The claim text / human note body.
```

`FileRepo` API (consumed by the core txn):

```ts
interface FileRepo {
  write(node: NodeFile): { file_path: string; content_hash: string }  // canonicalize + write
  read(id: Id): NodeFile | null
  list(kind?: Kind): NodeFile[]
  commit(msg: string, files: string[]): { git_sha: string }           // signed commit (audit #2)
}
```

Canonicalization (stable key order, normalized line endings) makes `content_hash` deterministic so the same logical
content always hashes identically — this is what lets reindex verify staleness and lets imports dedup by hash.

## 2. SQLite index — derived, disposable, portable-subset

Core tables use only the SQLite∩Postgres subset (`TEXT/INTEGER/TIMESTAMP`, surrogate `TEXT` ids, FK, CHECK) so the
schema ports to Postgres unchanged (ADR-0002 §3). The generic typed `edge` table is the graph-upgrade keystone.

```sql
CREATE TABLE node (
  id           TEXT PRIMARY KEY,
  kind         TEXT NOT NULL,
  boundary     TEXT NOT NULL DEFAULT 'confidential'   -- default-deny
                 CHECK (boundary IN ('public','internal','confidential')),
  visibility   TEXT NOT NULL DEFAULT 'private'         -- default-private
                 CHECK (visibility IN ('team','private')),
  trust        TEXT NOT NULL DEFAULT 'T0'
                 CHECK (trust IN ('T0','T1','T2','T3','contested')),
  owner        TEXT,
  artifact_uri TEXT,
  file_path    TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  created_at   TIMESTAMP NOT NULL
);
CREATE TABLE edge (
  src_id TEXT NOT NULL REFERENCES node(id),
  dst_id TEXT NOT NULL REFERENCES node(id),
  rel    TEXT NOT NULL,
  PRIMARY KEY (src_id, dst_id, rel)
);
CREATE TABLE event (                                   -- mirror of _events JSONL
  seq     INTEGER PRIMARY KEY,
  ts      TIMESTAMP NOT NULL,
  op      TEXT NOT NULL,
  node_id TEXT,
  payload TEXT NOT NULL,                               -- JSON
  prev_hash TEXT, hash TEXT NOT NULL                   -- hash chain
);
```

FTS5 and the reserved `node_vec` vector sidecar live in **separate, droppable migrations** so retrieval choices
never threaten portability (ADR-0002 §3, ADR-0006 §1/§6). Dropping and rebuilding them is always safe.

### Claim→Evidence invariant in the index
A portable FK cannot express "≥1 typed edge", so the invariant is enforced in **three lockstep layers** (ADR-0003):
frontmatter schema, core validator (ingest), and the **reindex re-check** — every `kind='claim'` must have ≥1
`edge(rel='supports')` to an `evidence` node. Reindex fails loud if a durable claim lacks evidence.

## 3. Reindex — deterministic, idempotent rebuild

`reindex` drops the SQLite file and rebuilds it from `knowledge/**` so query results are byte-identical to a fresh
build (ADR-0002 Implications). It is the safety net the whole design leans on.

```
reindex():
  1. drop + recreate schema (core tables, then FTS/vector migrations)
  2. for each .md in knowledge/**:
       parse frontmatter; recompute content_hash; assert matches stored hash (else WARN stale source)
       upsert node row; stage edges
  3. insert edges; verify referential integrity (no dangling dst)
  4. RE-CHECK Claim→Evidence invariant  → fail loud on violation (lists offending ids)
  5. recompute DERIVED trust per node (ladder T0–T3 + contested; AI-authored capped at T2 — ADR-0004)
  6. replay _events/*.jsonl into event table; verify hash chain continuity
  7. rebuild FTS5 from node text; leave node_vec empty (v0)
```

Properties: **deterministic** (same files ⇒ same DB), **idempotent** (rerun ⇒ same DB), **non-destructive to SoT**
(only the index is dropped). Trust and FTS are recomputed here, never trusted from the index.

## 4. `_events` writer — append-only audit ledger

Every skill-wrap write mirrors to `knowledge/_events/<ts>-<op>.jsonl` (one JSON object per line) and into the
`event` table, hash-chained (ADR-0002 §1, AuditService in [api-surface.md](./api-surface.md)).

```json
{"seq":42,"ts":"2026-01-01T00:00:00Z","op":"attach_evidence",
 "node_id":"clm_0xab12","actor":{"kind":"agent","id":"..."},
 "payload":{"evidence_id":"evd_0x99","rel":"supports"},
 "prev_hash":"sha256:...","hash":"sha256:..."}
```

`hash = sha256(prev_hash + canonical(record_without_hash))` ⇒ tamper-evidence; `verify_audit` walks the chain
(`AuditService.verify_audit`). Git history (signed commits, blame) is the **second** append-only ledger; the two are
kept in lockstep by the fixed write order.

## 5. Fixed write order (the core txn)

ADR-0002 §6 — a failed validation aborts the whole transaction; no orphan files, no half index, no dangling event.

```
1. FileRepo.write(node)               # canonicalize → file + content_hash
2. mirror to SQLite index (node/edge upsert)
3. append _events JSONL + event row (hash-chained)
4. VALIDATE: schema + evidence gate + Claim→Evidence + boundary monotonicity
5. on success: git commit (signed); on failure: roll back file + index + event  → Envelope.error
```

## 6. Artifact vault — large blobs by path/URI

Large imported artifacts (CAW-01 projections/traces) are **never inlined** (ADR-0002 §7, ADR-0007 §1). They are
copied into a content-addressed vault CAW-02 controls and referenced by `artifact_uri`; the `sha256` is stored for a
later integrity check, so reconstructability never depends on a foreign system being up.

```
artifacts/<sha256[:2]>/<sha256>      # content-addressed; dedups identical imports
node.artifact_uri = "artifact://<sha256>"   # or stable external URI
```

## Concurrency & failure model
Single-writer index lock at v0 scale; team write-concurrency is git PR/merge on files until the Postgres port
(ADR-0002 revisit trigger). Direct file edits **outside** the skill interface can drift `_events` from git — a
known hazard; reindex's hash-mismatch warnings surface it. Upgrade path is engine/query swap (Postgres `tsvector`,
then Apache AGE openCypher over the same `edge` table), **not** a data rewrite — files stay canonical at every step.

## Open Questions
- `TODO(open-question: ID scheme — content-addressed hash vs sequential slug — ADR-0002)`
- `TODO(open-question: team write-concurrency — git PR/merge vs serializing write-through API; Postgres-port trigger)`
- `TODO(open-question: reconcile _events JSONL vs git history when files are edited outside the skill interface)`
- `TODO(open-question: real timestamp source at build time; do not invent dates)`
- See [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md).

## Implications for runbooks
- **RB (reindex first):** deterministic, idempotent rebuild from `knowledge/**`; byte-identical query results;
  Claim→Evidence re-check fails loud; portable-SQL lint as acceptance.
- **RB (FileRepo + canonicalization):** one `.md` per entity; stable content_hash; signed commits.
- **RB (schema):** portable-subset core tables; FTS/vector in separate droppable migrations.
- **RB (events writer):** hash-chained `_events` JSONL + event table; `verify_audit` walks the chain.
- **RB (artifact vault):** content-addressed copy on import; integrity check by stored sha256.
