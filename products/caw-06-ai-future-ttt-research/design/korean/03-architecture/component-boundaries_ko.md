# 컴포넌트 경계 — 모듈 소유권, 핵심 서비스 및 포트

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [./system-architecture_ko.md](./system-architecture_ko.md) (컨테이너 맵 + 단방향 의존성 규칙)
  - [../01-decisions/ADR-0001-product-surface-and-scout.md](../01-decisions/ADR-0001-product-surface-and-scout_ko.md) (op-set, 서피스, 거버넌스-인-코어)
  - [../01-decisions/ADR-0002-hypothesis-representation.md](../01-decisions/ADR-0002-hypothesis-representation_ko.md) (status/불확실성 모델)
  - [../01-decisions/ADR-0003-experiment-ledger.md](../01-decisions/ADR-0003-experiment-ledger_ko.md) (verdict + reproducibility gate)
  - [../01-decisions/ADR-0004-writeback-traffic-schema.md](../01-decisions/ADR-0004-writeback-traffic-schema_ko.md) (`wbtraffic.v0`)
  - [../01-decisions/ADR-0005-source-and-claim-ingestion.md](../01-decisions/ADR-0005-source-and-claim-ingestion_ko.md) (SourceAdapter)
  - [../01-decisions/ADR-0008-export-boundaries.md](../01-decisions/ADR-0008-export-boundaries_ko.md) (ExportAdapter)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## 목적
이 문서는 CAW-06 내부의 **모듈 소유권**을 고정한다: 어떤 패키지가 어떤 엔티티를 소유하는가, 시그니처 수준의
**일곱 개 핵심 서비스**(Ingest, Hypothesis, Experiment, Writeback, Implication, Export, Schedule), 그리고
**세 개의 포트 Protocol**(Source / ExperimentRunner / Export). 이 문서는 **status/불확실성 +
reproducibility gate가 core에 존재한다**는 핵심 규칙을 고정하며, 이는 결코 서피스나 어댑터에 두지 않는다.
이 문서는 엔티티 스키마(소유 ADR)나 컨테이너 배선([system-architecture_ko.md](./system-architecture_ko.md))을
재정의하지 *않는다*. 아래의 시그니처는 **빌드 가이드**이며 — 빌더가 실제 코드를 작성한다(DOC-CONVENTIONS §6).

## 모듈 소유권

하나의 패키지가 각 엔티티를 end-to-end로 소유한다; 어떤 엔티티도 공동 소유되지 않는다. 서피스와 어댑터는 어떤 엔티티도 소유하지 않는다.

| 모듈 / 패키지 | 소유(엔티티) | 읽기 가능 | 건드리면 안 됨 |
|---|---|---|---|
| `core/ingest` | `Source`, `CandidateClaim`, `FetchCursor` | — | `Hypothesis` status, ledger |
| `core/hypothesis` | `Hypothesis`, `Evidence`, `status`, `confidence` | `CandidateClaim`, ledger 결과 | source raw text 쓰기 |
| `core/experiment` | `LedgerEntry (EXP-XXXX)`, `Verdict`, `DecisionRule` | `Hypothesis` | status 승격(제안만 함) |
| `core/writeback` | `WbTrafficSchema (wbtraffic.v0)` | `Hypothesis`, ledger | CAW-01 IR 객체 이름(경계에서 재검증) |
| `core/implication` | `ImplicationMap`, `Implication` | finding(hypothesis+evidence) | export transport |
| `core/export` | `ExportBundle`, `ExportReceipt` | 위의 모든 것 | 다른 제품의 store |
| `core/schedule` | `Run`, `RunReceipt`, lock/cursor/heartbeat | 모든 스테이지 | 도메인 진실(오케스트레이션만 함) |
| `core/store` | 모든 엔티티의 영속성(markdown/JSON) | — | 네트워크/transport |
| `surfaces/{cli,mcp,pipeline}` | 없음 | op-set | 엔티티를 직접 |
| `adapters/{source,runner,export}` | 없음 | 자신의 포트 DTO | core 내부 |

**거버넌스는 core 전용이다.** status 하한(`hypothesis`), `confidence ≤ evidence_strength` 캡,
`generated` evidence는 승격 불가 규칙, provenance 스탬핑, reproducibility gate, failures-first
원칙, 그리고 타깃별 export gate는 모두 `core/*` 서비스에 존재하며 — **결코** 서피스나 어댑터에 두지 않는다
(ADR-0001 "Governance lives in the core"). 서피스는 검증된 op를 호출하고; 진실을 변경하는 것은 오직 core뿐이다.

