# Tech Stack — CAW-06 ExperimentScout

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [./data-flow.md](./data-flow.md), [./repo-structure.md](./repo-structure.md)
  - [../01-decisions/ADR-0001-product-surface-and-scout.md](../01-decisions/ADR-0001-product-surface-and-scout.md) (pipeline + CLI + MCP)
  - [../01-decisions/ADR-0005-source-and-claim-ingestion.md](../01-decisions/ADR-0005-source-and-claim-ingestion.md) (SourceAdapter)
  - [../01-decisions/ADR-0003-experiment-ledger.md](../01-decisions/ADR-0003-experiment-ledger.md) (toy-runner + repro gate)
  - [../01-decisions/ADR-0007-storage-and-scheduling.md](../01-decisions/ADR-0007-storage-and-scheduling.md) (file store + scheduler)
  - [../01-decisions/ADR-0004-writeback-traffic-schema.md](../01-decisions/ADR-0004-writeback-traffic-schema.md), [../01-decisions/ADR-0008-export-boundaries.md](../01-decisions/ADR-0008-export-boundaries.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
Names the **concrete technologies** the AI builder uses to implement CAW-06: pipeline language, source clients
(arXiv / Semantic Scholar), the minimal toy-experiment runner, the file store, the scheduler, and the MCP/CLI
surfaces. It states *what to use and why*; it does NOT redesign the pipeline (see [data-flow.md](./data-flow.md))
or the directory layout (see [repo-structure.md](./repo-structure.md)). **All version pins are deferred to the
builder as `TODO(open-question: pin <x>)`** — DOC-CONVENTIONS §3 forbids inventing versions/numbers here.

Selection principles (from the brief + ADRs): **independence** (CAW-06's OWN runtime/store; no shared substrate);
**zero-infra default** (files on disk, not a DB server — ADR-0007); **ports & adapters** so every external
dependency sits behind a swappable port with a documented stub; **determinism** for the analytic estimator and a
**hard reproducibility gate** for experiments; **no overclaim / failures-first-class** baked into the records.

## Stack overview

| Layer | Choice (v1) | Behind which port | Why | Version pin |
|---|---|---|---|---|
| Language / runtime | **Python 3.x** | — | dominant in arXiv/S2 SDKs + PyTorch + MCP; matches family | `TODO(open-question: pin Python minor — 3.11/3.12?)` |
| Packaging / deps | **`pyproject.toml` + lockfile** (uv or Poetry) | — | reproducible installs; one canonical lock | `TODO(open-question: pick uv vs poetry; pin)` |
| Pipeline orchestration | **plain Python pipeline core** (in-process stages) | — | brief = ONE core, three thin surfaces; no heavy DAG engine at v1 | n/a |
| Source: arXiv | **arXiv API client** (HTTP/Atom, OAI-PMH for watermarks) | `SourceAdapter` | ADR-0005 S1; `FetchCursor` via resumptionToken | `TODO(open-question: pin client lib or hand-rolled httpx)` |
| Source: Semantic Scholar | **S2 Graph API client** (REST + API key) | `SourceAdapter` | ADR-0005 S1; paging cursor | `TODO(open-question: pin client / httpx; S2 API key handling)` |
| Source: CAW-05 import | **file-drop / pull reader** | `SourceAdapter` | ADR-0005 S2; CAW-05 is a SEPARATE product (no shared store) | n/a |
| HTTP / retry | **httpx + tenacity** (or equivalent) | inside adapters | rate-limit aware retries (transient vs terminal, ADR-0007) | `TODO(open-question: pin httpx + retry lib)` |
| Claim extraction (S4) | **LLM-assisted extraction behind an interface** | (extractor port) | proposal-only; output is status-bearing, human-reviewed | `TODO(open-question: which model/provider; pin)` |
| Toy experiment runner | **PyTorch (CPU/single-GPU, tiny models)** | `ExperimentRunnerAdapter` | ADR-0003; minimal reproductions only (brief §11) | `TODO(open-question: pin torch + CUDA/CPU build)` |
| Repro gate | **config + seed + env capture** (e.g. `pip freeze`/lock hash, `torch`/CUDA versions, RNG seeds) | runner | ADR-0003 hard gate; deterministic where feasible | n/a |
| Analytic estimator (W) | **pure-Python numeric** (stdlib; optional numpy) | (estimator) | ADR-0004 deterministic L0 estimate; no infra | `TODO(open-question: numpy needed or stdlib-only?)` |
| File store | **markdown + JSON on disk, git-tracked** | (store/resolver) | ADR-0007; diffable, zero infra, provenance in front-matter | n/a |
| Derived index (optional) | **SQLite OR flat JSON index**, rebuildable | (index) | ADR-0007 query layer; disposable, files canonical | `TODO(open-question: SQLite vs JSON — query volume at v1?)` |
| Schema validation | **JSON Schema / pydantic models** | shared | validate records + `wbtraffic.v0`; `null`+`basis` allowed | `TODO(open-question: pin pydantic v2 / jsonschema)` |
| Scheduler | **OS cron invoking a CLI entrypoint OR a small long-running daemon** | (scheduler) | ADR-0007 cron-like + event triggers | `TODO(open-question: daemon vs OS cron for a single-operator product?)` |
| Event triggers | **filesystem watch (CAW-05 drop) + CLI/MCP invoke** | (scheduler) | ADR-0007; on-demand + scheduled | `TODO(open-question: watch lib vs poll interval)` |
| CLI surface | **Python CLI** (e.g. Typer/Click/argparse) | surface | ADR-0001 thin surface over the one core | `TODO(open-question: pin CLI framework)` |
| MCP surface | **MCP server (Python MCP SDK)** | surface | ADR-0001 thin surface; run/inspect tools | `TODO(open-question: pin MCP SDK)` |
| Export transport | **file drop (v1)**; `HttpExportAdapter` stub | `ExportAdapter` | ADR-0008 one-way push; no shared store | n/a |
| Logging / observ. | **structured logging (stdlib `logging` + JSON)** | — | failures first-class, auditable receipts | `TODO(open-question: structlog vs stdlib)` |
| Tests / lint | **pytest + ruff + a formatter + type checker** | — | leave the tree green at each acceptance checkpoint | `TODO(open-question: pin pytest/ruff/mypy)` |

## Notes on load-bearing choices

### Python pipeline core, not a workflow engine
The brief fixes **one pipeline core + three thin surfaces** (ADR-0001). v1 implements the stages as an in-process
Python pipeline with explicit idempotency keys + cursors (see [data-flow.md](./data-flow.md)), **not** a
distributed DAG engine (Airflow/Prefect/etc.) — that would add infra against the zero-infra principle. Revisit
only if Run volume or fan-out demands it.

### Source clients behind SourceAdapter (ADR-0005)
arXiv and Semantic Scholar each get an adapter implementing the `SourceAdapter` port; both persist an opaque
`FetchCursor` so scheduled re-runs are incremental and idempotent. **Respect each API's published rate limits and
ToS** (brief §12: only legally/ToS-safe sources). The CAW-05 importer is a third adapter reading a **file drop
from a separate product** — never a shared store.

### Toy-experiment runner behind ExperimentRunnerAdapter (ADR-0003)
v1 is a **local PyTorch runner for tiny models only** — minimal reproductions / toy experiments (brief §11
non-goal: no training at scale, no full syntorch/vLLM). The runner enforces the **hard reproducibility gate**
(config + seed + env captured) and **emits one append-only ledger entry per launch**, including crashes →
`invalid`/`aborted`, so **failures are never silently dropped**. External-compute / HW runners are **documented
stubs** behind the same port.

### Analytic estimator is deterministic and assumption-explicit (ADR-0004)
The `wbtraffic.v0` estimator is pure numeric Python: same inputs → same outputs, and it **lists every
assumption**. It produces **modeled** numbers (flagged distinctly from **measured** ones from the ledger);
numerics default to `null` rather than being invented.

### File store + optional index (ADR-0007)
Source of truth is **markdown/JSON on disk**, git-tracked, append-only with supersede. The derived index is
**disposable and rebuildable** — deleting it loses nothing. This keeps zero database infrastructure as the
default and every record diff-reviewable.

### Surfaces are thin (ADR-0001)
CLI and MCP are **thin wrappers over the same core** — they run/inspect Runs and never hold business logic.
Anything one surface can do, the others can, because they share the core.

## Out of scope (v1 non-goals — brief §11)
- Full **syntorch/vLLM** integration and Chakra L0 tracing — that is CAW-01's domain (separate product).
- Large-scale or real TTT training; multi-GPU/cluster orchestration.
- A database server as source of truth; a shared registry/runtime with any other CAW product.

## Open Questions
See [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md). Stack-relevant:
- Every `TODO(open-question: pin …)` in the table above (concrete versions are the builder's first task).
- `TODO(open-question: scheduler host — OS cron + CLI entrypoint vs long-running daemon? — ADR-0007)`
- `TODO(open-question: index backend — SQLite vs flat JSON? — ADR-0007)`
- `TODO(open-question: which LLM/provider for claim extraction, and how its output stays proposal-only?)`

## Implications for runbooks
- The phase-0 setup runbook pins all versions (resolve the `TODO(open-question: pin …)` cells) and lands a green
  tree (pytest + ruff + type-check) before any stage is built.
- Each external dependency (arXiv, S2, CAW-05, PyTorch, export transport) is introduced **behind its port** with
  a documented stub, so v1 builds one adapter and leaves the seam open.
- The runner runbook wires the reproducibility gate and the one-entry-per-launch rule before the first experiment.
