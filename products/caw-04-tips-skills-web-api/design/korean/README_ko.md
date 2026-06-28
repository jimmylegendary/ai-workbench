# CAW-04 디자인 세트 — 색인

**CAW-04, AI Tips/Skills 웹사이트 & REST API**를 위한 완전한 설계 + 빌드 명세 — 독립적인
공개 퍼블리싱 제품이다. 설계 문서는 *무엇을/왜*를 말하고, 런북은 *어떻게 빌드하는지*를 말한다. **설계 작성자는
어떤 제품 코드도 작성하지 않는다.**

> 먼저 읽을 것: [`_meta/PRODUCT-BRIEF.md`](./_meta/PRODUCT-BRIEF_ko.md) 와 [`_meta/DOC-CONVENTIONS.md`](./_meta/DOC-CONVENTIONS_ko.md).

## 탐색

| # | 폴더 | 담고 있는 것 |
| --- | --- | --- |
| `_meta` | brief, conventions, [glossary](./_meta/GLOSSARY_ko.md) | 진실 + 규칙 |
| `00` | [overview](./00-overview/) | 비전, 범위 & 비목표, 페르소나 & 사용 사례 |
| `01` | [decisions](./01-decisions/) | 7개의 ADR (surface+delivery, content model, public-safe publish gate, import+ports, storage+versioning, web stack, API design) |
| `02` | [research](./02-research/) | 근거 연구 |
| `03` | [architecture](./03-architecture/) | 시스템 아키텍처, 컴포넌트 경계, 데이터 흐름, tech stack, 리포 구조 |
| `04` | [data-layer](./04-data-layer/) | content model, storage & versioning, public-safe & provenance |
| `05` | [publishing-core](./05-publishing-core/) | 핵심: publish gate, import & re-check, content entities, versioning, web/API 렌더링, ports & adapters |
| `06` | [interfaces](./06-interfaces/) | 웹사이트, REST API, preview/admin |
| `07` | [backend-api](./07-backend-api/) | 코어 API, 빌드 & 퍼블리시 서비스, import 서비스, 영속성 |
| `08` | [research-plan](./08-research-plan/) | 연구 계획, 검증/테스트, [open questions](./08-research-plan/open-questions_ko.md) |
| `09` | [roadmap](./09-roadmap/) | 마일스톤/단계, 의존성 그래프, 리스크 |
| `10` | [runbooks](./10-runbooks/) | 실행 가능한 빌드 계획 (phases 0–4) — [runbooks/README.md](./10-runbooks/README_ko.md)에서 시작 |

## 한 문단으로 보는 제품

**public-safe-by-construction** 퍼블리싱 레이어다. 콘텐츠(Tip/Skill/Workflow/Playbook + Example/Source/
SafetyBoundary/Version)는 **semver + content-digest** 불변 버전을 가진 **git 내 markdown/MDX**로 존재한다.
하나의 제품 코어가 모든 import에서 **deny-by-default publish gate**와 **코어 public-safe 재검사**를 강제한다
(upstream 경계 = 증거일 뿐이며, audit 전용 provenance는 **절대 직렬화되지 않는** sidecar에 보관된다). **Astro
5 + Starlight SSG 빌드**가 하나의 소스에서 웹사이트 **와** 읽기 전용 REST API(static JSON + raw markdown + manifest +
MCP resources view)를 함께 방출한다. 입력(CAW-02, CAW-03/skills registry)과 출력은 두 개의 포트 뒤에 있는 **adapter**이며,
향후 커넥터를 위한 문서화된 스텁이 함께 제공된다. 퍼블리시된 산출물은 동결되고 정적이다 — 내부 저장소로 향하는 라이브 경로는 없다.

## 빌드 경로

[`10-runbooks/`](./10-runbooks/) 의 phases 0→4를 따른다. **Milestone 1** = 검증된 Skill 하나가 import → public-safe
gate → 버전이 매겨진 웹 페이지 + API 리소스로 퍼블리시되어 web + API로 읽을 수 있게 됨.

## 상태

모든 문서는 **draft** 상태다. [open-questions](./08-research-plan/open-questions_ko.md)로 추적한다.