## 핵심 서비스(시그니처 수준)

시그니처는 예시적인 Python 스타일 Protocol이다. status/불확실성은 **결코 선택적** 파라미터가 아니다 — 이들은
엔티티에 내재되어 있으며 core가 스탬핑한다.

### Ingest (S1–S4)
```python
class IngestService:
    def discover(self, family: str, cursor: FetchCursor) -> list[Source]: ...      # via SourceAdapter
    def import_caw05(self, bundle_ref: BundleRef) -> list[Source]: ...             # read-only, evidence:false
    def canonicalize(self, sources: list[Source]) -> list[Source]: ...            # DOI ▸ arXiv ▸ norm(title)
    def extract_claims(self, source: Source) -> list[CandidateClaim]: ...         # extractive; status=unverified
    # invariant: never emits status='supported'; never a claim without evidence_span + source_locator
```

### Hypothesis (S5)
```python
class HypothesisService:
    def form(self, claims: list[CandidateClaim]) -> Hypothesis: ...               # status floor = 'hypothesis'
    def attach_evidence(self, h: Hypothesis, ev: Evidence) -> Hypothesis: ...
    def reassess(self, h: Hypothesis) -> Hypothesis: ...                          # 4-state reversible lifecycle
    # invariants (HARD): confidence <= evidence_strength; generated Evidence(evidence=False) CANNOT promote;
    #   status in {hypothesis, supported, refuted, inconclusive}; default = hypothesis
```

### Experiment (S6–S7)
```python
class ExperimentService:
    def plan(self, h: Hypothesis, rule: DecisionRule) -> LedgerEntry: ...         # rule PRE-REGISTERED
    def run(self, entry: LedgerEntry, runner: ExperimentRunnerAdapter) -> LedgerEntry: ...
    def verdict(self, entry: LedgerEntry) -> Verdict: ...                         # {supported,refuted,inconclusive,invalid}
    # invariants: ONE run = ONE append-only entry; reproducibility gate (config+seed+env) or entry is 'invalid';
    #   verdict gated by the pre-registered rule; negative results retained + classified, never discarded
```

### Writeback (S9 → CAW-01으로 공급)
```python
class WritebackService:
    def derive(self, h: Hypothesis, ledger: list[LedgerEntry]) -> WbTrafficSchema: ...  # wbtraffic.v0, per-variant
    # fields: write_bandwidth, write_endurance, near_memory_update, updated_state_residency,
    #         capacity_bw_ratio_over(context, update_freq); each numeric defaults null + basis=TODO(open-question)
    # invariant: v1 = ANALYTIC L0 estimate; MODELED flagged distinctly from MEASURED; no invented numbers
```

### Implication (S8)
```python
class ImplicationService:
    def map(self, finding: Finding) -> ImplicationMap: ...                        # one map per finding
    # domains: {ai-services, education, dev-platforms, models, hardware, memory-centric}
    # invariant: summary explicitly marked generated (evidence=False) — routing layer, not a verdict
```

### Export (S9)
```python
class ExportService:
    def build(self, target: str, item: Implication | WbTrafficSchema | Hypothesis) -> ExportBundle: ...
    def propose(self, bundle: ExportBundle) -> PendingGateEvent: ...              # surfaces stop here
    def emit(self, bundle: ExportBundle, adapter: ExportAdapter) -> ExportReceipt: ...  # core-only, post review gate
    # invariant: per-target gate runs inside validate() BEFORE any write; status:hypothesis rejected for CAW-02;
    #   one-way push; receipt stored on thread; self-describing bundle (schema_version+producer+content_hash)
```

### Schedule (the Run)
```python
class ScheduleService:
    def run(self, scope: RunScope) -> RunReceipt: ...                            # resumable pass over the 9 stages
    def resume(self, run_id: str) -> RunReceipt: ...                             # restart at last checkpoint
    # owns: single-flight lock, FetchCursor catch-up, per-stage checkpoints, heartbeat; scheduler only FIRES
    # invariant: re-running a completed thread-stage is a no-op (idempotent); orchestrates, owns no truth
```

## 포트(외부로 향하는 유일한 이음새)

core는 이 Protocol에 의존하며, 결코 구체적인 어댑터에 의존하지 않는다. 구성 기반 레지스트리가 family를 바인딩하고;
문서화된 스텁이 Protocol을 구현하고 `HealthStatus="deferred: <reason>"`를 보고한다(brief §9).

