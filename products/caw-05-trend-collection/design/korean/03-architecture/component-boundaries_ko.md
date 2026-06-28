# 컴포넌트 경계 — CAW-05 모듈, 코어 서비스 및 포트

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [system-architecture.md](system-architecture_ko.md) (컨테이너; 단방향 의존성 규칙; 데이터 흐름)
  - [../01-decisions/ADR-0001-product-surface-and-outputs.md](../01-decisions/ADR-0001-product-surface-and-outputs_ko.md) (the Run; op-set; FormatRenderer)
  - [../01-decisions/ADR-0002-interest-model.md](../01-decisions/ADR-0002-interest-model_ko.md) (관련성 점수; recall floor)
  - [../01-decisions/ADR-0003-source-adapters-and-ingestion.md](../01-decisions/ADR-0003-source-adapters-and-ingestion_ko.md) (SourceAdapter; cursor; dedup)
  - [../01-decisions/ADR-0004-classification-and-triage.md](../01-decisions/ADR-0004-classification-and-triage_ko.md) (cascade; review gate; routing)
  - [../01-decisions/ADR-0005-related-work-ledger.md](../01-decisions/ADR-0005-related-work-ledger_ko.md) (LedgerLink; verification)
  - [../01-decisions/ADR-0007-export-boundaries.md](../01-decisions/ADR-0007-export-boundaries_ko.md) (ExportAdapter; bundle envelope)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## 목적
이 문서는 파이프라인 코어 내부의 **모듈 소유권(ownership)** 과 코어가 의존하는 **포트 인터페이스**를 고정한다.
각 코어 서비스(Ingest, Relevance, Classify/Triage, Ledger, Synthesize, Export, Schedule)를 **시그니처
수준**에서 기술하며, **triage, routing, dedup은 코어에 존재하고 — 어댑터는 이를 우회할 수 없다**는 규칙을
명시한다. 이 문서는 그 서비스들이 구현하는 결정을 재정의하지 않으며(연결된 ADR 참조), 컨테이너 런타임
그림([system-architecture.md](system-architecture_ko.md))도 재정의하지 않는다. 대신 모듈 사이의 이음매(seam)를
긋는다. 아래의 시그니처는 **빌드 가이드**(빌더가 실제 코드를 작성한다)이며, 정확성을 위해 Python 타입으로
표기했다.

## 1. 모듈 맵 & 소유권

| 모듈 | 소유(Owns) | 금지(Must NOT) | 구현(Implements) |
|---|---|---|---|
| `core.ingest` | cursor, 다계층 dedup, provenance 검증, `Finding` 조립 | rank, classify, export | ADR-0003 §4–5 |
| `core.relevance` | BM25-first 가산적 설명가능 점수 + recall-first floor | watch list 히트를 조용히 누락 | ADR-0002 |
| `core.classify` | LF→LLM→human cascade, 2축 레이블, selective-review gate | rationale를 evidence로 취급 | ADR-0004 |
| `core.route` | 결정론적 config-driven routing | 미확인 novelty-threat를 route | ADR-0004 §routing |
| `core.ledger` | append-only LedgerLink + S2 verification record | history를 변경/재작성 | ADR-0005 |
| `core.synthesize` | 확정된 finding에 대해 5개 포맷 렌더링; `evidence:false` 스탬프 | `noise` 방출; 미확인을 종착(terminal)으로 렌더 | ADR-0001 §5 |
| `core.export` | 확정된 link → 서명된 bundle로 투영; fail-closed | 형제(sibling) 저장소에 쓰기 | ADR-0007 |
| `core.schedule` | Run wrapper: lock, catch-up, checkpoint, heartbeat | 비즈니스 로직 보유 | ADR-0001 §1–2 |
| `core.store` | 파일 + SQLite index 위의 `StoragePort` 구현 | source of truth가 됨 (SQLite는 cache) | ADR-0006 |
| `adapters.source.*` | 한 family의 fetch + normalize | classify/rank/dedup/export | ADR-0003 §3 |
| `adapters.export.*` | 한 consumer의 bundle 쓰기 | 재-rank 또는 재-classify | ADR-0007 §1 |
| `surfaces.cli` / `surfaces.mcp` | 검증된 op-set 구동 | 로컬에서 불변식 강제 | ADR-0001 §3–4 |

**불변식(하중을 견디는 규칙):** dedup, relevance/recall-floor, classification, triage, routing, review gate,
provenance, export는 모두 `core.*`에 존재한다. 어댑터와 surface는 **edge**다. classify하는 어댑터나 규칙을
강제하는 surface는 계약 누수(contract leak)다 (ADR-0003 재검토 트리거; ADR-0001 §Open).

## 2. 시그니처 수준의 코어 서비스

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

## 3. 포트 인터페이스 (코어는 이것에 의존하며, 구체적인 edge에는 결코 의존하지 않는다)

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

### 포트 → 어댑터 레지스트리 (v1 + 스텁)

