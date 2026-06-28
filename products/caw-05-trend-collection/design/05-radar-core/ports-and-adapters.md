# Radar Core — Ports & Adapters

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - **Source of truth:** [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF.md) (§9 open integration interfaces, §12 guardrails)
  - Conventions: [../_meta/DOC-CONVENTIONS.md](../_meta/DOC-CONVENTIONS.md)
  - ADR-0001 product surface — [../01-decisions/ADR-0001-product-surface-and-outputs.md](../01-decisions/ADR-0001-product-surface-and-outputs.md) (the Run; `FormatRenderer`)
  - ADR-0003 source adapters — [../01-decisions/ADR-0003-source-adapters-and-ingestion.md](../01-decisions/ADR-0003-source-adapters-and-ingestion.md)
  - ADR-0004 classification & triage — [../01-decisions/ADR-0004-classification-and-triage.md](../01-decisions/ADR-0004-classification-and-triage.md) (`Classifier`/routing ports)
  - ADR-0006 storage & scheduling — [../01-decisions/ADR-0006-storage-and-scheduling.md](../01-decisions/ADR-0006-storage-and-scheduling.md) (`SchedulerAdapter`)
  - ADR-0007 export boundaries — [../01-decisions/ADR-0007-export-boundaries.md](../01-decisions/ADR-0007-export-boundaries.md) (`ExportAdapter`)
  - Research (rationale + registry + stub template): [../02-research/scheduling-and-ports.md](../02-research/scheduling-and-ports.md)
  - Siblings: [./synthesis-and-formats.md](./synthesis-and-formats.md), [./export-boundaries.md](../05-radar-core/export-boundaries.md)

## Purpose
This doc fixes the **core-level** ports-and-adapters design: the five ports (`Source`, `Export`, `Scheduler`,
`FormatRenderer`, `Classifier`), the config-driven registry that wires them, the capability descriptors that make
the system self-describing, and the **documented-stub** pattern. The architectural rationale, the seam-test table,
and the incremental/dedup/cursor mechanics are authoritative in
[../02-research/scheduling-and-ports.md](../02-research/scheduling-and-ports.md) and **cross-linked, not
duplicated**. The crucial invariant this doc enforces: **adapters cannot bypass triage/routing** — every finding
flows through the Run's classify → route → review-gate spine before any output or export.

## 1. The Run and where ports attach
The unit of work is the **Run** (ADR-0001): `caw05 run --window weekly`, an idempotent, resumable pipeline. Each
stage attaches to one port; the pipeline core never imports a concrete adapter.

```
   SchedulerAdapter ──fires──►  caw05 run --window weekly
                                      │
   collect ──► SourceAdapter[]   (fan-in: arxiv-s2, rss-blog, github)
   dedup   ──► (core: cursor + content-address; NO port — never per-adapter)
   classify──► Classifier + Router  (LF→LLM→human cascade; selective-review gate)
   synth   ──► FormatRenderer[]  (memo/digest/slide/paper-card/action-brief)
   export  ──► ExportAdapter[]   (caw02/caw03/caw01/caw06)
                                      │
                                 run-receipt (heartbeat)
```

**The choke point:** an adapter only ever produces a `RawFinding` (source) or consumes a `RoutedSignal` (export).
Neither can short-circuit the core's classify/route/review-gate stages — that is the structural guarantee that
*generated summaries are never exported as evidence* and *unreviewed novelty-threats never reach CAW-03's gate*
(brief §11, §12; ADR-0004 §5; [./export-boundaries.md](../05-radar-core/export-boundaries.md)).

## 2. The five ports (signatures are build guidance)
Each port is a small typed `Protocol`; all consume/return the radar's own provenance-carrying value objects so the
pipeline stays adapter-independent. `SourceAdapter`, `ExportAdapter`, and `SchedulerAdapter` are specified in full
in the research doc §4; reproduced compactly here with the two synthesis/triage ports added.

| Port | Direction | Stage | v1 adapters | Stubs |
|---|---|---|---|---|
| `SourceAdapter` | driven | collect | `arxiv-s2`, `rss-blog`, `github` | `hn-reddit`, `securities` (SEC/EDGAR), `newsletter`, `internal-feed` |
| `Classifier` | driven | classify | LF set → LLM cascade adapter | embedding-lane classifier (alpha) |
| `FormatRenderer` | driven | synth | `memo`, `digest`, `slide-outline`, `paper-card`, `action-brief` | `tweet-thread`, … |
| `ExportAdapter` | driven | export | `caw02-source-claim`, `caw03-novelty`, `caw01-open-question`, `caw06-open-question` | other downstream targets |
| `SchedulerAdapter` | driving | (fires Run) | `cron` | `systemd-timer`, `github-actions`, `cloud-scheduler`, `airflow` |

