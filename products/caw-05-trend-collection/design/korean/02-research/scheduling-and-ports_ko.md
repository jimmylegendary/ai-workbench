# 스케줄링 & 포트 (레이더의 자동화 척추 + 통합 이음새)

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF_ko.md), [../_meta/DOC-CONVENTIONS.md](../_meta/DOC-CONVENTIONS_ko.md), `../01-decisions/ADR-0006-storage-and-scheduling.md` (TODO), `../01-decisions/ADR-0003-source-adapters-and-ingestion.md` (TODO), `../01-decisions/ADR-0007-export-boundaries.md` (TODO), `../08-research-plan/open-questions.md` (TODO)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## Purpose
이 문서는 **주간 레이더가 무인으로 어떻게 실행되며, 어떻게 source/sink/scheduler에 비종속적으로 유지되는가**를 결정한다. 세 가지: (1) **scheduler 모델** — 무엇이 주간 Run을 발화시키는가, 누락된 Run과 중첩을 어떻게 다루는가, 크래시 후 어떤 상태가 살아남는가; (2) **incremental / dedup** 전략 — 재실행 시 이미 본 것을 다시 수집·재분류·재방출하지 않도록; (3) **ports & adapters** 설계 — 계열별 `SourceAdapter`, 대상별 `ExportAdapter`, `SchedulerAdapter` — config 기반 registry와 **documented-stub**(문서화된 스텁) 패턴 (HN/Reddit, 증권, 뉴스레터, 기타 scheduler) 포함. 이 문서는 interest 모델, 분류 루브릭(threat/support/adjacent/noise), related-work ledger 스키마, synthesis 출력 포맷을 결정하지 *않는다* — 그것들은 이 포트들을 *소비하는* 별도의 ADR이다. 또한 어떤 stub 커넥터도 구현하지 않는다: v1은 v1 adapter + 등록된 stub만 출하한다 (brief §9, §11).

## 1. 문제 & 힘(forces)
레이더의 가치는 **좁은 watch list에 대한 높은 recall을, 주간으로, 아무도 실행을 기억하지 않아도** 달성하는 것이다 (brief §1, §3). 근접 논문을 놓치는 것은 실존적 novelty 위험이므로, 자동화는 한 주를 조용히 건너뛰거나, 어떤 finding을 CAW-03으로 이중 방출하거나, 재시도 시 digest를 다시 스팸해서는 안 된다. Run은 multi-source fan-in → classify → synthesize → export이며, 대상은 **공개, rate-limit, ToS 제약**이 있는 소스들이다 (brief §5, §12).

| 힘(Force) | 설계에 대한 함의 |
| --- | --- |
| 주간 cadence, 무인, 조용히 건너뛰면 안 됨 (recall이 미션) | scheduler는 누락된 Run을 **catch-up**하고 heartbeat을 방출해야 함; 건너뛴 한 주는 no-op이 아니라 알림(alert) |
| 재실행 / 재시도가 finding, ledger row, export를 중복시키면 안 됨 | **per-source incremental cursor + content-addressed dedup**가 adapter별이 아니라 핵심(core) |
| 소스가 이질적이고 법적으로 제약됨 (지금은 arXiv, RSS, GitHub; 나중에 HN/Reddit, 증권, 뉴스레터) | 하나의 `SourceAdapter` 계약; 각 계열은 단지 adapter일 뿐; ToS/rate-limit은 per-adapter 역량 |
| Export는 독립 제품 경계를 넘는다 (CAW-01/02/03/06), 공유 저장소 없음 (brief §1, §8) | 하나의 `ExportAdapter` 계약; 각 대상은 파일/번들 경계이지 공유 DB가 아님 |
| scheduler 자체가 바뀔 수 있음 (지금은 cron; 나중에 다른 scheduler) | `SchedulerAdapter`로 *트리거*를 교체 가능하게; 파이프라인은 절대 cron을 import하지 않음 |
| 코드는 우리가 아니라 builder가 작성 | 타입 있는 계약 + registry/config 설계 + stub 템플릿을 전달; 구체 코드는 runbook의 몫 |

