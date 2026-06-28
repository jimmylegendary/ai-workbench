# Ports & Adapters Architecture (개방형 통합 이음새)

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO
- **Related:** [../_meta/PRODUCT-BRIEF.md](../_meta/PRODUCT-BRIEF_ko.md), [../_meta/DOC-CONVENTIONS.md](../_meta/DOC-CONVENTIONS_ko.md), `../01-decisions/ADR-0005-ports-and-adapters.md` (TODO), `../08-research-plan/open-questions.md` (TODO)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## 목적
이것은 CAW-03의 핵심(load-bearing) 아키텍처 연구다. **harness가 engine/source/sink에 무관하게 유지되는 방법**을 결정한다: port 집합, 그들의 타입이 지정된 계약, 런타임에 adapter를 선택하는 registry + config, 그리고 향후 connector(내부 wiki, 내부 experiment-server, venue 제출, patent 출원)가 **코어를 편집하지 않고 adapter 하나를 채워 넣음으로써** 연결되게 하는 "documented stub" 패턴. evidence-gate 규칙, claim-ledger 스키마, patent-vs-paper 작성 로직, 또는 storage 레이아웃은 결정하지 않는다 — 그것들은 이 port들을 *소비하는* 별도 ADR이다. 어떤 향후 connector도 구축하지 않는다(Non-goal §9): v1은 v1 adapter + stub만 제공한다.

## 1. 문제와 힘(forces)
CAW-03은 기존 writing 엔진(PaperOrchestra)을 감싸며, v1 시점에 **아직 존재하지 않는** 시스템들로부터 입력을 받고 출력을 보내야 한다. 브리프(§5)는 "개방형 통합 인터페이스"를 *필수 설계 속성*으로 만든다. 피해야 할 실패 양상: 향후 통합(예: 내부 wiki source)이 harness 코어, 라이프사이클 상태 기계, 또는 다른 adapter의 변경을 강제하는 것.

| Force | 설계에 대한 함의 |
| --- | --- |
| 엔진은 교체 가능하지만 PaperOrchestra가 기본값 | WritingEngine은 port여야 함; 코어는 PaperOrchestra를 직접 import하지 않음 |
| Source는 이질적임(CAW-02 번들, CAW-01 results, 향후 wiki/exp-server, 흩어진 로그) | 하나의 `SourceAdapter` 계약; CAW-01/02/wiki는 *모두* 그 뒤의 adapter일 뿐 |
| 출력은 지금은 파일로, 나중엔 wiki/venue/patent-filing으로 | 하나의 `Sink/PublishAdapter` 계약; human-gate는 adapter가 아니라 코어에 머무름(Non-goal §9) |
| 형제 제품들과 공유된 런타임 substrate 없음(Independence §1) | 모든 cross-product 링크는 명시적 import/export boundary 위의 adapter이지, 공유 store가 아님 |
| 코드는 우리가 아니라 builder가 작성 | 우리는 타입이 지정된 계약 + registry/config 설계 + stub template을 제공; 구체적 코드는 runbook의 일 |

