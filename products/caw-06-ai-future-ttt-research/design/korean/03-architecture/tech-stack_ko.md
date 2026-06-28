# 기술 스택 — CAW-06 ExperimentScout

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [./data-flow_ko.md](./data-flow_ko.md), [./repo-structure_ko.md](./repo-structure_ko.md)
  - [../01-decisions/ADR-0001-product-surface-and-scout.md](../01-decisions/ADR-0001-product-surface-and-scout_ko.md) (pipeline + CLI + MCP)
  - [../01-decisions/ADR-0005-source-and-claim-ingestion.md](../01-decisions/ADR-0005-source-and-claim-ingestion_ko.md) (SourceAdapter)
  - [../01-decisions/ADR-0003-experiment-ledger.md](../01-decisions/ADR-0003-experiment-ledger_ko.md) (toy-runner + repro gate)
  - [../01-decisions/ADR-0007-storage-and-scheduling.md](../01-decisions/ADR-0007-storage-and-scheduling_ko.md) (file store + scheduler)
  - [../01-decisions/ADR-0004-writeback-traffic-schema.md](../01-decisions/ADR-0004-writeback-traffic-schema_ko.md), [../01-decisions/ADR-0008-export-boundaries.md](../01-decisions/ADR-0008-export-boundaries_ko.md)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## 목적
AI 빌더가 CAW-06을 구현하는 데 사용하는 **구체적 기술**을 명명한다: 파이프라인 언어, source 클라이언트
(arXiv / Semantic Scholar), 최소 toy-experiment runner, file store, scheduler, 그리고 MCP/CLI
서피스. *무엇을 쓰고 왜 그런지*를 명시한다; 파이프라인(see [data-flow_ko.md](./data-flow_ko.md))이나
디렉터리 레이아웃(see [repo-structure_ko.md](./repo-structure_ko.md))을 재설계하지 *않는다*. **모든 버전 핀은
`TODO(open-question: pin <x>)`로 빌더에게 연기된다** — DOC-CONVENTIONS §3은 여기서 버전/숫자를 지어내는 것을
금지한다.

선택 원칙(brief + ADR로부터): **독립성**(CAW-06의 OWN 런타임/store; 공유 기반 없음);
**zero-infra 기본**(DB 서버가 아니라 디스크 상의 파일 — ADR-0007); **ports & adapters**로 모든 외부 의존성이
문서화된 스텁을 갖춘 교체 가능한 포트 뒤에 있게 함; analytic estimator를 위한 **결정성(determinism)**과
실험을 위한 **hard reproducibility gate**; 레코드에 내장된 **no overclaim / failures-first-class**.

## 스택 개요

