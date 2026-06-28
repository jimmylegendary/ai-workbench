# CAW-03 디자인 세트 — 인덱스

**CAW-03, 즉 Paper & Patent Writing Harness**에 대한 완전한 설계 + 빌드 명세 — 이것은 **PaperOrchestra를 wrap(감싸기)** 하고 거버넌스를 추가하는 독립 제품이다. 디자인 문서는 *무엇을/왜*를 말하고, runbook은 *어떻게 빌드하는지*를 말한다.
**설계 작성자는 어떠한 제품 코드도(그리고 어떠한 PaperOrchestra 재구현도) 작성하지 않는다.**

> 먼저 읽을 것: [`_meta/PRODUCT-BRIEF.md`](./_meta/PRODUCT-BRIEF_ko.md) (단일 진실 공급원) 그리고
> [`_meta/DOC-CONVENTIONS.md`](./_meta/DOC-CONVENTIONS_ko.md).

## 둘러보기

| # | 폴더 | 담고 있는 것 |
| --- | --- | --- |
| `_meta` | brief, conventions, [glossary](./_meta/GLOSSARY_ko.md) | 진실 + 규칙 |
| `00` | [overview](./00-overview/) | [vision](./00-overview/vision_ko.md), [scope & non-goals](./00-overview/scope-and-non-goals_ko.md), [personas & use cases](./00-overview/personas-and-use-cases_ko.md) |
| `01` | [decisions](./01-decisions/) | 8개의 ADR (surface, writing-engine wrap, evidence gate, patents, ports&adapters, ladder/novelty, confidentiality, lifecycle) |
| `02` | [research](./02-research/) | ADR 뒤에 있는 근거 연구 |
| `03` | [architecture](./03-architecture/) | 시스템 아키텍처, 컴포넌트 boundary, 데이터 흐름, 기술 스택, 저장소 구조 |
| `04` | [data-layer](./04-data-layer/) | 데이터 모델, 저장 전략, confidentiality 및 provenance |
| `05` | [harness-core](./05-harness-core/) | 핵심: evidence gate, 입력 조립, PaperOrchestra adapter, 특허 모듈, **ports & adapters**, ladder/novelty, artifact lifecycle |
| `06` | [interfaces](./06-interfaces/) | API+MCP, CLI, 최소한의 리뷰/상태 UI |
| `07` | [backend-api](./07-backend-api/) | 핵심 API 계약, orchestration, adapter registry+config, persistence |
| `08` | [research-plan](./08-research-plan/) | 연구 계획, 검증/테스트, [open questions](./08-research-plan/open-questions_ko.md) |
| `09` | [roadmap](./09-roadmap/) | 마일스톤/단계, 의존성 그래프, 리스크 |
| `10` | [runbooks](./10-runbooks/) | 실행 가능한 빌드 계획 (phase 0–4) — [runbooks/README.md](./10-runbooks/README_ko.md)에서 시작 |

## 한 문단으로 보는 제품

**PaperOrchestra**(v1 `WritingEngineAdapter`, subprocess로 실행됨) 위에 놓인 거버넌스 **harness**다. 하나의 harness
core가 거버넌스 대상 연산의 유한한 **op-manifest**를 소유하며, core에서(절대 adapter에서가 아니라) 다음을 강제한다:
**evidence gate**(생성된 텍스트는 결코 evidence가 아니다; P1/P2/P3 임계값; fail-closed), **patent-first
interlock**, 그리고 **confidentiality**(CAW-02에서 상속됨, fail-closed export). 입력은 CAW-02
(claim+evidence 번들)와 CAW-01(결과)에서 import되어 **engine-neutral input bundle(엔진 중립 입력 번들)**로 조립된다.
특허는 별도의 `PatentEngine`을 사용한다. 외부의 모든 것은 **다섯 개의 port** 중 하나 뒤에 있는 **adapter**이며,
config로 선택되고, 미래 connector(내부 wiki, experiment-server, venue 제출, 특허 출원)를 위한 **문서화된 stub**을 갖는다.

## 빌드 경로

[`10-runbooks/`](./10-runbooks/)의 phase 0→4를 따른다. **Milestone 1** = import된 CAW-02 번들 + CAW-01 결과로부터
PaperOrchestra를 통해 생산된 하나의 evidence-gated 논문(gate → assemble → draft → review → PDF), provenance와
confidentiality 포함.

## 상태

모든 문서는 **draft**이며, `TODO(open-question)` 마커와 추적되는
[open-questions](./08-research-plan/open-questions_ko.md) 목록을 담고 있다.
