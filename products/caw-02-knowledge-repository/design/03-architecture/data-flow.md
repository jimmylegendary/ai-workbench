# Data Flow — write, retrieve, import/export

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [./tech-stack.md](./tech-stack.md)
  - [./repo-structure.md](./repo-structure.md)
  - [../01-decisions/ADR-0001-product-surface-and-skill-interface.md](../01-decisions/ADR-0001-product-surface-and-skill-interface.md)
  - [../01-decisions/ADR-0002-storage.md](../01-decisions/ADR-0002-storage.md)
  - [../01-decisions/ADR-0005-ingestion-pipeline.md](../01-decisions/ADR-0005-ingestion-pipeline.md)
  - [../01-decisions/ADR-0006-retrieval.md](../01-decisions/ADR-0006-retrieval.md)
  - [../01-decisions/ADR-0007-import-export-contracts.md](../01-decisions/ADR-0007-import-export-contracts.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
This doc traces the **runtime data flows** through CAW-02's single transactional core: (1) a skill-wrap **write**
(file write → `_events` append → reindex), (2) a **retrieval** (FTS + filters → provenance hydration → citation),
and (3) **import/export** (quarantine→redact→map→nodes / select→redact→sign→bundle). It shows how the ADR
decisions compose at runtime. It does NOT re-decide storage layout (ADR-0002), the entity/edge model (ADR-0003),
or wire formats (ADR-0007) — it sequences them. ASCII sequences are normative for ordering; field lists are
illustrative and defer to the ADRs.

## Actors and components (shared by all flows)
| Component | Role |
|---|---|
| **Adapter** (API / MCP / CLI) | Thin, codegen'd from the op manifest; parses the request, calls one core op, returns the result. Adds no logic (ADR-0001). |
| **Core (skill-wrap)** | The ONE transactional owner: validation, evidence gate, trust recompute, boundary propagation, audit append. Every surface routes here. |
| **Files** | `knowledge/**/*.md` — the single source of truth (ADR-0002). |
| **`_events`** | Append-only `knowledge/_events/<ts>-<op>.jsonl` ledger, mirrors every write. |
| **Index** | Derived, disposable SQLite: `node`, `edge`, `event`, FTS5, reserved `node_vec`. Rebuildable by `reindex`. |
| **git** | Signed commits / blame = the second append-only audit ledger. |

Golden rule (ADR-0002 §6 write order): **file → index → `_events` → validate → commit**; a failed validation
**aborts the whole transaction** (no orphan files/rows/events).

---

## Flow 1 — Skill-wrap write (e.g. `kr.attach_evidence`)
A write is append-only + supersedes (no update/delete). Agent writes are confirmation-by-default (ADR-0001).

```
Caller (human/agent)
   │  op + payload (e.g. attach_evidence{claim_id, artifact_ref, stance})
   ▼
┌──────────┐  validated request   ┌───────────────────────────────────────────┐
│ Adapter  │ ───────────────────► │ CORE (skill-wrap, single transaction)       │
│ API/MCP/ │                      │                                             │
│  CLI     │ ◄─── confirm? ─────► │ 0. authz + confirmation gate (agent=ask)    │
└──────────┘   (agent default)    │ 1. SCHEMA validate frontmatter contract     │
                                  │ 2. EVIDENCE GATE: artifact_ref MUST resolve │
                                  │    to a real artifact; NO prose field       │
                                  │ 3. boundary/visibility MONOTONE propagate   │
                                  │ 4. trust recompute (T0..T3, AI-capped T2)   │
                                  │ 5. INVARIANT: every claim has >=1 supports  │
                                  │    edge to evidence  (layer 2 of 3)         │
                                  └───────────────┬─────────────────────────────┘
                                                  │ all checks pass
        ┌─────────────────────────────────────────┼───────────────────────────┐
        ▼ (a) write file                           ▼ (b) mirror index           ▼ (c) append event
  knowledge/evidence/<id>.md             node/edge upsert in SQLite     _events/<ts>-attach_evidence.jsonl
  (YAML frontmatter + body)              (content_hash recorded)        (op, node_id, payload, actor)
        │                                          │                           │
        └───────────────────────┬──────────────────┴───────────────────────────┘
                                 ▼ (d) post-write re-validate (layer 3: reindex re-check semantics)
                                 ▼ (e) git commit (signed)  ── COMMIT POINT ──
                                 ▼ failure at ANY step before (e) → ROLLBACK: discard file/rows/event
                                 ▼
                          Adapter ◄── {id, status, trust, boundary}  ──► Caller
```

### Notes
- **Append-only + supersedes:** an "edit" writes a new `.md` with `supersedes: <old_id>`; the old file is never
  mutated or deleted, so git blame and `_events` stay a faithful ledger.
- **Three-layer invariant (ADR-0003):** (1) frontmatter schema rejects a malformed contract; (2) the core
  validator enforces Claim→Evidence at write; (3) `reindex` re-checks the same rule from files — identical on
  SQLite/Postgres. The write flow exercises layers 1–2; Flow-adjacent `reindex` exercises layer 3.
- **Evidence gate (ADR-0004):** `attach_evidence` has no prose field; a `Note`/summary can never be an
  `artifact_ref`. If `artifact_ref` does not resolve, the claim stays `needs_evidence` and never auto-promotes.
- **Trust is derived, never caller-set:** the caller cannot pass `trust`; the core recomputes it (AI-authored
  capped at T2). A `refutes` stance landing on an accepted claim auto-raises an `OpenQuestion` (ADR-0005 B5).

### reindex (the safety net, ADR-0002)
`reindex` is deterministic and idempotent: drop the SQLite file, walk `knowledge/**`, re-parse frontmatter,
rebuild `node`/`edge`/`event`/FTS, and **re-run the Claim→Evidence invariant**. A `content_hash` mismatch on read
means the index is stale ⇒ rebuild; a row is never silently trusted.

```
reindex:  drop index.sqlite ─► scan knowledge/**/*.md ─► parse frontmatter ─► upsert node/edge
                            ─► replay _events for event table ─► build FTS5 ─► re-check invariant ─► fsync
result:   byte-identical query results vs prior good index (acceptance check)
```

---

## Flow 2 — Retrieval (`kr.search`)
Boundary/scope filters run **before** ranking, so confidential items cannot leak (ADR-0006 §2). Results carry the
hydrated provenance chain; RAG is citation-constrained.

```
Caller ──► Adapter ──► CORE.search(query, filters{boundary,visibility,kind,concept,trust})
                              │
                              ▼ 1. STRUCTURED FILTER (SQL WHERE) — applied BEFORE ranking
                              │      boundary <= caller_clearance AND visibility ok AND kind/concept/trust
                              ▼ 2. FTS5 BM25 rank over the filtered candidate set
                              ▼ 3. PROVENANCE HYDRATION via edge traversal (always on):
                              │      Source ──extracted_from──► Evidence ──supports──► Claim ──cites──► Note
                              ▼ 4. assemble RetrievalHit[] (chain + trust + boundary + locator + score)
                              │
            ┌─────────────────┴───────────────────────────┐
            ▼ default: return ranked hits (NO generation)  ▼ opt-in: citation-constrained synthesis
   RetrievalHit{item, chain,                       boundary filter FIRST → generate → every
     trust, boundary, scope,                       sentence cites >=1 evidence_id → uncited =>
     locator, score}                               flagged `unsupported`, never returned as fact
                                                   → kept synthesis stored as cited Note (generated=true),
                                                     NEVER as Evidence
            └─────────────────┬───────────────────────────┘
                              ▼
                       Adapter ──► Caller  (structured envelope, never an opaque string)
```

### Notes
- **No embeddings in v0** (ADR-0006). `node_vec` sidecar is reserved but unused; add `sqlite-vec`/`pgvector` only
  when a measured trigger (A–D) fires.
- A retrieval **never mutates** state, except the explicit "keep this synthesis" path, which routes back through
  **Flow 1** to persist a cited `Note` (so even a saved answer obeys the evidence gate).
- `locator` points at where evidence physically lives (path/URI), enabling a reader to walk note→claim→
  evidence→source without re-running the LLM.

---

## Flow 3a — Import (CAW-01 projection / CAW-05 signal → nodes)
Quarantine-on-import; re-redact regardless of producer claims; map to nodes; never trust a generated summary as
evidence (ADR-0007). CAW-01/05 are **separate, independent products**; this is a file/API boundary, no shared store.

```
Foreign file (envelope.json / *.caw05.jsonl)   [from CAW-01 or CAW-05, separate products]
        │
        ▼ kr.import_projection / signal-intake (a vetted skill action — same checks as humans)
┌───────────────────────────────────────────────────────────────────────┐
│ 1. QUARANTINE: land in import quarantine; do NOT touch knowledge/ yet   │
│ 2. ENVELOPE VALIDATE: schema + semver (reject unknown MAJOR)            │
│ 3. SIGNATURE / payload_sha256 check; dedup by hash                      │
│ 4. CONFIDENTIALITY CHECK:                                               │
│      - boundary FLOOR: imported >= declared_boundary (clamp stricter)   │
│      - confidential-field scrub; jimmy-private never auto-shared        │
│      - RE-REDACT regardless of producer's redaction_applied            │
│      - leak scan (codename/fab/customer markers); internal-host URLs    │
│    indeterminate => keep in quarantine for curator, do NOT import       │
│ 5. VAULT COPY: content-addressed copy / stable URI CAW-02 controls      │
│ 6. MAP TO NODES (preserves invariant):                                  │
│      CAW-01 projection → Evidence (NEVER a Claim); curator writes claim │
│      CAW-05 signal     → Source (+ ClaimCandidate[]); raw_summary kept  │
│                          as kind=generated-summary, EXCLUDED as evidence│
│      classification threat|support → typed RelatedWork edge to Claim    │
│      threat on accepted Claim → auto-raise OpenQuestion + notify        │
└───────────────────────────────────┬───────────────────────────────────┘
                                     ▼ each mapped node flows through FLOW 1 (write order + invariant + audit)
                              knowledge/**/*.md  +  _events  +  index  +  git commit
```

---

## Flow 3b — Export (cited Claim+Evidence bundle → CAW-03)
Fail-closed allow-list using monotone boundary propagation. CAW-02 **emits** a signed bundle on explicit curator
action; CAW-03 pulls it. CAW-02 never writes into CAW-03 (ADR-0007 §4).

```
Curator: kr.export_bundle(claim_ids[], target_audience)
        │
        ▼
┌───────────────────────────────────────────────────────────────────────┐
│ 1. SELECT: resolve claims + their Evidence + cited Notes + bibliography │
│ 2. EVIDENCE CHECK: each Claim ships >=1 concrete Evidence;              │
│      a claim with no / only generated-summary evidence => REFUSED       │
│ 3. EFFECTIVE-BOUNDARY (monotone propagation, not row's own flag):       │
│      target_audience=public => DROP every entity whose effective        │
│      boundary != public; jimmy-private NEVER exported                   │
│ 4. REDACT SWEEP over text/locator/citation strings; conflation guard    │
│      (no fusing public Source + confidential projection as one evidence)│
│ 5. model-projection evidence keeps CI/unit (not presented as measure);  │
│      Notes tagged kind=synthesis, evidence=false                        │
│ 6. SIGN + provenance_digest over canonicalized payload                  │
│                                                                         │
│  ANY check indeterminate => item EXCLUDED.                              │
│  Empty bundle, OR an explicitly-requested confidential/jimmy-private    │
│  item in a public bundle => ABORT whole export + report offending ids.  │
└───────────────────────────────────┬───────────────────────────────────┘
                                     ▼
                       signed bundle file (envelope, boundary_kind=caw03-bundle)
                                     ▼  (CAW-03 pulls; CAW-02 logs a per-crossing audit entry)
```

### Notes
- Both directions write a **per-crossing audit log entry** and pass through the same envelope validator
  (ADR-0007 §1). Re-imports dedup by `payload_sha256`.
- Importers/exporters are **vetted skill actions** (`kr.import_projection`, signal intake, `kr.export_bundle`):
  no raw path bypasses confidentiality enforcement (ADR-0007 §6) — they reuse Flow 1's write order and audit.

## Open Questions
- `TODO(open-question: confirmation-by-default UX for agent writes — per-op vs per-session; tracked in ADR-0001)`
- `TODO(open-question: how _events JSONL and git history reconcile if files are edited outside the skill interface — ADR-0002)`
- `TODO(open-question: signature scheme for export bundles — minisign/cosign/DSSE — ADR-0007)`
- See [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md).

## Implications for runbooks
- The **write-order** sequence (file→index→`_events`→validate→commit, abort-on-fail) is the contract every
  ingest/skill-wrap RB implements; `reindex` is its safety net and an acceptance check (byte-identical results).
- The **search** RB returns the `RetrievalHit` envelope with pre-ranking boundary/scope filter + chain hydration.
- Import/export RBs implement quarantine→redact→map and select→redact→sign→bundle with fail-closed behaviour.
