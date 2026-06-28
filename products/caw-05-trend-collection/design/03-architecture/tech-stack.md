# Tech Stack — runtime, libraries, and version pins for the radar

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [./data-flow.md](./data-flow.md), [./repo-structure.md](./repo-structure.md)
  - [../01-decisions/ADR-0001-product-surface-and-outputs.md](../01-decisions/ADR-0001-product-surface-and-outputs.md) (CLI + MCP + renderers)
  - [../01-decisions/ADR-0002-interest-model.md](../01-decisions/ADR-0002-interest-model.md) (BM25 + embedding lane)
  - [../01-decisions/ADR-0003-source-adapters-and-ingestion.md](../01-decisions/ADR-0003-source-adapters-and-ingestion.md) (source clients)
  - [../01-decisions/ADR-0006-storage-and-scheduling.md](../01-decisions/ADR-0006-storage-and-scheduling.md) (SQLite + files + cron)
  - [../02-research/scheduling-and-ports.md](../02-research/scheduling-and-ports.md) (Protocol-style ports, entry-points)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
This doc fixes the **language, libraries, and infrastructure** the AI builder uses to implement CAW-05, and lists
every dependency that needs a pinned version (as `TODO(open-question: pin ...)` — we do not invent version
numbers). It chooses concrete tools consistent with the ADRs: explainable BM25-first ranking, legal/ToS-safe
source clients, files-as-truth + SQLite, cron, and an MCP surface. It does NOT re-decide architecture (see the
ADRs) or repo layout (see [repo-structure.md](./repo-structure.md)). Independence holds: this is CAW-05's OWN
stack — no shared runtime substrate with sibling products.

## 1. Core language decision

| Option | Pros | Cons | Fit |
|---|---|---|---|
| **Python core** | richest academic/ingestion ecosystem (arXiv, S2, feedparser, rank-bm25, sentence-transformers); `Protocol` ports + `importlib.metadata` entry-points already assumed in research/ADR-0003; first-class SQLite (`sqlite3` + FTS5) | runtime packaging discipline needed | **chosen** |
| TypeScript core | one language if surfaces are JS; good MCP SDK | weaker scientific/IR libs; BM25/embedding lanes are second-class; would fight ADR-0002/0003 assumptions | rejected for core |

**Decision: Python core.** The ports research (`scheduling-and-ports.md` §4) already specifies `Protocol`-style
interfaces and PyPA entry-point discovery; ADR-0002's explainable BM25 + alpha embedding lane and ADR-0003's
source clients all live in Python's ecosystem. The MCP surface can use the Python MCP SDK (below), so no second
language is required.

## 2. Dependency map (with version-pin TODOs)
All pins are deferred — the builder pins exact versions in `pyproject.toml` and a lockfile at build time.

### 2.1 Runtime & packaging

| Concern | Choice | Pin |
|---|---|---|
| Python interpreter | CPython, modern LTS-ish line | TODO(open-question: pin Python minor, e.g. 3.x) |
| Dependency/lock manager | `uv` (fast, lockfile) or Poetry | TODO(open-question: pick + pin tooling) |
| Packaging metadata | `pyproject.toml` (PEP 621) + entry-point groups `caw05.source_adapters` / `caw05.export_adapters` / `caw05.scheduler_adapters` | TODO(open-question: confirm entry-point group names — ADR-0003 OQ) |
| Typing / validation | `pydantic` v2 for value objects (`RawFinding`…`LedgerLink`) + config | TODO(open-question: pin pydantic 2.x) |
| Lint / format / types | `ruff` + `mypy` (strict) | TODO(open-question: pin) |
| Tests | `pytest` (+ fakes for every port) | TODO(open-question: pin) |

### 2.2 Source clients (ADR-0003 — legal/ToS-safe only)

| Source family | Library / access | Legal mode | Pin |
|---|---|---|---|
| arXiv | OAI-PMH harvest + query API + per-category RSS; HTTP via `httpx`; 3 s single-connection limiter | `api` | TODO(open-question: pin httpx; confirm OAI client lib vs hand-rolled) |
| Semantic Scholar | S2 Graph/Academic API (enrich, citation cross-ref, ledger verification); exponential backoff | `api` | TODO(open-question: pin client; S2 API-key decision — ADR-0003 OQ) |
| GitHub | `releases/tags/commits.atom` + REST with ETag/`since`; honor secondary-rate-limit headers | `api` | TODO(open-question: pin GitHub client or raw httpx) |
| Blog/lab RSS | `feedparser` (Atom/RSS) + conditional GET (`ETag`/`Last-Modified`) driven by `feeds.yaml` | `publisher_feed` | TODO(open-question: pin feedparser) |
| HN (light) | Algolia HN API, metadata + link only, `created_at_i` watermark | `metadata_only_link` | TODO(open-question: pin) |
| Reddit / EDGAR / newsletters / internal | **documented stubs** — registered, `maturity="stub"`, config-disabled | n/a | n/a (no dep until wired) |

Shared HTTP concerns: one async/sync HTTP client (`httpx`), a token-bucket rate limiter per host, retry with
exponential backoff + jitter. arXiv (3 s) and EDGAR (≤10 req/s) are serialized per host, never parallelized.

### 2.3 Relevance & dedup (ADR-0002, ADR-0003 §5)

