# Scheduling & Ports (the radar's automation spine + integration seams)

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF.md), [../_meta/DOC-CONVENTIONS.md](../_meta/DOC-CONVENTIONS.md), `../01-decisions/ADR-0006-storage-and-scheduling.md` (TODO), `../01-decisions/ADR-0003-source-adapters-and-ingestion.md` (TODO), `../01-decisions/ADR-0007-export-boundaries.md` (TODO), `../08-research-plan/open-questions.md` (TODO)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
This doc decides **how the weekly radar runs unattended and how it stays source/sink/scheduler-agnostic**. Three things: (1) the **scheduler model** — what fires the weekly run, how missed runs and overlap are handled, what state survives a crash; (2) the **incremental / dedup** strategy so a re-run does not re-collect, re-classify, or re-emit what was already seen; (3) the **ports & adapters** design — `SourceAdapter` per family, `ExportAdapter` per target, `SchedulerAdapter` — with a config-driven registry and the **documented-stub** pattern (HN/Reddit, securities, newsletters, other schedulers). It does NOT decide the interest model, the classification rubric (threat/support/adjacent/noise), the related-work ledger schema, or the synthesis output formats — those are separate ADRs that *consume* these ports. It does NOT build any stubbed connector: v1 ships v1 adapters + registered stubs only (brief §9, §11).

## 1. Problem & forces
The radar's value is **high recall on a narrow watch list, weekly, without anyone remembering to run it** (brief §1, §3). A missed close paper is an existential novelty risk, so the automation cannot silently skip a week, double-emit a finding to CAW-03, or re-spam a digest on retry. The run is multi-source fan-in → classify → synthesize → export, against **public, rate-limited, ToS-bound** sources (brief §5, §12).

| Force | Implication for the design |
| --- | --- |
| Weekly cadence, unattended, must not silently skip (recall is the mission) | Scheduler must **catch up** a missed run + emit a heartbeat; a skipped week is an alert, not a no-op |
| Re-runs / retries must not duplicate findings, ledger rows, or exports | **Incremental cursor per source + content-addressed dedup** is core, not per-adapter |
| Sources are heterogeneous + legally constrained (arXiv, RSS, GitHub now; HN/Reddit, securities, newsletters later) | One `SourceAdapter` contract; each family is just an adapter; ToS/rate-limit is a per-adapter capability |
| Exports cross independent-product boundaries (CAW-01/02/03/06), no shared store (brief §1, §8) | One `ExportAdapter` contract; each target is a file/bundle boundary, never a shared DB |
| Scheduler itself may change (cron now; other schedulers later) | `SchedulerAdapter` so the *trigger* is swappable; the pipeline never imports cron |
| Builder, not us, writes code | Deliver typed contracts + registry/config design + stub template; concrete code is the runbook's job |

## 2. Scheduler model
The schedule **triggers** the pipeline; it owns no domain logic. The unit of work is a **Run**: an idempotent, resumable invocation `caw05 run --window weekly`. The scheduler's only job is "start a Run on cadence, exactly enough times, and tell someone if it didn't."

### 2.1 Trigger mechanism — cron vs systemd timer
v1 is **cron** (brief §9: "v1 = cron; stubs = other schedulers"), but the design must survive on a box where reliability matters. The two realistic Linux mechanisms:

