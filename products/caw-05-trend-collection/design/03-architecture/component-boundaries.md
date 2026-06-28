# Component Boundaries — CAW-05 Modules, Core Services & Ports

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [system-architecture.md](system-architecture.md) (containers; one-way dependency rule; data flow)
  - [../01-decisions/ADR-0001-product-surface-and-outputs.md](../01-decisions/ADR-0001-product-surface-and-outputs.md) (the Run; op-set; FormatRenderer)
  - [../01-decisions/ADR-0002-interest-model.md](../01-decisions/ADR-0002-interest-model.md) (relevance score; recall floor)
  - [../01-decisions/ADR-0003-source-adapters-and-ingestion.md](../01-decisions/ADR-0003-source-adapters-and-ingestion.md) (SourceAdapter; cursors; dedup)
  - [../01-decisions/ADR-0004-classification-and-triage.md](../01-decisions/ADR-0004-classification-and-triage.md) (cascade; review gate; routing)
  - [../01-decisions/ADR-0005-related-work-ledger.md](../01-decisions/ADR-0005-related-work-ledger.md) (LedgerLink; verification)
  - [../01-decisions/ADR-0007-export-boundaries.md](../01-decisions/ADR-0007-export-boundaries.md) (ExportAdapter; bundle envelope)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
This doc fixes **module ownership** inside the pipeline core and the **port interfaces** the core depends on. It
states each core service (Ingest, Relevance, Classify/Triage, Ledger, Synthesize, Export, Schedule) at the
**signature level** and the rule that **triage, routing, and dedup live in the core — adapters cannot bypass
them**. It does NOT redefine the decisions those services implement (see the linked ADRs) nor the container
runtime picture ([system-architecture.md](system-architecture.md)); it draws the seams between modules. Signatures
below are **build guidance** (the builder writes real code), Python-typed for precision.

## 1. Module map & ownership

| Module | Owns | Must NOT | Implements |
|---|---|---|---|
| `core.ingest` | cursors, multi-layer dedup, provenance verification, the `Finding` assembly | rank, classify, export | ADR-0003 §4–5 |
| `core.relevance` | BM25-first additive explainable score + recall-first floor | drop a watch-list hit silently | ADR-0002 |
| `core.classify` | LF→LLM→human cascade, two-axis label, selective-review gate | treat rationale as evidence | ADR-0004 |
| `core.route` | deterministic config-driven routing | route an unconfirmed novelty-threat | ADR-0004 §routing |
| `core.ledger` | append-only LedgerLink + S2 verification record | mutate/rewrite history | ADR-0005 |
| `core.synthesize` | render the 5 formats over confirmed findings; stamp `evidence:false` | emit `noise`; render unconfirmed as terminal | ADR-0001 §5 |
| `core.export` | project confirmed links → signed bundles; fail-closed | write a sibling's store | ADR-0007 |
| `core.schedule` | Run wrapper: lock, catch-up, checkpoints, heartbeat | hold business logic | ADR-0001 §1–2 |
| `core.store` | `StoragePort` impl over files + SQLite index | be the source of truth (SQLite is a cache) | ADR-0006 |
| `adapters.source.*` | fetch + normalize one family | classify/rank/dedup/export | ADR-0003 §3 |
| `adapters.export.*` | one consumer's bundle write | re-rank or re-classify | ADR-0007 §1 |
| `surfaces.cli` / `surfaces.mcp` | drive the vetted op-set | enforce any invariant locally | ADR-0001 §3–4 |

**Invariant (the load-bearing rule):** dedup, relevance/recall-floor, classification, triage, routing, the review
gate, provenance, and export all live in `core.*`. Adapters and surfaces are **edges**: an adapter that classifies,
or a surface that enforces a rule, is a contract leak (ADR-0003 revisit trigger; ADR-0001 §Open).

## 2. Core services at signature level