| Concern | Choice | Pin |
|---|---|---|
| BM25 ranking (v1, explainable) | `rank-bm25` (pure-Python, term-level scores feed the additive explanation) **or** SQLite FTS5 BM25 | TODO(open-question: rank-bm25 vs FTS5 BM25 as the scorer of record — pin choice) |
| Full-text index | SQLite **FTS5** (built into stdlib `sqlite3` on most builds) | TODO(open-question: confirm FTS5 compiled in target Python/SQLite) |
| Embedding lane (alpha, gated) | `sentence-transformers` + a small local model; vectors in SQLite (or `sqlite-vec`/`faiss` if needed) | TODO(open-question: pin model + vector store; gate on labeled eval set — ADR-0002) |
| Near-dup (dedup L3, flagged) | SimHash (64-bit) — `simhash` lib or hand-rolled; OFF by default | TODO(open-question: pin lib + Hamming threshold — ADR-0003 OQ) |
| Hashing (dedup L2) | stdlib `hashlib` SHA-256 over normalized title+body | none (stdlib) |

The embedding lane is **alpha and gated** (ADR-0002): it must not regress the recall-first floor, so v1 ships
BM25-first with the embedding lane behind a flag and a labeled eval gate.

### 2.4 Classification cascade (ADR-0004)

| Stage | Choice | Pin |
|---|---|---|
| Labeling functions (LF) | plain Python predicates over typed metadata (no heavy framework in v1) | none |
| LLM tier | Claude via the `anthropic` SDK; prompts produce a label + confidence + rationale (`kind=generated`, never evidence) | TODO(open-question: pin `anthropic` SDK + model id; see runbook for model selection) |
| Human tier | selective-review queue as files (`review/*.json`) surfaced via CLI/MCP | none |

Note: the LLM provider for the classify tier is **Claude/Anthropic** (per the workbench default); the builder
confirms the exact model id and pins the SDK in the runbook. Rationale text is always marked generated and is
never written as evidence into the ledger.

### 2.5 Storage, scheduling, surfaces (ADR-0006, ADR-0001)

| Concern | Choice | Pin |
|---|---|---|
| Files-as-truth | YAML (`interests.yaml`, `*.yaml` config) + JSON/JSONL (`findings/`, `ledger/`) | TODO(open-question: pin a YAML lib, e.g. ruamel/PyYAML) |
| Index/ledger cache | SQLite via stdlib `sqlite3` (FTS5 + `seen` + ledger projection — rebuildable) | none (stdlib) |
| Config format | `caw05.config.toml` (stdlib `tomllib` read) + per-adapter blocks | none (stdlib read) |
| Scheduler (v1) | **cron** via `CronSchedulerAdapter` (writes a crontab line `caw05 run --window weekly`); stubs: systemd-timer, GitHub Actions, cloud | none (writes crontab) |
| Run wrapper | single-flight `flock` lockfile (`run.lock`), checkpoints, run-receipt heartbeat | none (stdlib/OS) |
| CLI surface | `typer` or `click` (`caw05 run`, `status`, `interests`, `adapters`, `--since` backfill) | TODO(open-question: typer vs click — pin) |
| MCP surface | Python MCP SDK (`mcp`) exposing run/inspect tools + the ledger read view | TODO(open-question: pin MCP SDK) |
| Renderers | markdown-first templates (memo, digest, slide-outline, paper-card, action-brief) via `jinja2` behind the `FormatRenderer` port | TODO(open-question: pin jinja2) |
| Export bundles | JSON bundles + signing (e.g. `hashlib`/HMAC or detached signature) across boundaries (ADR-0007) | TODO(open-question: pin signing approach) |

## 3. What we deliberately do NOT add (v1)
- No external DB/service, no message broker, no container orchestration — files + SQLite + cron only (ADR-0006;
  brief §11). A standing service would be a shared substrate and is rejected.
- No heavy ML relevance stack in v1 — BM25-first, explainable; embeddings stay alpha/gated (brief §11, ADR-0002).
- No web/GUI framework — surfaces are scheduled-pipeline + CLI + MCP (ADR-0001); a read view is optional/markdown.
- No second language for surfaces — the Python MCP SDK avoids a TS runtime.

## 4. Dependency-risk table

| Dependency | Risk | Mitigation |
|---|---|---|
| Semantic Scholar API limits | unauth pool is slow; verification (ADR-0005) needs throughput | backoff + cache; API-key decision is an OQ |
| arXiv 3 s / EDGAR 10 req/s | IP block on breach | per-host serialization + token bucket in core |
| FTS5 availability | some Python/SQLite builds omit FTS5 | preflight check; fallback to rank-bm25 in-process |
| Embedding model size/cost | could regress recall floor or latency | gated behind labeled eval; off by default |
| LLM cost/variability | classify tier cost + nondeterminism | LF tier filters first; abstain→human; rationale non-evidence |

## Open Questions
Track in `../08-research-plan/open-questions.md`:
- TODO(open-question: pin all versions listed above in `pyproject.toml` + lockfile at build time.)
- TODO(open-question: `rank-bm25` vs SQLite FTS5 BM25 as the scorer of record for the explainable additive score.)
- TODO(open-question: embedding model + vector store choice and the labeled eval gate threshold — ADR-0002.)
- TODO(open-question: confirm FTS5 is compiled into the target Python/SQLite, else select a fallback.)
- TODO(open-question: exact `anthropic` SDK + model id for the classify tier; record in the runbook.)
- TODO(open-question: confirm entry-point group names + adapter SemVer/compat policy — ADR-0003 / ports research.)

## Implications for runbooks
- **RB (bootstrap):** `pyproject.toml` with pinned deps + lockfile, entry-point groups, ruff/mypy/pytest green.
- **RB (storage):** SQLite FTS5 index builder + rebuild-from-files; preflight FTS5 availability check.
- **RB (source clients):** `httpx` + per-host token bucket; arXiv/S2/GitHub/RSS/HN clients honoring legal_mode.
- **RB (rank):** BM25 scorer + additive explanation; embedding lane behind a flag + eval gate.
- **RB (surfaces):** `typer`/`click` CLI + Python MCP SDK tools + `jinja2` FormatRenderers; `CronSchedulerAdapter`.
