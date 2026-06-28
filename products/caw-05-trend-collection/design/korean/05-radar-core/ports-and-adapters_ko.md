# Radar Core — Ports & Adapters (포트와 어댑터)

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - **Source of truth:** [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF_ko.md) (§9 개방형 통합 인터페이스, §12 가드레일)
  - Conventions: [../_meta/DOC-CONVENTIONS.md](../_meta/DOC-CONVENTIONS_ko.md)
  - ADR-0001 product surface — [../01-decisions/ADR-0001-product-surface-and-outputs_ko.md](../01-decisions/ADR-0001-product-surface-and-outputs_ko.md) (the Run; `FormatRenderer`)
  - ADR-0003 source adapters — [../01-decisions/ADR-0003-source-adapters-and-ingestion_ko.md](../01-decisions/ADR-0003-source-adapters-and-ingestion_ko.md)
  - ADR-0004 classification & triage — [../01-decisions/ADR-0004-classification-and-triage_ko.md](../01-decisions/ADR-0004-classification-and-triage_ko.md) (`Classifier`/라우팅 포트)
  - ADR-0006 storage & scheduling — [../01-decisions/ADR-0006-storage-and-scheduling_ko.md](../01-decisions/ADR-0006-storage-and-scheduling_ko.md) (`SchedulerAdapter`)
  - ADR-0007 export boundaries — [../01-decisions/ADR-0007-export-boundaries_ko.md](../01-decisions/ADR-0007-export-boundaries_ko.md) (`ExportAdapter`)
  - Research (근거 + 레지스트리 + stub 템플릿): [../02-research/scheduling-and-ports_ko.md](../02-research/scheduling-and-ports_ko.md)
  - Siblings: [./synthesis-and-formats_ko.md](./synthesis-and-formats_ko.md), [./export-boundaries_ko.md](../05-radar-core/export-boundaries_ko.md)

## Purpose
이 문서는 **core 레벨**의 ports-and-adapters 설계를 확정한다. 다섯 개의 포트(`Source`, `Export`, `Scheduler`,
`FormatRenderer`, `Classifier`), 이들을 연결하는 config 기반 레지스트리, 시스템을 자기 기술적(self-describing)으로
만드는 capability descriptor, 그리고 **documented-stub** 패턴이 그것이다. 아키텍처 근거, seam-test 표,
그리고 incremental/dedup/cursor 메커니즘은
[../02-research/scheduling-and-ports_ko.md](../02-research/scheduling-and-ports_ko.md)에서 권위를 가지며 **상호 링크로 연결할 뿐
중복하지 않는다**. 이 문서가 강제하는 핵심 불변식: **어댑터는 triage/routing을 우회할 수 없다** — 모든 finding은
출력이나 export 이전에 Run의 classify → route → review-gate 척추(spine)를 거친다.

## 1. The Run과 포트가 붙는 지점
작업의 단위는 **Run**(ADR-0001)이다: `caw05 run --window weekly`, 멱등하며 재개 가능한 파이프라인이다. 각
stage는 하나의 포트에 붙고, 파이프라인 core는 절대 구체적인 어댑터를 import하지 않는다.

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

**병목 지점(choke point):** 어댑터는 오직 `RawFinding`(source)을 생산하거나 `RoutedSignal`(export)을 소비할 뿐이다.
어느 쪽도 core의 classify/route/review-gate stage를 단락(short-circuit)시킬 수 없다 — 이것이 *생성된 요약이 절대
근거로 export되지 않으며* *검토되지 않은 novelty-threat가 CAW-03의 gate에 도달하지 않는다*는 구조적 보장이다
(brief §11, §12; ADR-0004 §5; [./export-boundaries_ko.md](../05-radar-core/export-boundaries_ko.md)).

## 2. 다섯 개의 포트 (시그니처는 빌드 가이드)
각 포트는 작은 타입드 `Protocol`이다. 모두 radar 고유의 provenance를 담은 value object를 소비/반환하므로
파이프라인은 어댑터 독립적으로 유지된다. `SourceAdapter`, `ExportAdapter`, `SchedulerAdapter`는 research 문서 §4에
전체가 명세되어 있으며, 여기서는 synthesis/triage 두 포트를 추가하여 간결하게 재현한다.

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

**참고 — dedup은 포트가 아니다.** cursor watermark + content-addressed dedup은 core에 살기 때문에 모든
`SourceAdapter`가 이를 공짜로 상속받고, 어떤 어댑터도 dedup을 건너뛸 수 없다(research §3). 스케줄러는 Run을
*발화(fire)*만 한다. lock/catch-up/heartbeat/resume은 Run wrapper에 살기 때문에 평범한 cron조차 올바르게 동작한다(research §2.2).

## 3. Config 기반 레지스트리
어댑터는 (파이프라인에 하드코딩되지 않고) **등록**되며 **config로 선택**된다 — 형제 제품 CAW-03과 같은 패턴이다
(별개 제품이며 공유 레지스트리는 없다). 하나의 레지스트리로 들어가는 2계층 discovery:

1. **Built-in registration** — v1 어댑터는 import 시 데코레이터로 등록한다: `@register(port="source", id="arxiv-s2")`.
2. **Entry-point discovery** — 외부 어댑터는 패키지 메타데이터(PyPA entry-point group,
   예: `caw05.source_adapters`, `caw05.export_adapters`, `caw05.scheduler_adapters`, `caw05.format_renderers`,
   `caw05.classifiers`)로 자신을 광고하며 `importlib.metadata`로 발견된다 — 미래의 connector는 CAW-05의 트리를
   건드리지 않고 자체 패키지로 출하된다.

