# Ports & Adapters — Source / ExperimentRunner / Export

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [./export-boundaries_ko.md](./export-boundaries_ko.md) (Export 포트 전체)
  - [./implication-mapping_ko.md](./implication-mapping_ko.md) (Export 포트로 공급되는 것)
  - [../01-decisions/ADR-0005-source-and-claim-ingestion_ko.md](../01-decisions/ADR-0005-source-and-claim-ingestion_ko.md) (SourceAdapter)
  - [../01-decisions/ADR-0003-experiment-ledger_ko.md](../01-decisions/ADR-0003-experiment-ledger_ko.md) (ExperimentRunner + reproducibility gate)
  - [../01-decisions/ADR-0002-hypothesis-representation_ko.md](../01-decisions/ADR-0002-hypothesis-representation_ko.md) (status/uncertainty gate)
  - [../01-decisions/ADR-0008-export-boundaries_ko.md](../01-decisions/ADR-0008-export-boundaries_ko.md) (Export gate)
  - [../01-decisions/ADR-0001-product-surface-and-scout_ko.md](../01-decisions/ADR-0001-product-surface-and-scout_ko.md) (파이프라인 코어)
  - [../08-research-plan/open-questions_ko.md](../08-research-plan/open-questions_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## 목적
이 문서는 CAW-06의 **ports & adapters**를 명세한다: 세 개의 통합 이음새(`SourceAdapter`,
`ExperimentRunnerAdapter`, `ExportAdapter`), 이들을 배선하는 **config-driven 레지스트리**, **문서화된
스텁**, 그리고 **어떤 어댑터도 우회할 수 없는** status/uncertainty/reproducibility 게이트라는 불변식이다.
번들 형태나 export 게이트(see [./export-boundaries_ko.md](./export-boundaries_ko.md)), 인제스트 단계
(ADR-0005), ledger 의미론(ADR-0003)을 **재정의하지 않는다** — 상호 링크한다. 다른 제품을 건드리는 모든
어댑터는 **독립 제품 간의 file/API 경계**다 — 공유 저장소/런타임 없음.

## 1. 왜 ports & adapters인가
Source, experiment runner, export 타깃은 **재설계 없이** 꽂을 수 있어야 한다 (brief §9). 각 이음새는 좁은
**port**(파이프라인 코어가 의존하는 인터페이스)다; 구체적인 **adapter**가 이를 구현한다;
**config-driven 레지스트리**가 어떤 어댑터가 활성인지를 선택한다. v1은 최소한의 실제 어댑터를 빌드하고
나머지는 **스텁으로 문서화**하므로, 스텁 승격은 재설계가 아니라 config + 빌드일 뿐이다.

| 이음새 | Port | v1 어댑터 | 문서화된 스텁 |
|---|---|---|---|
| Ingest | `SourceAdapter` | arXiv/Semantic Scholar; CAW-05 신호 import | 기타 카탈로그, web, RSS |
| Experiment | `ExperimentRunnerAdapter` | 로컬 toy-experiment 러너 | 외부 compute, HW 러너 |
| Export | `ExportAdapter` | `Caw01WritebackAdapter`, `Caw02ClaimAdapter` | `Caw03NoveltyAdapter`, `HttpExportAdapter` |

파이프라인 코어(ADR-0001: 하나의 ExperimentScout Run)는 **port**에만 의존하며, 결코 구체적 어댑터에
의존하지 않는다 — 표면(스케줄 파이프라인 / CLI / MCP)과 외부 시스템은 이음새 뒤에서 교체된다.

## 2. `SourceAdapter` 포트
인제스트는 이 포트 뒤의 하나의 파이프라인, 다섯 단계다 (ADR-0005). CAW-05는 **별개의 제품**이다; 그
신호는 경계를 가로질러 **import**되며, 결코 공유 저장소에서 읽지 않는다.

```python
class SourceAdapter(Protocol):
    name: str
    def discover(self, query: ScoutQuery) -> list[SourceRef]: ...      # S1 Discover
    def fetch(self, ref: SourceRef) -> RawSource: ...                  # S2 Import
    def health(self) -> AdapterStatus: ...
```

- 멱등적 + 재개 가능; canonicalization/dedup/claim-extraction은 어댑터가 아니라 파이프라인(S3–S5)에서
  일어난다 (ADR-0005).
- **Import된 CAW-05 판정은 CAW-06 자체의 것과 결코 혼동되지 않는다** — provenance와 함께 *검증할 claim*
  으로 들어온다 (brief §12).

## 3. `ExperimentRunnerAdapter` 포트
한 run = 하나의 append-only ledger 항목이며, 사전 등록된 결정 규칙과 강한 reproducibility gate로 게이트된다
(ADR-0003). v1 = 로컬 toy-experiment 러너; 외부 compute / HW 러너는 **스텁**이다.

```python
class ExperimentRunnerAdapter(Protocol):
    name: str
    def plan(self, hypothesis_ref: str) -> ExperimentPlan: ...   # pre-registers the decision rule
    def run(self, plan: ExperimentPlan) -> RunResult: ...        # captures config+seed+env
    def health(self) -> AdapterStatus: ...
```

- **reproducibility gate**(config + seed + env 캡처)는 어댑터가 아니라 ledger writer가 강제한다 — seed/env를
  누락한 러너는 ledger가 **증거로 표시하기를 거부하는** 재현 불가능한 결과를 만든다 (ADR-0003). 다른
  러너를 선택한다고 게이트를 우회할 수 없다.
- **부정적 결과는 보관되고, 분류되며, 기본적으로 노출된다** — 러너는 실패를 조용히 떨어뜨릴 수 없다
  (brief §5).
- v1은 **최소 reproduction / toy experiment만** 유지한다 (brief §11); HW/외부 러너 스텁이라도 만족해야 할
  게이트는 바뀌지 않는다.

## 4. `ExportAdapter` 포트 + 레지스트리
전체 계약, 번들 형태, 타깃별 게이트는 [./export-boundaries_ko.md](./export-boundaries_ko.md)에 있다.
여기서는 그것(과 세 이음새 모두)을 배선하는 **레지스트리**다 — config-driven; 스텁은 문서화될 뿐, 빌드되지 않음.

```python
# config-driven registry; one entry per active adapter, stubs listed but inert
ADAPTERS = {
  "source": {
    "arxiv":   ArxivSemanticScholarAdapter,   # v1
    "caw-05":  Caw05SignalImportAdapter,      # v1 (import from a separate product)
    "rss":     StubSourceAdapter,             # stub
  },
  "runner": {
    "local-toy": LocalToyRunner,              # v1
    "external":  StubRunnerAdapter,           # stub (external compute / HW)
  },
  "export": {
    "caw-01":  Caw01WritebackAdapter,         # v1
    "caw-02":  Caw02ClaimAdapter,             # v1
    "caw-03":  StubExportAdapter,             # stub (novelty cues)
    "http":    StubExportAdapter,             # stub (transport swap)
  },
}
```

- **문서화된 스텁 계약:** 스텁은 자신의 포트를 구현하고 등록되지만, `health()`는 `not-built`를 보고하며
  어떤 호출이든 ADR 포인터와 함께 `NotImplementedError`를 발생시킨다 — 그래서 승격은 이음새 재설계가
  아니라 config + 빌드일 뿐이다.
- 레지스트리는 어댑터가 이름 붙는 **유일한** 자리다; 파이프라인 코어는 port + key로 해석한다.

## 5. 불변식: 어댑터는 게이트를 우회할 수 없다
어댑터는 **transport + shape**이지, 결코 **policy**가 아니다. 세 게이트는 파이프라인 코어 / 도메인 모델이
소유하며 **어떤 어댑터가 활성이든 상관없이** 실행된다.

| Gate | 소유 | 강제하는 것 | 어댑터가 할 수 없는 것 |
|---|---|---|---|
| **status/uncertainty** | hypothesis 모델(ADR-0002) + Export gate(ADR-0008) | status/uncertainty가 벗겨진 채로는 아무것도 경계를 넘지 못함; generated evidence는 status를 승격 불가 | uncertainty를 벗기거나 단순 `hypothesis`를 claim으로 밀반출 |
| **reproducibility** | ledger writer(ADR-0003) | config+seed+env 캡처; 재현 불가 run은 증거 아님 | 다른 러너를 선택해 재현 불가 run을 증거로 표시 |
| **export eligibility** | 타깃별 `validate()` 게이트(ADR-0008 §3) | CAW-01 = writeback/open-question; CAW-02 = evidence + status≠hypothesis | `validate()`에 실패한 번들을 방출 |

구체적으로:
- `ExportAdapter.emit()`은 `validate()`(게이트 + 스키마)가 먼저 통과하지 않는 한 도달 불가하다 —
  게이트에서 걸러진 번들은 로그되고 결코 쓰이지 않는다 ([./export-boundaries_ko.md](./export-boundaries_ko.md) §2).
- `SourceAdapter`는 claim을 증거로 주입할 수 없다; 추출(S4)이 provenance + uncertainty를 태깅하며,
  CAW-05 import는 *검증할 claim*으로 남는다.
- `ExperimentRunnerAdapter`는 결과를 자체 인증할 수 없다; ledger가 reproducibility gate와 사전 등록된
  결정 규칙을 적용한다.
- generated `summary`는 어떤 이음새에서도 결코 증거가 아니다 (brief §12).

```
core pipeline ──depends-on──► [ports]  ──registry selects──► [adapters: real | stub]
gates (status/uncertainty, reproducibility, export-eligibility) sit INSIDE the core,
so swapping an adapter cannot move or weaken a gate.
```

## 6. 어댑터 추가 / 승격
1. 해당 포트(`SourceAdapter` / `ExperimentRunnerAdapter` / `ExportAdapter`)를 구현한다.
2. `ADAPTERS`에서 자신의 이음새 키 아래 등록한다 (config-driven).
3. 어댑터는 **transport + shape만** 다룬다; 기존 게이트는 변경 없이 적용된다.
4. export 타깃의 경우, [./export-boundaries_ko.md](./export-boundaries_ko.md) §3에 타깃별 게이트를
   추가/확인한다 — 새 타깃이라도 무과장 게이트를 건너뛸 수는 없다.

## Open Questions
[../08-research-plan/open-questions_ko.md](../08-research-plan/open-questions_ko.md)에서 추적:
- `TODO(open-question: does the external/HW ExperimentRunner stub need a different reproducibility-capture contract than the local runner?)`
- `TODO(open-question: should the CAW-05 import adapter verify a signature on imported signals — mirror outbound signing?)`
- `TODO(open-question: registry config format — static module map vs entry-points discovery — and where it lives in CAW-06's OWN store?)`
- `TODO(open-question: do stubs need a uniform "not-built" health contract surfaced in the CLI/MCP surfaces?)`

## 런북에 대한 함의
- 세 포트와 config-driven `ADAPTERS` 레지스트리를 정의; 파이프라인 코어에서 port + key로 해석.
- v1 어댑터: arXiv/Semantic-Scholar + CAW-05 import (Source); 로컬 toy 러너 (Runner); CAW-01 + CAW-02
  (Export). 그 외 전부는 `not-built` health 계약을 가진 문서화된 스텁.
- 세 게이트를 어댑터가 아니라 **코어 내부에서** 강제; 스텁/대체 어댑터가
  status/uncertainty/reproducibility/export-eligibility를 우회할 수 없음을 검증하는 테스트 추가.
- 런북 작업을 ADR-0005(ingest), ADR-0003(ledger), ADR-0008(export)에 상호 링크.