```python
class SourceAdapter(Protocol):
    capabilities: AdapterCapabilities       # family, cursor_kind, rate_limit, tos_class, provides=[PAPER,REPO,THREAD,REPORT,ARTICLE]
    def discover(self, watch: WatchQuery, cursor: Cursor | None) -> list[ItemRef]: ...
    def fetch(self, ref: ItemRef) -> RawFinding: ...     # provenance-tagged, boundary=public, large artifacts by path
    def health(self) -> HealthStatus: ...                # reachable? auth ok? within rate budget?

class Classifier(Protocol):
    capabilities: AdapterCapabilities       # axes=[novelty/support/adjacent/noise, signal/hype], emits_confidence: bool
    def classify(self, finding: RawFinding, ctx: TriageContext) -> Verdict: ...  # abstain→human when low-confidence (ADR-0004)
# Routing is CONFIG-DRIVEN and lives in the core (knowledge/task/experiment/open-question/discard), NOT in the adapter;
# generated rationale is NEVER evidence (ADR-0004).

class FormatRenderer(Protocol):             # see synthesis-and-formats.md §2.1
    capabilities: AdapterCapabilities       # produces=MARKDOWN, exports_to=[CAW-0x|none]
    def applies_to(self, group: FindingGroup) -> bool: ...
    def render(self, group: FindingGroup, ctx: SynthContext) -> Artifact: ...

class ExportAdapter(Protocol):              # see export-boundaries.md §1
    capabilities: AdapterCapabilities       # target, accepts=[SOURCE_CLAIM,NOVELTY_SIGNAL,OPEN_QUESTION]
    def can_accept(self, signal: RoutedSignal) -> Acceptance: ...
    def export(self, signal: RoutedSignal, ctx: ExportContext) -> ExportReceipt: ...   # idempotent file-drop

class SchedulerAdapter(Protocol):           # see scheduling-and-ports.md §4.3
    capabilities: AdapterCapabilities       # cadence support, native_catchup: bool, native_overlap_guard: bool
    def install(self, run_spec: RunSpec) -> ScheduleHandle: ...
    def status(self) -> ScheduleStatus: ...
    def uninstall(self, handle: ScheduleHandle) -> None: ...
```

**Note — dedup is NOT a port.** The cursor watermark + content-addressed dedup live in the core so every
`SourceAdapter` inherits them for free and no adapter can skip dedup (research §3). The scheduler only *fires* the
Run; lock/catch-up/heartbeat/resume live in the Run wrapper, so even plain cron is correct (research §2.2).

## 3. Config-driven registry
Adapters are **registered** (never hard-coded into the pipeline) and **selected by config** — same pattern as the
sibling product CAW-03 (a separate product; no shared registry). Two-layer discovery into one registry:

1. **Built-in registration** — v1 adapters register at import via decorator: `@register(port="source", id="arxiv-s2")`.
2. **Entry-point discovery** — external adapters self-advertise via package metadata (PyPA entry-point groups,
   e.g. `caw05.source_adapters`, `caw05.export_adapters`, `caw05.scheduler_adapters`, `caw05.format_renderers`,
   `caw05.classifiers`), discovered with `importlib.metadata` — a future connector ships as its own package
   without touching CAW-05's tree.

```python
class AdapterRegistry:
    def register(self, port: PortName, id: str, factory: Callable[[AdapterConfig], Adapter]) -> None: ...
    def get(self, port: PortName, id: str, cfg: AdapterConfig) -> Adapter: ...
    def list(self, port: PortName) -> list[AdapterDescriptor]: ...   # ids + capability descriptors (preflight / CLI / MCP)
```

Selection is config-driven — one block per port, no code change to switch:
```toml
# caw05.config.toml — the ONLY place wiring changes
[adapters.source]    active = ["arxiv-s2", "rss-blog", "github"]
[adapters.classifier] active = "lf-llm-cascade"
[adapters.format]    active = ["memo", "digest", "slide-outline", "paper-card", "action-brief"]
[adapters.export]    active = ["caw02-source-claim", "caw03-novelty", "caw01-open-question", "caw06-open-question"]
[adapters.scheduler] active = "cron"

[adapters.source.arxiv-s2]   sets = ["cs.AR","cs.LG"]  cursor_store = "state/arxiv.cursor"  rate_limit = "1/3s"
[adapters.source.hn-reddit]  enabled = false           # stub present, off until connector lands + ToS cleared
[adapters.scheduler.cron]    schedule = "0 7 * * MON"  target = "caw05 run --window weekly"
```

## 4. Capability descriptors + preflight
```python
@dataclass(frozen=True)
class AdapterCapabilities:
    port: PortName                       # "source"|"classifier"|"format"|"export"|"scheduler"
    id: str; version: str
    provides: list[DataKind] = []        # SourceAdapter: PAPER/REPO/THREAD/REPORT/ARTICLE
    accepts: list[SignalKind] = []       # ExportAdapter: SOURCE_CLAIM/NOVELTY_SIGNAL/OPEN_QUESTION
    cursor_kind: Literal["oai-pmh","etag","since-id","date-range","none"] = "none"
    tos_class: Literal["public-open","public-rate-limited","tos-restricted"] = "public-open"
    rate_limit: str | None = None        # e.g. "10/s" (EDGAR), "10000/hr" (HN Algolia)
    requires_config: list[str] = []      # preflight checks these
    maturity: Literal["v1","stub","experimental"] = "stub"
```