```python
class AdapterRegistry:
    def register(self, port: PortName, id: str, factory: Callable[[AdapterConfig], Adapter]) -> None: ...
    def get(self, port: PortName, id: str, cfg: AdapterConfig) -> Adapter: ...
    def list(self, port: PortName) -> list[AdapterDescriptor]: ...   # ids + capability descriptors (preflight / CLI / MCP)
```

선택은 config 기반이다 — 포트당 한 블록, 전환에 코드 변경이 없다:
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

## 4. Capability descriptor + preflight
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

**Preflight**(모든 Run 이전)은 각 `active` id를 해결하고, 그 descriptor를 읽고, wiring을 **I/O 없이** 검증한다:
모든 export가 run이 라우팅할 signal kind를 `accepts`하는지, 모든 source가 합법적인 `tos_class`와 cursor kind를
선언하는지, 필요한 auth/config가 존재하는지, 그리고 **어떤 `active` 어댑터도 `stub`이 아닌지**를 본다. 누락 /
비활성 / 무능력 / ToS 불안전 / 잘못 구성된 wiring은 run 중간이 아니라 *이 지점에서* 실행 가능한 메시지와 함께
실패한다. `tos-restricted` source는 명시적으로 승인되지 않는 한 거부된다(brief §12).

## 5. The documented-stub 패턴
미래의 어댑터는 v1에서 **documented stub**으로 출하된다: 실제 인터페이스, not-implemented 마커,
`maturity="stub"`인 descriptor, 그리고 config 예제이다. 나중에 실제 connector를 연결하는 것은 = *그 한 파일*의
메서드 본문을 채우는 일이다(research §7).

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

stub은 **등록되고 발견 가능**(`registry.list()` / CLI / MCP에 나타남)하지만 **기본적으로 config-disabled**이다.
preflight는 `active`인 stub의 실행을 거부하며 구현해야 할 파일을 가리킨다. brief §9가 요구하는 stub들:

| Port | Documented stubs |
|---|---|
| Source | `hn-reddit`, `securities` (SEC/EDGAR ≤10 req/s, no key), `newsletter`, `internal-feed` |
| Export | CAW-01/02/03/06 너머의 downstream target들 |
| Scheduler | `systemd-timer` (네이티브 `Persistent=true` catch-up), `github-actions`, `cloud-scheduler`, `airflow` |
| FormatRenderer | 미래 포맷 (예: `tweet-thread`) |
| Classifier | embedding-lane classifier (alpha, 라벨링된 eval set에 의해 게이팅됨 — ADR-0002) |

## 6. The seam test (왜 이것이 일반화되는가)
어떤 변경이 새 통합에서 **어댑터 파일 하나 + config 블록 하나만** 건드린다면 그것은 "open by design"이다. 전체
표는 research §8에 있으며, 핵심 케이스는:

| New integration | 추가되는 것 | 건드리지 않는 것 |
|---|---|---|
| HN/Reddit as a source | `hn-reddit` 구현, config 활성화 (ToS 승인 후) | 파이프라인, classify, dedup, 다른 어댑터 |
| New downstream consumer | `ExportAdapter` 구현, `active` 전환 | 라우팅 규칙 (`RoutedSignal` 위에서 동작) |
| New output format | `FormatRenderer` 구현, `active` 전환 | classify/export; base 템플릿이 manifest/banner를 담당 |
| cron → systemd timer | `systemd-timer` 구현, `active` 전환 | Run wrapper (lock/catch-up/heartbeat는 core에 잔류) |

이 중 어느 것이라도 파이프라인 core 편집을 강제한다면 계약이 새고 있는 것이다 — 그것이 재검토 트리거다.

## 7. Open Questions
[../08-research-plan/open-questions_ko.md](../08-research-plan/open-questions_ko.md)에서 추적한다:
- TODO(open-question: 정확한 entry-point group 이름 + 어댑터 SemVer/호환성 정책 — core는 오래된 포트 버전에 대해
  빌드된 어댑터를 어떻게 거부하는가?)
- TODO(open-question: "공유 런타임 substrate 없음"을 감안할 때 어댑터별 secret/rate-budget은 어디에 사는가 —
  어댑터별 config + env ref만으로?)
- TODO(open-question: `Classifier`는 하나의 포트인가 아니면 하위 포트(LF / LLM / human)의 cascade인가 — cascade는
  core에 속하는가 아니면 하나의 어댑터 뒤에 속하는가? ADR-0004로 해결.)
- TODO(open-question: stub을 위한 Reddit ToS/OAuth 적법성 — "legal/ToS-safe only"가 Reddit을 애초에 허용하는가,
  아니면 우선 HN-only인가?)

## 8. 런북에 대한 함의
- **RB (ports):** 다섯 개 `Protocol` 인터페이스 + value object(`RawFinding`, `Verdict`, `FindingGroup`,
  `Artifact`, `RoutedSignal`, `Cursor`, `AdapterCapabilities`, descriptor)를 정의. fake만 사용; 트리는 green 유지.
- **RB (registry/config):** `AdapterRegistry` (데코레이터 + entry-point discovery), `caw05.config.toml` 로더,
  그리고 **preflight** (capability + ToS + no-active-stub 검증). Acceptance: preflight가
  stub/무능력/ToS 불안전/잘못 구성된 wiring을 실행 가능한 메시지와 함께 거부.
- **RB (v1 adapters):** 위의 source/classifier/format/export/scheduler v1 어댑터들.
- **RB (stubs):** §5를 통해 모든 brief-§9 stub을 출하 — 등록됨, `maturity="stub"`, config-disabled. Acceptance:
  각각이 `registry.list()`에 나타나며 강제로 active 시 preflight가 거부.
- **RB (bypass guard):** classify → route → review-gate를 통과하지 않고는 어떤 어댑터 경로도 synth/export에
  도달하지 못함을 증명하는 테스트(§1의 choke-point 보장).
