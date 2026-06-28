# CAW-04 디자인 세트 — 색인

**CAW-04, AI Tips/Skills 웹사이트 및 REST API**에 대한 완전한 디자인 + 빌드 명세 — 독립적인
공개 퍼블리싱(public publishing) 제품. 디자인 문서는 *무엇/왜*를 말하고, 런북(runbook)은 *어떻게 빌드하는지*를 말한다. **제품 코드는
디자인 작성자가 작성하지 않는다.**

> 먼저 읽기: [`_meta/PRODUCT-BRIEF.md`](./_meta/PRODUCT-BRIEF_ko.md) 및 [`_meta/DOC-CONVENTIONS.md`](./_meta/DOC-CONVENTIONS_ko.md).

## 둘러보기

| # | 폴더 | 담고 있는 내용 |
| --- | --- | --- |
| `_meta` | brief, conventions, [glossary](./_meta/GLOSSARY_ko.md) | 진실 + 규칙 |
| `00` | [overview](./00-overview/) | vision, scope & non-goals, personas & use cases |
| `01` | [decisions](./01-decisions/) | 7개의 ADR (surface+delivery, content model, public-safe publish gate, import+ports, storage+versioning, web stack, API design) |
| `02` | [research](./02-research/) | 기반(grounding) 리서치 |
| `03` | [architecture](./03-architecture/) | 시스템 아키텍처, 컴포넌트 경계, 데이터 흐름, 기술 스택, 레포 구조 |
| `04` | [data-layer](./04-data-layer/) | content model, storage & versioning, public-safe & provenance |
| `05` | [publishing-core](./05-publishing-core/) | 핵심: publish gate, import & re-check, content entities, versioning, web/API rendering, ports & adapters |
| `06` | [interfaces](./06-interfaces/) | website, REST API, preview/admin |
| `07` | [backend-api](./07-backend-api/) | core API, build & publish service, import service, persistence |
| `08` | [research-plan](./08-research-plan/) | research plan, validation/tests, [open questions](./08-research-plan/open-questions_ko.md) |
| `09` | [roadmap](./09-roadmap/) | milestones/phases, dependency graph, risks |
| `10` | [runbooks](./10-runbooks/) | 실행 가능한 빌드 계획 (phases 0–4) — [runbooks/README.md](./10-runbooks/README_ko.md)에서 시작 |

## 한 문단으로 보는 제품

**public-safe-by-construction**(구성상 공개 안전) 퍼블리싱 레이어. 콘텐츠(Tip/Skill/Workflow/Playbook + Example/Source/
SafetyBoundary/Version)는 **git 안의 markdown/MDX**로 존재하며 **semver + content-digest** 불변(immutable) 버전을 가진다.
하나의 제품 코어가 모든 import 시 **deny-by-default publish gate**와 **core public-safe re-check**를 강제한다
(upstream 경계 = evidence 전용; audit 전용 provenance는 **절대 직렬화되지 않는** sidecar에 보관). **Astro
5 + Starlight SSG build**가 하나의 소스로부터 웹사이트 **및** 읽기 전용 REST API(static JSON + raw markdown + manifest +
MCP resources view)를 방출한다. 입력(CAW-02, CAW-03/skills registry)과 출력은 두 개의 port 뒤에 있는 **adapter**이며,
미래의 커넥터를 위한 문서화된 stub을 갖춘다. 발행된 산출물(artifact)은 동결(frozen)되고 정적(static)이다 — 내부 저장소로 가는 라이브 경로는 없다.

## 빌드 경로

[`10-runbooks/`](./10-runbooks/)의 phases 0→4를 따른다. **Milestone 1** = 검증된 Skill 하나가 import됨 → public-safe
gate → 버전이 부여된 웹 페이지 + API 리소스로 발행됨, web + API로 읽기 가능.

## 상태

모든 문서는 **draft**이다; [open-questions](./08-research-plan/open-questions.md)에서 추적된다.
