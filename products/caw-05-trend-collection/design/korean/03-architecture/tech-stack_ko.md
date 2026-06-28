# 기술 스택 — 레이더의 런타임, 라이브러리, 버전 핀(pin)

- **Status:** draft
- **Owner:** Jimmy
- **Last-reviewed:** TODO(open-question: set on review)
- **Related:**
  - [./data-flow.md](./data-flow_ko.md), [./repo-structure.md](./repo-structure_ko.md)
  - [../01-decisions/ADR-0001-product-surface-and-outputs.md](../01-decisions/ADR-0001-product-surface-and-outputs_ko.md) (CLI + MCP + renderer)
  - [../01-decisions/ADR-0002-interest-model.md](../01-decisions/ADR-0002-interest-model_ko.md) (BM25 + embedding lane)
  - [../01-decisions/ADR-0003-source-adapters-and-ingestion.md](../01-decisions/ADR-0003-source-adapters-and-ingestion_ko.md) (source client)
  - [../01-decisions/ADR-0006-storage-and-scheduling.md](../01-decisions/ADR-0006-storage-and-scheduling_ko.md) (SQLite + files + cron)
  - [../02-research/scheduling-and-ports.md](../02-research/scheduling-and-ports_ko.md) (Protocol-style 포트, entry-point)
- **Source of truth:** ../_meta/PRODUCT-BRIEF.md

## 목적
이 문서는 AI 빌더가 CAW-05를 구현하는 데 사용하는 **언어, 라이브러리, 인프라**를 고정하고, 핀된 버전이
필요한 모든 의존성을 나열한다(`TODO(open-question: pin ...)`로 — 버전 번호를 임의로 만들지 않는다). ADR과
일관된 구체 도구를 선택한다: 설명가능한 BM25-first ranking, legal/ToS-safe source client, files-as-truth +
SQLite, cron, MCP surface. 이 문서는 아키텍처(ADR 참조)나 리포 레이아웃([repo-structure.md](./repo-structure_ko.md))을
재결정하지 않는다. 독립성이 유지된다: 이것은 CAW-05의 **자체** 스택이다 — 형제 제품과 공유 런타임 기반 없음.

## 1. 코어 언어 결정

| 옵션 | 장점 | 단점 | 적합성 |
|---|---|---|---|
| **Python 코어** | 가장 풍부한 학술/ingestion 생태계 (arXiv, S2, feedparser, rank-bm25, sentence-transformers); research/ADR-0003에서 이미 가정한 `Protocol` 포트 + `importlib.metadata` entry-point; 일급 SQLite (`sqlite3` + FTS5) | 런타임 패키징 규율 필요 | **선택됨** |
| TypeScript 코어 | surface가 JS면 단일 언어; 좋은 MCP SDK | 과학/IR 라이브러리 약함; BM25/embedding lane이 이류; ADR-0002/0003 가정과 충돌 | 코어로는 기각 |

**결정: Python 코어.** 포트 research(`scheduling-and-ports.md` §4)는 이미 `Protocol`-style 인터페이스와 PyPA
entry-point 발견을 명시한다; ADR-0002의 설명가능 BM25 + alpha embedding lane과 ADR-0003의 source client는 모두
Python 생태계에 있다. MCP surface는 Python MCP SDK(아래)를 쓸 수 있으므로 두 번째 언어가 필요 없다.

## 2. 의존성 맵 (버전-핀 TODO 포함)
모든 핀은 유보된다 — 빌더가 빌드 시점에 `pyproject.toml`과 lockfile에서 정확한 버전을 핀한다.

### 2.1 런타임 & 패키징

| 관심사 | 선택 | 핀 |
|---|---|---|
| Python 인터프리터 | CPython, 모던 LTS급 라인 | TODO(open-question: pin Python minor, e.g. 3.x) |
| 의존성/lock 관리자 | `uv` (빠름, lockfile) 또는 Poetry | TODO(open-question: pick + pin tooling) |
| 패키징 메타데이터 | `pyproject.toml` (PEP 621) + entry-point group `caw05.source_adapters` / `caw05.export_adapters` / `caw05.scheduler_adapters` | TODO(open-question: confirm entry-point group names — ADR-0003 OQ) |
| 타이핑 / 검증 | value object(`RawFinding`…`LedgerLink`) + config용 `pydantic` v2 | TODO(open-question: pin pydantic 2.x) |
| Lint / format / type | `ruff` + `mypy` (strict) | TODO(open-question: pin) |
| 테스트 | `pytest` (+ 모든 포트의 fake) | TODO(open-question: pin) |