```python
class SourceAdapter(Protocol):                                  # discovery + import (ADR-0005)
    def capabilities(self) -> SourceCapabilities: ...
    def fetch(self, query: Query, cursor: FetchCursor) -> FetchPage: ...   # provenance complete; rate-limit inside
    def health(self) -> HealthStatus: ...
    # contract: idempotent+incremental; legal-mode (public, ToS-safe); typed failures; NO extraction/ranking here

class ExperimentRunnerAdapter(Protocol):                        # toy reproduction (ADR-0003)
    def run(self, spec: ExperimentSpec) -> RunArtifacts: ...    # returns config+seed+env for the repro gate
    def health(self) -> HealthStatus: ...

class ExportAdapter(Protocol):                                  # the ONLY export seam (ADR-0008)
    def validate(self, bundle: ExportBundle) -> ValidationReport: ...   # per-target gate + schema BEFORE write
    def emit(self, bundle: ExportBundle) -> ExportReceipt: ...          # file drop v1; idempotent by id+hash
    def health(self) -> AdapterStatus: ...
```

| 포트 | v1 어댑터(빌드) | 문서화된 스텁 |
|---|---|---|
| `SourceAdapter` | `ArxivAdapter`, `SemanticScholarAdapter`, `CAW05ImportAdapter` | `GithubAdapter`, `BlogRssAdapter`, `HackerNewsAdapter` |
| `ExperimentRunnerAdapter` | `LocalToyRunner` | 외부 컴퓨트 / HW 러너 |
| `ExportAdapter` | `Caw01WritebackAdapter`, `Caw02ClaimAdapter` | `Caw03NoveltyAdapter`, `HttpExportAdapter` |

## 핵심 규칙이 어디에 존재하는가(경계 표)

| 규칙 | 반드시 존재해야 할 곳 | 존재하면 안 되는 곳 | 경계 검사 |
|---|---|---|---|
| status 하한 = `hypothesis` | `core/hypothesis` | 서피스, 어댑터 | CAW-02에서 export gate가 재확인 |
| `confidence ≤ evidence_strength` 캡 | `core/hypothesis` | 서피스, 어댑터 | 불확실성이 제거된 채 경계를 넘는 것은 없음 |
| generated ≠ evidence(승격 불가) | `core/hypothesis` | 서피스, 어댑터 | CAW-02 번들이 `not_evidence[]`를 운반 |
| reproducibility gate(config+seed+env) | `core/experiment` | 러너 어댑터 | 그것 없는 entry = `invalid` |
| 사전 등록된 decision rule | `core/experiment` | 서피스 | verdict이 rule id를 참조 |
| failures 보존 + 노출 | `core/experiment` + store | — | `negative-results` 뷰 |
| 타깃별 export gate | `core/export` | export 어댑터 | 어떤 write보다 먼저 `validate()` 실행 |
| 지어낸 숫자 없음(null+basis) | `core/writeback` | 어댑터 | CAW-01 번들의 modeled≠measured 플래그 |
| 단방향 push, 공유 store 없음 | `core/export` + 포트 | — | 로컬 receipt만; read-back 없음 |

반복되는 함정: 어댑터나 서피스가 "도움이 되겠다며" 진실을 결정하는 것(러너가 결과를 `supported`로 표시,
MCP 툴이 자동 승격, export 어댑터가 gate를 완화). 그러한 모든 경로는 core가 인간 review gate 뒤에서 판정하는
**제안**일 뿐이다(ADR-0001 §4). 어댑터는 바이트를 옮기고; 서피스는 op를 요청하며; **core가 진실을 소유한다**.

## 미해결 질문
- TODO(open-question: split `core/store` per-entity or one store facade? affects how services share persistence — ADR-0007.)
- TODO(open-question: is `Evidence` a sub-record of `Hypothesis` or its own owned entity referenced by id? affects `core/hypothesis` boundary — ADR-0002.)
- TODO(open-question: does `WritebackService` read ledger directly or only via a `Finding` projection? affects coupling to `core/experiment`.)
- [../08-research-plan/open-questions.md](../08-research-plan/open-questions_ko.md) 참조.

## 런북에 대한 함의
- RB: 위의 일곱 개 서비스 Protocol로 `core/*` 패키지를 스캐폴딩한다; 경계 테스트로 거버넌스-인-코어를 단언한다(서피스/어댑터가 status mutator를 import하면 빌드 실패).
- RB: 세 개의 포트 Protocol + 구성 기반 레지스트리 + `deferred`를 보고하는 스텁.
- RB: 경계 린트 — 어댑터는 포트 DTO만, 서피스는 op-set만 import하고, 아무것도 `core` 내부를 import하지 않는다.