```python
# ---- core.ingest -----------------------------------------------------------
class IngestService:
    def collect(self, run: RunContext) -> list[Finding]:
        """For each ACTIVE SourceAdapter: fetch(query, cursor) -> RawFinding[];
        advance cursor only on a fully successful pass; then dedup + verify provenance."""
    def _dedup(self, raws: Iterable[RawFinding]) -> list[Finding]:
        """Multi-layer: native-id ▸ canonical(DOI▸arXiv▸norm-title+author) ▸ SHA-256
        ▸ [SimHash behind flag]. One Finding, many provenance entries. Recall-safe defaults."""
    def _require_provenance(self, raw: RawFinding) -> None:
        """Refuse a finding lacking origin / retrieved_at / native id / boundary."""

# ---- core.relevance --------------------------------------------------------
class RelevanceService:
    def score(self, finding: Finding, interests: InterestModel) -> RelevanceScore:
        """BM25-first ADDITIVE EXPLAINABLE score (per-term contributions) + recall-first
        FLOOR: a watch-list (tier-1) hit is never scored below the keep threshold.
        Optional embedding lane (alpha) gated on a labeled eval set."""

# ---- core.classify (+ triage gate) ----------------------------------------
class ClassifyService:
    def classify(self, finding: Finding) -> Triage:
        """Cascade LF -> LLM -> (abstain -> human). Two-axis label:
        relation ∈ {novelty-threat, support, adjacent, noise} × mode ∈ {signal, hype}.
        Recall-biased selective-review gate: low confidence => route to human."""
    # rationale is metadata, NEVER evidence (Triage.rationale.evidence == False)

class RouteService:
    def route(self, triage: Triage) -> Route:
        """Deterministic CONFIG-DRIVEN: knowledge | task | experiment | open-question | discard.
        A novelty-threat route to a terminal target stays PROPOSED until the review gate."""

# ---- core.ledger -----------------------------------------------------------
class LedgerService:
    def append(self, link: LedgerLink) -> LedgerRef:
        """Append-only to ledger/*.jsonl; index into SQLite cache. No rewrite."""
    def verify(self, finding: Finding, target: WatchedTarget) -> VerificationRecord:
        """Semantic Scholar: Levenshtein title gate + year±1 + multi-key dedup.
        A provenance-complete LedgerLink is the single auditable record."""

# ---- core.synthesize -------------------------------------------------------
class SynthesizeService:
    def render(self, finding: Finding, fmt: FormatName, renderer: FormatRenderer) -> Document:
        """5 markdown-first formats: memo | digest | slide-outline | paper-card | action-brief.
        Base template carries provenance manifest + 'generated summary — not evidence' banner.
        'noise' is never synthesized."""

# ---- core.export -----------------------------------------------------------
class ExportService:
    def export(self, link: LedgerLink, target: ExportTarget) -> ExportReceipt:
        """Confirmed-only by default. Project relation -> consumer vocabulary; foreign_ref in
        related_to; raw_summary kind=generated-summary excluded from evidence; public-only;
        content-addressed (payload_sha256) + idempotent. Fail-closed; empty bundle refused."""

# ---- core.schedule (Run wrapper) ------------------------------------------
class ScheduleService:
    def run(self, window: Window) -> RunReceipt:
        """Single-flight lock; cursor-based catch-up (a missed week self-heals);
        per-stage checkpoints (resume at last completed stage); heartbeat receipt.
        Re-running a 'done' Run is a no-op."""
```

## 3. Port interfaces (the core depends on these, never on a concrete edge)

```python
class SourceAdapter(Protocol):                                  # ADR-0003 §3
    def capabilities(self) -> SourceCapabilities: ...           # family, legal_mode, tos_class
    def fetch(self, query: Query, cursor: FetchCursor) -> tuple[Iterable[RawFinding], FetchCursor]: ...
    def healthcheck(self) -> HealthStatus: ...
    # 6 obligations: idempotent+incremental; rate-limit+backoff inside; legal_mode honored;
    # provenance complete; typed failures (transient vs terminal); NO classify/rank.

class ExportAdapter(Protocol):                                  # ADR-0007 §1
    capabilities: AdapterCapabilities  # target, accepts=[SOURCE_CLAIM|NOVELTY_SIGNAL|OPEN_QUESTION]
    def can_accept(self, signal: RoutedSignal) -> Acceptance: ...    # type/boundary/format preflight
    def export(self, signal: RoutedSignal, ctx: ExportContext) -> ExportReceipt: ...  # idempotent

class SchedulerAdapter(Protocol):                              # ADR-0001 §B
    def install(self, spec: ScheduleSpec) -> None: ...         # v1 = cron line invoking `caw05 run`
    def status(self) -> SchedulerStatus: ...                   # FIRES only; no catch-up logic here

class FormatRenderer(Protocol):                               # ADR-0001 §5
    name: FormatName                                           # memo|digest|slide-outline|paper-card|action-brief
    def render(self, findings: Sequence[Finding], ctx: RenderContext) -> Document: ...
    # inherits base template: provenance manifest + evidence:false banner

class Classifier(Protocol):                                    # ADR-0004
    def label(self, finding: Finding) -> ClassifierOutput: ... # confidence drives the abstain->human gate
    # LF lane and LLM lane both satisfy this; human is the terminal stage of the cascade

class StoragePort(Protocol):                                   # ADR-0006
    def read_interests(self) -> InterestModel: ...
    def upsert_finding(self, f: Finding) -> None: ...          # files/*.json = truth
    def append_ledger(self, link: LedgerLink) -> LedgerRef: ... # ledger/*.jsonl append-only
    def index(self, ...) -> None: ...                          # SQLite cache, rebuildable from files
```

