# Tech Stack — concrete choices for CAW-02 v0

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [./data-flow.md](./data-flow.md)
  - [./repo-structure.md](./repo-structure.md)
  - [../01-decisions/ADR-0001-product-surface-and-skill-interface.md](../01-decisions/ADR-0001-product-surface-and-skill-interface.md)
  - [../01-decisions/ADR-0002-storage.md](../01-decisions/ADR-0002-storage.md)
  - [../01-decisions/ADR-0006-retrieval.md](../01-decisions/ADR-0006-retrieval.md)
  - [../01-decisions/ADR-0007-import-export-contracts.md](../01-decisions/ADR-0007-import-export-contracts.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
This doc picks the **concrete, opinionated technology stack** that realizes the ADRs for v0: language/runtime,
git+markdown storage, the SQLite FTS5 index, the codegen path for thin adapters, the MCP server, and the CLI. It
states *why* each choice fits the digest and leaves exact version pins as `TODO`. It does NOT re-decide
architecture (the ADRs do) — it names the tools that implement it. Where a choice is genuinely open it is marked
`TODO(open-question)`.

## Constraints that drive the stack (from the digest)
1. **One transactional core owns all logic; adapters are thin and codegen'd from one op manifest** (ADR-0001).
   → The core's language must have first-class codegen + a strong type system to share one schema across API/MCP/CLI.
2. **Markdown-in-git is the source of truth; SQLite is a derived, disposable index** (ADR-0002).
   → Need ergonomic YAML+markdown parsing and an embeddable SQL engine with FTS5; no DB server in v0.
3. **One deployable unit, single curator + small team + a few agents** (brief §3, ADR-0002).
   → Favor an in-process, single-binary-ish deployment over services.
4. **Portable-subset schema; Postgres/Apache-AGE is a future swap, not a rewrite** (ADR-0002).
   → SQL access layer must keep to the SQLite∩Postgres subset and isolate FTS/vector behind droppable migrations.
5. **MCP server is a primary surface for agents** (brief §4).
   → Pick a language with a maintained, first-party MCP SDK.

## Decision — language & runtime
| Candidate | Pros | Cons | Fit |
|---|---|---|---|
| **TypeScript / Node** | First-party MCP SDK; superb codegen ecosystem (zod→JSON-Schema→types); great YAML/markdown libs; one language for core+adapters+optional viewer; `better-sqlite3` gives synchronous, transactional SQLite | Single-threaded for CPU-heavy parse (mitigated: GROBID is a separate process) | **Chosen** |
| Go | Single static binary; strong concurrency | MCP SDK less mature; codegen more manual; heavier for a viewer UI | Strong alt; reconsider if a single static binary becomes a hard requirement |
| Python | Best ML/embedding ecosystem (future) | Weaker compile-time types for the manifest→adapter codegen; packaging friction | Use for the **parser/extractor sidecar**, not the core |
| Rust | Fastest, safest single binary | Slowest to build the breadth here at v0 | Overkill for v0 scale |

**Chosen: TypeScript on Node.** One language spans the transactional core, the three codegen'd adapters, and the
optional read-only viewer; the manifest-driven codegen story is strongest here; the MCP SDK is first-party.
LLM-heavy parsing/extraction (GROBID, schema-constrained extraction) runs as a **separate process/sidecar** so it
never blocks the core's transaction (ADR-0005).

- `TODO(open-question: pin Node LTS — e.g. 20.x vs 22.x; choose at runbook time)`
- `TODO(open-question: package manager + monorepo tool — pnpm workspaces vs npm; pin versions)`

## Decision — storage: git + markdown (source of truth)
| Concern | Choice | Why |
|---|---|---|
| Canonical store | **markdown files in a git repo** | Diff/blame/signed-commit audit; survives a product rewrite (ADR-0002) |
| Per-entity contract | **YAML frontmatter + markdown body** | Machine contract + human note in one diffable file |
| Frontmatter parse | **`gray-matter`** (front-matter split) + **`yaml`** (typed parse) | Mature, lossless enough for round-trip; `TODO(open-question: verify key-order/round-trip stability for deterministic reindex)` |
| Schema validation | **`zod`** schemas → the frontmatter contract (layer 1 of the 3-layer invariant) | Same schema feeds codegen + runtime validation |
| Event ledger | **append-only JSONL** `knowledge/_events/<ts>-<op>.jsonl` | Mirrors every write; cheap, greppable, replayable |
| git access | **`git` CLI** invoked by the core (signed commits) | No need for a libgit2 binding in v0; `TODO(open-question: commit-signing key management for agents vs humans)` |

No ORM over the files: the **files are the model**; the SQLite index is rebuilt from them.

## Decision — derived index: SQLite + FTS5
| Concern | Choice | Why |
|---|---|---|
| Engine | **SQLite (embedded)** via **`better-sqlite3`** | Synchronous, transactional, single-file; no server; one deployable unit (ADR-0002, ADR-0006) |
| Core tables | `node`, `edge`, `event` (portable subset: `TEXT/INTEGER/TIMESTAMP`, FK, CHECK) | Graph-upgrade-ready; ports to Postgres unchanged (ADR-0002 §3) |
| Full-text | **FTS5 (BM25)** in a **separate, droppable migration** | Keyword/jargon recall; deterministic, inspectable; SQL boundary-filterable (ADR-0006) |
| Vectors | **reserved nullable `node_vec` sidecar; UNUSED in v0** | Add `sqlite-vec` only on a measured trigger (ADR-0006) |
| Migrations | plain numbered SQL files + a tiny runner | FTS/vector isolated so portability is never threatened |
| Portability lint | a **portable-subset SQL lint** as an acceptance check | Keeps core schema inside SQLite∩Postgres |

- The index is **disposable**: `reindex` drops and rebuilds it deterministically; a `content_hash` mismatch ⇒ stale ⇒ rebuild.
- `TODO(open-question: pin better-sqlite3 + bundled SQLite version; confirm FTS5 compiled in the distributed build)`
- `TODO(open-question: sqlite-vec vs pgvector when the embeddings trigger fires — deferred, ADR-0006)`

## Decision — one op manifest → codegen'd thin adapters
The core exposes a single **op manifest** (the `kr.*` operations: `add_source`, `extract_claims`,
`attach_evidence`, `synthesize_note`, `classify_signal`, `search`, `import_projection`, `export_bundle`, …). Each
op is defined once (input/output `zod` schema + metadata). Adapters are **generated**, adding no logic (ADR-0001).

```
                 op-manifest (zod schemas + op metadata, single source)
                 ┌──────────────┬───────────────┬──────────────────┐
                 ▼              ▼               ▼                  ▼
            JSON Schema    OpenAPI/types     MCP tool defs      CLI commands
                 │              │               │                  │
                 ▼              ▼               ▼                  ▼
            (validation)   API adapter      MCP adapter        CLI adapter
                            (thin)            (thin)             (thin)
                 └──────────────┴───────────────┴──────────────────┘
                                  all call → CORE op (single transaction)
```

| Concern | Choice | Why |
|---|---|---|
| Op schema | **`zod`** | One schema → runtime validation + `zod-to-json-schema` for everything downstream |
| JSON Schema | **`zod-to-json-schema`** | Feeds MCP tool defs, API docs, manifest export |
| Codegen | a small in-repo generator over the manifest | Adapters add nothing; regenerated, not hand-edited (ADR-0001) |
| `TODO` | `TODO(open-question: generate OpenAPI from zod vs hand-keep a thin spec; pin tooling)` |

## Decision — surfaces
| Surface | Tool | Why / notes |
|---|---|---|
| **MCP server** | **`@modelcontextprotocol/sdk`** (TS, first-party) | Primary agent surface; tools generated from the manifest; confirmation-by-default for writes (ADR-0001) |
| **API** | **HTTP via a minimal framework** (`TODO(open-question: Fastify vs Hono vs bare node:http)`) | Typed adapter; thin; same ops |
| **CLI** | **`commander`** (or `clipanion`) — `TODO(open-question: pin)` | Human + script surface; same ops; good for `reindex`, import/export, audits |
| **Viewer (optional, read-only)** | static-render or a tiny SPA over `search()` | Browse Source/Claim/Evidence/Note + links + trust; rich editing is a non-goal (brief §4, §9) |

## Decision — ingestion sidecar tools
| Stage | Tool | Why |
|---|---|---|
| PDF parse | **GROBID** (PDF→TEI), LLM fallback for garbled PDFs | Deterministic, re-runnable; locators survive re-parse (ADR-0005) |
| Article parse | readability → markdown | Structured blocks with stable `block_id`/`char_span` |
| Claim extraction | **schema-constrained LLM** (emit JSON; mandatory `supporting_block_ids`) | Blocks the no-provenance case at the schema layer (ADR-0005) |
| Hashing | `sha256` (node:crypto) | Source dedup + idempotency key |

LLM/provider choice for extraction/synthesis is deliberately abstracted behind the sidecar and is
`TODO(open-question: extraction/synthesis model + provider; must honor confidential-boundary locality — see ADR-0006)`.
When CAW-02 itself calls an Anthropic model for extraction/synthesis, pin via the official SDK and current model
ids (consult the claude-api reference at build time rather than hard-coding here).

## Cross-product boundaries (no shared substrate)
Import/export use **versioned JSON envelopes + JSONL** validated by CAW-02's **own** boundary schemas (ADR-0007).
CAW-01/03/05 are separate, independent products reached only over file/API boundaries — no shared DB, registry,
queue, or runtime. Bundle signing: `TODO(open-question: minisign vs cosign vs DSSE — ADR-0007)`.

## Deployment shape
- **One deployable unit:** the TS core + adapters as a single package; the knowledge **repo (git)** alongside; one
  local **`index.sqlite`** rebuilt by `reindex`. GROBID runs as an optional companion process for ingestion only.
- No server database in v0. Postgres (+ optional Apache AGE) is the **future swap**, gated on concurrent writers /
  index contention (ADR-0002 revisit triggers) — same portable schema, not a data rewrite.

## Version-pin checklist (all `TODO`, set at runbook time)
- `TODO(open-question: Node LTS)` · `TODO(open-question: pnpm/npm)` · `TODO(open-question: typescript)`
- `TODO(open-question: better-sqlite3 + bundled SQLite/FTS5)` · `TODO(open-question: zod + zod-to-json-schema)`
- `TODO(open-question: @modelcontextprotocol/sdk)` · `TODO(open-question: HTTP framework)` · `TODO(open-question: CLI lib)`
- `TODO(open-question: GROBID image/version)` · `TODO(open-question: gray-matter + yaml)` · `TODO(open-question: signing tool)`

## Open Questions
- `TODO(open-question: single static binary requirement — if it appears, revisit Go for the core)`
- `TODO(open-question: viewer rendering approach — static export vs minimal SPA)`
- See [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md).

## Implications for runbooks
- A **scaffold RB** pins the versions above and stands up the workspace (core + adapters + manifest codegen).
- A **schema/migrations RB** builds portable-subset core tables + FTS5 (droppable) + reserved `node_vec`, with the
  portable-SQL lint as an acceptance check.
- A **codegen RB** turns the op manifest into the API/MCP/CLI adapters (regenerate, never hand-edit).
- An **ingestion-sidecar RB** wires GROBID + the schema-constrained extractor as a separate process.