| 레이어 | 선택(v1) | 어느 포트 뒤 | 이유 | 버전 핀 |
|---|---|---|---|---|
| 언어 / 런타임 | **Python 3.x** | — | arXiv/S2 SDK + PyTorch + MCP에서 지배적; family와 일치 | `TODO(open-question: pin Python minor — 3.11/3.12?)` |
| 패키징 / deps | **`pyproject.toml` + lockfile** (uv 또는 Poetry) | — | 재현 가능한 설치; 하나의 정본 lock | `TODO(open-question: pick uv vs poetry; pin)` |
| 파이프라인 오케스트레이션 | **순수 Python 파이프라인 core** (in-process 스테이지) | — | brief = ONE core, 세 개의 얇은 서피스; v1에 무거운 DAG 엔진 없음 | n/a |
| Source: arXiv | **arXiv API 클라이언트** (HTTP/Atom, watermark용 OAI-PMH) | `SourceAdapter` | ADR-0005 S1; resumptionToken을 통한 `FetchCursor` | `TODO(open-question: pin client lib or hand-rolled httpx)` |
| Source: Semantic Scholar | **S2 Graph API 클라이언트** (REST + API key) | `SourceAdapter` | ADR-0005 S1; paging cursor | `TODO(open-question: pin client / httpx; S2 API key handling)` |
| Source: CAW-05 import | **file-drop / pull reader** | `SourceAdapter` | ADR-0005 S2; CAW-05는 별개 제품(공유 store 없음) | n/a |
| HTTP / retry | **httpx + tenacity** (또는 동등물) | 어댑터 내부 | rate-limit 인식 재시도(transient vs terminal, ADR-0007) | `TODO(open-question: pin httpx + retry lib)` |
| Claim 추출 (S4) | **인터페이스 뒤의 LLM-assisted 추출** | (extractor port) | 제안 전용; 출력은 status-bearing, 인간 검토 | `TODO(open-question: which model/provider; pin)` |
| Toy experiment runner | **PyTorch (CPU/단일-GPU, tiny model)** | `ExperimentRunnerAdapter` | ADR-0003; 최소 reproduction만(brief §11) | `TODO(open-question: pin torch + CUDA/CPU build)` |
| Repro gate | **config + seed + env 캡처** (예: `pip freeze`/lock hash, `torch`/CUDA 버전, RNG seed) | runner | ADR-0003 hard gate; 가능한 곳에서 결정적 | n/a |
| Analytic estimator (W) | **순수 Python 수치** (stdlib; 선택적 numpy) | (estimator) | ADR-0004 결정적 L0 estimate; infra 없음 | `TODO(open-question: numpy needed or stdlib-only?)` |
| File store | **디스크 상의 markdown + JSON, git-tracked** | (store/resolver) | ADR-0007; diff 가능, zero infra, front-matter의 provenance | n/a |
| 파생 인덱스(선택) | **SQLite 또는 flat JSON 인덱스**, 재구축 가능 | (index) | ADR-0007 쿼리 레이어; 폐기 가능, 파일이 정본 | `TODO(open-question: SQLite vs JSON — query volume at v1?)` |
| 스키마 검증 | **JSON Schema / pydantic 모델** | shared | 레코드 + `wbtraffic.v0` 검증; `null`+`basis` 허용 | `TODO(open-question: pin pydantic v2 / jsonschema)` |
| Scheduler | **CLI 엔트리포인트를 호출하는 OS cron 또는 작은 long-running daemon** | (scheduler) | ADR-0007 cron-like + event trigger | `TODO(open-question: daemon vs OS cron for a single-operator product?)` |
| Event trigger | **filesystem watch (CAW-05 drop) + CLI/MCP invoke** | (scheduler) | ADR-0007; 온디맨드 + scheduled | `TODO(open-question: watch lib vs poll interval)` |
| CLI 서피스 | **Python CLI** (예: Typer/Click/argparse) | surface | ADR-0001 하나의 core 위의 얇은 서피스 | `TODO(open-question: pin CLI framework)` |
| MCP 서피스 | **MCP server (Python MCP SDK)** | surface | ADR-0001 얇은 서피스; run/inspect 툴 | `TODO(open-question: pin MCP SDK)` |
| Export transport | **file drop (v1)**; `HttpExportAdapter` 스텁 | `ExportAdapter` | ADR-0008 단방향 push; 공유 store 없음 | n/a |
| 로깅 / 관측 | **구조적 로깅 (stdlib `logging` + JSON)** | — | failures first-class, 감사 가능한 receipt | `TODO(open-question: structlog vs stdlib)` |
| 테스트 / 린트 | **pytest + ruff + 포매터 + 타입 체커** | — | 각 acceptance checkpoint에서 트리를 green으로 유지 | `TODO(open-question: pin pytest/ruff/mypy)` |

## 핵심 선택에 대한 노트

### 워크플로 엔진이 아닌 Python 파이프라인 core
brief는 **하나의 파이프라인 core + 세 개의 얇은 서피스**(ADR-0001)를 고정한다. v1은 스테이지를 명시적 멱등성 키 +
커서를 갖춘 in-process Python 파이프라인으로 구현하며(see [data-flow_ko.md](./data-flow_ko.md)), 분산 DAG 엔진
(Airflow/Prefect 등)이 **아니다** — 그것은 zero-infra 원칙에 반하는 infra를 추가할 것이다. Run 볼륨이나
fan-out이 요구할 때만 재검토한다.