### 2.2 Source client (ADR-0003 — legal/ToS-safe만)

| Source family | 라이브러리 / 접근 | Legal mode | 핀 |
|---|---|---|---|
| arXiv | OAI-PMH harvest + query API + 카테고리별 RSS; `httpx`를 통한 HTTP; 3초 단일 연결 limiter | `api` | TODO(open-question: pin httpx; confirm OAI client lib vs hand-rolled) |
| Semantic Scholar | S2 Graph/Academic API (enrich, citation cross-ref, ledger verification); 지수 backoff | `api` | TODO(open-question: pin client; S2 API-key decision — ADR-0003 OQ) |
| GitHub | `releases/tags/commits.atom` + ETag/`since`가 있는 REST; secondary-rate-limit 헤더 준수 | `api` | TODO(open-question: pin GitHub client or raw httpx) |
| Blog/lab RSS | `feedparser` (Atom/RSS) + `feeds.yaml`로 구동되는 conditional GET (`ETag`/`Last-Modified`) | `publisher_feed` | TODO(open-question: pin feedparser) |
| HN (light) | Algolia HN API, metadata + link만, `created_at_i` watermark | `metadata_only_link` | TODO(open-question: pin) |
| Reddit / EDGAR / newsletter / internal | **문서화된 스텁** — 등록됨, `maturity="stub"`, config-disabled | n/a | n/a (배선 전까지 의존성 없음) |

공유 HTTP 관심사: 단일 async/sync HTTP client(`httpx`), 호스트별 token-bucket rate limiter, 지수 backoff +
jitter가 있는 retry. arXiv(3초)와 EDGAR(≤10 req/s)는 호스트별로 직렬화되며 결코 병렬화되지 않는다.

### 2.3 Relevance & dedup (ADR-0002, ADR-0003 §5)

| 관심사 | 선택 | 핀 |
|---|---|---|
| BM25 ranking (v1, 설명가능) | `rank-bm25` (순수 Python, term 수준 점수가 가산적 설명에 공급) **또는** SQLite FTS5 BM25 | TODO(open-question: rank-bm25 vs FTS5 BM25 as the scorer of record — pin choice) |
| 전문(full-text) index | SQLite **FTS5** (대부분의 빌드에서 stdlib `sqlite3`에 내장) | TODO(open-question: confirm FTS5 compiled in target Python/SQLite) |
| Embedding lane (alpha, gated) | `sentence-transformers` + 작은 로컬 모델; vector는 SQLite에 (필요 시 `sqlite-vec`/`faiss`) | TODO(open-question: pin model + vector store; gate on labeled eval set — ADR-0002) |
| Near-dup (dedup L3, flagged) | SimHash (64-bit) — `simhash` 라이브러리 또는 hand-rolled; 기본 OFF | TODO(open-question: pin lib + Hamming threshold — ADR-0003 OQ) |
| 해싱 (dedup L2) | 정규화된 title+body에 대한 stdlib `hashlib` SHA-256 | 없음 (stdlib) |

embedding lane은 **alpha이며 gated**다(ADR-0002): recall-first floor를 퇴행시켜서는 안 되므로, v1은 BM25-first로
출시되며 embedding lane은 플래그와 labeled eval gate 뒤에 둔다.

### 2.4 Classification cascade (ADR-0004)

| Stage | 선택 | 핀 |
|---|---|---|
| Labeling function (LF) | 타입화된 metadata에 대한 평범한 Python 술어(predicate) (v1에서는 무거운 프레임워크 없음) | 없음 |
| LLM tier | `anthropic` SDK를 통한 Claude; 프롬프트가 label + confidence + rationale 생성 (`kind=generated`, 결코 evidence 아님) | TODO(open-question: pin `anthropic` SDK + model id; see runbook for model selection) |
| Human tier | CLI/MCP로 표출되는 파일(`review/*.json`)로서의 selective-review queue | 없음 |

참고: classify tier의 LLM 제공자는 **Claude/Anthropic**이다(워크벤치 기본값); 빌더는 정확한 model id를 확정하고
런북에서 SDK를 핀한다. rationale 텍스트는 항상 generated로 표기되며 결코 evidence로서 ledger에 쓰이지 않는다.

### 2.5 스토리지, 스케줄링, surface (ADR-0006, ADR-0001)