| 포트 | v1 어댑터 | 문서화된 스텁 (등록됨, config-disabled) |
|---|---|---|
| `SourceAdapter` | Arxiv, SemanticScholar, Github, BlogRss, HackerNews(light) | Reddit, Edgar, Newsletter, InternalFeed |
| `ExportAdapter` | Caw02SourceClaim, Caw03NoveltySignal, Caw01OpenQuestion, Caw06OpenQuestion | 기타 다운스트림 타깃 |
| `SchedulerAdapter` | Cron | systemd, cloud scheduler |
| `FormatRenderer` | memo, digest, slide-outline, paper-card, action-brief | (새 포맷 = 어댑터 하나) |
| `Classifier` | LF lane, LLM lane (+ human terminal) | embedding 지원 lane (alpha) |

스텁은 **발견은 가능하나 config-disabled** 상태다. preflight는 `active` 상태의 스텁(ADR-0003 §1)과 ToS-unsafe
하거나 non-public한 어댑터(ADR-0003 §2, ADR-0007 §4)를 거부한다.

## 4. 비우회(non-bypass) 규칙 (triage / routing / dedup은 코어에 존재한다)

이것은 recall + audit 미션을 보호하는 경계다. 강제 가능한 의무로 기술하면 다음과 같다:

| # | 의무 | 방지하는 실패 |
|---|---|---|
| 1 | 어댑터는 `RawFinding`만 반환한다 — 레이블, 점수, dedup 판정은 결코 반환하지 않는다 | family별 ranking 표류; 한 family가 watch list 히트를 조용히 누락 |
| 2 | dedup은 모든 source에 걸쳐 `core.ingest`에서 한 번 실행된다 | 4개 source에서 온 같은 논문이 4개의 finding이 되는 것(또는 false-merge로 하나가 누락되는 것) |
| 3 | relevance + recall floor는 `core.relevance`에서 실행된다 | tier-1 watch list 히트가 edge에서 점수로 밀려나는 것 |
| 4 | classification/triage/routing은 `core.classify`/`core.route`에서 실행된다 | surface나 어댑터가 미검토 novelty-threat를 CAW-03의 gate로 route하는 것 |
| 5 | review gate는 코어다; surface/MCP 종착은 **proposal-only**다 | 에이전트가 미확인 위협을 자동 export하는 것 |
| 6 | export는 오직 `core.export` + `ExportAdapter`를 통해서만; 직접 쓰기는 결코 없다 | 형제 저장소에 쓰기(독립성 침해) |
| 7 | 생성된 산문은 종단 간 `evidence:false`를 지닌다 | 생성 요약이 경계를 evidence로 넘는 것 |

**이음매 테스트(반드시 성립):** source family, export 타깃, 포맷, classifier lane을 추가하는 것은 파이프라인을
전혀 변경하지 않는 **어댑터 파일 하나 + config 블록 하나**다. 코어가 source별/consumer별 분기를 필요로 한다면
포트 계약이 누수되고 있는 것이니, 파이프라인이 아니라 value object를 확장하라 (ADR-0003 / ADR-0007 재검토
트리거).

## 5. 모듈 간 데이터 핸드오프

| From → To | Payload | 계약 |
|---|---|---|
| SourceAdapter → Ingest | `RawFinding` (+ provenance) | provenance 완전 또는 거부 |
| Ingest → Relevance | deduped `Finding` | finding 하나, provenance entry 다수 |
| Relevance → Classify | `Finding` + `RelevanceScore` | recall floor 이미 적용됨 |
| Classify → Route | `Triage` (2축 + confidence) | routing 전 abstain → human |
| Route → Ledger | `Route` + `Finding` | append-only `LedgerLink` + verification |
| Ledger → Synthesize | 확정된 `LedgerLink`/`Finding` | `noise` 제외 |
| Ledger → Export | 확정된 `LedgerLink` | confirmed-only; fail-closed 투영 |

## 열린 질문(Open Questions)
- TODO(open-question: is a Run one synchronous process or resumable stage-jobs with a handle? affects `status` +
  service boundaries.) [../08-research-plan/open-questions.md](../08-research-plan/open-questions_ko.md) 참조.
- TODO(open-question: does the embedding-assisted Classifier lane graduate from alpha in v1, gated on the labeled
  eval set? owned with ADR-0002/0004.)
- TODO(open-question: SimHash near-dup folding default in `core.ingest` — on or off in v1, given false-merge =
  dropped finding? owned with ADR-0003.)

## 런북에 대한 함의
- **RB (코어 서비스):** 서비스당 모듈 하나(§1)에 §2 시그니처를 담는다; dedup/relevance/triage/routing/gate는
  `core.*`에만 둔다.
- **RB (포트):** 5개 포트(§3)를 Protocol + config-driven 레지스트리로; v1 어댑터 + 문서화된 스텁;
  preflight는 active/ToS-unsafe/non-public 어댑터를 거부한다.
- **RB (비우회 테스트):** 의무 1–7(§4)과 이음매 테스트를 단언한다 — 어댑터는 classify/rank/dedup/export 할 수
  없고; surface는 규칙을 강제할 수 없으며; export는 fail-closed다 (ADR-0007 N1–N6).
