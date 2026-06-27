# CAW-02 디자인 세트 — 인덱스

**CAW-02, 팀/개인 Knowledge Repository(지식 저장소)** 에 대한 완전한 설계 + 빌드 사양 — 독립적인 단독
제품입니다. 디자인 문서는 *무엇을* 그리고 *왜* 를 말하고, runbook은 *어떻게 빌드하는지* 를 말합니다.
**디자인 작성자는 어떤 제품 코드도 작성하지 않습니다.**

> 먼저 읽으세요: [`_meta/PRODUCT-BRIEF.md`](./_meta/PRODUCT-BRIEF_ko.md) (단일 진실 공급원) 및
> [`_meta/DOC-CONVENTIONS.md`](./_meta/DOC-CONVENTIONS_ko.md).

## 탐색

| # | 폴더 | 담고 있는 내용 |
| --- | --- | --- |
| `_meta` | brief, conventions, [glossary](./_meta/GLOSSARY_ko.md) | 진실 + 규칙 |
| `00` | [overview](./00-overview/) | [vision](./00-overview/vision_ko.md), [scope & non-goals](./00-overview/scope-and-non-goals_ko.md), [personas & use cases](./00-overview/personas-and-use-cases_ko.md) |
| `01` | [decisions](./01-decisions/) | 7개의 ADR (surface+skill, storage, data model, provenance/trust, ingestion, retrieval, import/export) |
| `02` | [research](./02-research/) | ADR의 기반이 되는 연구 |
| `03` | [architecture](./03-architecture/) | 시스템 아키텍처, 컴포넌트 boundary, 데이터 흐름, 기술 스택, 저장소 구조 |
| `04` | [data-layer](./04-data-layer/) | 데이터 모델, 저장 전략, provenance 및 boundary, 버전 관리 및 events |
| `05` | [knowledge-core](./05-knowledge-core/) | 핵심: entity/edge 모델, claim↔evidence gate, ingestion, retrieval, skill-wrap, import/export 흐름 |
| `06` | [interfaces](./06-interfaces/) | API + MCP, CLI, 읽기 전용 뷰어 |
| `07` | [backend-api](./07-backend-api/) | 코어 API 계약, ingestion 서비스, retrieval 서비스, 영속성 + index |
| `08` | [research-plan](./08-research-plan/) | 연구 계획, 검증/테스트, [open questions](./08-research-plan/open-questions_ko.md) |
| `09` | [roadmap](./09-roadmap/) | 마일스톤/단계, 의존성 그래프, 리스크 |
| `10` | [runbooks](./10-runbooks/) | 실행 가능한 빌드 계획 (단계 0–5) — [runbooks/README.md](./10-runbooks/README_ko.md)에서 시작 |

## 한 문단으로 보는 제품

provenance를 보존하는 지식 저장소로, **진실 공급원은 git에 있는 markdown 파일**(entity =
frontmatter + 본문, `knowledge/` 아래)이며, retrieval을 위한 **파생적이고 폐기 가능한 SQLite index** 를
함께 둡니다. 하나의 **트랜잭션 기반 제품 코어**가 **evidence gate**(note는 절대 evidence가 될 수 없음),
**Claim→Evidence 불변식**(3개의 lockstep 레이어), 단조 전파(monotone propagation)를 갖는 2축
**boundary**(public/internal/confidential) × **visibility**(team/private), 파생된 **trust ladder**(T0–T3,
AI는 T2까지로 제한), 그리고 append-only 감사를 강제합니다. **API/MCP/CLI** 는 하나의 op manifest에서
codegen된 얇은 어댑터입니다. Retrieval은 인용 제약(citation-constrained) RAG를 갖춘 **FTS5 + 구조적
필터**입니다(v0에서는 embedding 없음). 제품 간 사용은 엄격하게 **import/export** 입니다(CAW-01 projection,
CAW-05 signal 입력; 인용된 bundle을 CAW-03으로 출력) — 결코 공유 저장소가 아닙니다.

## 빌드 경로

[`10-runbooks/`](./10-runbooks/) 단계 0→5를 따르세요. **마일스톤 1** = md-git + SQLite index 위에서
skill 인터페이스를 통한 최초의 provenance 보존 지식 트랜잭션
(`add-source → extract-claim → attach-evidence → synthesize-cited-note`)과 retrieval입니다.

## 상태

모든 문서는 **draft**이며, PRODUCT-BRIEF + 연구를 바탕으로 작성되었습니다. `TODO(open-question)` 마커와
추적되는 [open-questions](./08-research-plan/open-questions_ko.md) 목록을 포함합니다.