| 관심사 | 선택 | 핀 |
|---|---|---|
| Files-as-truth | YAML (`interests.yaml`, `*.yaml` config) + JSON/JSONL (`findings/`, `ledger/`) | TODO(open-question: pin a YAML lib, e.g. ruamel/PyYAML) |
| Index/ledger cache | stdlib `sqlite3`를 통한 SQLite (FTS5 + `seen` + ledger projection — 재구축 가능) | 없음 (stdlib) |
| Config 포맷 | `caw05.config.toml` (stdlib `tomllib` 읽기) + 어댑터별 블록 | 없음 (stdlib 읽기) |
| Scheduler (v1) | `CronSchedulerAdapter`를 통한 **cron** (crontab line `caw05 run --window weekly` 작성); 스텁: systemd-timer, GitHub Actions, cloud | 없음 (crontab 작성) |
| Run wrapper | single-flight `flock` lockfile (`run.lock`), checkpoint, run-receipt heartbeat | 없음 (stdlib/OS) |
| CLI surface | `typer` 또는 `click` (`caw05 run`, `status`, `interests`, `adapters`, `--since` 백필) | TODO(open-question: typer vs click — pin) |
| MCP surface | run/inspect 도구 + ledger read view를 노출하는 Python MCP SDK (`mcp`) | TODO(open-question: pin MCP SDK) |
| Renderer | `FormatRenderer` 포트 뒤의 `jinja2`를 통한 markdown-first 템플릿 (memo, digest, slide-outline, paper-card, action-brief) | TODO(open-question: pin jinja2) |
| Export bundle | 경계를 넘는 JSON bundle + 서명 (예: `hashlib`/HMAC 또는 detached signature) (ADR-0007) | TODO(open-question: pin signing approach) |

## 3. 의도적으로 추가하지 않는 것 (v1)
- 외부 DB/서비스 없음, message broker 없음, container orchestration 없음 — files + SQLite + cron만(ADR-0006;
  brief §11). 상시(standing) 서비스는 공유 기반이 되므로 기각된다.
- v1에 무거운 ML relevance 스택 없음 — BM25-first, 설명가능; embedding은 alpha/gated 유지(brief §11, ADR-0002).
- web/GUI 프레임워크 없음 — surface는 scheduled-pipeline + CLI + MCP(ADR-0001); read view는 선택/markdown.
- surface용 두 번째 언어 없음 — Python MCP SDK가 TS 런타임을 피한다.

## 4. 의존성-리스크 표

| 의존성 | 리스크 | 완화 |
|---|---|---|
| Semantic Scholar API 제한 | 미인증 풀은 느림; verification(ADR-0005)은 처리량 필요 | backoff + cache; API-key 결정은 OQ |
| arXiv 3초 / EDGAR 10 req/s | 위반 시 IP 차단 | 호스트별 직렬화 + 코어 내 token bucket |
| FTS5 가용성 | 일부 Python/SQLite 빌드는 FTS5 누락 | preflight 체크; in-process rank-bm25로 폴백 |
| Embedding 모델 크기/비용 | recall floor 또는 지연 퇴행 가능 | labeled eval 뒤에 gated; 기본 off |
| LLM 비용/변동성 | classify tier 비용 + 비결정성 | LF tier가 먼저 필터; abstain→human; rationale non-evidence |

## 열린 질문(Open Questions)
`../08-research-plan/open-questions.md`에서 추적:
- TODO(open-question: pin all versions listed above in `pyproject.toml` + lockfile at build time.)
- TODO(open-question: `rank-bm25` vs SQLite FTS5 BM25 as the scorer of record for the explainable additive score.)
- TODO(open-question: embedding model + vector store choice and the labeled eval gate threshold — ADR-0002.)
- TODO(open-question: confirm FTS5 is compiled into the target Python/SQLite, else select a fallback.)
- TODO(open-question: exact `anthropic` SDK + model id for the classify tier; record in the runbook.)
- TODO(open-question: confirm entry-point group names + adapter SemVer/compat policy — ADR-0003 / ports research.)

## 런북에 대한 함의
- **RB (bootstrap):** 핀된 deps + lockfile, entry-point group, ruff/mypy/pytest green이 있는 `pyproject.toml`.
- **RB (storage):** SQLite FTS5 index 빌더 + 파일로부터 재구축; preflight FTS5 가용성 체크.
- **RB (source client):** `httpx` + 호스트별 token bucket; legal_mode를 준수하는 arXiv/S2/GitHub/RSS/HN client.
- **RB (rank):** BM25 scorer + 가산적 설명; 플래그 + eval gate 뒤의 embedding lane.
- **RB (surface):** `typer`/`click` CLI + Python MCP SDK 도구 + `jinja2` FormatRenderer; `CronSchedulerAdapter`.