## 2. 패턴 선택
Hexagonal(ports & adapters)이 올바른 backbone이다: 애플리케이션 코어는 **port**(의도를 표현하는 인터페이스)에만 의존하고, 구체적 I/O는 그것을 구현하는 **adapter**에 산다 — 코어는 어느 adapter가 연결되었는지 알지 못한다([Cockburn](https://alistair.cockburn.us/hexagonal-architecture), [Wikipedia](https://en.wikipedia.org/wiki/Hexagonal_architecture_(software))). adapter 추가는 "`adapters/`의 새 파일 하나 + registry의 한 줄"이어야 한다([Hasan, two-codebase study](https://saadh393.github.io/blog/adapter-port-architecture-two-cases)). 우리는 세 개의 하위 패턴을 결합한다:

| Sub-pattern | 여기서의 역할 | Reference |
| --- | --- | --- |
| Ports & adapters (hexagonal) | 코어 ↔ 외부 격리; port = 기술 연산이 아니라 capability | Cockburn |
| Plugin **registry** | 논리적 id → adapter factory 매핑; run별 해소 | 위의 plugin/registry 예시 |
| Entry-point **discovery** + **config selection** | adapter가 self-register; config가 활성 대상을 선택 | [PyPA entry points](https://packaging.python.org/specifications/entry-points/) |
| **Capability descriptor** | 각 adapter가 할 수 있는/필요로 하는 것을 선언해, 코어가 실행 전 배선을 검증 | (우리의 추가; §5 참조) |

방향이 중요하다: **driven ports**(harness가 바깥으로 호출)는 Source, WritingEngine, PatentEngine, Sink, Novelty를 다룬다. harness 자체의 표면(API/MCP/CLI/UI, 별도 ADR §8)은 코어로 *호출해 들어오는* **driving** adapter다. 이 문서는 driven 측을 다룬다.

## 3. port들 (이음새)
다섯 개의 port, 브리프의 §5 표와 일치한다. 각각은 작은 타입이 지정된 인터페이스다(여기서는 Python `Protocol` 스타일, 기본 엔진이 Python skill 모음이므로; 계약은 언어 무관). 모든 port는 harness 자체의 **provenance를 운반하는** 값 객체를 반환/소비하므로 라이프사이클(`claim → gate → draft → review → output`)이 adapter 무관하게 유지된다.

### 3.1 SourceAdapter — claims/evidence/results의 출처
```python
class SourceAdapter(Protocol):
    capabilities: AdapterCapabilities      # declares: provides=[CLAIM, EVIDENCE, RESULT, FIGURE], read_only, auth needs
    def discover(self, query: SourceQuery) -> list[BundleRef]: ...        # list available bundles (by id/URI)
    def fetch(self, ref: BundleRef) -> EvidenceBundle: ...                # pull a typed, provenance-tagged bundle
    def health(self) -> HealthStatus: ...                                 # reachable? auth ok? for preflight
# EvidenceBundle = claims[] (typed P1/P2/P3) + evidence refs + result-registry refs + figure/table manifest refs
# v1 adapters: Caw02BundleSourceAdapter, Caw01ResultSourceAdapter
# stub adapters: InternalWikiSourceAdapter, ExperimentServerSourceAdapter, ScatteredLogsSourceAdapter, UserBundleSourceAdapter
```
핵심 일반화: CAW-01/02와 향후 wiki는 `fetch() -> EvidenceBundle` 뒤에서 상호 교체 가능하다. **evidence gate**(별도 ADR)는 반환된 번들에서 실행되며 source를 결코 알지 못한다. 참조는 id/URI/path로 이뤄진다(브리프 §7); adapter는 상류 store를 복제하지 않는다.

### 3.2 WritingEngineAdapter — 작성 (PaperOrchestra를 감쌈)
```python
class WritingEngineAdapter(Protocol):
    capabilities: AdapterCapabilities      # declares: stages supported, multimodal?, citation-verify?, output formats
    def assemble_inputs(self, gated: GatedClaimSet, template: TemplateSpec) -> EngineInputs: ...
        # builds idea.md, experimental_log.md, template.tex, conference_guidelines.md, figures from the bundle
    def draft(self, inputs: EngineInputs, opts: DraftOptions) -> DraftArtifact: ...   # run the pipeline
    def score(self, draft: DraftArtifact) -> ScoreReport | None: ...                  # optional autoraters
# v1 adapter: PaperOrchestraEngineAdapter (delegates to outline→plotting→lit-review→section-writing→refinement + autoraters)
# stub adapters: other LLM writing engines
```
`assemble_inputs`는 브리프의 "엔진 입력을 구축하는 adapter"(§4)다 — PaperOrchestra의 `agent-research-aggregator`("흩어진 로그 → inputs")를 "gated workbench 번들 → inputs"로 일반화한다. 코어는 엔진에 `GatedClaimSet`(이미 evidence gate를 통과한)을 건넨다; 엔진은 gate를 통과하지 못한 claim을 결코 보지 않으므로, 엔진 교체가 거버넌스를 약화시킬 수 없다.

### 3.3 PatentEngineAdapter — patent 작성 (별도 경로)
```python
class PatentEngineAdapter(Protocol):
    capabilities: AdapterCapabilities      # declares: claim-drafting, prior-art search, patentability scoring
    def draft_claims(self, gated: GatedClaimSet, prior_art: PriorArtSet) -> PatentDraft: ...
    def patentability(self, draft: PatentDraft) -> PatentabilityReport: ...
# v1 adapter: BaselinePatentDrafterAdapter (in-house baseline drafter)
# stub adapters: ExternalPatentToolingAdapter
```
의도적으로 WritingEngine과 구별된다(브리프 §6): patent는 자체 gate와 **patent-first** 처리를 갖는다. 동일한 `GatedClaimSet` 앞단을 공유하므로, claim/evidence 선택과 novelty가 재사용된다.

### 3.4 Sink/PublishAdapter — 출력의 행선지
```python
class SinkAdapter(Protocol):
    capabilities: AdapterCapabilities      # declares: accepts=[PAPER_PDF, PATENT_DRAFT, REPORT], requires_human_gate
    def can_accept(self, artifact: OutputArtifact) -> Acceptance: ...     # type/format/confidentiality preflight
    def publish(self, artifact: OutputArtifact, ctx: PublishContext) -> PublishReceipt: ...
# v1 adapter: LocalFileSinkAdapter (LaTeX + compiled PDF, patent draft docs, score reports)
# stub adapters: InternalWikiSinkAdapter, VenueSubmissionSinkAdapter, PatentFilingSinkAdapter
```
**human gate**와 **confidentiality 필터**는 `publish()`가 호출되기 *이전에* 코어에 산다 — 제출/출원 자율성은 Non-goal(§9)이다. `requires_human_gate=True`를 선언하는 sink는 코어가 검증한다; adapter는 스스로 gate에서 빠져나올 수 없다.

### 3.5 Novelty/RadarAdapter — related-work + threat signals
```python
class NoveltyAdapter(Protocol):
    capabilities: AdapterCapabilities      # declares: related-work search, threat/radar signals, prior-art live?
    def assess(self, claims: ClaimSet) -> NoveltyReport: ...   # novel vs threatened, patent-first flags
# v1 adapters: RelatedWorkTrackerAdapter, Caw05RadarImportAdapter
# stub adapters: LivePriorArtSearchAdapter (e.g. patent/prior-art search services)
```

## 4. Registry + config 선택
adapter는 (코어에 hard-code되지 않고) **등록되며** **config에 의해 선택된다**. 두 계층의 discovery가 하나의 registry로 모인다:

1. **Built-in 등록** — v1 adapter는 import 시 decorator로 등록한다(`@register(port="source", id="caw02-bundle")`).
2. **Entry-point discovery** — 외부/서드파티 adapter는 패키지 메타데이터(PyPA entry-point 그룹, 예: `caw03.source_adapters`)로 스스로를 광고하며, `importlib.metadata`로 발견된다([PyPA spec](https://packaging.python.org/specifications/entry-points/)). 이것이 향후 connector가 CAW-03 트리를 건드리지 않고 *자체* 패키지로 배포되는 방식이다.

```python
class AdapterRegistry:
    def register(self, port: PortName, id: str, factory: Callable[[AdapterConfig], Adapter]) -> None: ...
    def get(self, port: PortName, id: str, cfg: AdapterConfig) -> Adapter: ...
    def list(self, port: PortName) -> list[AdapterDescriptor]: ...   # ids + capability descriptors, for preflight/UI
```

선택은 config 기반이다 — port당 하나의 블록, 전환에 코드 변경 없음:
```toml
# caw03.config.toml  — the ONLY place wiring changes
[adapters.source]   active = ["caw02-bundle", "caw01-result"]   # multiple sources fan in
[adapters.engine]   active = "paper-orchestra"                   # swap default engine here
[adapters.patent]   active = "baseline-drafter"
[adapters.sink]     active = ["local-file"]
[adapters.novelty]  active = ["related-work", "caw05-radar"]

[adapters.source.caw02-bundle]   endpoint = "..."   auth = "env:CAW02_TOKEN"
[adapters.sink.internal-wiki]    enabled  = false    # stub present, off until the connector lands
```
**Preflight**(어떤 run 이전에): 코어는 각 `active` id를 registry에서 해소하고, 그 **capability descriptor**를 읽어 배선을 검증한다 — 예: 선택된 sink가 이 run이 산출할 artifact 유형을 `accepts`하는지, source가 엔진이 필요로 하는 것을 `provides`하는지, 필요한 auth/config가 존재하는지. 누락/비활성화/무능한 adapter는 pipeline 중간이 아니라 명확한 메시지와 함께 *여기서* 실패한다.

## 5. Capability descriptors
각 adapter는 코어가 **I/O를 인스턴스화하지 않고도** 배선에 대해 추론할 수 있도록 기계 판독 가능한 descriptor를 운반한다:
```python
@dataclass(frozen=True)
class AdapterCapabilities:
    port: PortName
    id: str
    version: str
    provides: list[DataKind] = []      # SourceAdapter: CLAIM/EVIDENCE/RESULT/FIGURE
    accepts: list[ArtifactKind] = []   # SinkAdapter: PAPER_PDF/PATENT_DRAFT/REPORT
    features: set[str] = {}            # e.g. {"citation-verify","multimodal","prior-art-live"}
    requires_config: list[str] = []    # keys that MUST be set (preflight checks these)
    requires_human_gate: bool = True   # cannot be self-disabled by the adapter
    maturity: Literal["v1","stub","experimental"] = "stub"
```
descriptor는 시스템을 **자기 기술적(self-describing)** 으로 만든다: review/status UI가 사용 가능한 adapter를 나열하고; preflight가 capability 협상을 수행하며; `stub` maturity가 명확히 드러나 어떤 run도 구현되지 않은 connector에 조용히 의존하지 않는다.

## 6. "documented stub" 패턴 (향후 adapter)
향후 adapter는 v1에 **documented stub**으로 배포된다: 실제 인터페이스, not-implemented 마커, `maturity="stub"`인 capability descriptor, 그리고 config 예시. 나중에 실제 connector를 연결하는 것 = *그 한 파일*의 메서드 본문을 채우는 것.

```python
@register(port="source", id="internal-wiki")
class InternalWikiSourceAdapter(SourceAdapter):
    """STUB — internal company wiki source. Implement when the wiki connector is approved.
    Contract: SourceAdapter (§3.1). Must return provenance-tagged EvidenceBundle; respect confidentiality
    (internal-review-required by default). See PRODUCT-BRIEF §5/§10.
    Config example:
        [adapters.source.internal-wiki]
        base_url = "https://wiki.internal/..."   auth = "env:WIKI_TOKEN"   space = "RESEARCH"
    """
    capabilities = AdapterCapabilities(
        port="source", id="internal-wiki", version="0.0.0",
        provides=[CLAIM, EVIDENCE], features={"internal-confidential"},
        requires_config=["base_url", "auth"], maturity="stub")

    def discover(self, query): raise NotImplementedError("internal-wiki source not yet wired (PRODUCT-BRIEF §9 non-goal in v1)")
    def fetch(self, ref):      raise NotImplementedError(...)
    def health(self):          return HealthStatus.not_implemented("stub")
```
규칙: stub은 **등록되고 발견 가능**하지만(따라서 `registry.list()`와 UI에 나타남) 기본적으로 **config-disabled**다; preflight는 `active`인 stub의 실행을 거부하며, 구현해야 할 파일을 가리키는 메시지를 낸다. 브리프 §5가 요구하는 documented stub: `InternalWikiSourceAdapter`, `ExperimentServerSourceAdapter`, `InternalWikiSinkAdapter`, `VenueSubmissionSinkAdapter`, `PatentFilingSinkAdapter`, `LivePriorArtSearchAdapter`, 그리고 범용 `UserBundleSourceAdapter`/`ScatteredLogsSourceAdapter`.

## 7. 이것이 일반화되는 이유 (이음새 테스트)
어떤 변경이 새 통합으로 **adapter 파일 하나 + config 블록 하나**만 건드린다면 "설계상 개방형(open by design)"이다. 작동 예시:

| 새 통합 | 추가되는 것 | 건드리지 않는 것 |
| --- | --- | --- |
| source로서의 내부 wiki | `InternalWikiSourceAdapter` 구현, config 활성화 | 코어, 라이프사이클, evidence gate, 다른 adapter |
| 내부 experiment-server | `ExperimentServerSourceAdapter` 구현 | figure/table 매니페스트 로직(`EvidenceBundle`을 소비) |
| venue에 제출 | `VenueSubmissionSinkAdapter` 구현 | human-gate + confidentiality 필터(코어에 머무름) |
| PaperOrchestra를 엔진 X로 교체 | 새 `WritingEngineAdapter`, `active` 전환 | evidence gate(`GatedClaimSet`에서 동작) |
| 실시간 prior-art 검색 | `LivePriorArtSearchAdapter` 구현 | novelty 거버넌스 / patent-first 로직 |

이들 중 어느 것이라도 코어 편집을 강제한다면, 계약이 새고 있는 것이며 재검토되어야 한다(revisit 트리거).

## 8. Tradeoffs

| Decision | Pros | Cons / cost | Stance |
| --- | --- | --- | --- |
| Hexagonal 코어 + 5 ports | 엔진/source/sink 자유 교체; fake로 테스트 가능 | 사전 계약 설계; 간접성 | 채택(브리프 §5 의무) |
| Entry-point discovery + built-in registry | 서드파티 adapter를 자체 패키지로; 코어 편집 없음 | 메타데이터 복잡성; 버전 skew | 채택; built-in 경로를 기본값으로 유지 |
| Capability descriptor + preflight | fail fast, 자기 기술적, 안전한 배선 | descriptor를 정직하게 유지해야 함 | 채택 |
| v1의 documented stubs | 이음새가 증명 가능하게 존재; 명확한 "한 파일 채우기" 경로 | 연결 전까지 dead code | 채택(브리프 §5 요구) |
| 다수의 active source adapter (fan-in) | 한 run에서 CAW-01 + CAW-02 결합 | merge/provenance 우선순위 규칙 필요 | 채택; 우선순위는 open question |

## Open Questions
`../08-research-plan/open-questions.md`에서 추적:
- TODO(open-question: when multiple `SourceAdapter`s are active, what is the **merge/precedence** rule for overlapping claims/evidence, and how is provenance preserved on merge?)
- TODO(open-question: are async/long-running engine runs (PaperOrchestra is multi-stage) modeled as sync `draft()` or a job-handle/poll contract? Affects the WritingEngine port signature.)
- TODO(open-question: exact entry-point group names + adapter SemVer/compat policy — how does the core reject an adapter built against an old port version?)
- TODO(open-question: does the confidentiality filter need a capability hook on `SourceAdapter` (e.g. `provides_confidential`) so the core can route internal-review-required bundles, or is it purely a core concern?)
- TODO(open-question: where do adapter **secrets/auth** live given "no shared runtime substrate" — per-adapter config + env refs only?)
- TODO(open-question: is the Novelty port one port or split into related-work vs threat/radar sub-ports?)

## 런북(runbooks)에 대한 함의
- **RB (core/ports):** 다섯 개의 `Protocol` 인터페이스 + 값 객체(`EvidenceBundle`, `GatedClaimSet`, `OutputArtifact`, `AdapterCapabilities`, descriptors)를 정의한다. fake만으로 트리를 정상(green) 유지 — 아직 구체적 I/O 없음.
- **RB (registry/config):** `AdapterRegistry`(decorator + entry-point discovery), `caw03.config.toml` 로더, 그리고 **preflight** capability 검증을 구현한다. 수용 기준: preflight가 stub/무능/오설정 배선을 실행 가능한 메시지와 함께 거부한다.
- **RB (v1 adapters):** `Caw02BundleSourceAdapter`, `Caw01ResultSourceAdapter`, `PaperOrchestraEngineAdapter`, `BaselinePatentDrafterAdapter`, `LocalFileSinkAdapter`, `RelatedWorkTrackerAdapter` + `Caw05RadarImportAdapter`.
- **RB (stubs):** 모든 브리프-§5 stub을 §6 template로 제공 — 등록됨, `maturity="stub"`, config-disabled. 수용 기준: 각각이 `registry.list()`에 나타나고 강제로 active되면 preflight에 의해 거부된다.
- Cross-product 링크(CAW-01/02/05)는 공유 store가 아니라 **import/export boundary adapter**다(Independence §1) — runbook은 이들을 `SourceAdapter`/`NoveltyAdapter` 계약 뒤에만 유지해야 한다.