| Option | Catch-up on missed run | Overlap guard | Observability | Fit for v1 |
| --- | --- | --- | --- | --- |
| **cron** | None — if the box is off at fire time, the run is silently skipped ([dchost](https://www.dchost.com/blog/en/cron-vs-systemd-timers-the-friendly-way-to-ship-reliable-schedules-and-real-healthchecks/)) | None — stampedes unless you add a lockfile ([xtom](https://xtom.com/blog/systemd-vs-cron-linux-task-scheduling/)) | Logs nowhere unless redirected | brief-mandated default; wrap to fix gaps |
| **systemd timer** (`OnCalendar=` + `Persistent=true`) | Runs once on next boot if the calendar event was missed ([oneuptime](https://oneuptime.com/blog/post/2026-01-15-use-systemd-timers-ubuntu/view)) | Service unit won't double-start | Writes to journald by default | best for a real host; ship as a `SchedulerAdapter` |

**Decision:** the brief fixes cron as the v1 adapter, so the catch-up/overlap/heartbeat properties that cron lacks are implemented **in the Run wrapper, not assumed from the scheduler**. The `SchedulerAdapter` abstracts the trigger so a systemd-timer or cloud-scheduler adapter can later supply those properties natively. This keeps us honest: the radar is correct even on plain cron.

### 2.2 Properties the Run wrapper guarantees (regardless of scheduler)
- **Single-flight lock.** A run acquires an exclusive lock (lockfile/flock or a `run.lock` row); a second trigger while one is in flight is refused, not stacked. (Cron has no overlap guard; we add it.)
- **Catch-up via watermark, not via the clock.** Each source carries a `last_success_cursor` (see §3). A Run collects "everything since the cursor," so a *missed week is automatically absorbed by the next run* — the next run's window simply spans more time. Catch-up is a property of the **cursor**, independent of whether the scheduler itself replays missed fires.
- **Heartbeat / dead-man's-switch.** Every run writes a `run-receipt` (start, end, per-source counts, status). A missing receipt for > cadence + grace is an **alert** ("the radar went dark"), satisfying "must not silently skip." (TODO(open-question: heartbeat sink — local check vs external dead-man service.))
- **Resumable, idempotent stages.** A Run is a pipeline of stages (`collect → dedup → classify → synthesize → export`) with per-stage checkpoints; a crash mid-run re-enters at the last completed stage. Re-running a completed Run is a no-op (idempotency keys, §3.2).
- **Backfill mode.** `caw05 run --since <date>` ignores cursors for a one-off historical sweep (first-run seeding of the watch list, brief §6).

### 2.3 Run lifecycle (state, not prose)
```
scheduled → acquiring-lock → collecting → deduping → classifying → synthesizing → exporting → done
                  │ lock held by another run → refused (logged, no error)
                  └ any stage crash → checkpoint kept → next trigger resumes from checkpoint
done → writes run-receipt {window, per_source: {fetched, new, dup}, classified_counts, exports[], status}
```

## 3. Incremental & dedup across runs
Two independent mechanisms; together they make a re-run cheap and duplicate-free. This logic lives in the **core**, so every `SourceAdapter` inherits it for free.

### 3.1 Per-source incremental cursor (don't re-fetch)
Each source advertises a **cursor kind** in its capability descriptor and the core persists the last successful cursor:

| Source family | Cursor mechanism | Notes / grounding |
| --- | --- | --- |
| arXiv / Semantic Scholar | OAI-PMH `from=<last datestamp>`, never set `until`; take `from` from the last server response; carry the `resumptionToken` to page | arXiv OAI is built for exactly this; tokens expire daily so a mid-page failure recovers via `from=<last datestamp>` ([arXiv OAI](https://info.arxiv.org/help/oa/index.html), [OAI-PMH guidelines](https://www.openarchives.org/OAI/2.0/guidelines-harvester.htm)) |
| RSS / blogs | last-seen entry `id`/`guid` + `Last-Modified`/`ETag` conditional GET | standard feed semantics; cheap |
| GitHub | `since=` on events/commits; repo `pushed_at` watermark | per-watchlist repos |
| HN (stub) | Algolia `numericFilters=created_at_i>cursor`; no key, 10k req/hr/IP | ([HN Algolia API](https://hn.algolia.com/api)) |
| Securities (stub) | EDGAR RSS / full-text `dateRange`; cursor = last accession date; ≤10 req/s | ([SEC accessing data](https://www.sec.gov/search-filings/edgar-search-assistance/accessing-edgar-data)) |

The cursor is updated **only on a fully successful source pass**, so a failure mid-source re-fetches an overlapping window — safe because dedup (§3.2) absorbs the overlap. **Recall bias:** when in doubt, re-fetch and dedup rather than advance the cursor.

### 3.2 Content-addressed dedup (don't re-process / re-emit)
A `seen` index keyed by stable identity. Three layers, cheapest first:

1. **Canonical id** — DOI / arXiv id / URL-normalized / repo+sha. Exact match ⇒ already known.
2. **Exact content hash** — SHA-256 of normalized title+abstract/body. Catches the same item arriving via two sources (e.g. a paper seen on arXiv and on HN). Exact hashing removes identical items but misses near-duplicates ([Manku/Google](https://research.google.com/pubs/archive/33026.pdf)).
3. **Near-duplicate fingerprint** — **SimHash** (64-bit, Hamming-distance threshold) over the body to fold reposts / cross-posts / mirror copies. SimHash gives small fingerprints with the property that near-duplicates differ in few bits ([Manku/Google](https://research.google.com/pubs/archive/33026.pdf), [Naman](https://naman.so/blog/simhash-web-crawl-caching)). MinHash+LSH is the alternative if we later need set-similarity at scale ([Milvus](https://milvus.io/blog/minhash-lsh-in-milvus-the-secret-weapon-for-fighting-duplicates-in-llm-training-data.md)) — overkill for a narrow weekly list. **v1 = layers 1+2; SimHash is layer-3, behind a flag** (precision/recall of the threshold is an open question — false-merge would *drop* a finding, which violates recall priority).
4. **Export idempotency** — each export bundle carries an `idempotency_key = hash(finding_id + target + classification_version)`; an `ExportAdapter` re-emitting the same key is a no-op, so retries never double-route a novelty-threat to CAW-03.

| Concern | v1 mechanism | Stance |
| --- | --- | --- |
| Re-fetch on re-run | per-source cursor watermark | adopt |
| Same item, two sources | canonical id + SHA-256 | adopt |
| Reposts / mirrors | SimHash (flagged, conservative threshold) | adopt as opt-in; recall-safe default = keep both |
| Double export on retry | idempotency key per bundle | adopt |

## 4. The ports (the seams)
Three ports, matching brief §9. Each is a small typed interface (Python `Protocol`-style; default runtime is a Python pipeline, contract is language-agnostic). All ports consume/return the radar's own **provenance-carrying** value objects (brief §7) so the pipeline stays adapter-independent.

### 4.1 SourceAdapter — where findings come from (driven)
```python
class SourceAdapter(Protocol):
    capabilities: AdapterCapabilities   # family, cursor_kind, rate_limit, tos_class, provides=[PAPER, REPO, THREAD, REPORT, ARTICLE]
    def discover(self, watch: WatchQuery, cursor: Cursor | None) -> list[ItemRef]: ...   # list new refs since cursor
    def fetch(self, ref: ItemRef) -> RawFinding: ...        # pull provenance-tagged raw finding (origin/date/retrieval)
    def health(self) -> HealthStatus: ...                   # reachable? auth ok? within rate budget? (preflight)
# RawFinding = canonical_id + source provenance + title/body + boundary=public + raw payload ref (large artifacts by path)
# v1 adapters: ArxivS2SourceAdapter, RssBlogSourceAdapter, GithubSourceAdapter
# stub adapters: HnRedditSourceAdapter, SecuritiesReportSourceAdapter, NewsletterSourceAdapter, InternalFeedSourceAdapter
```
Key generalization: arXiv, an RSS blog, and a future HN connector are interchangeable behind `fetch() -> RawFinding`. **Classification and dedup never know the source.** Every adapter is **read-only on public sources** and declares its `tos_class` + `rate_limit` so the core can throttle and a ToS-unsafe adapter is refused at preflight (brief §12).

### 4.2 ExportAdapter — where signals go (driven, cross-boundary)
```python
class ExportAdapter(Protocol):
    capabilities: AdapterCapabilities   # target, accepts=[SOURCE_CLAIM, NOVELTY_SIGNAL, OPEN_QUESTION], bundle_format
    def can_accept(self, signal: RoutedSignal) -> Acceptance: ...   # type/boundary/format preflight
    def export(self, signal: RoutedSignal, ctx: ExportContext) -> ExportReceipt: ...   # write a boundary bundle (idempotent)
# v1 adapters: Caw02SourceClaimExportAdapter, Caw03NoveltySignalExportAdapter,
#              Caw01OpenQuestionExportAdapter, Caw06OpenQuestionExportAdapter
# stub adapters: other downstream targets
```
Each export is a **file/bundle written across an explicit import/export boundary** — never a shared store (brief §1, §8). The radar **proposes**; it does not write into a sibling's database. Generated summaries in a bundle are marked `kind=generated` (not evidence; brief §5, §12). Idempotency key (§3.2) lives here so retries are safe.

### 4.3 SchedulerAdapter — what fires a Run (driving)
```python
class SchedulerAdapter(Protocol):
    capabilities: AdapterCapabilities   # cadence support, native_catchup: bool, native_overlap_guard: bool
    def install(self, run_spec: RunSpec) -> ScheduleHandle: ...   # register the cadence (e.g. write a crontab line / timer unit)
    def status(self) -> ScheduleStatus: ...                       # next fire, last fire, healthy?
    def uninstall(self, handle: ScheduleHandle) -> None: ...
# v1 adapter: CronSchedulerAdapter (writes a crontab entry calling `caw05 run --window weekly`)
# stub adapters: SystemdTimerSchedulerAdapter, GithubActionsSchedulerAdapter, CloudSchedulerAdapter, AirflowSchedulerAdapter
```
The SchedulerAdapter only **installs/inspects the trigger**; the Run wrapper (§2.2) owns lock, catch-up, heartbeat, resume — so a weak scheduler (cron, `native_catchup=False`) is still correct. An adapter that advertises `native_catchup=True` (systemd `Persistent=true`) lets the wrapper skip its own catch-up bookkeeping.

## 5. Registry + config selection
Adapters are **registered** (never hard-coded into the pipeline) and **selected by config** — same pattern as the sibling product CAW-03 (a separate product; no shared registry). Two-layer discovery into one registry:

1. **Built-in registration** — v1 adapters register at import via decorator: `@register(port="source", id="arxiv-s2")`.
2. **Entry-point discovery** — external adapters self-advertise via package metadata (PyPA entry-point groups, e.g. `caw05.source_adapters`, `caw05.export_adapters`, `caw05.scheduler_adapters`), discovered with `importlib.metadata` — so a future connector ships as its own package without touching CAW-05's tree.

```python
class AdapterRegistry:
    def register(self, port: PortName, id: str, factory: Callable[[AdapterConfig], Adapter]) -> None: ...
    def get(self, port: PortName, id: str, cfg: AdapterConfig) -> Adapter: ...
    def list(self, port: PortName) -> list[AdapterDescriptor]: ...   # ids + capability descriptors (preflight / CLI / MCP)
```

Selection is config-driven — one block per port, no code change to switch:
```toml
# caw05.config.toml — the ONLY place wiring changes
[adapters.source]    active = ["arxiv-s2", "rss-blog", "github"]   # families fan in
[adapters.export]    active = ["caw02-source-claim", "caw03-novelty", "caw01-open-question", "caw06-open-question"]
[adapters.scheduler] active = "cron"

[adapters.source.arxiv-s2]    sets = ["cs.AR","cs.LG"]   cursor_store = "state/arxiv.cursor"   rate_limit = "1/3s"
[adapters.source.hn-reddit]   enabled = false            # stub present, off until connector lands
[adapters.scheduler.cron]     schedule = "0 7 * * MON"   target = "caw05 run --window weekly"
```
**Preflight** (before any Run): the core resolves each `active` id, reads its **capability descriptor**, and validates the wiring — every export `accepts` the signal kinds the run will route, every source declares a legal `tos_class` and a cursor kind, required auth/config is present, and **no `active` adapter is a stub**. A missing/disabled/incapable/ToS-unsafe adapter fails *here* with an actionable message, not mid-run.

## 6. Capability descriptors
```python
@dataclass(frozen=True)
class AdapterCapabilities:
    port: PortName                       # "source" | "export" | "scheduler"
    id: str; version: str
    provides: list[DataKind] = []        # SourceAdapter: PAPER/REPO/THREAD/REPORT/ARTICLE
    accepts: list[SignalKind] = []       # ExportAdapter: SOURCE_CLAIM/NOVELTY_SIGNAL/OPEN_QUESTION
    cursor_kind: Literal["oai-pmh","etag","since-id","date-range","none"] = "none"
    tos_class: Literal["public-open","public-rate-limited","tos-restricted"] = "public-open"
    rate_limit: str | None = None        # e.g. "10/s" (EDGAR), "10000/hr" (HN Algolia)
    requires_config: list[str] = []      # preflight checks these
    maturity: Literal["v1","stub","experimental"] = "stub"
```
Descriptors make the system **self-describing**: the CLI/MCP lists adapters; preflight does capability + legality negotiation without doing I/O; a `stub` maturity surfaces so no Run silently depends on an unimplemented connector; a `tos-restricted` source is refused unless explicitly cleared.

## 7. The "documented stub" pattern (future adapters)
A future adapter ships in v1 as a **documented stub**: the real interface, a not-implemented marker, a capability descriptor with `maturity="stub"`, and a config example. Wiring the real connector later = filling in the method bodies of *that one file*.

```python
@register(port="source", id="hn-reddit")
class HnRedditSourceAdapter(SourceAdapter):
    """STUB — Hacker News (Algolia) + Reddit community source. Implement when the connector is approved.
    Contract: SourceAdapter (§4.1). HN Algolia: no key, 10k req/hr/IP. Reddit: OAuth + rate-limited ToS — confirm
    legal/ToS before enabling (PRODUCT-BRIEF §5/§12). Must return provenance-tagged RawFinding, boundary=public.
    Config example:
        [adapters.source.hn-reddit]
        hn_query = "memory wall LLM"   reddit_subs = ["MachineLearning"]   auth = "env:REDDIT_TOKEN"
    """
    capabilities = AdapterCapabilities(
        port="source", id="hn-reddit", version="0.0.0",
        provides=[THREAD, ARTICLE], cursor_kind="since-id",
        tos_class="public-rate-limited", rate_limit="10000/hr",
        requires_config=["hn_query"], maturity="stub")

    def discover(self, watch, cursor): raise NotImplementedError("hn-reddit source not yet wired (PRODUCT-BRIEF §9 non-goal in v1)")
    def fetch(self, ref):              raise NotImplementedError(...)
    def health(self):                  return HealthStatus.not_implemented("stub")
```
Rules: a stub is **registered and discoverable** (appears in `registry.list()` / CLI / MCP) but **config-disabled by default**; preflight refuses to run a stub that is `active`, pointing at the file to implement. Stubs required by the brief §9:
- **Source:** `HnRedditSourceAdapter`, `SecuritiesReportSourceAdapter` (EDGAR ≤10 req/s, RSS + data.sec.gov JSON, no key — [SEC](https://www.sec.gov/search-filings/edgar-application-programming-interfaces)), `NewsletterSourceAdapter`, `InternalFeedSourceAdapter`.
- **Export:** additional downstream targets beyond CAW-01/02/03/06.
- **Scheduler:** `SystemdTimerSchedulerAdapter` (native `Persistent=true` catch-up), `GithubActionsSchedulerAdapter`, `CloudSchedulerAdapter`, `AirflowSchedulerAdapter`.

## 8. Why this generalizes (the seam test)
A change is "open by design" if a new integration touches **only one adapter file + one config block**.

| New integration | What gets added | What is NOT touched |
| --- | --- | --- |
| HN/Reddit as a source | implement `HnRedditSourceAdapter`, enable config | pipeline, classification, dedup, other adapters |
| Securities reports (EDGAR) | implement `SecuritiesReportSourceAdapter` | the cursor/dedup core (consumes `RawFinding`) |
| New downstream consumer | implement an `ExportAdapter`, flip `active` | the routing rules (operate on `RoutedSignal`) |
| Move cron → systemd timer | implement `SystemdTimerSchedulerAdapter`, flip `active` | the Run wrapper (lock/catch-up/heartbeat stay in core) |
| Swap cron → GitHub Actions | implement `GithubActionsSchedulerAdapter` | everything downstream of `caw05 run` |

If any of these forces a pipeline-core edit, the contract is leaking and must be revisited (revisit trigger).

## 9. Tradeoffs

| Decision | Pros | Cons / cost | Stance |
| --- | --- | --- | --- |
| cron as v1 scheduler (brief-fixed) + Run-wrapper guarantees | universal, zero-dep; correctness independent of scheduler strength | wrapper must reimplement catch-up/overlap/heartbeat cron lacks | adopt (brief §9) |
| Catch-up via per-source **cursor**, not via clock replay | a missed week self-heals; works on any scheduler | needs durable cursor store + careful "advance only on success" | adopt |
| Content-addressed dedup (id → SHA → SimHash) | duplicate-free, cross-source merge; recall-safe defaults | SimHash threshold risks false-merge (drops a finding) | adopt layers 1–2; SimHash opt-in |
| Export idempotency key | retries never double-route to siblings | key must encode classification version | adopt |
| Three ports + registry + config | swap source/export/scheduler freely; testable with fakes | upfront contract design; indirection | adopt (brief §9 mandates) |
| Documented stubs in v1 | seams provably exist; "fill one file" path; ToS surfaced early | dead code until wired | adopt (brief §9 requires) |

## Open Questions
Track in `../08-research-plan/open-questions.md`:
- TODO(open-question: heartbeat/dead-man's-switch sink — local "no receipt in N days" check, or an external dead-man service? what is the alert channel given "no shared substrate"?)
- TODO(open-question: SimHash Hamming threshold + body normalization for layer-3 dedup — what false-merge rate is acceptable given recall is the mission? is layer-3 even on for v1?)
- TODO(open-question: when multiple `SourceAdapter`s surface the same item, which provenance wins on merge, and is the dropped source still recorded in the ledger?)
- TODO(open-question: where do per-adapter secrets/rate-budgets live given "no shared runtime substrate" — per-adapter config + env refs only?)
- TODO(open-question: is a long-running Run modeled as one synchronous process or as resumable stage-jobs with a job handle? affects crash-resume + the CLI/MCP `status` contract.)
- TODO(open-question: exact entry-point group names + adapter SemVer/compat policy — how does the core reject an adapter built against an old port version?)
- TODO(open-question: Reddit ToS/OAuth legality for the stub — does the brief's "legal/ToS-safe only" rule permit Reddit at all, or HN-only first?)

## Implications for runbooks
- **RB (core/Run-wrapper):** implement the Run lifecycle (§2.3) — single-flight lock, stage checkpoints/resume, run-receipt + heartbeat, `--since` backfill. Leave the tree green with fakes (no real sources yet). Acceptance: a killed Run resumes from the last stage; a re-run of a `done` Run is a no-op.
- **RB (incremental/dedup):** implement the cursor store (advance-on-success) + the `seen` index (canonical id + SHA-256; SimHash behind a flag) + export idempotency keys. Acceptance: re-running the same window fetches new=0, dup=all; a retry does not double-export.
- **RB (ports):** define the three `Protocol` interfaces + value objects (`RawFinding`, `RoutedSignal`, `Cursor`, `AdapterCapabilities`, descriptors). Fakes only.
- **RB (registry/config):** `AdapterRegistry` (decorator + entry-point discovery), `caw05.config.toml` loader, and **preflight** (capability + ToS + no-active-stub validation). Acceptance: preflight rejects a stub/incapable/ToS-unsafe/misconfigured wiring with an actionable message.
- **RB (v1 adapters):** `ArxivS2SourceAdapter`, `RssBlogSourceAdapter`, `GithubSourceAdapter`; `Caw02SourceClaimExportAdapter`, `Caw03NoveltySignalExportAdapter`, `Caw01OpenQuestionExportAdapter`, `Caw06OpenQuestionExportAdapter`; `CronSchedulerAdapter`.
- **RB (stubs):** ship every brief-§9 stub via the §7 template — registered, `maturity="stub"`, config-disabled. Acceptance: each appears in `registry.list()` and is refused by preflight when forced active.
- Cross-product exports (CAW-01/02/03/06) are **import/export boundary bundles**, not shared stores (Independence §1) — runbooks must keep them behind the `ExportAdapter` contract only, and mark generated summaries as non-evidence.