### Port → adapter registry (v1 + stubs)

| Port | v1 adapters | Documented stubs (registered, config-disabled) |
|---|---|---|
| `SourceAdapter` | Arxiv, SemanticScholar, Github, BlogRss, HackerNews(light) | Reddit, Edgar, Newsletter, InternalFeed |
| `ExportAdapter` | Caw02SourceClaim, Caw03NoveltySignal, Caw01OpenQuestion, Caw06OpenQuestion | other downstream targets |
| `SchedulerAdapter` | Cron | systemd, cloud scheduler |
| `FormatRenderer` | memo, digest, slide-outline, paper-card, action-brief | (new format = one adapter) |
| `Classifier` | LF lane, LLM lane (+ human terminal) | embedding-assisted lane (alpha) |

A stub is **discoverable but config-disabled**; preflight refuses an `active` stub (ADR-0003 §1) and a ToS-unsafe
or non-public adapter (ADR-0003 §2, ADR-0007 §4).

## 4. The non-bypass rule (triage / routing / dedup live in the core)

This is the boundary that protects the recall + audit mission. Stated as enforceable obligations:

| # | Obligation | Failure it prevents |
|---|---|---|
| 1 | An adapter returns `RawFinding` only — never a label, score, or dedup verdict | per-family ranking drift; a family silently dropping a watch-list hit |
| 2 | Dedup runs once, in `core.ingest`, across ALL sources | the same paper from 4 sources becoming 4 findings (or a false-merge dropping one) |
| 3 | Relevance + the recall floor run in `core.relevance` | a tier-1 watch-list hit scored away at an edge |
| 4 | Classification/triage/routing run in `core.classify`/`core.route` | a surface or adapter routing an unreviewed novelty-threat to CAW-03's gate |
| 5 | The review gate is core; surfaces/MCP terminals are **proposal-only** | an agent auto-exporting an unconfirmed threat |
| 6 | Export only via `core.export` + `ExportAdapter`; never a direct write | a write into a sibling's store (independence breach) |
| 7 | Generated prose carries `evidence:false` end-to-end | a generated summary crossing a boundary as evidence |

**Seam test (must hold):** adding a source family, an export target, a format, or a classifier lane is **one
adapter file + one config block** with zero change to the pipeline; if the core needs a source-/consumer-specific
branch, the port contract is leaking — extend the value object, not the pipeline (ADR-0003 / ADR-0007 revisit
triggers).

## 5. Cross-module data handoffs

| From → To | Payload | Contract |
|---|---|---|
| SourceAdapter → Ingest | `RawFinding` (+ provenance) | provenance complete or refused |
| Ingest → Relevance | deduped `Finding` | one finding, many provenance entries |
| Relevance → Classify | `Finding` + `RelevanceScore` | recall floor already applied |
| Classify → Route | `Triage` (two-axis + confidence) | abstain → human before routing |
| Route → Ledger | `Route` + `Finding` | append-only `LedgerLink` + verification |
| Ledger → Synthesize | confirmed `LedgerLink`/`Finding` | `noise` excluded |
| Ledger → Export | confirmed `LedgerLink` | confirmed-only; fail-closed projection |

## Open Questions
- TODO(open-question: is a Run one synchronous process or resumable stage-jobs with a handle? affects `status` +
  service boundaries.) See [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md).
- TODO(open-question: does the embedding-assisted Classifier lane graduate from alpha in v1, gated on the labeled
  eval set? owned with ADR-0002/0004.)
- TODO(open-question: SimHash near-dup folding default in `core.ingest` — on or off in v1, given false-merge =
  dropped finding? owned with ADR-0003.)

## Implications for runbooks
- **RB (core services):** one module per service (§1) with the §2 signatures; dedup/relevance/triage/routing/gate
  in `core.*` only.
- **RB (ports):** the five ports (§3) as Protocols + a config-driven registry; v1 adapters + documented stubs;
  preflight refuses active/ToS-unsafe/non-public adapters.
- **RB (non-bypass tests):** assert obligations 1–7 (§4) and the seam test — an adapter cannot classify/rank/dedup/
  export; a surface cannot enforce a rule; export is fail-closed (ADR-0007 N1–N6).
