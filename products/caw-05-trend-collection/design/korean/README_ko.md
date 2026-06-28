# CAW-05 Design Set — 색인

**CAW-05, 주기적 트렌드 수집 및 종합 레이더(radar)** 의 전체 설계 + 빌드 명세 — 독립 제품입니다. 설계 문서는 *무엇을/왜*를 다루고, runbook은 *어떻게 빌드하는지*를 다룹니다. **설계 작성자는 어떠한 제품 코드도 작성하지 않습니다.**

> 먼저 읽기: [`_meta/PRODUCT-BRIEF.md`](./_meta/PRODUCT-BRIEF_ko.md) 와 [`_meta/DOC-CONVENTIONS.md`](./_meta/DOC-CONVENTIONS_ko.md).

## 둘러보기

| # | 폴더 | 담고 있는 내용 |
| --- | --- | --- |
| `_meta` | brief, conventions, [glossary](./_meta/GLOSSARY_ko.md) | 진실(truth) + 규칙 |
| `00` | [overview](./00-overview/) | 비전, 범위 및 비목표(non-goals), 페르소나 및 유스케이스 |
| `01` | [decisions](./01-decisions/) | 7개의 ADR (surface+outputs, interest model, source adapters, classification/triage, ledger, storage+scheduling, export boundaries) |
| `02` | [research](./02-research/) | 근거 리서치 |
| `03` | [architecture](./03-architecture/) | 시스템 아키텍처, 컴포넌트 경계, 데이터 흐름, 기술 스택, repo 구조 |
| `04` | [data-layer](./04-data-layer/) | 데이터 모델, storage 및 scheduling, 출처(provenance) 및 경계 |
| `05` | [radar-core](./05-radar-core/) | 핵심: interest model, source 수집(ingestion) 및 dedup, classification 및 triage, related-work ledger, synthesis 및 formats, export boundaries, ports 및 adapters |
| `06` | [interfaces](./06-interfaces/) | CLI 및 MCP, 스케줄된 파이프라인, digest 출력 |
| `07` | [backend-api](./07-backend-api/) | core API, 수집 서비스(ingestion service), 종합 서비스(synthesis service), scheduler 및 영속성(persistence) |
| `08` | [research-plan](./08-research-plan/) | 리서치 계획, 검증/테스트, [open questions](./08-research-plan/open-questions_ko.md) |
| `09` | [roadmap](./09-roadmap/) | 마일스톤/단계(phases), 의존성 그래프, 리스크 |
| `10` | [runbooks](./10-runbooks/) | 실행 가능한 빌드 계획 (phases 0–4) — [runbooks/README.md](./10-runbooks/README_ko.md) 에서 시작 |

## 한 문단으로 보는 제품

스케줄된 파이프라인으로 실행되는 **고-재현율(high-recall) 조기 경보(early-warning) 레이더**. 하나의 core가 **Run**을 실행합니다 (ingest → dedup → relevance → classify → triage/route → ledger → synthesize → export). Interest는 타입이 지정되고 계층화된(tiered) 아티팩트로, **BM25 우선(BM25-first), 설명 가능(explainable), 재현율 우선(recall-first)** relevance 점수를 구동합니다. 각 finding은 **recall로 치우친(recall-biased) selective-review gate**를 갖춘 **LF→LLM→human cascade**에 의해 **두 축(two axes)** (novelty-threat/support/adjacent/noise × signal/hype)으로 classify되고, 그 다음 결정론적으로 라우팅됩니다. 추가 전용(append-only) **related-work ledger** (Semantic Scholar로 검증됨)는 각 finding이 무엇을 위협(threaten)하거나 지지(support)하는지를 기록합니다. Finding들은 다섯 가지 markdown format으로 종합되며, **ExportAdapter** (유일한 export 이음새)는 서명된 번들을 CAW-02(knowledge), CAW-03(novelty), CAW-01/CAW-06(open questions)로 전달합니다. 저장은 **files-as-truth + SQLite cache**이며, source와 export는 문서화된 stub을 갖춘 adapter입니다. 생성된 요약/근거(rationale)는 결코 증거(evidence)가 아닙니다.

## 빌드 경로

[`10-runbooks/`](./10-runbooks/) phases 0→4를 따르세요. **Milestone 1** = end-to-end로 동작하는 좁은(narrow) 주간 레이더 (watch list source 가져오기 → relevance → classify → digest), 하나의 novelty-threat를 CAW-03으로 export합니다.

## 상태

모든 문서는 **draft**이며, [open-questions](./08-research-plan/open-questions_ko.md)로 추적됩니다.