**Preflight** (before any Run) resolves each `active` id, reads its descriptor, and validates the wiring **without
I/O**: every export `accepts` the signal kinds the run will route; every source declares a legal `tos_class` and a
cursor kind; required auth/config is present; and **no `active` adapter is a `stub`**. A missing / disabled /
incapable / ToS-unsafe / misconfigured wiring fails *here* with an actionable message, not mid-run. A
`tos-restricted` source is refused unless explicitly cleared (brief §12).

## 5. The documented-stub pattern
A future adapter ships in v1 as a **documented stub**: the real interface, a not-implemented marker, a descriptor
with `maturity="stub"`, and a config example. Wiring the real connector later = filling in the method bodies of
*that one file* (research §7).

```python
@register(port="source", id="securities")
class SecuritiesReportSourceAdapter(SourceAdapter):
    """STUB — SEC/EDGAR securities-report source. Implement when approved.
    Contract: SourceAdapter (§2). EDGAR: RSS + data.sec.gov JSON, no key, <=10 req/s. Confirm legal/ToS before
    enabling (PRODUCT-BRIEF §5/§12). Must return provenance-tagged RawFinding, boundary=public.
    Config example:
        [adapters.source.securities]
        ciks = ["..."]   date_range = "last-week"   rate_limit = "10/s"
    """
    capabilities = AdapterCapabilities(
        port="source", id="securities", version="0.0.0",
        provides=[REPORT], cursor_kind="date-range",
        tos_class="public-rate-limited", rate_limit="10/s",
        requires_config=["ciks"], maturity="stub")
    def discover(self, watch, cursor): raise NotImplementedError("securities source not yet wired (brief §9)")
    def fetch(self, ref):              raise NotImplementedError(...)
    def health(self):                  return HealthStatus.not_implemented("stub")
```

A stub is **registered and discoverable** (appears in `registry.list()` / CLI / MCP) but **config-disabled by
default**; preflight refuses to run a stub that is `active`, pointing at the file to implement. Stubs required by
brief §9:

| Port | Documented stubs |
|---|---|
| Source | `hn-reddit`, `securities` (SEC/EDGAR ≤10 req/s, no key), `newsletter`, `internal-feed` |
| Export | downstream targets beyond CAW-01/02/03/06 |
| Scheduler | `systemd-timer` (native `Persistent=true` catch-up), `github-actions`, `cloud-scheduler`, `airflow` |
| FormatRenderer | future formats (e.g. `tweet-thread`) |
| Classifier | embedding-lane classifier (alpha, gated on a labeled eval set — ADR-0002) |

## 6. The seam test (why this generalizes)
A change is "open by design" if a new integration touches **only one adapter file + one config block**. Full
table in research §8; the core cases:

| New integration | What gets added | What is NOT touched |
|---|---|---|
| HN/Reddit as a source | implement `hn-reddit`, enable config (after ToS clearance) | pipeline, classify, dedup, other adapters |
| New downstream consumer | implement an `ExportAdapter`, flip `active` | routing rules (operate on `RoutedSignal`) |
| New output format | implement a `FormatRenderer`, flip `active` | classify/export; base template carries manifest/banner |
| cron → systemd timer | implement `systemd-timer`, flip `active` | the Run wrapper (lock/catch-up/heartbeat stay in core) |

If any of these forces a pipeline-core edit, the contract is leaking — that is the revisit trigger.

## 7. Open Questions
Tracked in [../08-research-plan/open-questions.md](../08-research-plan/open-questions.md):
- TODO(open-question: exact entry-point group names + adapter SemVer/compat policy — how does the core reject an
  adapter built against an old port version?)
- TODO(open-question: where do per-adapter secrets/rate-budgets live given "no shared runtime substrate" —
  per-adapter config + env refs only?)
- TODO(open-question: is `Classifier` one port or a cascade of sub-ports (LF / LLM / human) — does the cascade
  belong in the core or behind one adapter? Resolve with ADR-0004.)
- TODO(open-question: Reddit ToS/OAuth legality for the stub — does "legal/ToS-safe only" permit Reddit at all, or
  HN-only first?)

## 8. Implications for runbooks
- **RB (ports):** define the five `Protocol` interfaces + value objects (`RawFinding`, `Verdict`, `FindingGroup`,
  `Artifact`, `RoutedSignal`, `Cursor`, `AdapterCapabilities`, descriptors). Fakes only; tree stays green.
- **RB (registry/config):** `AdapterRegistry` (decorator + entry-point discovery), `caw05.config.toml` loader, and
  **preflight** (capability + ToS + no-active-stub validation). Acceptance: preflight rejects a
  stub/incapable/ToS-unsafe/misconfigured wiring with an actionable message.
- **RB (v1 adapters):** the source/classifier/format/export/scheduler v1 adapters above.
- **RB (stubs):** ship every brief-§9 stub via §5 — registered, `maturity="stub"`, config-disabled. Acceptance:
  each appears in `registry.list()` and is refused by preflight when forced active.
- **RB (bypass guard):** a test proving no adapter path reaches synth/export without passing classify → route →
  review-gate (the §1 choke-point guarantee).