## 2. Scheduler 모델
schedule은 파이프라인을 **트리거**할 뿐 도메인 로직을 소유하지 않는다. 작업 단위는 **Run**이다: 멱등적이고 재개 가능한 호출 `caw05 run --window weekly`. scheduler의 유일한 임무는 "cadence에 맞춰, 딱 충분한 횟수만큼 Run을 시작하고, 실행되지 않았으면 누군가에게 알리는 것"이다.

### 2.1 트리거 메커니즘 — cron vs systemd timer
v1은 **cron**이다 (brief §9: "v1 = cron; stub = 다른 scheduler"). 하지만 설계는 신뢰성이 중요한 머신에서도 살아남아야 한다. 현실적인 두 Linux 메커니즘:

| 옵션 | 누락된 Run의 catch-up | 중첩 가드 | 관측성(observability) | v1 적합성 |
| --- | --- | --- | --- | --- |
| **cron** | 없음 — 발화 시점에 머신이 꺼져 있으면 Run은 조용히 건너뛰어짐 ([dchost](https://www.dchost.com/blog/en/cron-vs-systemd-timers-the-friendly-way-to-ship-reliable-schedules-and-real-healthchecks/)) | 없음 — lockfile을 추가하지 않으면 stampede ([xtom](https://xtom.com/blog/systemd-vs-cron-linux-task-scheduling/)) | 리다이렉트하지 않으면 어디에도 로그 안 남음 | brief가 강제한 기본값; gap을 메우려면 wrap |
| **systemd timer** (`OnCalendar=` + `Persistent=true`) | calendar 이벤트가 누락되었으면 다음 부팅 시 한 번 실행 ([oneuptime](https://oneuptime.com/blog/post/2026-01-15-use-systemd-timers-ubuntu/view)) | service unit이 이중 시작하지 않음 | 기본적으로 journald에 기록 | 실제 호스트에 최적; `SchedulerAdapter`로 출하 |

**결정:** brief가 cron을 v1 adapter로 고정하므로, cron에 없는 catch-up/overlap/heartbeat 속성은 **scheduler에서 가정하지 않고 Run wrapper에서** 구현한다. `SchedulerAdapter`는 트리거를 추상화하므로 나중에 systemd-timer나 cloud-scheduler adapter가 그 속성들을 네이티브로 제공할 수 있다. 이로써 우리는 정직하게 유지된다: 레이더는 순수 cron에서도 올바르다.

### 2.2 Run wrapper가 보장하는 속성 (scheduler와 무관하게)
- **Single-flight lock.** Run은 배타적 lock을 획득한다 (lockfile/flock 또는 `run.lock` row); 하나가 진행 중일 때 들어온 두 번째 트리거는 쌓이지 않고 거부된다. (cron은 중첩 가드가 없으므로 우리가 추가한다.)
- **Catch-up은 시계가 아니라 watermark로.** 각 소스는 `last_success_cursor`를 가진다 (§3 참조). Run은 "cursor 이후의 모든 것"을 수집하므로, *누락된 한 주는 다음 Run이 자동으로 흡수한다* — 다음 Run의 window가 단지 더 긴 시간을 포괄할 뿐이다. catch-up은 scheduler가 누락된 발화를 재생하든 말든 무관하게 **cursor**의 속성이다.
- **Heartbeat / dead-man's-switch.** 모든 Run은 `run-receipt`(시작, 종료, per-source 카운트, 상태)를 기록한다. cadence + grace를 초과해 receipt이 없으면 **알림**("레이더가 어두워졌다")이며, "조용히 건너뛰면 안 됨"을 충족한다. (TODO(open-question: heartbeat sink — 로컬 점검 vs 외부 dead-man 서비스.))
- **재개 가능, 멱등 stage.** Run은 stage 파이프라인(`collect → dedup → classify → synthesize → export`)이며 stage별 checkpoint를 가진다; Run 도중 크래시는 마지막 완료 stage에서 재진입한다. 완료된 Run을 재실행하는 것은 no-op이다 (멱등 키, §3.2).
- **Backfill 모드.** `caw05 run --since <date>`는 cursor를 무시하고 일회성 과거 스윕을 수행한다 (watch list의 first-run seeding, brief §6).

### 2.3 Run 생명주기 (산문이 아니라 상태)
```
scheduled → acquiring-lock → collecting → deduping → classifying → synthesizing → exporting → done
                  │ lock held by another run → refused (logged, no error)
                  └ any stage crash → checkpoint kept → next trigger resumes from checkpoint
done → writes run-receipt {window, per_source: {fetched, new, dup}, classified_counts, exports[], status}
```

## 3. Run 간 incremental & dedup
독립적인 두 메커니즘; 둘이 함께 재실행을 저렴하고 중복 없게 만든다. 이 로직은 **core**에 있으므로, 모든 `SourceAdapter`가 공짜로 상속한다.

### 3.1 Per-source incremental cursor (재fetch하지 않기)
각 소스는 역량 기술자(capability descriptor)에 **cursor kind**를 광고하고, core는 마지막 성공 cursor를 영속화한다:

| 소스 계열 | Cursor 메커니즘 | 비고 / 근거 |
| --- | --- | --- |
| arXiv / Semantic Scholar | OAI-PMH `from=<last datestamp>`, `until`은 절대 설정 안 함; 마지막 서버 응답에서 `from`을 취함; 페이지를 넘기려면 `resumptionToken`을 전달 | arXiv OAI는 정확히 이를 위해 만들어짐; 토큰은 매일 만료되므로 mid-page 실패는 `from=<last datestamp>`로 복구 ([arXiv OAI](https://info.arxiv.org/help/oa/index.html), [OAI-PMH guidelines](https://www.openarchives.org/OAI/2.0/guidelines-harvester.htm)) |
| RSS / blogs | last-seen entry `id`/`guid` + `Last-Modified`/`ETag` conditional GET | 표준 feed 시맨틱; 저렴 |
| GitHub | events/commits의 `since=`; repo `pushed_at` watermark | per-watchlist repos |
| HN (stub) | Algolia `numericFilters=created_at_i>cursor`; 키 없음, 10k req/hr/IP | ([HN Algolia API](https://hn.algolia.com/api)) |
| 증권(Securities) (stub) | EDGAR RSS / full-text `dateRange`; cursor = 마지막 accession date; ≤10 req/s | ([SEC accessing data](https://www.sec.gov/search-filings/edgar-search-assistance/accessing-edgar-data)) |

cursor는 **소스 전체 패스가 완전히 성공했을 때만** 갱신되므로, 소스 도중 실패는 겹치는 window를 재fetch한다 — dedup(§3.2)이 겹침을 흡수하므로 안전하다. **Recall 편향:** 의심스러우면 cursor를 전진시키기보다 재fetch하고 dedup한다.

### 3.2 Content-addressed dedup (재처리 / 재방출하지 않기)
안정적 정체성으로 키잉된 `seen` 인덱스. 세 계층, 저렴한 것부터:

1. **Canonical id** — DOI / arXiv id / URL-정규화 / repo+sha. 정확 일치 ⇒ 이미 알려진 것.
2. **Exact content hash** — 정규화된 title+abstract/body의 SHA-256. 같은 항목이 두 소스로 도착하는 것을 잡음 (예: arXiv와 HN 둘 다에서 본 논문). exact hashing은 동일 항목을 제거하지만 near-duplicate는 놓침 ([Manku/Google](https://research.google.com/pubs/archive/33026.pdf)).
3. **Near-duplicate fingerprint** — body에 대한 **SimHash**(64-bit, Hamming 거리 임계값)로 repost / cross-post / mirror 복사본을 접음. SimHash는 near-duplicate가 적은 비트만 다르다는 속성을 가진 작은 fingerprint를 준다 ([Manku/Google](https://research.google.com/pubs/archive/33026.pdf), [Naman](https://naman.so/blog/simhash-web-crawl-caching)). 나중에 대규모 set-similarity가 필요하면 MinHash+LSH가 대안 ([Milvus](https://milvus.io/blog/minhash-lsh-in-milvus-the-secret-weapon-for-fighting-duplicates-in-llm-training-data.md)) — 좁은 주간 list에는 과함. **v1 = 계층 1+2; SimHash는 계층-3, 플래그 뒤에** (임계값의 precision/recall은 open question — false-merge는 finding을 *떨어뜨려* recall 우선순위를 위반함).
4. **Export idempotency** — 각 export 번들은 `idempotency_key = hash(finding_id + target + classification_version)`를 가진다; 같은 키를 재방출하는 `ExportAdapter`는 no-op이므로 재시도가 novelty-threat를 CAW-03으로 이중 라우팅하지 않는다.

| 우려 | v1 메커니즘 | 입장 |
| --- | --- | --- |
| 재실행 시 재fetch | per-source cursor watermark | 채택 |
| 같은 항목, 두 소스 | canonical id + SHA-256 | 채택 |
| Repost / mirror | SimHash (플래그, 보수적 임계값) | opt-in으로 채택; recall-safe 기본값 = 둘 다 유지 |
| 재시도 시 이중 export | 번들별 idempotency key | 채택 |

## 4. 포트들 (이음새)
세 포트, brief §9에 대응. 각각은 작은 타입 있는 인터페이스 (Python `Protocol` 스타일; 기본 런타임은 Python 파이프라인이며 계약은 언어 비종속). 모든 포트는 레이더 자신의 **provenance-carrying**(출처를 담은) 값 객체를 소비/반환하므로 (brief §7) 파이프라인이 adapter 비종속으로 유지된다.

### 4.1 SourceAdapter — finding이 어디서 오는가 (driven)
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
핵심 일반화: arXiv, RSS 블로그, 미래의 HN 커넥터는 `fetch() -> RawFinding` 뒤에서 상호 교환 가능하다. **분류와 dedup은 소스를 절대 모른다.** 모든 adapter는 **공개 소스에 대해 read-only**이며 자신의 `tos_class` + `rate_limit`을 선언하므로 core가 throttle할 수 있고 ToS-unsafe adapter는 preflight에서 거부된다 (brief §12).

### 4.2 ExportAdapter — signal이 어디로 가는가 (driven, cross-boundary)
```python
class ExportAdapter(Protocol):
    capabilities: AdapterCapabilities   # target, accepts=[SOURCE_CLAIM, NOVELTY_SIGNAL, OPEN_QUESTION], bundle_format
    def can_accept(self, signal: RoutedSignal) -> Acceptance: ...   # type/boundary/format preflight
    def export(self, signal: RoutedSignal, ctx: ExportContext) -> ExportReceipt: ...   # write a boundary bundle (idempotent)
# v1 adapters: Caw02SourceClaimExportAdapter, Caw03NoveltySignalExportAdapter,
#              Caw01OpenQuestionExportAdapter, Caw06OpenQuestionExportAdapter
# stub adapters: other downstream targets
```
각 export는 **명시적 import/export 경계를 넘어 기록되는 파일/번들**이다 — 절대 공유 저장소가 아님 (brief §1, §8). 레이더는 **제안한다(proposes)**; 형제 제품의 데이터베이스에 쓰지 않는다. 번들 내 생성된 요약은 `kind=generated`로 표시된다 (evidence 아님; brief §5, §12). idempotency key(§3.2)는 여기에 있으므로 재시도가 안전하다.

### 4.3 SchedulerAdapter — 무엇이 Run을 발화하는가 (driving)
```python
class SchedulerAdapter(Protocol):
    capabilities: AdapterCapabilities   # cadence support, native_catchup: bool, native_overlap_guard: bool
    def install(self, run_spec: RunSpec) -> ScheduleHandle: ...   # register the cadence (e.g. write a crontab line / timer unit)
    def status(self) -> ScheduleStatus: ...                       # next fire, last fire, healthy?
    def uninstall(self, handle: ScheduleHandle) -> None: ...
# v1 adapter: CronSchedulerAdapter (writes a crontab entry calling `caw05 run --window weekly`)
# stub adapters: SystemdTimerSchedulerAdapter, GithubActionsSchedulerAdapter, CloudSchedulerAdapter, AirflowSchedulerAdapter
```
SchedulerAdapter는 **트리거를 install/inspect**할 뿐이다; Run wrapper(§2.2)가 lock, catch-up, heartbeat, resume를 소유하므로 — 약한 scheduler(cron, `native_catchup=False`)도 여전히 올바르다. `native_catchup=True`를 광고하는 adapter(systemd `Persistent=true`)는 wrapper가 자체 catch-up 부기를 건너뛰게 해준다.

## 5. Registry + config 선택
adapter는 (파이프라인에 하드코딩되지 않고) **등록(register)**되며 **config로 선택**된다 — 형제 제품 CAW-03와 같은 패턴 (별도 제품; 공유 registry 없음). 하나의 registry로 들어가는 2계층 발견(discovery):

1. **Built-in registration** — v1 adapter는 import 시 데코레이터로 등록: `@register(port="source", id="arxiv-s2")`.
2. **Entry-point discovery** — 외부 adapter는 패키지 메타데이터(PyPA entry-point 그룹, 예: `caw05.source_adapters`, `caw05.export_adapters`, `caw05.scheduler_adapters`)로 자기 광고하며 `importlib.metadata`로 발견됨 — 따라서 미래 커넥터는 CAW-05의 트리를 건드리지 않고 자체 패키지로 출하된다.

```python
class AdapterRegistry:
    def register(self, port: PortName, id: str, factory: Callable[[AdapterConfig], Adapter]) -> None: ...
    def get(self, port: PortName, id: str, cfg: AdapterConfig) -> Adapter: ...
    def list(self, port: PortName) -> list[AdapterDescriptor]: ...   # ids + capability descriptors (preflight / CLI / MCP)
```

선택은 config 기반 — 포트당 한 블록, 전환에 코드 변경 없음:
```toml
# caw05.config.toml — the ONLY place wiring changes
[adapters.source]    active = ["arxiv-s2", "rss-blog", "github"]   # families fan in
[adapters.export]    active = ["caw02-source-claim", "caw03-novelty", "caw01-open-question", "caw06-open-question"]
[adapters.scheduler] active = "cron"

[adapters.source.arxiv-s2]    sets = ["cs.AR","cs.LG"]   cursor_store = "state/arxiv.cursor"   rate_limit = "1/3s"
[adapters.source.hn-reddit]   enabled = false            # stub present, off until connector lands
[adapters.scheduler.cron]     schedule = "0 7 * * MON"   target = "caw05 run --window weekly"
```
**Preflight** (어떤 Run 이전에): core는 각 `active` id를 해소하고, 그 **capability descriptor**를 읽어, wiring을 검증한다 — 모든 export가 Run이 라우팅할 signal kind를 `accepts`하는지, 모든 source가 합법적 `tos_class`와 cursor kind를 선언하는지, 필요한 auth/config가 존재하는지, 그리고 **어떤 `active` adapter도 stub이 아닌지**. 누락/비활성/무능력/ToS-unsafe adapter는 Run 도중이 아니라 *여기서* 실행 가능한 메시지와 함께 실패한다.

## 6. Capability descriptor
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
descriptor는 시스템을 **자기 기술적(self-describing)**으로 만든다: CLI/MCP가 adapter를 나열하고; preflight가 I/O 없이 역량 + 합법성 협상을 수행하며; `stub` maturity가 드러나서 어떤 Run도 미구현 커넥터에 조용히 의존하지 않고; `tos-restricted` 소스는 명시적으로 승인되지 않으면 거부된다.

## 7. "Documented stub" 패턴 (미래 adapter)
미래 adapter는 v1에서 **documented stub**으로 출하된다: 실제 인터페이스, not-implemented 마커, `maturity="stub"`인 capability descriptor, 그리고 config 예시. 나중에 실제 커넥터를 wiring = *그 한 파일*의 메서드 본문을 채우는 것.

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
규칙: stub은 **등록되고 발견 가능**(`registry.list()` / CLI / MCP에 나타남)하지만 기본적으로 **config-disabled**이다; preflight는 `active`인 stub의 실행을 거부하며 구현할 파일을 가리킨다. brief §9가 요구하는 stub:
- **Source:** `HnRedditSourceAdapter`, `SecuritiesReportSourceAdapter` (EDGAR ≤10 req/s, RSS + data.sec.gov JSON, 키 없음 — [SEC](https://www.sec.gov/search-filings/edgar-application-programming-interfaces)), `NewsletterSourceAdapter`, `InternalFeedSourceAdapter`.
- **Export:** CAW-01/02/03/06을 넘는 추가 downstream 대상.
- **Scheduler:** `SystemdTimerSchedulerAdapter` (네이티브 `Persistent=true` catch-up), `GithubActionsSchedulerAdapter`, `CloudSchedulerAdapter`, `AirflowSchedulerAdapter`.

## 8. 왜 이것이 일반화되는가 (이음새 테스트)
어떤 변경이 **adapter 파일 하나 + config 블록 하나**만 건드린다면 그 변경은 "open by design"이다.

| 새 통합 | 추가되는 것 | 건드리지 않는 것 |
| --- | --- | --- |
| source로서의 HN/Reddit | `HnRedditSourceAdapter` 구현, config 활성화 | 파이프라인, 분류, dedup, 다른 adapter |
| 증권 보고서 (EDGAR) | `SecuritiesReportSourceAdapter` 구현 | cursor/dedup core (`RawFinding`을 소비) |
| 새 downstream 소비자 | `ExportAdapter` 구현, `active` 전환 | 라우팅 규칙 (`RoutedSignal`에 작동) |
| cron → systemd timer 이동 | `SystemdTimerSchedulerAdapter` 구현, `active` 전환 | Run wrapper (lock/catch-up/heartbeat는 core에 유지) |
| cron → GitHub Actions 교체 | `GithubActionsSchedulerAdapter` 구현 | `caw05 run` 이후의 모든 것 |

이들 중 어느 하나라도 파이프라인 core 편집을 강제한다면 계약이 새고 있는 것이며 재검토해야 한다 (revisit trigger).

## 9. 트레이드오프

| 결정 | 장점 | 단점 / 비용 | 입장 |
| --- | --- | --- | --- |
| v1 scheduler로 cron (brief-고정) + Run-wrapper 보장 | 보편적, 무의존성; 정확성이 scheduler 강도와 무관 | wrapper가 cron에 없는 catch-up/overlap/heartbeat을 재구현해야 함 | 채택 (brief §9) |
| 시계 재생이 아니라 per-source **cursor**로 catch-up | 누락된 한 주가 self-heal; 어떤 scheduler에서도 작동 | 내구성 있는 cursor store + 신중한 "성공 시에만 전진" 필요 | 채택 |
| Content-addressed dedup (id → SHA → SimHash) | 중복 없음, cross-source 병합; recall-safe 기본값 | SimHash 임계값이 false-merge(finding 누락) 위험 | 계층 1–2 채택; SimHash opt-in |
| Export idempotency key | 재시도가 형제로 이중 라우팅 안 함 | key가 classification version을 인코딩해야 함 | 채택 |
| 세 포트 + registry + config | source/export/scheduler 자유 교체; fake로 테스트 가능 | 사전 계약 설계; 간접성 | 채택 (brief §9 강제) |
| v1의 documented stub | 이음새가 입증 가능하게 존재; "한 파일 채우기" 경로; ToS 조기 표면화 | wiring 전까지 dead code | 채택 (brief §9 요구) |

## Open Questions
`../08-research-plan/open-questions.md`에서 추적:
- TODO(open-question: heartbeat/dead-man's-switch sink — 로컬 "N일 내 receipt 없음" 점검인가, 아니면 외부 dead-man 서비스인가? "공유 substrate 없음"을 고려할 때 알림 채널은 무엇인가?)
- TODO(open-question: 계층-3 dedup을 위한 SimHash Hamming 임계값 + body 정규화 — recall이 미션임을 고려할 때 어느 정도의 false-merge rate가 수용 가능한가? 계층-3이 v1에서 켜져 있긴 한가?)
- TODO(open-question: 여러 `SourceAdapter`가 같은 항목을 표면화할 때, 병합 시 어느 provenance가 이기는가, 그리고 떨어진 소스도 ledger에 기록되는가?)
- TODO(open-question: "공유 런타임 substrate 없음"을 고려할 때 per-adapter secret/rate-budget은 어디에 사는가 — per-adapter config + env 참조만?)
- TODO(open-question: 장시간 실행 Run은 하나의 동기 프로세스로 모델링되는가, 아니면 job handle을 가진 재개 가능한 stage-job으로? crash-resume + CLI/MCP `status` 계약에 영향.)
- TODO(open-question: 정확한 entry-point 그룹 이름 + adapter SemVer/호환 정책 — core는 구 포트 버전으로 빌드된 adapter를 어떻게 거부하는가?)
- TODO(open-question: stub을 위한 Reddit ToS/OAuth 합법성 — brief의 "법적/ToS-safe만" 규칙이 Reddit을 아예 허용하는가, 아니면 HN-only가 먼저인가?)

## Runbook에 대한 함의
- **RB (core/Run-wrapper):** Run 생명주기(§2.3) 구현 — single-flight lock, stage checkpoint/resume, run-receipt + heartbeat, `--since` backfill. fake로 트리를 green으로 유지 (아직 실제 소스 없음). 수용 기준: 죽은 Run이 마지막 stage에서 재개됨; `done` Run의 재실행이 no-op.
- **RB (incremental/dedup):** cursor store(advance-on-success) + `seen` 인덱스(canonical id + SHA-256; SimHash는 플래그 뒤) + export idempotency key 구현. 수용 기준: 같은 window 재실행 시 new=0, dup=all; 재시도가 이중 export 안 함.
- **RB (ports):** 세 `Protocol` 인터페이스 + 값 객체(`RawFinding`, `RoutedSignal`, `Cursor`, `AdapterCapabilities`, descriptor) 정의. fake만.
- **RB (registry/config):** `AdapterRegistry`(데코레이터 + entry-point discovery), `caw05.config.toml` loader, 그리고 **preflight**(역량 + ToS + no-active-stub 검증). 수용 기준: preflight가 stub/무능력/ToS-unsafe/오설정 wiring을 실행 가능한 메시지와 함께 거부.
- **RB (v1 adapters):** `ArxivS2SourceAdapter`, `RssBlogSourceAdapter`, `GithubSourceAdapter`; `Caw02SourceClaimExportAdapter`, `Caw03NoveltySignalExportAdapter`, `Caw01OpenQuestionExportAdapter`, `Caw06OpenQuestionExportAdapter`; `CronSchedulerAdapter`.
- **RB (stubs):** 모든 brief-§9 stub을 §7 템플릿으로 출하 — 등록됨, `maturity="stub"`, config-disabled. 수용 기준: 각각이 `registry.list()`에 나타나고 강제로 active되면 preflight가 거부.
- Cross-product export (CAW-01/02/03/06)는 공유 저장소가 아니라 **import/export 경계 번들**이다 (Independence §1) — runbook은 이들을 오직 `ExportAdapter` 계약 뒤에 유지하고 생성된 요약을 non-evidence로 표시해야 한다.