### SourceAdapter 뒤의 Source 클라이언트 (ADR-0005)
arXiv와 Semantic Scholar는 각각 `SourceAdapter` 포트를 구현하는 어댑터를 갖는다; 둘 다 불투명한 `FetchCursor`를
영속화하여 scheduled 재실행이 증분적이고 멱등적이게 한다. **각 API의 공표된 rate limit과 ToS를 존중한다**
(brief §12: 오직 법적으로/ToS-safe한 source만). CAW-05 importer는 **별개 제품의 file drop**을 읽는 세 번째
어댑터이며 — 결코 공유 store가 아니다.

### ExperimentRunnerAdapter 뒤의 toy-experiment runner (ADR-0003)
v1은 **tiny model 전용 로컬 PyTorch runner**이다 — 최소 reproduction / toy experiment(brief §11
비목표: 대규모 학습 없음, full syntorch/vLLM 없음). runner는 **hard reproducibility gate**(config + seed + env
캡처)를 시행하고 **launch당 하나의 append-only ledger entry를 emit**하며, 크래시 포함(→ `invalid`/`aborted`)이므로
**실패가 결코 조용히 버려지지 않는다**. 외부 컴퓨트 / HW runner는 동일 포트 뒤의 **문서화된 스텁**이다.

### Analytic estimator는 결정적이고 가정-명시적 (ADR-0004)
`wbtraffic.v0` estimator는 순수 수치 Python이다: 동일 입력 → 동일 출력이며, **모든 가정을 나열**한다.
**modeled** 숫자를 생산하며(ledger의 **measured** 숫자와 구별되게 플래그); 수치는 지어내지 않고 기본값 `null`이다.

### File store + 선택적 인덱스 (ADR-0007)
진실의 원천은 **디스크 상의 markdown/JSON**이며, git-tracked, append-only + supersede이다. 파생 인덱스는
**폐기 가능하고 재구축 가능**하다 — 삭제해도 잃는 것이 없다. 이것이 기본으로 zero 데이터베이스 인프라를 유지하고
모든 레코드를 diff-검토 가능하게 한다.

### 서피스는 얇다 (ADR-0001)
CLI와 MCP는 **동일한 core 위의 얇은 래퍼**이다 — Run을 run/inspect하며 결코 비즈니스 로직을 보유하지 않는다.
한 서피스가 할 수 있는 것은 다른 서피스도 할 수 있는데, core를 공유하기 때문이다.

## 범위 밖(v1 비목표 — brief §11)
- Full **syntorch/vLLM** 통합 및 Chakra L0 tracing — 그것은 CAW-01의 도메인이다(별개 제품).
- 대규모 또는 실제 TTT 학습; 멀티-GPU/클러스터 오케스트레이션.
- 진실의 원천으로서의 데이터베이스 서버; 다른 어떤 CAW 제품과의 공유 레지스트리/런타임.

## 미해결 질문
[../08-research-plan/open-questions.md](../08-research-plan/open-questions_ko.md) 참조. 스택 관련:
- 위 표의 모든 `TODO(open-question: pin …)`(구체 버전은 빌더의 첫 작업이다).
- `TODO(open-question: scheduler host — OS cron + CLI entrypoint vs long-running daemon? — ADR-0007)`
- `TODO(open-question: index backend — SQLite vs flat JSON? — ADR-0007)`
- `TODO(open-question: which LLM/provider for claim extraction, and how its output stays proposal-only?)`

## 런북에 대한 함의
- phase-0 setup 런북은 모든 버전을 핀하고(`TODO(open-question: pin …)` 셀 해결) 어떤 스테이지가 빌드되기 전에
  green 트리(pytest + ruff + type-check)를 안착시킨다.
- 각 외부 의존성(arXiv, S2, CAW-05, PyTorch, export transport)은 문서화된 스텁과 함께 **자신의 포트 뒤에**
  도입되므로, v1은 하나의 어댑터를 빌드하고 이음새를 열어둔다.
- runner 런북은 첫 실험 전에 reproducibility gate와 launch당 하나의 entry 규칙을 배선한다.
